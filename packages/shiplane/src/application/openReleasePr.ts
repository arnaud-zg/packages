import type { AppBump } from "../domain/changes";
import type { KindOf, OpenPr } from "../domain/releasePr";
import type { ReleaseContext } from "./context";
import type { Prepared } from "./prepareRelease";
import { releaseSource } from "../domain/governance";
import {
  releaseBranchName,
  releaseCommitBody,
  releasePrBody,
  releasePrGroups,
  releaseTitle,
  titleFits,
} from "../domain/releasePr";
import { chooseVersion } from "./chooseVersion";
import { prepareRelease } from "./prepareRelease";
import { fail, listed, paint } from "./say";
import { branchStep, openPrStep, pushStep, runSteps } from "./steps";
import { destination, environmentLabel, moduleOf } from "./targets";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** What happens to a unit once the release PR merges: its module ships the version. */
const shipsOnMerge =
  (context: ReleaseContext, { contributions, companions }: Prepared) =>
  (bump: AppBump) => {
    const contributed = contributions[bump.app]?.onMerge;
    if (contributed) return contributed;
    const unit = context.release.units.find(({ name }) => name === bump.app);
    const along = companions.find(({ app }) => app === bump.app);
    const reason = along
      ? ` (not picked: ${along.why})`
      : bump.movedWith.length > 0
        ? ` (moved with ${bump.movedWith.join(", ")})`
        : "";
    return `Ship ${destination(context, [bump.app], "preview")} with ${(unit && moduleOf(context, unit)?.provider) ?? "its target"}${reason}`;
  };

/** Where a release sends what it moves. */
const whereTo = (context: ReleaseContext, { bumps }: Prepared) =>
  destination(
    context,
    bumps.map(({ app }) => app),
    "preview",
  );

/** Units going out unpicked, each with the package that takes it along. */
const printCompanions = ({ output, release }: ReleaseContext, { companions, split }: Prepared) => {
  if (companions.length === 0) return;
  const names = companions.map(({ app }) => app);
  const verb = names.length === 1 ? "is not picked but ships too" : "are not picked but ship too";
  output.line(`  ${paint(["bold", "yellow"], "!")} ${paint("bold", `${listed(names)} ${verb}:`)}`);
  companions.forEach(({ app, version, why }) => {
    const packageName = release.units.find(({ name }) => name === app)?.packageName;
    const waiting = split.waits.filter(({ releases }) =>
      releases.some(({ name }) => name === packageName),
    ).length;
    const own = waiting > 0 ? ` · picking it ships its ${plural(waiting, "changeset")} too` : "";
    output.line(`      ${app.padEnd(11)}${version.padEnd(20)}${paint("dim", `${why}${own}`)}`);
  });
  output.line();
};

/** The table a person reads before anything is written: each unit, its move, what ships. */
export const printSummary = (context: ReleaseContext, prepared: Prepared) => {
  const { output, release } = context;
  const { bumps, packages, pending, held, contributions, companions } = prepared;
  const dot = paint("dim", "·");
  const stays = held.filter((app) => !bumps.some((bump) => bump.app === app));
  const heldLabel = stays.length > 0 ? `  ${dot}  ${stays.join(", ")} held` : "";
  const moving = bumps.map(({ app }) => app);
  output.line();
  output.line(
    `  ${paint("bold", "Release")}  ${dot}  ${environmentLabel(context, moving, "preview")}  ${dot}  ${plural(pending, "changeset")}${heldLabel}`,
  );
  output.line();
  // The unit column fits the longest name, as status does.
  const width = Math.max(13, ...release.units.map(({ name }) => name.length)) + 2;
  output.line(
    paint(
      "dim",
      `  ${"Unit".padEnd(width)}${"Version".padEnd(20)}Ships ${destination(context, moving, "preview")}`,
    ),
  );
  release.units.forEach((unit) => {
    const bump = bumps.find(({ app }) => app === unit.name);
    const version = bump ? `${bump.from} → ${bump.to}` : unit.version;
    const ships = (() => {
      if (held.includes(unit.name) && !bump)
        return paint("yellow", "⏸ held, its changesets stay pending");
      const contributed = contributions[unit.name]?.summary;
      if (contributed && contributed.length > 0)
        return contributed.join(`\n  ${" ".repeat(width + 20)}`);
      if (!bump) return paint("dim", "– nothing changed");
      const along = companions.some(({ app }) => app === unit.name)
        ? paint("yellow", "  not picked, goes along")
        : "";
      return `${paint("green", "↑ ship")}  ${paint("dim", moduleOf(context, unit)?.provider ?? "")}${along}`;
    })();
    output.line(`  ${unit.name.padEnd(width)}${version.padEnd(20)}${ships}`);
  });
  if (packages > 0) {
    output.line(
      `  ${"packages".padEnd(width)}${`${packages} bumped`.padEnd(20)}${paint("dim", "changelogs only, nothing published")}`,
    );
  }
  output.line();
  printCompanions(context, prepared);
};

/** Says what a plugin refuses in `prepared`; true when something does. */
const refused = (context: ReleaseContext, { contributions }: Prepared) => {
  const blocked = Object.values(contributions).find((entry) => entry.blocked)?.blocked;
  if (blocked) fail(context, blocked.title, blocked.detail, blocked.commands);
  return Boolean(blocked);
};

/**
 * Versions what `prepared` covers on one branch from main, opens its PR, and goes back to main.
 * Null, with what to do, when it must not run.
 */
export const openReleasePr = async (
  context: ReleaseContext,
  prepared: Prepared,
  /** Release PRs this one takes the place of, named at the top of its description. */
  replaces: readonly OpenPr[] = [],
): Promise<OpenPr[] | null> => {
  const { output, services, clock } = context;
  printSummary(context, prepared);
  if (refused(context, prepared)) return null;
  const source = releaseSource("build", "preview", await services.sourceControl.position());
  if (!source.allowed) {
    fail(
      context,
      source.why === "not-main" ? "Not from main" : "main is behind origin",
      "a release versions what is merged.",
      ["git switch main", "git pull", "shiplane"],
    );
    return null;
  }
  if (!(await services.sourceControl.isClean())) {
    fail(
      context,
      "Uncommitted changes",
      "commit or stash them first, the release PR commits every change.",
    );
    return null;
  }
  const kindOf: KindOf = (app) => {
    const unit = context.release.units.find(({ name }) => name === app);
    return unit && moduleOf(context, unit)?.kind;
  };
  const groups = prGroupsOf(context, prepared);
  const titles = groups.map((group) => releaseTitle(group, kindOf));
  const planned = [
    groups.length > 1
      ? `Open ${groups.length} release PRs from main, one per app, then wait for you to squash merge each:\n${titles
          .map((title) => `       ${title}`)
          .join("\n")}`
      : "Open the release PR, then wait for you to squash merge it",
    "Tag each version and publish its release notes",
    ...Object.values(prepared.contributions).flatMap(({ step }) => (step ? [step] : [])),
  ];
  output.line(paint("dim", "  Steps"));
  planned.forEach((step, index) => output.line(`  ${index + 1}. ${step}`));
  output.line();
  const chosen = await chooseVersion(context, prepared, whereTo(context, prepared));
  if (!chosen) {
    output.line(paint("dim", "Nothing ran."));
    return null;
  }
  // A forced version can change what a plugin decides, and what its changeset ties together.
  if (refused(context, chosen)) return null;
  const opening = prGroupsOf(context, chosen);
  const now = clock.now();
  const prs: OpenPr[] = [];
  for (const group of opening) {
    const apps = new Set(group.map(({ app }) => app));
    const scoped =
      opening.length > 1 ? await prepareRelease(context, apps, chosen.contributions) : chosen;
    const [first] = group;
    const branch = `${releaseBranchName(now)}${opening.length > 1 && first ? `-${first.app}` : ""}`;
    const pr = await openOne(context, scoped, kindOf, branch, replaces);
    if (!pr) {
      if (prs.length > 0) {
        output.line(
          paint(
            "dim",
            `  ${listed(prs.map(({ number }) => `#${number}`))} stay open: merge them, then run shiplane for the rest.`,
          ),
        );
      }
      return null;
    }
    prs.push(pr);
  }
  return prs;
};

/**
 * The apps each release PR takes: one PR per app, a family as one. Apps one changeset names or
 * one moving with the other share a PR. A release moving internal packages stays one PR: their
 * changelog lines have no app to go with.
 */
const prGroupsOf = ({ release }: ReleaseContext, prepared: Prepared) => {
  if (prepared.packages > 0) return [prepared.bumps];
  const appOf = (packageName: string) =>
    release.units.find((unit) => unit.packageName === packageName)?.name;
  const linked = [
    ...prepared.shipped.map(({ releases }) => releases.map(({ name }) => appOf(name) ?? name)),
    ...prepared.bumps.map(({ app, movedWith }) => [
      app,
      ...movedWith.map((name) => appOf(name) ?? name),
    ]),
  ];
  return releasePrGroups(prepared.bumps, linked);
};

/** The line a release PR opens with when it takes the place of release PRs main moved past. */
const replacedLine = (replaces: readonly OpenPr[]) =>
  replaces.length === 0
    ? ""
    : `Replaces ${listed(replaces.map(({ number }) => `#${number}`))}, which went out of date when main moved.\n\n`;

/** Versions `prepared` on `branch` from main, opens its PR, and goes back to main. */
const openOne = async (
  context: ReleaseContext,
  prepared: Prepared,
  kindOf: KindOf,
  branch: string,
  replaces: readonly OpenPr[],
): Promise<OpenPr | null> => {
  const { services } = context;
  const title = releaseTitle(prepared.bumps, kindOf);
  // A title naming more apps than a header holds skips the commit hooks (commitlint's 100
  // characters) for this commit only.
  const skipHooks = !titleFits(title);
  const created: { pr?: OpenPr } = {};
  const done = await runSteps(context, [
    branchStep(context, branch),
    {
      label: "versions and changelogs",
      run: () =>
        services.versioning.apply(prepared.added, prepared.split.waits, prepared.forced?.level),
    },
    ...Object.values(prepared.contributions).flatMap(({ writes }) => writes),
    {
      label: `commit "${title}"`,
      run: async () =>
        services.sourceControl.commit(
          await services.sourceControl.changedFiles(),
          title,
          releaseCommitBody(prepared.bumps) || undefined,
          { skipHooks },
        ),
    },
    pushStep(context, branch),
    openPrStep(context, "open the release pull request", async () => {
      created.pr = await services.codeHost.createPr({
        base: "main",
        head: branch,
        title,
        body:
          replacedLine(replaces) +
          releasePrBody(
            prepared.bumps,
            shipsOnMerge(context, prepared),
            whereTo(context, prepared),
          ),
        label: "type: chore",
      });
      return created.pr;
    }),
    { label: "back to main", run: () => services.sourceControl.switchTo("main") },
  ]);
  return done && created.pr ? created.pr : null;
};
