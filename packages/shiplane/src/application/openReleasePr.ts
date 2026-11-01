import type { AppBump } from "../domain/changes";
import type { OpenPr } from "../domain/releasePr";
import type { ReleaseContext } from "./context";
import type { Prepared } from "./prepareRelease";
import { releaseSource } from "../domain/governance";
import {
  releaseBranchName,
  releaseCommitBody,
  releasePrBody,
  releaseTitle,
} from "../domain/releasePr";
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
 * Null, with what to do, when it must not run.
 */
export const openReleasePr = async (
  context: ReleaseContext,
  prepared: Prepared,
): Promise<OpenPr[] | null> => {
  const { output, services, clock } = context;
  printSummary(context, prepared);
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
  const planned = [
    "Open the release PR, then wait for you to squash merge it",
    "Tag each version and publish its release notes",
    ...Object.values(prepared.contributions).flatMap(({ step }) => (step ? [step] : [])),
  ];
  output.line(paint("dim", "  Steps"));
  planned.forEach((step, index) => output.line(`  ${index + 1}. ${step}`));
  output.line();
  if (
    !(await confirm(
      context,
      `Release these ${
        environmentLabel(
          context,
          prepared.bumps.map(({ app }) => app),
          "preview",
        ) === "live"
          ? "live"
          : "to preview"
      }?`,
      true,
    ))
  ) {
    output.line(paint("dim", "Nothing ran."));
    return null;
  }
  const branch = releaseBranchName(clock.now());
  const title = releaseTitle(prepared.bumps);
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
