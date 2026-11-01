import type { MergeMethod, OpenPr, WaitAction } from "../domain/releasePr";
import type { ReleaseContext } from "./context";
import { mergeChoices, waitKey } from "../domain/releasePr";
import { fail, paint } from "./say";

const POLL_MS = 15_000;
const KEYS = ["d", "m", "o"];

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

/**
 * True once merged, false when closed without a merge. It polls the host; in a terminal the person
 * can also read the diff (d), merge from here (m) or open it in the browser (o).
 */
export const waitForMerge = async (context: ReleaseContext, pr: OpenPr): Promise<boolean> => {
  const { output, prompter, services } = context;
  output.line(`  ${paint("green", "✓")} Release PR  ${paint("cyan", pr.url)}`);
  output.line(
    paint(
      "dim",
      "    Review and merge it here or on GitHub; this carries on by itself once merged.",
    ),
  );
  if (prompter.interactive) {
    output.line(
      `    ${paint("cyan", "d")} ${paint("dim", "see the diff")}   ${paint("cyan", "m")} ${paint("dim", "merge it from here")}   ${paint("cyan", "o")} ${paint("dim", "open it on GitHub")}   ${paint("cyan", "Ctrl-C")} ${paint("dim", "stop, release picks up here")}`,
    );
  }
  output.line();
  for (;;) {
    const state = await services.codeHost.prState(pr).catch(() => "OPEN" as const);
    if (state !== "OPEN") return state === "MERGED";
    const key = await prompter.waitForKey(
      `Waiting for #${pr.number} to merge`,
      POLL_MS,
      prompter.interactive ? KEYS : [],
    );
    const action = waitKey(key ?? undefined);
    if (action) await ACTIONS[action](context, pr);
  }
};
