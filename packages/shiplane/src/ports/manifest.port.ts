export interface Manifest {
  name: string;
  version: string;
}

/** Reads a unit's name and version from its folder: package.json today, pom.xml or Cargo.toml later. */
export interface ManifestReader {
  read: (root: string, dir: string) => Manifest | null;
}
