import type { OpenPr } from "../domain/releasePr";
import type { ReleaseContext } from "./context";
import { CommandFailed } from "../ports/shell.port";
import { fail, paint } from "./say";

/** How a step takes back what it did, and what a person runs when that fails too. */
export interface Undo {
  label: string;
  run: () => Promise<void>;
  byHand: () => string[];
}

/** What a step leaves in place on purpose when a later one fails, and what finishes the job. */
export interface Kept {
  label: string;
  byHand: () => string[];
}

/** One labelled thing a release does; the label is what a dry run or a failure shows. */
export interface Step {
  label: string;
  run: () => Promise<void>;
  /** Run when a later step fails, so a stopped release leaves nothing half done. */
  undo?: Undo;
  /** What stays when a later step fails, said instead of claiming all was undone. */
  kept?: Kept;
}

const MAX_OUTPUT_LINES = 40;

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What the failed command printed, so the person reads why without running it again. */
const printOutput = ({ output }: ReleaseContext, error: unknown) => {
  if (!(error instanceof CommandFailed) || !error.output) return;
  const lines = error.output.split("\n");
  const shown = lines.slice(-MAX_OUTPUT_LINES);
  if (shown.length < lines.length) {
    output.line(paint("dim", `    … ${lines.length - shown.length} earlier lines`));
  }
  shown.forEach((line) => output.line(paint("dim", `    │ ${line}`)));
};

/** Takes back the steps that ran, newest first; one that cannot be undone never stops the rest. */
const cancel = async (context: ReleaseContext, ran: readonly Step[]) => {
  const undos = ran.flatMap(({ undo }) => (undo ? [undo] : [])).reverse();
  const kept = ran.flatMap((step) => (step.kept ? [step.kept] : []));
  if (undos.length === 0 && kept.length === 0) return;
  const left: Undo[] = [];
  for (const undo of undos) {
    try {
      await context.progress.during(`undo: ${undo.label}`, "working", undo.run);
    } catch (error) {
      left.push(undo);
      context.progress.say(
        "worried",
        `${paint("red", "✗")} undo ${undo.label}: ${reasonOf(error)}`,
      );
    }
  }
  if (left.length === 0 && kept.length === 0) {
    context.progress.say("resting", paint("dim", "Cancelled: everything this run did is undone."));
    return;
  }
  const commands = [...new Set([...left, ...kept].flatMap(({ byHand }) => byHand()))];
  const these = commands.length > 1 ? "these" : "this";
  const ask = kept.length === 0 ? "run these to finish the cleanup:" : `run ${these} to finish:`;
  fail(
    context,
    "Cancelled, not all of it",
    [...kept.map(({ label }) => label), ask].join("; "),
    commands,
  );
};

/**
 * Runs steps in order, each shown with its place in the run. At the first failure it says why,
 * with the command's own output, and undoes the steps that ran.
 */
export const runSteps = async (context: ReleaseContext, steps: readonly Step[]) => {
  for (const [index, step] of steps.entries()) {
    try {
      await context.progress.during(step.label, "working", step.run, {
        index,
        total: steps.length,
      });
    } catch (error) {
      fail(context, `${step.label} failed`, `${reasonOf(error)}, the steps after it did not run.`);
      printOutput(context, error);
      await cancel(context, steps.slice(0, index));
      return false;
    }
  }
  return true;
};

/** A branch from main; undone by dropping the changes made on it and the branch itself. */
export const branchStep = (
  { services: { sourceControl: source } }: ReleaseContext,
  branch: string,
): Step => {
  let untracked = new Set<string>();
  return {
    label: `branch ${branch} from main`,
    run: async () => {
      untracked = new Set(await source.changedFiles());
      await source.createBranch(branch);
    },
    undo: {
      label: `delete ${branch}`,
      run: async () => {
        const created = (await source.changedFiles()).filter((file) => !untracked.has(file));
        await source.discard(created);
        await source.switchTo("main");
        await source.deleteBranch(branch);
      },
      byHand: () => ["git reset --hard", "git switch main", `git branch -D ${branch}`],
    },
  };
};

export const pushStep = (
  { services: { sourceControl: source } }: ReleaseContext,
  branch: string,
): Step => ({
  label: `push ${branch}`,
  run: () => source.push(branch),
  undo: {
    label: `delete ${branch} on origin`,
    run: () => source.deleteRemoteBranch(branch),
    byHand: () => [`git push origin --delete ${branch}`],
  },
});

/** Opens a pull request; undone by closing it, with a comment saying why. */
export const openPrStep = (
  { services: { codeHost: host } }: ReleaseContext,
  label: string,
  open: () => Promise<OpenPr>,
): Step => {
  let opened: OpenPr | null = null;
  return {
    label,
    run: async () => {
      opened = await open();
    },
    undo: {
      label: "close the pull request",
      run: async () => {
        if (opened) await host.closePr(opened, "The release stopped part way, so it closed this.");
      },
      byHand: () => (opened ? [`gh pr close ${opened.number}`] : []),
    },
  };
};
