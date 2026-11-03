/** A unit as changesets know it: its name here, its package name there. */
export interface UnitRef {
  name: string;
  packageName: string;
}

export type BumpType = "major" | "minor" | "patch" | "none";

/** One changeset, as `changeset status --output` lists it. */
export interface PlannedChangeset {
  id: string;
  summary: string;
  releases: { name: string; type: BumpType }[];
}

/** One package's version move, as `changeset status --output` lists it. */
export interface PlannedRelease {
  name: string;
  type: BumpType;
  oldVersion: string;
  newVersion: string;
  /** Empty when the package only moves because a workspace dependency did. */
  changesets: string[];
}

export interface StatusPlan {
  changesets: PlannedChangeset[];
  releases: PlannedRelease[];
}

export interface AppBump {
  /** The unit's name. */
  app: string;
  from: string;
  to: string;
  /** What the app's users get: the summaries of the changesets naming it. */
  notes: string[];
  /** The workspace packages it moves with, when no changeset names it. */
  movedWith: string[];
}

/** The units a release moves, in `units` order, each with its notes or the packages it moves with. */
export const appBumps = (
  { changesets, releases }: StatusPlan,
  dependencies: Record<string, string[]>,
  units: readonly UnitRef[],
): AppBump[] => {
  const moving = new Set(releases.map(({ name }) => name));
  return units.flatMap(({ name: app, packageName }) => {
    const release = releases.find(({ name }) => name === packageName);
    if (!release) return [];
    const notes = changesets
      .filter(({ id }) => release.changesets.includes(id))
      .map(({ summary }) => summary);
    const movedWith =
      notes.length > 0 ? [] : (dependencies[release.name] ?? []).filter((dep) => moving.has(dep));
    return [{ app, from: release.oldVersion, to: release.newVersion, notes, movedWith }];
  });
};

/** How many internal packages a release moves: they get changelogs, nothing ships. */
export const packageBumps = ({ releases }: StatusPlan, units: readonly UnitRef[]) =>
  releases.filter(({ name }) => !units.some(({ packageName }) => packageName === name)).length;

/**
 * Holding an app back keeps its lines pending, with any package line they came with so the package
 * does not drag the held app along. The picked apps' lines ship under the same summary.
 */
export const splitChangesets = (
  changesets: PlannedChangeset[],
  held: readonly string[],
  units: readonly UnitRef[],
) => {
  const packageOf = (name: string) => units.find((unit) => unit.name === name)?.packageName;
  const heldNames = new Set(held.map(packageOf));
  const isUnit = (name: string) => units.some(({ packageName }) => packageName === name);
  return changesets.reduce<{ ships: PlannedChangeset[]; waits: PlannedChangeset[] }>(
    (split, changeset) => {
      if (!changeset.releases.some(({ name }) => heldNames.has(name))) {
        return { ...split, ships: [...split.ships, changeset] };
      }
      const picked = changeset.releases.filter(({ name }) => isUnit(name) && !heldNames.has(name));
      const waiting = changeset.releases.filter(
        ({ name }) => !picked.some((line) => line.name === name),
      );
      return {
        ships:
          picked.length > 0 ? [...split.ships, { ...changeset, releases: picked }] : split.ships,
        waits: [...split.waits, { ...changeset, releases: waiting }],
      };
    },
    { ships: [], waits: [] },
  );
};

/** The units a changeset file releases, read from its frontmatter. */
export const changesetApps = (text: string, units: readonly UnitRef[]): string[] => {
  const frontmatter = text.split("---")[1] ?? "";
  return units
    .filter(({ packageName }) => frontmatter.includes(`"${packageName}":`))
    .map(({ name }) => name);
};
