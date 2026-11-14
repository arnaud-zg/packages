import fs from "fs";
import os from "os";
import path from "path";
import { dump } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CatalogWorkspace } from "../catalogWorkspace";
import { aWorkspaceYaml } from "./builders";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "expo-pnpm-catalog-workspace-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeYaml(data: object): string {
  const filePath = path.join(tmpDir, "pnpm-workspace.yaml");
  fs.writeFileSync(filePath, dump(data));
  return filePath;
}

describe("reading and updating catalog versions", () => {
  describe("given the workspace has both a root catalog and named catalogs", () => {
    it("when loaded, then all versions from every catalog section are available", () => {
      const filePath = writeYaml(aWorkspaceYaml().build());

      const workspace = CatalogWorkspace.load(filePath);

      expect(workspace.getAllCatalogVersions()).toEqual({
        "some-lib": "^3.0.0",
        "expo-camera": "~17.0.10",
        "@expo/vector-icons": "^15.0.3",
      });
    });

    it("when a package uses catalog:expo, then its concrete version is resolved", () => {
      const filePath = writeYaml(aWorkspaceYaml().build());
      const workspace = CatalogWorkspace.load(filePath);

      const resolved = workspace.resolveDeps({
        "expo-camera": "catalog:expo",
        "@expo/vector-icons": "catalog:expo",
      });

      expect(resolved["expo-camera"]).toBe("~17.0.10");
      expect(resolved["@expo/vector-icons"]).toBe("^15.0.3");
    });

    it("when a package uses the root catalog, then its concrete version is resolved", () => {
      const filePath = writeYaml(aWorkspaceYaml().build());
      const workspace = CatalogWorkspace.load(filePath);

      const resolved = workspace.resolveDeps({ "some-lib": "catalog:" });

      expect(resolved["some-lib"]).toBe("^3.0.0");
    });
  });

  describe("given the workspace has no catalog section", () => {
    it("when loaded, then no versions are available", () => {
      const filePath = writeYaml({ packages: ["apps/*"] });

      const workspace = CatalogWorkspace.load(filePath);

      expect(workspace.getAllCatalogVersions()).toEqual({});
    });
  });

  describe("given the yaml contains comments alongside package entries", () => {
    it("when a version is updated and saved, then comments survive", () => {
      const content = [
        "catalogs:",
        "  expo:",
        "    # managed by expo-pnpm-catalog",
        '    expo-camera: "~17.0.8"',
      ].join("\n");
      const filePath = path.join(tmpDir, "pnpm-workspace.yaml");
      fs.writeFileSync(filePath, content);

      CatalogWorkspace.load(filePath).writeVersion("expo-camera", "~17.0.10").save();

      const updated = fs.readFileSync(filePath, "utf-8");
      expect(updated).toContain("# managed by expo-pnpm-catalog");
      expect(updated).toContain('"~17.0.10"');
      expect(updated).not.toContain('"~17.0.8"');
    });
  });

  describe("given a version is updated in memory but not saved", () => {
    it("when not saved, then the file on disk is unchanged", () => {
      const filePath = writeYaml(aWorkspaceYaml().build());
      const original = fs.readFileSync(filePath, "utf-8");

      CatalogWorkspace.load(filePath).writeVersion("expo-camera", "~17.0.99");

      expect(fs.readFileSync(filePath, "utf-8")).toBe(original);
    });
  });
});

describe("deriving workspace directories from packages globs", () => {
  describe("given pnpm-workspace.yaml declares packages globs", () => {
    it("when loaded, then the top-level directory of each glob is returned", () => {
      const filePath = writeYaml({ packages: ["apps/*", "packages/*", "tooling/*"] });

      const workspace = CatalogWorkspace.load(filePath);

      expect(workspace.getWorkspaceDirs()).toEqual(
        expect.arrayContaining(["apps", "packages", "tooling"]),
      );
    });
  });

  describe("given pnpm-workspace.yaml declares no packages globs", () => {
    it("when loaded, then the default workspace directories are returned", () => {
      const filePath = writeYaml({ catalog: {} });

      const workspace = CatalogWorkspace.load(filePath);

      expect(workspace.getWorkspaceDirs()).toEqual(["apps", "packages", "tooling"]);
    });
  });
});
