import { isReleaseSubject } from "./tags";
import { nextPatch } from "./versions";

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

export interface UnreleasedApp {
  /** The unit's name. */
  app: string;
  version: string;
  /** Subjects of the commits that touched it since its current version, newest first. */
  commits: string[];
}

/** Apps that changed since their current version came out, with no changeset to ship it. */
export const unreleasedApps = (
  history: UnreleasedApp[],
  named: ReadonlySet<string>,
): UnreleasedApp[] =>
  history
    .map((entry) => ({
      ...entry,
      commits: entry.commits.filter((subject) => !isReleaseSubject(subject)),
    }))
    .filter(({ app, commits }) => commits.length > 0 && !named.has(app));

const USER_FACING = /^(feat|fix|perf)(\(.+?\))?!?:/;

// Commit subjects here are written as user value already: drop the type, scope and PR number.
const asSentence = (subject: string) => {
  const text = subject
    .replace(/^\w+(\(.+?\))?!?:\s*/, "")
    .replace(/\s*\(#\d+\)$/, "")
    .trim();
  const sentence = `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
};

/**
 * The patch changesets the release writes for an unreleased app the person picked: one changelog
 * line per feature or fix since its release, or its latest commit when there are only chores.
 */
export const unreleasedChangesets = (
  { name: app, packageName }: UnitRef,
  version: string,
  commits: string[],
): PlannedChangeset[] => {
  const userFacing = commits.filter((commit) => USER_FACING.test(commit));
  const lines = userFacing.length > 0 ? userFacing : commits.slice(0, 1);
  return lines.map((subject, index) => ({
    id: `${app}-${nextPatch(version)}-${index + 1}`,
    releases: [{ name: packageName, type: "patch" }],
    summary: asSentence(subject),
  }));
};
