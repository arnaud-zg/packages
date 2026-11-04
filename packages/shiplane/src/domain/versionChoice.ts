import type { AppBump, BumpLevel, PlannedChangeset } from "./changes";
import { nextVersion } from "./versions";

/** Biggest first: up the list is a bigger version, down a smaller one. */
export const LEVELS: readonly BumpLevel[] = ["major", "minor", "patch"];

const PLAIN_VERSION = /^\d+\.\d+\.\d+$/;

export interface VersionChoices {
  /** The level versioning computed. */
  computed: BumpLevel;
  /** The version each level leads to. */
  versions: Record<BumpLevel, string>;
}

/** A version a person chose over the computed one. */
export interface ForcedVersion {
  /** Nothing in the release ships above it. */
  level: BumpLevel;
  /** Moves the release up to that level, and carries why into its notes. */
  changeset: PlannedChangeset;
}

/**
 * The versions a release can go to, when everything it moves lands on one version: a single unit
 * or a fixed group. Null when units move apart, or on a version no bump explains, a prerelease.
 */
export const versionChoices = (bumps: readonly AppBump[]): VersionChoices | null => {
  const [first] = bumps;
  if (!first || !PLAIN_VERSION.test(first.from)) return null;
  if (bumps.some(({ from, to }) => from !== first.from || to !== first.to)) return null;
  const { from, to } = first;
  const versions = {
    major: nextVersion(from, "major"),
    minor: nextVersion(from, "minor"),
    patch: nextVersion(from, "patch"),
  };
  const computed = LEVELS.find((level) => versions[level] === to);
  return computed ? { computed, versions } : null;
};

/** The person's choice, as what the release adds: `packages` are all those it moves. */
export const forcedVersion = (
  { computed, versions }: VersionChoices,
  level: BumpLevel,
  reason: string,
  packages: readonly string[],
): ForcedVersion => ({
  level,
  changeset: {
    id: `forced-${versions[level]}`,
    releases: packages.map((name) => ({ name, type: level })),
    summary: `Version forced to ${versions[level]} instead of ${versions[computed]}: ${reason}`,
  },
});
