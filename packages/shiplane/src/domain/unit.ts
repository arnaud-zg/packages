/** Something with a version that ships somewhere: an app, a published package, this CLI. */
export interface ReleaseUnit {
  /** Its folder's name, the name every command and `${units.<name>}` uses. */
  name: string;
  /** Its folder, relative to the repository root. */
  dir: string;
  /** Its `shiplane.unit.yml`, relative to the repository root. */
  file: string;
  packageName: string;
  version: string;
  /** The module that ships it, as its unit file names it. */
  module: string;
  /** Its `buildCommand:`, when its unit file says one; else its package.json "build" script. */
  buildCommand?: string;
  /** As written: per-environment maps and references are resolved by `optionsFor`. */
  options: Record<string, unknown>;
  /** Units whose values it reads: they are dispatched before it. */
  after: string[];
}
