import type { MergeMethod, OpenPr, WaitAction } from "../domain/releasePr";
import type { ReleaseContext } from "./context";
import { mergeChoices, waitKey } from "../domain/releasePr";
import { fail, keyHints, paint } from "./say";

const POLL_MS = 15_000;

/** How a wait for the release PR ends: merged, closed on the host, or left to a later run. */
export type WaitOutcome = "merged" | "closed" | "left";

/** Merges the pull request with the method the person picks. GitHub refuses approving your own PR. */
const mergeHere = async (context: ReleaseContext, pr: OpenPr) => {
  const { choices, initial } = mergeChoices(await context.services.codeHost.mergeMethods());
  if (choices.length === 0) {
    fail(context, "No merge method", "the repository allows none: merge it on GitHub.");
    return;
  }
  const method = await context.prompter.select<MergeMethod | "no">(
    `Merge #${pr.number} into main?`,
    [...choices, { value: "no", label: "Not now" }],
    initial,
  );
  if (!method || method === "no") {
    context.output.line(paint("dim", "  Not merged."));
    return;
  }
  await context.services.codeHost.merge(pr, method);
};

const ACTIONS: Record<WaitAction, (context: ReleaseContext, pr: OpenPr) => Promise<void>> = {
  diff: (context, pr) => context.services.codeHost.showDiff(pr),
  merge: mergeHere,
  open: (context, pr) => context.services.codeHost.openInBrowser(pr),
};

/** The keys a wait offers. Someone else approves a release that requires it: no merge from here. */
const hintsFor = (approvalRequired: boolean) => [
  { key: "d", label: "see the diff" },
  ...(approvalRequired ? [] : [{ key: "m", label: "merge it from here" }]),
  { key: "o", label: "open it on GitHub" },
  { key: "Ctrl-C", label: "leave, continue later" },
];

/**
 * Polls the host until the PR merges or closes; in a terminal the person can also read the diff
 * (d), merge from here (m, unless approval is required) or open it in the browser (o). Without a
 * terminal, a release waiting on someone's approval is left for a later run instead.
 */
export const waitForMerge = async (context: ReleaseContext, pr: OpenPr): Promise<WaitOutcome> => {
  const { output, prompter, services } = context;
  const approvalRequired = context.release.flow.approval === "required";
  output.line(`  ${paint("green", "✓")} Release PR  ${paint("cyan", pr.url)}`);
  if (approvalRequired) {
    output.line(`    Waiting for approval on #${pr.number}. This can take a while.`);
    output.line(paint("dim", "    It's safe to leave: run shiplane later and it picks up here."));
  } else {
    output.line(
      paint(
        "dim",
        "    Review and merge it here or on GitHub; this carries on by itself once merged.",
      ),
    );
  }
  if (approvalRequired && !prompter.interactive) {
    const state = await services.codeHost.prState(pr).catch(() => "OPEN" as const);
    if (state === "OPEN") return "left";
    return state === "MERGED" ? "merged" : "closed";
  }
  const hints = hintsFor(approvalRequired);
  if (prompter.interactive) {
    output.line();
    output.line(`    ${keyHints(hints)}`);
  }
  output.line();
  const keys = prompter.interactive
    ? hints.map(({ key }) => key).filter((key) => key.length === 1)
    : [];
  for (;;) {
    const state = await services.codeHost.prState(pr).catch(() => "OPEN" as const);
    if (state !== "OPEN") return state === "MERGED" ? "merged" : "closed";
    const key = await prompter.waitForKey(
      approvalRequired
        ? `Waiting for #${pr.number} to be approved and merged`
        : `Waiting for #${pr.number} to merge`,
      POLL_MS,
      keys,
    );
    const action = key && keys.includes(key) ? waitKey(key) : null;
    if (action) await ACTIONS[action](context, pr);
  }
};
