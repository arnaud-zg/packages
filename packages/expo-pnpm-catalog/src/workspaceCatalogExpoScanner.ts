/**
 * Scans every workspace package for catalog: references (any catalog),
 * excluding a given package.json path (typically the Expo app itself).
 */
import fs from "fs";
import path from "path";

import type { ExtraPackages, PackageJson } from "./catalogUtils";
import { DEFAULT_WORKSPACE_DIRS, isCatalogRef } from "./catalogUtils";

export class WorkspaceCatalogExpoScanner {
  constructor(
    private readonly rootDir: string,
    private readonly workspaceDirs: readonly string[] = DEFAULT_WORKSPACE_DIRS,
  ) {}

  scan(allCatalogVersions: Record<string, string>, skipPath: string): ExtraPackages {
    const result: ExtraPackages = { byPackage: {}, versions: {} };
    for (const dir of this.workspaceDirs) {
      this.scanDirectory(path.resolve(this.rootDir, dir), allCatalogVersions, skipPath, result);
    }
    return result;
  }

  private scanDirectory(
    directoryPath: string,
    allCatalogVersions: Record<string, string>,
    skipPath: string,
    result: ExtraPackages,
  ): void {
    if (!fs.existsSync(directoryPath)) return;
    for (const entry of fs.readdirSync(directoryPath)) {
      const packageJsonPath = path.resolve(directoryPath, entry, "package.json");
      if (packageJsonPath === skipPath || !fs.existsSync(packageJsonPath)) continue;
      this.scanPackageJson(packageJsonPath, allCatalogVersions, result);
    }
  }

  private scanPackageJson(
    packageJsonPath: string,
    allCatalogVersions: Record<string, string>,
    result: ExtraPackages,
  ): void {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as PackageJson;
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const sourceName = pkg.name ?? path.basename(path.dirname(packageJsonPath));

    for (const [name, version] of Object.entries(allDeps)) {
      const catalogVersion = allCatalogVersions[name];
      if (!isCatalogRef(version) || catalogVersion === undefined) continue;
      (result.byPackage[name] ??= []).push(sourceName);
      result.versions[name] = catalogVersion;
    }
  }
}
