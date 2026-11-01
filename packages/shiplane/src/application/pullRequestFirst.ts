import type { OpenPr } from "../domain/releasePr";
import type { Decision } from "../ports/delivery.port";
import type { ReleaseContext } from "./context";
import { confirm, fail, paint } from "./say";
import { branchStep, openPrStep, pushStep, runSteps } from "./steps";
import { waitForMerge } from "./waitForMerge";

type PullRequest = Extract<Decision, { action: "pull-request" }>;

/**
 * A small PR a plugin needs merged before it ships, such as production's version moving: branch,
 * write, commit, push, open, back to main, wait for the merge, pull. `declined` when the person
 * said no.
 */
export const pullRequestFirst = async (
  context: ReleaseContext,
  request: PullRequest,
): Promise<"merged" | "declined" | "failed"> => {
  const { output, services } = context;
  if (!(await confirm(context, request.question))) {
    output.line(paint("dim", "  Not now."));
    return "declined";
  }
  const created: { pr?: OpenPr } = {};
  const opened = await runSteps(context, [
    branchStep(context, request.branch),
    {
      label: `commit "${request.title}"`,
      run: async () => {
        await request.write();
        for (const changeset of request.changesets) await services.versioning.write(changeset);
        await services.sourceControl.commit(
          await services.sourceControl.changedFiles(),
          request.title,
        );
      },
    },
    pushStep(context, request.branch),
    openPrStep(context, "open the pull request", async () => {
      created.pr = await services.codeHost.createPr({
        base: "main",
        head: request.branch,
        title: request.title,
        body: request.body,
        label: "type: chore",
      });
      return created.pr;
    }),
    { label: "back to main", run: () => services.sourceControl.switchTo("main") },
  ]);
  const { pr } = created;
  if (!opened || !pr) return "failed";
  output.line();
  if (!(await waitForMerge(context, pr))) {
    fail(context, `#${pr.number} was closed without a merge`, "nothing shipped.", ["shiplane"]);
    return "failed";
  }
  const pulled = await runSteps(context, [
    { label: "pull main", run: () => services.sourceControl.pull() },
  ]);
  return pulled ? "merged" : "failed";
};
