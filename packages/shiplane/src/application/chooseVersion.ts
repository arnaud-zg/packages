import type { BumpLevel } from "../domain/changes";
import type { VersionChoices } from "../domain/versionChoice";
import type { ReleaseContext } from "./context";
import type { Prepared } from "./prepareRelease";
import { forcedVersion, LEVELS, versionChoices } from "../domain/versionChoice";
import { prepareRelease } from "./prepareRelease";
import { confirm, fail, paint } from "./say";

/** The release again at `level`, or null with why when versioning cannot land there. */
const forceVersion = async (
  context: ReleaseContext,
  prepared: Prepared,
  choices: VersionChoices,
  level: BumpLevel,
  reason: string,
) => {
  const packages = prepared.bumps.flatMap(({ app }) =>
    context.release.units.filter(({ name }) => name === app).map((unit) => unit.packageName),
  );
  const forced = await prepareRelease(
    context,
    prepared.scope,
    {},
    forcedVersion(choices, level, reason, packages),
  );
  const version = choices.versions[level];
  const elsewhere = forced.bumps.find(({ to }) => to !== version);
  if (elsewhere) {
    fail(context, `Can't force ${version}`, `${elsewhere.app} would go to ${elsewhere.to}.`);
    return null;
  }
  context.output.line(
    `  ${paint(["bold", "yellow"], "!")} ${version} instead of ${choices.versions[choices.computed]}: ${reason}`,
  );
  return forced;
};

/**
 * The release to open: as computed, or at the version the person chose instead with why. Null when
 * they cancel. A plain yes when no one version covers the release, under --yes or with no terminal.
 */
export const chooseVersion = async (
  context: ReleaseContext,
  prepared: Prepared,
  where: string,
): Promise<Prepared | null> => {
  const { prompter, options } = context;
  const choices = versionChoices(prepared.bumps);
  if (!choices || options.yes || !prompter.interactive) {
    return (await confirm(context, `Release these ${where}?`, true)) ? prepared : null;
  }
  const { computed, versions } = choices;
  const picks = LEVELS.map((level) => ({
    value: level,
    label: `${versions[level]}  ${level}${level === computed ? ", computed" : ""}`,
  }));
  for (;;) {
    const level = await prompter.select(`Release these ${where} as (Esc cancels)`, picks, computed);
    if (!level) return null;
    if (level === computed) return prepared;
    const reason = await prompter.text(
      `Why ${versions[level]}? Tell users what changed, in one line.`,
    );
    // Esc or an empty line goes back to the versions.
    if (reason?.trim()) return forceVersion(context, prepared, choices, level, reason.trim());
  }
};
