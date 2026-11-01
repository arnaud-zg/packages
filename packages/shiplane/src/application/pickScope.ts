import type { Environment } from "../domain/environment";
import type { ScopeInfo } from "../domain/scope";
import type { ReleaseContext } from "./context";
import { scopeChoices } from "../domain/scope";
import { readScope } from "./readScope";
import { paint } from "./say";

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
    "Reading what changed: changesets, commits, tags and GitHub deployments",
    "thinking",
    () => readScope(context, environment),
  );
  const choices = scopeChoices(info, environment);
  if (!choices.some(({ pending }) => pending)) {
    output.line();
    choices.forEach(({ app, hint }) =>
      output.line(`  ${paint("dim", `${app.padEnd(15)}${hint}`)}`),
    );
    output.line();
    progress.say(
      "resting",
      `${paint("bold", `Nothing to release to ${environment}.`)} ${paint("dim", environment === "preview" ? "Queue a change first:" : "Release to preview first:")}`,
    );
    output.line(`    ${paint("cyan", environment === "preview" ? "pnpm changeset" : "shiplane")}`);
    output.line();
    return null;
  }
  if (options.yes || !prompter.interactive) return { scope: defaultScope(info, environment), info };
  const picked = await prompter.multiselect(
    `What do you want to release to ${environment}? Greyed units have nothing to release.`,
    choices.map(({ app, pending, hint }) => ({ value: app, label: app, hint, disabled: !pending })),
    choices.filter(({ pending }) => pending).map(({ app }) => app),
  );
  return picked ? { scope: new Set(picked), info } : null;
};
