import type { OpenPr } from "../domain/releasePr";
import type { ReleaseContext } from "./context";
import { nextStep, RELEASE_BRANCH_PREFIX } from "../domain/releasePr";
import { openReleasePr, printSummary } from "./openReleasePr";
import { pickScope } from "./pickScope";
import { prepareRelease } from "./prepareRelease";
import { preflight } from "./requirements";
import { fail, paint } from "./say";
import { shipTo } from "./ship";
import { runSteps } from "./steps";
import { missingTags, tagRelease } from "./tagRelease";
import { waitForMerge } from "./waitForMerge";

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
    prs = step.prs;
  }
  if (prs.length > 0) stage("Merge");
  for (const pr of prs) {
    output.line();
    if (!(await waitForMerge(context, pr))) {
      fail(context, `#${pr.number} was closed without a merge`, "nothing shipped.", ["shiplane"]);
      return false;
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
