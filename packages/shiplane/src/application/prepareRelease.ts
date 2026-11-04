import type { AppBump, PlannedChangeset } from "../domain/changes";
import type { Companion } from "../domain/companions";
import type { ForcedVersion } from "../domain/versionChoice";
import type { VersionChoice, VersionContribution } from "../ports/delivery.port";
import type { ReleaseContext } from "./context";
import { appBumps, packageBumps, splitChangesets } from "../domain/changes";
import { draggedUnits } from "../domain/companions";
import { tagName } from "../domain/tags";
import { namedUnits, unitRefs } from "./readScope";
import { decideContext, jobInput, moduleOf } from "./targets";

export type Split = ReturnType<typeof splitChangesets>;

const NOTHING_HELD: Split = { ships: [], waits: [] };

export interface Prepared {
  /** The units the person picked. */
  scope: ReadonlySet<string>;
  /** The version the person chose over the computed one, when they did. */
  forced?: ForcedVersion;
  /** Changesets this release ships, the ones it writes included. */
  pending: number;
  /** Units the person left out: their changesets stay pending. */
  held: string[];
  split: Split;
  bumps: AppBump[];
  /** Units the person did not pick that move anyway, with the package that drags each. */
  companions: Companion[];
  /** Internal packages moved along: changelogs only. */
  packages: number;
  /** Changesets the release writes itself. */
  added: PlannedChangeset[];
  /** Every changeset the release versions, with the lines it ships. */
  shipped: PlannedChangeset[];
  /** What plugins add to the release PR, by unit: an EAS app's build or update. */
  contributions: Record<string, VersionContribution>;
}

/** The person's answer to a plugin's choice; the suggestion without a terminal or with --yes. */
const choose = async ({ prompter, options }: ReleaseContext, choice: VersionChoice | undefined) => {
  if (!choice) return null;
  if (options.yes || !prompter.interactive) return choice.suggested;
  return prompter.select(choice.question, choice.options, choice.suggested);
};

/** What each picked unit's plugin adds, given the unit's bump so far. One at a time: it may ask. */
const contributionsOf = async (
  context: ReleaseContext,
  scope: ReadonlySet<string>,
  bumps: readonly AppBump[],
  known: Readonly<Record<string, VersionContribution>> = {},
) => {
  const { head } = await context.services.sourceControl.position();
  const contributions: Record<string, VersionContribution> = {};
  for (const unit of context.release.units.filter(({ name }) => scope.has(name))) {
    // Already answered for the whole release: one release PR of several never asks twice.
    const answered = known[unit.name];
    if (answered) {
      contributions[unit.name] = answered;
      continue;
    }
    const module = moduleOf(context, unit);
    const version = module?.version?.bind(module);
    if (!module || !version) continue;
    const input = jobInput(context, module, unit, {
      tag: tagName(unit.name, unit.version, context.release.tagFormat),
      environment: "preview",
      commit: head,
    });
    const bump = bumps.find(({ app }) => app === unit.name);
    const contribute = (chosen?: string) =>
      version(decideContext(context), { ...input, bump, chosen });
    const suggested = await contribute();
    const chosen = await choose(context, suggested.choice);
    contributions[unit.name] =
      chosen && chosen !== suggested.choice?.suggested ? await contribute(chosen) : suggested;
  }
  return contributions;
};

/** What a release PR covering `scope` would version, computed without writing anything. */
export const prepareRelease = async (
  context: ReleaseContext,
  scope: ReadonlySet<string>,
  known: Readonly<Record<string, VersionContribution>> = {},
  forced?: ForcedVersion,
): Promise<Prepared> => {
  const { release, services } = context;
  const refs = unitRefs(release.units);
  const [dependencies, named, base, pendingFiles] = await Promise.all([
    services.versioning.dependencies(),
    namedUnits(context),
    services.versioning.plan([], []),
    services.versioning.pending(),
  ]);
  const held = [...named].filter((app) => !scope.has(app));
  const split = held.length > 0 ? splitChangesets(base.changesets, held, refs) : NOTHING_HELD;
  const own = forced ? [forced.changeset] : [];
  const ceiling = forced?.level;
  const picked =
    held.length > 0 || forced ? await services.versioning.plan(own, split.waits, ceiling) : base;
  const contributions = await contributionsOf(
    context,
    scope,
    appBumps(picked, dependencies, refs),
    known,
  );
  const added = [
    ...own,
    ...Object.values(contributions).flatMap((contribution) => contribution.added),
  ];
  const plan =
    added.length > own.length
      ? await services.versioning.plan(added, split.waits, ceiling)
      : picked;
  return {
    scope,
    forced,
    pending: (held.length > 0 ? split.ships.length : pendingFiles.length) + added.length,
    held,
    split,
    bumps: appBumps(plan, dependencies, refs),
    companions: draggedUnits(plan, dependencies, refs, scope),
    packages: packageBumps(plan, refs),
    added,
    shipped: plan.changesets,
    contributions,
  };
};
