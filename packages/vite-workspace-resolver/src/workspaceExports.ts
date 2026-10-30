import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Package } from "resolve.exports";
import { exports as resolveExportsMap } from "resolve.exports";

// Only the fields this plugin needs — importing Vite/Vitest's own Plugin type drags a large,
// version-fragile type graph (Vite's CSS/PostCSS types) into this package's build.
export type WorkspaceExportsPlugin = {
  name: string;
  enforce: "pre";
  resolveId: (source: string) => string | null;
};

export type WorkspaceExportsOptions = {
  /** Directories under `rootDir` whose direct children are workspace packages. */
  groups?: string[];
};

type WorkspacePackage = {
  dir: string;
  packageJson: Package;
};

const DEFAULT_GROUPS = ["packages"];
const SOURCE_EXTENSIONS = ["", ".ts", ".tsx"];

// Splits "@scope/name/sub/path" or "name/sub/path" into the package name and the rest.
const SPECIFIER_PATTERN = /^((?:@[^/]+\/)?[^/@][^/]*)(\/.*)?$/;

const readPackageJson = (pkgJsonPath: string): Package | null => {
  if (!existsSync(pkgJsonPath)) {
    return null;
  }
  return JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as Package;
};

const scanWorkspacePackages = (
  rootDir: string,
  groups: string[],
): Map<string, WorkspacePackage> => {
  const packages = new Map<string, WorkspacePackage>();

  for (const group of groups) {
    const groupDir = join(rootDir, group);
    if (!existsSync(groupDir)) {
      continue;
    }

    for (const entry of readdirSync(groupDir)) {
      const pkgDir = join(groupDir, entry);
      const packageJson = readPackageJson(join(pkgDir, "package.json"));
      if (!packageJson?.name) {
        continue;
      }

      packages.set(packageJson.name, { dir: pkgDir, packageJson });
    }
  }

  return packages;
};

const resolveWithExtension = (filePath: string): string | null => {
  for (const ext of SOURCE_EXTENSIONS) {
    if (existsSync(filePath + ext)) {
      return filePath + ext;
    }
  }
  return null;
};

// resolve.exports (github.com/lukeed/resolve.exports) implements the actual exports-map
// resolution algorithm — conditional exports, wildcard subpaths — none of which a hand-rolled
// version here should reinvent.
const resolveExportSubpath = (pkg: WorkspacePackage, exportKey: string): string | null => {
  try {
    const [target] = resolveExportsMap(pkg.packageJson, exportKey) ?? [];
    return target ? join(pkg.dir, target) : null;
  } catch {
    return null;
  }
};

// Vite's test resolver won't follow a workspace package's package.json exports map for
// non-"." subpaths, and can't reach into a package's src/ for files that aren't exported at
// all. Scans every workspace package once and resolves both cases directly, so no consuming
// vitest.config.ts needs its own hand-rolled alias for it. Specifiers naming a package outside
// the workspace return null, leaving them to Vite's default resolver.
export const workspaceExports = (
  rootDir: string,
  { groups = DEFAULT_GROUPS }: WorkspaceExportsOptions = {},
): WorkspaceExportsPlugin => {
  const packages = scanWorkspacePackages(rootDir, groups);

  return {
    name: "workspace-exports",
    enforce: "pre",
    resolveId(source) {
      const match = SPECIFIER_PATTERN.exec(source);
      const pkgName = match?.[1];
      if (!pkgName) {
        return null;
      }

      const pkg = packages.get(pkgName);
      if (!pkg) {
        return null;
      }

      const rest = match[2];
      const deepSrcMatch = rest ? /^\/src\/(.+)$/.exec(rest) : null;
      const deepSrcRest = deepSrcMatch?.[1];
      if (deepSrcRest) {
        return resolveWithExtension(join(pkg.dir, "src", deepSrcRest));
      }

      return resolveExportSubpath(pkg, rest ? `.${rest}` : ".");
    },
  };
};
