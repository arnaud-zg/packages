import type { AppBump } from "../domain/changes";
import type { KindOf, OpenPr } from "../domain/releasePr";
import type { ReleaseContext } from "./context";
import type { Prepared } from "./prepareRelease";
import { releaseSource } from "../domain/governance";
import {
  releaseBranchName,
  releaseCommitBody,
  releaseGroups,
  releasePrBody,
  releaseTitle,
} from "../domain/releasePr";
import { prepareRelease } from "./prepareRelease";
import { confirm, fail, listed, paint } from "./say";
import { branchStep, openPrStep, pushStep, runSteps } from "./steps";
import { environmentLabel, moduleOf } from "./targets";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** What happens to a unit once the release PR merges: its module ships the version to preview. */
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
    return `${environmentLabel(context, [bump.app], "preview") === "live" ? "Ship live" : "Ship to preview"} with ${(unit && moduleOf(context, unit)?.provider) ?? "its target"}${reason}`;
  };

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
  const { bumps, packages, pending, held, unreleased, contributions, companions } = prepared;
  const dot = paint("dim", "·");
  const stays = held.filter((app) => !bumps.some((bump) => bump.app === app));
  const heldLabel = stays.length > 0 ? `  ${dot}  ${stays.join(", ")} held` : "";
  const where = environmentLabel(
    context,
    bumps.map(({ app }) => app),
    "preview",
  );
  output.line();
  output.line(
    `  ${paint("bold", "Release")}  ${dot}  ${where}  ${dot}  ${plural(pending, "changeset")}${heldLabel}`,
  );
  output.line();
  // The unit column fits the longest name, as status does.
  const width = Math.max(13, ...release.units.map(({ name }) => name.length)) + 2;
  output.line(
    paint(
      "dim",
      `  ${"Unit".padEnd(width)}${"Version".padEnd(20)}${where === "live" ? "Ships live" : "Ships to preview"}`,
    ),
  );
  release.units.forEach((unit) => {
    const bump = bumps.find(({ app }) => app === unit.name);
    const version = bump ? `${bump.from} → ${bump.to}` : unit.version;
    const left = unreleased.find(({ app }) => app === unit.name);
    const ships = (() => {
      if (held.includes(unit.name) && !bump)
        return paint("yellow", "⏸ held, its changesets stay pending");
      if (left && !bump) {
        return paint(
          "yellow",
          `! ${plural(left.commits.length, "commit")} since ${left.version}, no changeset: not in this release`,
        );
      }
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

/**
 * Versions what `prepared` covers on one branch from main, opens its PR, and goes back to main.
 * Too many apps for one title, it opens the first group's PR only: run again once it merges, and
 * the next group's opens, `confirmed` so the plan is not asked twice. Null when it must not run.
 */
export const openReleasePr = async (
  context: ReleaseContext,
  prepared: Prepared,
  { confirmed = false, part = 1 }: { confirmed?: boolean; part?: number } = {},
): Promise<OpenPr[] | null> => {
  const { output, services, clock } = context;
  if (!confirmed) printSummary(context, prepared);
  const blocked = Object.values(prepared.contributions).find((entry) => entry.blocked)?.blocked;
  if (blocked) {
    fail(context, blocked.title, blocked.detail, blocked.commands);
    return null;
  }
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
  const kindOf = kindsOf(context);
  const groups = releaseGroups(prepared.bumps, kindOf);
  if (!confirmed) {
    const planned = [
      groups.length > 1
        ? `Open ${groups.length} release PRs, one after the other, so each title names its apps:\n${groups
            .map((group) => `       ${releaseTitle(group, kindOf)}`)
            .join("\n")}\n     and wait for you to squash merge each one`
        : "Open the release PR, then wait for you to squash merge it",
      "Tag each version and publish its release notes",
      ...Object.values(prepared.contributions).flatMap(({ step }) => (step ? [step] : [])),
    ];
    output.line(paint("dim", "  Steps"));
    planned.forEach((step, index) => output.line(`  ${index + 1}. ${step}`));
    output.line();
    const where = environmentLabel(
      context,
      prepared.bumps.map(({ app }) => app),
      "preview",
    );
    if (
      !(await confirm(context, `Release these ${where === "live" ? "live" : "to preview"}?`, true))
    ) {
      output.line(paint("dim", "Nothing ran."));
      return null;
    }
  }
  // Too many apps for one title: this PR takes the first group; the next opens once it merges.
  const [first] = groups;
  const scoped =
    groups.length > 1 && first
      ? await prepareRelease(context, new Set(first.map(({ app }) => app)))
      : prepared;
  return openOne(context, scoped, kindOf, clock.now(), groups.length > 1 || part > 1 ? part : null);
};

/** Each app's module kind, as the release names it. */
export const kindsOf =
  (context: ReleaseContext): KindOf =>
  (app) => {
    const unit = context.release.units.find(({ name }) => name === app);
    return unit && moduleOf(context, unit)?.kind;
  };

/** Versions `prepared` on its own branch from main, opens its PR, and goes back to main. */
const openOne = async (
  context: ReleaseContext,
  prepared: Prepared,
  kindOf: KindOf,
  now: Date,
  part: number | null,
): Promise<OpenPr[] | null> => {
  const { services } = context;
  // Parts of one release can open within a minute: each names its own branch.
  const branch = `${releaseBranchName(now)}${part === null ? "" : `-part-${part}`}`;
  const title = releaseTitle(prepared.bumps, kindOf);
  const prs: OpenPr[] = [];
  const done = await runSteps(context, [
    branchStep(context, branch),
    {
      label: "versions and changelogs",
      run: () => services.versioning.apply(prepared.added, prepared.split.waits),
    },
    ...Object.values(prepared.contributions).flatMap(({ writes }) => writes),
    {
      label: `commit "${title}"`,
      run: async () =>
        services.sourceControl.commit(
          await services.sourceControl.changedFiles(),
          title,
          releaseCommitBody(prepared.bumps) || undefined,
        ),
    },
    pushStep(context, branch),
    openPrStep(context, "open the release pull request", async () => {
      const pr = await services.codeHost.createPr({
        base: "main",
        head: branch,
        title,
        body: releasePrBody(prepared.bumps, shipsOnMerge(context, prepared)),
        label: "type: chore",
      });
      prs.push(pr);
      return pr;
    }),
    { label: "back to main", run: () => services.sourceControl.switchTo("main") },
  ]);
  return done ? prs : null;
};
