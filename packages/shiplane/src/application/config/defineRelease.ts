import type { DisplayChoice } from "../../domain/display";
import type { Feature, ReleaseFlow, ReleaseModule } from "../../modules/module";

/** How a repository releases: the flow, what gets released in order, and what happens around it. */
export interface ReleaseConfig {
  /** Folders to look in, `dir/*` or exact. Without it, the workspace file decides. */
  units?: string[];
  /** How the release itself runs: an adapter per port, each from its plugin. */
  flow: ReleaseFlow;
  /** What gets released, in this order. The first app is the repository's Latest release. */
  modules: ReleaseModule[];
  /** What happens around a release, after the ship, in this order. */
  features?: Feature[];
  /** How a tag names a version: `{name}@{version}` when absent, or e.g. `v{version}`, `{name}--v{version}`. */
  tag?: string;
  /**
   * A unit whose folder changed with no changeset naming it: `"ignore"` (the default, as changesets
   * does) leaves it, `"release"` offers it with a changelog from its commits.
   */
  commitsWithoutChangeset?: "release" | "ignore";
  /** How much the release says while it runs; `--verbose` and `--mascot` (or `--no-…`) override. */
  display?: DisplayChoice;
}

export const defineRelease = (config: ReleaseConfig): ReleaseConfig => config;
