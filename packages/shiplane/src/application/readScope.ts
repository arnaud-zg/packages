import type { UnitRef } from "../domain/changes";
import type { Environment } from "../domain/environment";
import type { ScopeInfo } from "../domain/scope";
import type { ReleaseUnit } from "../domain/unit";
import type { Deploy } from "../ports/code-host.port";
import type { ReleaseContext } from "./context";
import { changesetApps } from "../domain/changes";
import { deployRunTitle } from "../domain/deploys";
import { cameWithRelease, firstRelease, tagName } from "../domain/tags";
import { decideContext, hasNoEnvironment, jobInput, moduleOf } from "./targets";

export const MANIFEST = "package.json";

export const unitRefs = (units: readonly ReleaseUnit[]): UnitRef[] =>
  units.map(({ name, packageName }) => ({ name, packageName }));

/** The units the pending changesets name. */
export const namedUnits = async ({ release, services }: ReleaseContext) =>
  new Set(
    (await services.versioning.pending()).flatMap(({ text }) =>
      changesetApps(text, unitRefs(release.units)),
    ),
  );

/** A tag's deploy on an environment, from every record the host keeps. */
export const deployedOn = (history: readonly Deploy[], tag: string, environment: Environment) => {
  const states = history
    .filter(({ title }) => title === deployRunTitle(tag, environment))
    .map(({ state }) => state);
  if (states.includes("done")) return "done";
  return states.includes("running") ? "running" : "none";
};

/**
 * Each unit as the first question sees it: git for what is new, the host's deploy records for what
 * each environment runs (offline, nothing counts as deployed).
 */
export const readScope = async (
  context: ReleaseContext,
  environment: Environment,
): Promise<ScopeInfo[]> => {
  const { release, services } = context;
  const pending = await services.versioning.pending();
  const refs = unitRefs(release.units);
  const named = pending.map(({ text }) => changesetApps(text, refs));
  const [deployed, tags] = await Promise.all([
    services.codeHost.deployments().catch(() => []),
    services.sourceControl.tags(),
  ]);
  return Promise.all(
    release.units.map(async (unit) => {
      const tag = tagName(unit.name, unit.version, context.release.tagFormat);
      const target = moduleOf(context, unit);
      const decidedBy = target?.decidedBy;
      const commit = await services.sourceControl.versionCommit(unit.dir, MANIFEST, unit.version);
      const tagged = (await services.sourceControl.tagCommit(tag)) !== null;
      // A module that reads its platform (a registry) says what runs; else deploy records do.
      const live = async (on: Environment) => {
        if (!target?.live || !tagged) return deployedOn(deployed, tag, on) === "done";
        const { head } = await services.sourceControl.position();
        const input = jobInput(context, target, unit, { tag, environment: on, commit: head });
        return target.live(decideContext(context), input).catch(() => false);
      };
      return {
        app: unit.name,
        version: unit.version,
        changesets: named.filter((apps) => apps.includes(unit.name)).length,
        tagged,
        versioned:
          commit !== null && cameWithRelease({ app: unit.name, version: unit.version, commit }),
        firstRelease:
          !tagged &&
          commit !== null &&
          firstRelease(unit.name, unit.version, tags, context.release.tagFormat),
        onChannel: await live(environment),
        onPreview: await live("preview"),
        ...(decidedBy ? { decidedBy } : {}),
        ...(target?.releaseOnly ? { releaseOnly: true } : {}),
        ...(target && hasNoEnvironment(target) ? { noEnvironment: true } : {}),
      };
    }),
  );
};
