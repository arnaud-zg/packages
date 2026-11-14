/**
 * Represents pnpm-workspace.yaml — reads, resolves catalog references,
 * and writes version updates in place (preserving comments).
 */
import fs from "fs";
import { load } from "js-yaml";

import type { WorkspaceYaml } from "./catalogUtils";
import {
  DEFAULT_WORKSPACE_DIRS,
  getAllCatalogVersions,
  resolveCatalogRefs,
  updateVersionInYaml,
} from "./catalogUtils";

export type { WorkspaceYaml };

export class CatalogWorkspace {
  private constructor(
    private readonly path: string,
    private readonly raw: string,
    private readonly data: WorkspaceYaml,
  ) {}

  static load(path: string): CatalogWorkspace {
    const raw = fs.readFileSync(path, "utf-8");
    const data = load(raw) as WorkspaceYaml;
    return new CatalogWorkspace(path, raw, data);
  }

  getAllCatalogVersions(): Record<string, string> {
    return getAllCatalogVersions(this.data);
  }

  /**
   * Top-level workspace directories declared by `packages:` (e.g. `apps/*`
   * → `apps`). Falls back to the monorepo defaults when none are declared.
   */
  getWorkspaceDirs(): string[] {
    const dirs = new Set<string>();
    for (const pattern of this.data.packages ?? []) {
      const base = pattern.split("/")[0];
      if (base) dirs.add(base);
    }
    return dirs.size > 0 ? Array.from(dirs) : [...DEFAULT_WORKSPACE_DIRS];
  }

  resolveDeps(deps: Record<string, string>): Record<string, string> {
    return resolveCatalogRefs(deps, this.data);
  }

  writeVersion(packageName: string, newVersion: string): CatalogWorkspace {
    const updatedRaw = updateVersionInYaml(this.raw, packageName, newVersion);
    return new CatalogWorkspace(this.path, updatedRaw, load(updatedRaw) as WorkspaceYaml);
  }

  save(): void {
    fs.writeFileSync(this.path, this.raw);
  }
}
