import type { Environment } from "../domain/environment";
import type { ScopeInfo } from "../domain/scope";
import type { ReleaseContext } from "./context";
import { scopeChoices } from "../domain/scope";
import { readScope } from "./readScope";
import { paint } from "./say";
import { destination } from "./targets";

/** Every unit with something to release here: what --yes and a run without a terminal cover. */
export const defaultScope = (info: ScopeInfo[], environment: Environment) =>
  new Set(
    scopeChoices(info, environment)
      .filter(({ pending }) => pending)
      .map(({ app }) => app),
  );

/**
 * The first question: which units this run covers. Every unit is listed; those with nothing to
 * release are greyed out with why. Null when cancelled or when nothing is pending.
 */
export const pickScope = async (
  context: ReleaseContext,
  environment: Environment,
): Promise<{ scope: Set<string>; info: ScopeInfo[] } | null> => {
  const { output, prompter, options, progress } = context;
  const info = await progress.during(
    "Reading what changed: changesets, tags and GitHub deployments",
    "thinking",
    () => readScope(context, environment),
  );
  const choices = scopeChoices(info, environment);
  const where = destination(
    context,
    info.map(({ app }) => app),
    environment,
  );
  if (!choices.some(({ pending }) => pending)) {
    output.line();
    choices.forEach(({ app, hint }) =>
      output.line(`  ${paint("dim", `${app.padEnd(15)}${hint}`)}`),
    );
    output.line();
    // Nothing promotes a release-only unit: only a new change moves it.
    const queue = environment === "preview" || info.every(({ releaseOnly }) => releaseOnly);
    progress.say(
      "resting",
      `${paint("bold", `Nothing to release ${where}.`)} ${paint("dim", queue ? "Queue a change first:" : "Release to preview first:")}`,
    );
    output.line(`    ${paint("cyan", queue ? "pnpm changeset" : "shiplane")}`);
    output.line();
    return null;
  }
  if (options.yes || !prompter.interactive) return { scope: defaultScope(info, environment), info };
  const picked = await prompter.multiselect(
    `What do you want to release ${where}? Greyed units have nothing to release.`,
    choices.map(({ app, pending, hint }) => ({ value: app, label: app, hint, disabled: !pending })),
    choices.filter(({ pending }) => pending).map(({ app }) => app),
  );
  return picked ? { scope: new Set(picked), info } : null;
};
