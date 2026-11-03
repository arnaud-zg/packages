import type { Environment } from "../domain/environment";
import type { OpenPr, ReleaseStep } from "../domain/releasePr";
import type { ReleaseTag } from "../domain/tags";
import type { ReleaseContext } from "./context";
import { nextStep, RELEASE_BRANCH_PREFIX } from "../domain/releasePr";
import { scopeChoices } from "../domain/scope";
import { tagName } from "../domain/tags";
import { readScope } from "./readScope";
import { missingTags } from "./tagRelease";
import { decideContext, jobInput, moduleOf } from "./targets";

export interface UnitStatus {
  unit: string;
  target: string;
  version: string;
  tag: string;
  tagged: boolean;
  changesets: number;
  /** Something to release to this environment. */
  pending: boolean;
  hint: string;
  /** What its plugin reads from its own platform, such as each EAS build's verdict. */
  live?: unknown;
}

export interface ReleaseStatus {
  environment: Environment;
  units: UnitStatus[];
  releasePrs: OpenPr[];
  untagged: ReleaseTag[];
  next: ReleaseStep;
}

/** Where every unit stands on an environment, and the step a release takes next. Reads only. */
export const readStatus = async (
  context: ReleaseContext,
  environment: Environment,
): Promise<ReleaseStatus> => {
  const info = await readScope(context, environment);
  const choices = scopeChoices(info, environment);
  const [releasePrs, untagged] = await Promise.all([
    context.services.codeHost.openPrsFrom(RELEASE_BRANCH_PREFIX).catch(() => []),
    missingTags(context),
  ]);
  const { head } = await context.services.sourceControl.position();
  const live = async (name: string) => {
    const unit = context.release.units.find((candidate) => candidate.name === name);
    const module = unit && moduleOf(context, unit);
    if (!unit || !module?.inspect) return {};
    const input = jobInput(context, module, unit, {
      tag: tagName(unit.name, unit.version, context.release.tagFormat),
      environment,
      commit: head,
    });
    const inspected = await module
      .inspect(decideContext(context), input)
      .catch((error: unknown) => ({
        error: error instanceof Error ? error.message : String(error),
      }));
    return { live: inspected };
  };
  const units = await Promise.all(
    info.map(async (entry) => {
      const choice = choices.find(({ app }) => app === entry.app);
      const unit = context.release.units.find(({ name }) => name === entry.app);
      return {
        unit: entry.app,
        target: (unit && moduleOf(context, unit)?.provider) ?? "",
        version: entry.version,
        tag: tagName(entry.app, entry.version, context.release.tagFormat),
        tagged: entry.tagged,
        changesets: entry.changesets,
        pending: choice?.pending ?? false,
        hint: choice?.hint ?? "",
        ...(await live(entry.app)),
      };
    }),
  );
  return {
    environment,
    units,
    releasePrs,
    untagged,
    next: nextStep({
      pending: info.reduce((sum, { changesets }) => sum + changesets, 0),
      releasePrs,
      untagged: untagged.length,
    }),
  };
};
