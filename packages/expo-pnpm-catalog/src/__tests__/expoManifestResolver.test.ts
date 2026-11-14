import fs from "fs";
import os from "os";
import path from "path";
import { dump } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CatalogWorkspace } from "../catalogWorkspace";
import { ExpoAppManifest } from "../expoAppManifest";
import { ExpoManifestResolver } from "../expoManifestResolver";
import { aPackageJson, aWorkspaceYaml } from "./builders";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "expo-resolver-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function loadWorkspace(overrides: object = {}): CatalogWorkspace {
  const data = aWorkspaceYaml().build();
  const filePath = path.join(tmpDir, "pnpm-workspace.yaml");
  fs.writeFileSync(filePath, dump({ ...data, ...overrides }));
  return CatalogWorkspace.load(filePath);
}

function loadManifest(
  deps: Record<string, string>,
  devDeps: Record<string, string> = {},
): ExpoAppManifest {
  const data = aPackageJson().dependencies(deps).devDependencies(devDeps).build();
  const filePath = path.join(tmpDir, "package.json");
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  return ExpoAppManifest.load(filePath);
}

describe("preparing the manifest for expo tooling", () => {
  describe("given the expo app has catalog dependencies", () => {
    it("when resolved, then expo tooling sees concrete versions instead of catalog references", () => {
      const workspace = loadWorkspace();
      const manifest = loadManifest({ "expo-camera": "catalog:expo" });

      const resolved = ExpoManifestResolver.from(manifest).withCatalogResolution(workspace).build();

      expect(resolved.data.dependencies?.["expo-camera"]).toBe("~17.0.10");
    });

    it("when extra workspace packages are included, then their versions are present in the resolved manifest", () => {
      const workspace = loadWorkspace();
      const manifest = loadManifest({});

      const resolved = ExpoManifestResolver.from(manifest)
        .withCatalogResolution(workspace)
        .mergeExtraPackages({ "expo-crypto": "~15.0.8" })
        .build();

      expect(resolved.data.dependencies?.["expo-crypto"]).toBe("~15.0.8");
    });

    it("when a dep exists in both sources, then the app's own version takes precedence", () => {
      const workspace = loadWorkspace();
      const manifest = loadManifest({ "expo-camera": "catalog:expo" });

      const resolved = ExpoManifestResolver.from(manifest)
        .withCatalogResolution(workspace)
        .mergeExtraPackages({ "expo-camera": "~99.0.0" })
        .build();

      expect(resolved.data.dependencies?.["expo-camera"]).toBe("~17.0.10");
    });
  });

  describe("given resolution steps are chained", () => {
    it("when resolved, then the original package.json is never modified", () => {
      const workspace = loadWorkspace();
      const manifest = loadManifest({ "expo-camera": "catalog:expo" });
      const manifestFilePath = path.join(tmpDir, "package.json");
      const originalContent = fs.readFileSync(manifestFilePath, "utf-8");

      ExpoManifestResolver.from(manifest).withCatalogResolution(workspace).build();

      expect(fs.readFileSync(manifestFilePath, "utf-8")).toBe(originalContent);
    });
  });
});
