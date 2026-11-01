import { styleText } from "node:util";
import type { Environment, GitPosition, Health, SourceControlPort } from "shiplane/plugin";
import { progressBar } from "shiplane/plugin";

import type { easClient } from "./client";
import type {
  Platform,
  PlatformState,
  PlatformVerdict,
  ReleaseAction,
  ReleasePlan,
} from "./policy";
import { platformVerdict, releasePlan, timeOut } from "./policy";

export const PLATFORMS: Platform[] = ["ios", "android"];

export const PLATFORM_NAME: Record<Platform, string> = { ios: "iOS", android: "Android" };

export interface Analysis {
  channel: Environment;
  version: string;
  commit: string;
  git: GitPosition;
  checked: { state: PlatformState; verdict: PlatformVerdict; changes: string[] }[];
  plan: ReleasePlan;
}

/** Each platform's last store build on the channel against this commit's native fingerprint. */
export const analyse = async (
  client: ReturnType<typeof easClient>,
  source: SourceControlPort,
  environment: Environment,
  version: string,
  unit: string,
): Promise<Analysis> => {
  const position = await source.position();
  const checked = await Promise.all(
    PLATFORMS.map(async (platform) => {
      const [fingerprint, builds] = await Promise.all([
        client.localFingerprint(platform, environment),
        client.channelBuilds(platform, environment),
      ]);
      const state: PlatformState = {
        platform,
        local: { fingerprint, version, commit: position.head },
        ...builds,
      };
      const verdict = platformVerdict(state);
      const changes =
        verdict.action === "build" && verdict.why === "native-changed" && verdict.shipped
          ? await client.nativeChanges(verdict.shipped.id, environment)
          : [];
      return { state, verdict, changes };
    }),
  );
  return {
    channel: environment,
    version,
    commit: position.head,
    git: position,
    checked,
    plan: releasePlan(
      environment,
      checked.map(({ verdict }) => verdict),
      unit,
    ),
  };
};

const LOOK: Record<ReleaseAction, { mark: string; style: "green" | "yellow" | "red" }> = {
  update: { mark: "✓", style: "green" },
  submit: { mark: "↑", style: "green" },
  wait: { mark: "…", style: "yellow" },
  pull: { mark: "↓", style: "yellow" },
  build: { mark: "✗", style: "red" },
};

/** Why a platform needs what it needs, as a person reads it. */
export const why = (verdict: PlatformVerdict): string => {
  switch (verdict.action) {
    case "update":
      return "same native layer and version as the last build";
    case "submit":
      return "the last build was made from this commit";
    case "wait":
      return `build ${verdict.running.buildNumber ?? "?"} for this version is still running`;
    case "pull":
      return `this branch misses the ${verdict.newerVersion} release of a build on this channel`;
    case "build":
      // Builds that errored leave no binary: the last finished one is what devices run.
      return {
        "no-build": "no store build on this channel yet",
        "no-fingerprint": "the last build has no fingerprint, nothing proves an update fits",
        "native-changed": "native code changed since the last build",
        "version-changed": `no binary carries this version yet: the last finished build is ${verdict.shipped?.appVersion ?? "older"}`,
      }[verdict.why];
  }
};

/** Why the deciding platform needs what the plan says, or nothing when none decided. */
export const planWhy = ({ checked, plan }: Analysis) => {
  const shown = checked.find(({ verdict }) => verdict.action === plan.action);
  return shown ? why(shown.verdict) : "";
};

const MAX_CHANGES = 6;

/** The verdict line a summary shows for the platform that decides, with what changed under it. */
export const verdictLines = ({ checked, plan }: Analysis): string[] => {
  const shown = checked.find(({ verdict }) => verdict.action === plan.action);
  if (!shown) return [];
  const look = LOOK[shown.verdict.action];
  return [
    `${styleText(look.style, `${look.mark} ${shown.verdict.action}`)}  ${styleText("dim", why(shown.verdict))}`,
    ...shown.changes.slice(0, MAX_CHANGES).map((change) => styleText("dim", `  ${change}`)),
  ];
};

/** The analysis as `status --json` prints it, the same shape the old release check printed. */
export const analysisJson = ({ channel, version, commit, plan, checked }: Analysis) => ({
  channel,
  version,
  commit,
  ...plan,
  platforms: checked.map(({ verdict, changes }) => ({ ...verdict, changes })),
});

const count = (total: number, one: string, many: string) => `${total} ${total === 1 ? one : many}`;

/** An update's health from its launches: unwell once it crashed, or while nobody has run it. */
export const updateHealth = (
  launches: { platform: Platform; installs: number; failedInstalls: number }[],
): Health => {
  const summary = launches
    .map(
      ({ platform, installs, failedInstalls }) =>
        `${PLATFORM_NAME[platform]} ${count(installs, "launch", "launches")}, ${count(failedInstalls, "crash", "crashes")}`,
    )
    .join(" · ");
  const crashes = launches.reduce((sum, { failedInstalls }) => sum + failedInstalls, 0);
  if (crashes > 0) {
    return { ok: false, summary, why: `${count(crashes, "crash", "crashes")} on preview` };
  }
  if (launches.every(({ installs }) => installs === 0)) {
    return { ok: false, summary, why: "nobody has launched it on preview yet" };
  }
  return { ok: true, summary };
};

/** Where a rollout stands, as the lines above the question: whose, how far, how long, how it does. */
export const rolloutLines = ({
  tag,
  environment,
  percentage,
  hoursOut,
  health,
}: {
  tag: string;
  environment: Environment;
  percentage: number;
  hoursOut: number;
  health: Health;
}) => [
  `${styleText("bold", tag)} ${styleText("dim", `on ${environment}`)}`,
  `${styleText(health.ok ? "green" : "yellow", progressBar(percentage, 100, 20))}  ${percentage}% of people · out for ${timeOut(hoursOut)}`,
  styleText("dim", health.summary),
];
