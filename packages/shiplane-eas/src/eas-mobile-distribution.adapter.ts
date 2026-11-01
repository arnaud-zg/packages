import fs from "node:fs";
import path from "node:path";
import type {
  DecideContext,
  Decision,
  DeliveryAdapter,
  Environment,
  Job,
  JobInput,
  MobileDistributionPort,
  Refusal,
  ReleaseUnit,
  Resolved,
} from "shiplane/plugin";
import { defineMobileDistribution, perEnv, releaseSource, tagName, z } from "shiplane/plugin";

import type { MobileRelease } from "./eas/policy";
import {
  analyse,
  analysisJson,
  planWhy,
  rolloutLines,
  updateHealth,
  verdictLines,
} from "./eas/analyse";
import { easClient } from "./eas/client";
import {
  mobileChoice,
  mobileRelease,
  mobileShip,
  needsNewVersion,
  productionMobile,
  releaseChangesets,
  ROLLOUT_STEPS,
  rolloutAdvice,
} from "./eas/policy";

const EasOptions = z.object({
  versionFile: z.string().default("app-version.json").describe("Each environment's binary version"),
  update: perEnv(z.string()).describe(
    "The package script that publishes an update, per environment",
  ),
});

type Options = Resolved<z.output<typeof EasOptions>>;

const readJson = (file: string): Record<string, unknown> =>
  z.record(z.string(), z.unknown()).parse(JSON.parse(fs.readFileSync(file, "utf8")));

const writeJson = (file: string, value: unknown) =>
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

const VersionsSchema = z.record(z.string(), z.object({ version: z.string() }).loose());

/** The binary version an environment carries. */
const versionFileOf = (root: string, unit: ReleaseUnit, options: Options) =>
  path.join(root, unit.dir, options.versionFile);

const binaryVersion = (
  root: string,
  unit: ReleaseUnit,
  options: Options,
  environment: Environment,
) =>
  VersionsSchema.parse(readJson(versionFileOf(root, unit, options)))[environment]?.version ??
  unit.version;

const setBinaryVersion = (
  root: string,
  unit: ReleaseUnit,
  options: Options,
  environment: Environment,
  version: string,
) => {
  const file = versionFileOf(root, unit, options);
  const versions = VersionsSchema.parse(readJson(file));
  writeJson(file, { ...versions, [environment]: { ...versions[environment], version } });
  return path.relative(root, file);
};

// A build runs on EAS from this machine; a preview update ships what its tag named, production main.
const updateRef = ({ tag, environment }: JobInput<Options>) =>
  environment === "preview" ? tag : "main";

const buildJob = (input: JobInput<Options>): Job => {
  const { unit, environment } = input;
  return {
    label: `build iOS and Android on EAS ${environment}, submitted when done`,
    local: [
      {
        command: "pnpm",
        args: [
          "exec",
          "eas",
          "build",
          "--profile",
          environment,
          "--platform",
          "all",
          "--auto-submit",
          "--no-wait",
        ],
        cwd: unit.dir,
        env: { EXPO_ATLAS: "false", APP_VARIANT: environment },
      },
    ],
  };
};

const updateJob = (input: JobInput<Options>): Job => {
  const { unit, environment, options } = input;
  return {
    label: `publish the ${environment} update`,
    local: [
      {
        command: "pnpm",
        args: ["run", options.update],
        cwd: unit.dir,
        env: { APP_VARIANT: environment },
      },
    ],
    ci: { ref: updateRef(input) },
  };
};

/** One eas command on a rollout; no workflow moves a rollout, so it runs here. */
const rolloutJob = (
  { unit, environment }: JobInput<Options>,
  label: string,
  args: string[],
): Job => ({
  label,
  local: [
    {
      command: "pnpm",
      args: ["exec", "eas", ...args, "--non-interactive"],
      cwd: unit.dir,
      env: { APP_VARIANT: environment },
    },
  ],
});

/** Where an update reaching part of the channel stands, and each way it can go from there. */
const rolloutChoice = async (
  context: DecideContext,
  client: ReturnType<typeof easClient>,
  input: JobInput<Options>,
  update: { group: string; percentage: number; createdAt: string | null },
): Promise<Decision> => {
  const { tag, environment } = input;
  const { group, percentage } = update;
  const launches = await client.updateLaunches(group, environment);
  const hoursOut = update.createdAt
    ? (context.now().getTime() - new Date(update.createdAt).getTime()) / 3_600_000
    : 0;
  const advice = rolloutAdvice({
    percentage,
    launches: launches.reduce((sum, { installs }) => sum + installs, 0),
    crashes: launches.reduce((sum, { failedInstalls }) => sum + failedInstalls, 0),
    hoursOut,
  });
  const suggested = String(advice.suggested);
  const widen = (to: number) =>
    rolloutJob(input, `widen the ${tag} rollout on ${environment}: ${percentage}% → ${to}%`, [
      "update:edit",
      group,
      "--rollout-percentage",
      String(to),
    ]);
  const options = [
    ...ROLLOUT_STEPS.filter((step) => step > percentage).map((step) => ({
      value: String(step),
      label: step === 100 ? "Everyone" : `${step}% of people`,
      hint: step === 100 ? "finishes the rollout" : undefined,
      jobs: [widen(step)],
    })),
    {
      value: "stay",
      label: `Stay at ${percentage}%`,
      hint: "nothing changes, check again later",
      jobs: [],
    },
    {
      value: "roll-back",
      label: "Roll back",
      hint: "people on it go back to the update before",
      jobs: [
        rolloutJob(input, `roll back the ${tag} rollout on ${environment}`, [
          "update:revert-update-rollout",
          "--group",
          group,
        ]),
      ],
    },
  ].map((option) =>
    option.value === suggested
      ? { ...option, label: `${option.label} (suggested)`, hint: advice.why }
      : option,
  );
  return {
    action: "choose",
    lines: rolloutLines({
      tag,
      environment,
      percentage,
      hoursOut,
      health: updateHealth(launches),
    }),
    question: `How far should ${tag} go on ${environment}?`,
    suggested,
    options,
    held: `${tag} stays at ${percentage}% of people`,
  };
};

const refuse = (refusal: Refusal): Decision => ({ action: "fail", ...refusal });

/** The checks a new binary passes before EAS builds it: from main, a new version, a clean tree. */
const buildRefusal = async (
  context: DecideContext,
  analysis: Awaited<ReturnType<typeof analyse>>,
  input: JobInput<Options>,
): Promise<Refusal | null> => {
  const source = releaseSource("build", input.environment, analysis.git);
  if (!source.allowed) {
    return source.why === "not-main"
      ? {
          title: `Not from ${analysis.git.branch}`,
          detail: "a binary ships what it is built from, so builds start from main.",
          commands: ["git switch main", "git pull", "shiplane ship"],
        }
      : {
          title: "main is behind origin",
          detail: "pull it first, a release ships what is merged.",
          commands: ["git pull"],
        };
  }
  if (needsNewVersion(analysis.checked.map(({ state }) => state))) {
    return {
      title: `${analysis.version} already has a ${input.environment} binary`,
      detail: "a new native layer needs a new version, or updates would reach both binaries.",
      commands: ["shiplane"],
    };
  }
  if (!(await context.sourceControl.isClean())) {
    return {
      title: "Uncommitted changes",
      detail: "commit or stash them first, a release ships the commit.",
      commands: [],
    };
  }
  return null;
};

const previewDecision = async (
  context: DecideContext,
  input: JobInput<Options>,
): Promise<Decision> => {
  const { unit, options } = input;
  const client = easClient(context.shell, path.join(context.root, unit.dir));
  const analysis = await analyse(
    client,
    context.sourceControl,
    "preview",
    binaryVersion(context.root, unit, options, "preview"),
    unit.name,
  );
  const version = unit.version;
  const tag = await context.sourceControl.tagCommit(tagName(unit.name, version, context.tagFormat));
  const codeSince = (commit: string) => (tag ? context.changedCode(unit, tag, commit) : []);
  const sinceTag = async (commit: string | null) =>
    tag !== null && commit !== null && (await codeSince(commit)).length === 0;
  const builtFrom = analysis.checked.map(({ state }) => state.shipped?.gitCommit ?? null);
  const lastBuildCommit = builtFrom.every((commit) => commit === builtFrom[0])
    ? (builtFrom[0] ?? null)
    : null;
  const lastUpdate =
    tag && analysis.plan.action === "update" ? await client.lastUpdate("preview") : null;
  const lastUpdateCommit = lastUpdate
    ? (await client.updateOrigin(lastUpdate.group, "preview")).commit
    : null;
  const ship = mobileShip(analysis.plan.action, {
    tagged: tag !== null,
    codeSinceTag: tag !== null && !(await sinceTag(analysis.git.head)),
    codeShipped:
      analysis.plan.action === "update" &&
      ((await sinceTag(lastBuildCommit)) || (await sinceTag(lastUpdateCommit))),
  });
  // Main moved past the tag: GitHub Actions still ships the tag, this machine only its checkout.
  const movedPast = ship === "moved-past";
  const kind = analysis.plan.action === "build" ? "build" : "update";
  // On CI a preview update still ships its tag; this machine would ship code no release named.
  const named = movedPast ? await codeSince(analysis.git.head) : [];
  const notLocal = movedPast
    ? {
        notLocal: `main moved past it (${named.slice(0, 3).join(", ")}${named.length > 3 ? ", ..." : ""} changed since)`,
      }
    : {};
  switch (movedPast && kind === "update" ? kind : ship) {
    case "build": {
      const refusal = await buildRefusal(context, analysis, input);
      return refusal
        ? refuse(refusal)
        : { action: "ship", kind: "build", jobs: [buildJob(input)], ...notLocal };
    }
    case "update":
      return { action: "ship", kind: "update", jobs: [updateJob(input)], ...notLocal };
    case "wait":
      return {
        action: "none",
        status: `${unit.name} ${version} is building on EAS, submitted when done`,
      };
    case "shipped":
      return { action: "none", status: `${unit.name} ${version} is on preview` };
    case "nothing":
      return {
        action: "none",
        status: `No ${unit.name} version to ship: add a changeset, then release.`,
      };
    case "behind":
      return refuse({
        title: "main is behind",
        detail: "the last preview build carries a newer version.",
        commands: ["git pull"],
      });
    case "moved-past": {
      const changed = await codeSince(analysis.git.head);
      const named = changed.slice(0, 3).join(", ") + (changed.length > 3 ? ", ..." : "");
      return refuse({
        title: `main moved past ${tagName(unit.name, version, context.tagFormat)}`,
        detail: `a binary or an update ships its commit, and ${named} changed since, code no release named.`,
        commands: ["pnpm changeset", "shiplane"],
      });
    }
  }
};

const productionDecision = async (
  context: DecideContext,
  input: JobInput<Options>,
): Promise<Decision> => {
  const { unit, options } = input;
  const client = easClient(context.shell, path.join(context.root, unit.dir));
  const productionVersion = binaryVersion(context.root, unit, options, "production");
  const analysis = await analyse(
    client,
    context.sourceControl,
    "production",
    productionVersion,
    unit.name,
  );
  const version = unit.version;
  const tag = await context.sourceControl.tagCommit(tagName(unit.name, version, context.tagFormat));
  const codeSince = (commit: string) => (tag ? context.changedCode(unit, tag, commit) : []);
  const sinceTag = async (commit: string | null) =>
    tag !== null && commit !== null && (await codeSince(commit)).length === 0;
  const action = analysis.plan.action;
  const lastUpdate = tag && action === "update" ? await client.lastUpdate("production") : null;
  const origin = lastUpdate ? await client.updateOrigin(lastUpdate.group, "production") : null;
  const updateCommit = origin?.commit ?? null;
  const shippedCommits = [
    ...analysis.checked.map(({ state }) => state.shipped?.gitCommit ?? null),
    updateCommit,
  ];
  const builtVersion = analysis.checked[0]?.state.shipped?.appVersion ?? null;
  const shippedAny = (await Promise.all(shippedCommits.map(sinceTag))).some(Boolean);
  const rollout = lastUpdate?.rolloutPercentage ?? 100;
  const decision = productionMobile(action, {
    tagged: tag !== null,
    sinceTagOnlyVersionFiles: await sinceTag(analysis.git.head),
    expoVersion: version,
    productionVersion,
    codeShipped: action === "submit" || shippedAny,
    builtVersion,
    partialRollout: rollout < 100 && (await sinceTag(updateCommit)),
  });
  switch (decision) {
    case "finish-rollout":
      return lastUpdate
        ? rolloutChoice(context, client, input, {
            group: lastUpdate.group,
            percentage: rollout,
            createdAt: origin?.createdAt ?? null,
          })
        : { action: "none", status: `${unit.name} ${version} is live` };
    case "promote":
      return {
        action: "pull-request",
        question: `Open the PR that moves production to ${unit.name} ${version}?`,
        branch: `chore/promote-${unit.name}-${version}`,
        title: `chore(release): production builds ${unit.name} ${version}`,
        body: [
          "## 🎯 What & why",
          "",
          `Production builds ${unit.name} ${version}, the version preview validated: \`${path.posix.join(unit.dir, options.versionFile)}\` production moves to it, the runtime version production updates target. Merge it, then \`release --channel production\` builds.`,
          "",
          "## ✅ Testing",
          "",
          "Version file only. No UI change.",
        ].join("\n"),
        changesets: [],
        write: () =>
          Promise.resolve([setBinaryVersion(context.root, unit, options, "production", version)]),
      };
    case "update":
      return { action: "ship", kind: "update", jobs: [updateJob(input)] };
    case "build": {
      const refusal = await buildRefusal(context, analysis, input);
      return refusal ? refuse(refusal) : { action: "ship", kind: "build", jobs: [buildJob(input)] };
    }
    case "wait":
      return {
        action: "none",
        status: `${unit.name} ${productionVersion} is building on EAS, submitted to the stores when done`,
      };
    case "shipped":
      return {
        action: "none",
        status: `${unit.name} ${builtVersion ?? version} is live`,
      };
    case "nothing":
      return {
        action: "none",
        status: `No ${unit.name} release to promote yet: release to preview first.`,
      };
    case "behind":
      return refuse({
        title: "main is behind",
        detail: "the last production build carries a newer version.",
        commands: ["git pull"],
      });
    case "moved-past": {
      const changed = await codeSince(analysis.git.head);
      const named = changed.slice(0, 3).join(", ") + (changed.length > 3 ? ", ..." : "");
      return refuse({
        title: `main moved past ${tagName(unit.name, version, context.tagFormat)}`,
        detail: `production ships what preview validated, and ${named} changed since, code preview never ran: release it to preview first.`,
        commands: ["pnpm changeset", "shiplane"],
      });
    }
  }
};

const ON_MERGE: Partial<Record<MobileRelease["ships"], string>> = {
  build: "Build iOS and Android, submitted when done",
  update: "Over-the-air update",
};

/**
 * A mobile app on EAS. The native fingerprint decides between a new binary and an over-the-air
 * update; production ships what preview validated, moving its version by PR first when it must.
 */
export type EasMobileDistributionAdapter = DeliveryAdapter<MobileDistributionPort>;

export const easMobileDistribution = (): EasMobileDistributionAdapter =>
  defineMobileDistribution({
    name: "eas",
    settings: EasOptions,
    decidedBy: { platform: "EAS", choice: "build or update", check: "shiplane status --json" },
    typicalMinutes: 8,
    // The binary versions move after a tag; the code does not.
    versionFiles: (unit) => [path.posix.join(unit.dir, EasOptions.parse(unit.options).versionFile)],
    describe: ({ environment }) => `EAS ${environment}, iOS and Android`,
    detect: (folder) => {
      if (!folder.has("eas.json")) return null;
      const scripts = z
        .object({ scripts: z.record(z.string(), z.string()).default({}) })
        .safeParse(JSON.parse(folder.read("package.json") ?? "{}"));
      const names = scripts.success ? Object.keys(scripts.data.scripts) : [];
      const pick = (environment: string) =>
        [`eas:update:${environment}`, `eas:update:${environment}:gated`].find((name) =>
          names.includes(name),
        ) ?? names.find((name) => name.includes("update") && name.includes(environment));
      const [preview, production] = [pick("preview"), pick("production")];
      return {
        certainty: "found",
        reason: "eas.json",
        options: preview && production ? { update: { preview, production } } : {},
      };
    },
    questions: (_folder, found) =>
      found.update === undefined
        ? [
            {
              key: "update",
              message: "Package script that publishes an update?",
              initial: "eas:update",
            },
          ]
        : [],
    requirements: (unit) => [
      {
        label: "eas",
        check: { command: "pnpm", args: ["exec", "eas", "whoami"], cwd: unit.dir },
        fix: { command: "pnpm", args: ["exec", "eas", "login"], cwd: unit.dir },
      },
    ],
    jobs: (input) => [buildJob(input), updateJob(input)],
    decide: (context, input) =>
      input.environment === "preview"
        ? previewDecision(context, input)
        : productionDecision(context, input),
    inspect: async (context, input) => {
      const { unit, environment, options } = input;
      const client = easClient(context.shell, path.join(context.root, unit.dir));
      const [analysis, lastUpdate] = await Promise.all([
        analyse(
          client,
          context.sourceControl,
          environment,
          binaryVersion(context.root, unit, options, environment),
          unit.name,
        ),
        client.lastUpdate(environment),
      ]);
      const rollout = lastUpdate?.rolloutPercentage ?? 100;
      return {
        ...analysisJson(analysis),
        ...(rollout < 100 ? { rolloutPercentage: rollout } : {}),
      };
    },
    // Only an update has launch data: a binary preview got for this release reports nothing here.
    health: async (context, { unit, tag }) => {
      const client = easClient(context.shell, path.join(context.root, unit.dir));
      const [last, tagged] = await Promise.all([
        client.lastUpdate("preview"),
        context.sourceControl.tagCommit(tag),
      ]);
      if (!last || !tagged) return null;
      const { commit } = await client.updateOrigin(last.group, "preview");
      if (!commit || (await context.changedCode(unit, tagged, commit)).length > 0) return null;
      return updateHealth(await client.updateLaunches(last.group, "preview"));
    },
    beforeVersion: async (context, input) => {
      const { unit, options, bump } = input;
      const client = easClient(context.shell, path.join(context.root, unit.dir));
      const analysis = await analyse(
        client,
        context.sourceControl,
        "preview",
        binaryVersion(context.root, unit, options, "preview"),
        unit.name,
      );
      const forced = input.chosen === "build" && analysis.plan.action !== "build";
      const mobile = mobileRelease(forced ? "build" : analysis.plan.action, bump, unit.version);
      const summary = forced
        ? ["↑ build  asked for, an update would do", ...verdictLines(analysis)]
        : verdictLines(analysis);
      if (mobile.ships === "blocked") {
        return {
          blocked: {
            title: "No release",
            detail:
              mobile.why === "build-running"
                ? "a preview build is still running: release once it's done, the native layer it carries decides the version."
                : "main is behind the last preview build's version.",
            commands: ["shiplane"],
          },
          added: [],
          writes: [],
          summary,
          onMerge: "Nothing ships",
        };
      }
      const changes = [...new Set(analysis.checked.flatMap(({ changes: lines }) => lines))];
      const version =
        mobile.ships === "build" || mobile.ships === "update" ? mobile.version : unit.version;
      return {
        choice: mobileChoice(analysis.plan.action, planWhy(analysis), unit.name),
        added: releaseChangesets(mobile, changes, unit.packageName),
        writes:
          mobile.ships === "build"
            ? [
                {
                  label: `preview app version → ${version}`,
                  run: async () => {
                    setBinaryVersion(context.root, unit, options, "preview", version);
                    await Promise.resolve();
                  },
                },
              ]
            : [],
        summary: mobile.ships === "nothing" ? ["– nothing changed"] : summary,
        onMerge: ON_MERGE[mobile.ships] ?? "Nothing ships",
        ...(mobile.ships === "build"
          ? {
              step: `Build iOS and Android ${version} on EAS, submitted to TestFlight and Play internal when done`,
            }
          : mobile.ships === "update"
            ? { step: `Publish ${version} over the air to preview` }
            : {}),
      };
    },
  });
