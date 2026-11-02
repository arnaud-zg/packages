import type { OpenPr } from "../domain/releasePr";
import type { ReleaseContext } from "./context";
import { nextStep, RELEASE_BRANCH_PREFIX } from "../domain/releasePr";
import { openReleasePr, printSummary } from "./openReleasePr";
import { pickScope } from "./pickScope";
import { prepareRelease } from "./prepareRelease";
import { preflight } from "./requirements";
import { listed, paint } from "./say";
import { shipTo } from "./ship";
import { runSteps } from "./steps";
import { missingTags, tagRelease } from "./tagRelease";
import { waitForMerge } from "./waitForMerge";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The commits main gained since a release PR's branch, or none when the host did not say. */
const movedPast = async (context: ReleaseContext, pr: OpenPr, originMain: string) => {
  if (!pr.head) return [];
  return context.services.sourceControl.commitsBetween(pr.head, originMain).catch(() => []);
};

/** Why a stale release PR closed, said on it, so a reviewer landing there knows where to go. */
const closedComment = (replacement: readonly OpenPr[], subjects: readonly string[]) =>
  [
    `Closed by shiplane: ${plural(subjects.length, "commit")} ${subjects.length === 1 ? "was" : "were"} merged into main after this release PR was opened, so its changelog no longer matched what would ship.`,
    `Replaced by ${listed(replacement.map(({ number }) => `#${number}`))}, which versions everything merged so far. Please review that one.`,
    "",
    ...subjects.map((subject) => `- ${subject}`),
  ].join("\n");

/**
 * Release PRs main moved past are replaced: a fresh one versions everything merged, then each
 * stale one closes with a comment pointing to it. The open ones, or null when that failed.
 */
const refreshStale = async (
  context: ReleaseContext,
  prs: OpenPr[],
  scope: ReadonlySet<string>,
): Promise<OpenPr[] | null> => {
  const { originMain } = await context.services.sourceControl.position();
  const moved = await Promise.all(prs.map((pr) => movedPast(context, pr, originMain)));
  const subjects = [...new Set(moved.flat().map(({ subject }) => subject))];
  if (subjects.length === 0) return prs;
  const { output, progress } = context;
  const names = listed(prs.map(({ number }) => `#${number}`));
  progress.say(
    "thinking",
    `↻ Release ${names} is out of date: ${plural(subjects.length, "commit")} landed on main since.`,
  );
  output.line(paint("dim", "    Replacing it so the changelog matches what ships."));
  const prepared = await prepareRelease(context, scope);
  const opened = await openReleasePr(context, prepared, prs);
  if (!opened) return null;
  for (const pr of prs)
    await context.services.codeHost.closePr(pr, closedComment(opened, subjects));
  output.line(
    `  ${paint("green", "✓")} Opened ${listed(opened.map(({ number }) => `#${number}`))}${context.release.flow.approval === "required" ? " (needs approval again)" : ""}  ${paint("green", "✓")} Closed ${names}, with a comment pointing to it`,
  );
  return opened;
};

const STAGES = ["What to release", "Versions", "Release PR", "Merge", "Tags", "Ship"] as const;

/**
 * `release` on preview: the release PR, the wait for its merge, the tags, then the ship. It reads where things
 * stand first, so a run stopped anywhere picks up where it left off. False when something failed.
 */
export const releaseToPreview = async (context: ReleaseContext): Promise<boolean> => {
  const { output, services, progress } = context;
  const stage = (name: (typeof STAGES)[number]) => progress.stage(STAGES, STAGES.indexOf(name));
  stage("What to release");
  const picked = await pickScope(context, "preview");
  if (!picked || picked.scope.size === 0) {
    progress.say("resting", paint("dim", "Nothing ran."));
    return true;
  }
  if (!(await preflight(context, picked.scope))) return false;
  const covered = picked.info.filter(({ app }) => picked.scope.has(app));
  const [releasePrs, missing] = await progress.during(
    "Looking for an open release PR and versions not tagged yet",
    "thinking",
    () => Promise.all([services.codeHost.openPrsFrom(RELEASE_BRANCH_PREFIX), missingTags(context)]),
  );
  const step = nextStep({
    pending: covered.reduce((sum, { changesets }) => sum + changesets, 0),
    releasePrs,
    untagged: missing.length,
    unreleased: covered.filter(({ changesets, commits }) => changesets === 0 && commits > 0).length,
  });
  let prs: OpenPr[] = [];
  let current = context;
  if (step.step === "release-pr") {
    stage("Versions");
    const prepared = await progress.during(
      "Planning each app's version with changesets, and what its target ships",
      "thinking",
      () => prepareRelease(context, picked.scope),
    );
    if (prepared.bumps.length === 0 && prepared.packages === 0) {
      printSummary(context, prepared);
      output.line(
        paint("dim", "  Nothing to version for these units: the others wait for a later release."),
      );
      return true;
    }
    stage("Release PR");
    const opened = await openReleasePr(context, prepared);
    if (!opened) return false;
    prs = opened;
  } else if (step.step === "wait-merge") {
    const fresh = await refreshStale(context, step.prs, picked.scope);
    if (!fresh) return false;
    if (fresh === step.prs) {
      const waiting = context.release.flow.approval === "required" ? "approval" : "a merge";
      progress.say(
        "thinking",
        `↻ Picking up release ${listed(fresh.map(({ number }) => `#${number}`))}: still waiting for ${waiting}`,
      );
      output.line(paint("dim", "    To cancel it, close it on GitHub."));
    }
    prs = fresh;
  } else if (missing.length > 0) {
    progress.say("thinking", `↻ Picking up a merged release`);
    output.line(
      paint("dim", `    Left to do: tag ${plural(missing.length, "version")} → ship to preview`),
    );
  }
  if (prs.length > 0) stage("Merge");
  for (const pr of prs) {
    output.line();
    const outcome = await waitForMerge(context, pr);
    if (outcome === "closed") {
      progress.say("resting", `○ Release #${pr.number} was closed: nothing shipped.`);
      output.line(paint("dim", "    Run shiplane to open a new release with everything pending."));
      return true;
    }
    if (outcome === "left") {
      output.line(paint("dim", `  Left #${pr.number} waiting. Run shiplane once it's approved.`));
      return true;
    }
    progress.say("happy", `${paint("green", "✓")} Release PR #${pr.number} merged`);
  }
  if (prs.length > 0) {
    const pulled = await runSteps(context, [
      { label: "switch to main", run: () => services.sourceControl.switchTo("main") },
      { label: "pull main", run: () => services.sourceControl.pull() },
    ]);
    if (!pulled) return false;
    current = { ...context, release: await context.load() };
  }
  const tags = prs.length > 0 ? await missingTags(current) : missing;
  if (tags.length > 0) stage("Tags");
  if (!(await tagRelease(current, tags))) return false;
  stage("Ship");
  // A unit the release took along unpicked is tagged with the rest, so it ships with them too.
  return shipTo(current, "preview", {
    scope: new Set([...picked.scope, ...tags.map(({ app }) => app)]),
  });
};
