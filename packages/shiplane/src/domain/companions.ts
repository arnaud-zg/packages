import type { StatusPlan, UnitRef } from "./changes";

/** A unit that goes out with the picked ones without being picked, and why. */
export interface Companion {
  /** The unit's name. */
  app: string;
  version: string;
  /** The picked units it goes with. */
  with: string[];
  /** Why, as a person reads it. */
  why: string;
}

/** The shortest chain of moving packages from `from` to one a changeset names, breadth first. */
const chainTo = (
  from: string,
  dependencies: Record<string, string[]>,
  moving: ReadonlySet<string>,
  named: ReadonlySet<string>,
): string[] => {
  const seen = new Set<string>();
  let paths = [[from]];
  while (paths.length > 0) {
    const next: string[][] = [];
    for (const path of paths) {
      const last = path[path.length - 1] ?? from;
      for (const dependency of dependencies[last] ?? []) {
        if (!moving.has(dependency) || seen.has(dependency)) continue;
        seen.add(dependency);
        const chain = [...path, dependency];
        if (named.has(dependency)) return chain.slice(1);
        next.push(chain);
      }
    }
    paths = next;
  }
  return [];
};

/**
 * Preview: the units a release moves that the person did not pick. changesets moves a unit whenever
 * a workspace package it uses moves, so it cannot stay behind; this says through which package.
 */
export const draggedUnits = (
  plan: StatusPlan,
  dependencies: Record<string, string[]>,
  units: readonly UnitRef[],
  scope: ReadonlySet<string>,
): Companion[] => {
  const moving = new Set(plan.releases.map(({ name }) => name));
  const named = new Set(
    plan.releases.filter(({ changesets }) => changesets.length > 0).map(({ name }) => name),
  );
  const picked = units.filter(({ name }) => scope.has(name));
  return units.flatMap(({ name: app, packageName }) => {
    const release = plan.releases.find(({ name }) => name === packageName);
    if (scope.has(app) || !release) return [];
    const chain = chainTo(packageName, dependencies, moving, named);
    const source = chain[chain.length - 1];
    const movers = picked
      .filter((unit) =>
        plan.changesets.some(
          ({ releases }) =>
            releases.some(({ name }) => name === source) &&
            releases.some(({ name }) => name === unit.packageName),
        ),
      )
      .map(({ name }) => name);
    const whose = movers.length > 0 ? `${movers.join(", ")}'s changes move` : "this release moves";
    return [
      {
        app,
        version: release.newVersion,
        with: movers,
        why:
          chain.length > 0
            ? `uses ${chain.join(" → ")}, which ${whose}`
            : "moves with this release",
      },
    ];
  });
};

/** A unit's version on preview with its release notes. */
export interface Released {
  app: string;
  version: string;
  notes: string;
}

const OWN_CHANGE = /^- ([0-9a-f]{7,40}): /gm;
const DEPENDENCY_CHANGES = /^- Updated dependencies \[([^\]]+)\]/gm;

/** The changes a version carries: its own, and those a package it uses moved for. */
const changeIds = (notes: string) =>
  new Set([
    ...[...notes.matchAll(OWN_CHANGE)].flatMap(([, id]) => (id ? [id] : [])),
    ...[...notes.matchAll(DEPENDENCY_CHANGES)].flatMap(([, ids]) =>
      (ids ?? "").split(",").map((id) => id.trim()),
    ),
  ]);

/** A change's first line in these notes, with an ellipsis when it goes on. */
const summaryOf = (notes: string, id: string) => {
  const lines = notes.split("\n");
  const index = lines.findIndex((line) => line.startsWith(`- ${id}: `));
  const first = lines[index]?.slice(`- ${id}: `.length).trim();
  if (index < 0 || !first) return null;
  const goesOn = /^ {2}\S/.test(lines[index + 1] ?? "");
  return goesOn ? `${first}…` : first;
};

/** The packages listed under the `Updated dependencies` line that names this change. */
const packagesMovedFor = (notes: string, id: string) => {
  const lines = notes.split("\n");
  const start = lines.findIndex(
    (line) => line.startsWith("- Updated dependencies [") && line.includes(id),
  );
  if (start < 0) return [];
  const listed = lines.slice(start + 1);
  const end = listed.findIndex((line) => !/^ {2}- \S+@/.test(line));
  return (end < 0 ? listed : listed.slice(0, end)).map((line) =>
    line
      .trim()
      .slice(2)
      .replace(/@[^@]*$/, ""),
  );
};

/** Why two versions went out together: the change they share, or the package both moved for. */
const sharedReason = (partner: Released, other: Released, id: string) => {
  const summary = summaryOf(partner.notes, id) ?? summaryOf(other.notes, id);
  if (summary) return ` for: ${summary}`;
  const theirs = new Set(packagesMovedFor(partner.notes, id));
  const both = packagesMovedFor(other.notes, id).filter((name) => theirs.has(name));
  return both.length > 0 ? `: both use ${both.join(", ")}, which moved` : "";
};

/**
 * Production: the units preview runs with the picked ones that are not picked. Two versions went to
 * preview together when their notes share a change, their own or one a package they use moved for.
 */
export const releasedTogether = (picked: Released[], others: Released[]): Companion[] =>
  others.flatMap((other) => {
    const ids = changeIds(other.notes);
    const partners = picked.flatMap((partner) => {
      const shared = [...changeIds(partner.notes)].find((id) => ids.has(id));
      return shared ? [{ partner, shared }] : [];
    });
    const [first] = partners;
    if (!first) return [];
    const names = partners.map(({ partner }) => `${partner.app} ${partner.version}`).join(", ");
    return [
      {
        app: other.app,
        version: other.version,
        with: partners.map(({ partner }) => partner.app),
        why: `went to preview with ${names}${sharedReason(first.partner, other, first.shared)}`,
      },
    ];
  });
