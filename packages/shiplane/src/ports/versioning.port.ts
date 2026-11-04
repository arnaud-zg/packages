import type { PlannedChangeset, StatusPlan } from "../domain/changes";

/** The intent to release: changesets today. */
export interface VersioningPort {
  /** What a person does to queue a release, as they read it: "pnpm changeset". */
  readonly nextChange: string;
  /** Pending change files, by id, with their raw text. */
  pending: () => Promise<{ id: string; text: string }[]>;
  /** What versioning would move, with these added and the `waits` held back, writing nothing. */
  plan: (added: PlannedChangeset[], held: PlannedChangeset[]) => Promise<StatusPlan>;
  /** Writes `added`, versions everything but `held`, and leaves `held` pending. */
  apply: (added: PlannedChangeset[], held: PlannedChangeset[]) => Promise<void>;
  /** Adds one pending changeset, as a person would with `pnpm changeset`. */
  write: (changeset: PlannedChangeset) => Promise<void>;
  /** Each workspace package's runtime workspace dependencies, by package name. */
  dependencies: () => Promise<Record<string, string[]>>;
  /** Each workspace package's folder, relative to the root, by package name. */
  folders: () => Promise<Record<string, string>>;
  /** A pending changeset's file, relative to the root. */
  changesetFile: (id: string) => string;
  /** The changelog a unit keeps, to read release notes from. */
  changelogFile: (dir: string) => string;
}
