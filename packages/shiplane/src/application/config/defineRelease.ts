import type { DisplayChoice } from "../../domain/display";
import type { TagFormatName } from "../../domain/tags";
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
  /**
   * How a tag names a version: `"package"` (`{name}@{version}`, the default), `"plugin"` (`{name}--v{version}`), `"single"` (`v{version}`, one unit only), `"module"` (`{name}/v{version}`), or a format of your own.
   */
  tag?: TagFormatName | (string & {});
  /** @deprecated Ignored: use `pnpm changeset`, or `commitsVersioning()` from `@shiplane/changesets`. */
  commitsWithoutChangeset?: "release" | "ignore";
  /** How much the release says while it runs; `--verbose` and `--mascot` (or `--no-…`) override. */
  display?: DisplayChoice;
}

export const defineRelease = (config: ReleaseConfig): ReleaseConfig => config;
