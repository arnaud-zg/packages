import { describe, expect, it } from "vitest";

import { changesReaching, codeFolders } from "../codeScope";

const DEPENDENCIES = {
  "@acme/expo": ["@acme/app"],
  "@acme/app": ["@acme/ui", "@acme/plant-contracts"],
  "@acme/ui": ["@acme/tokens"],
  "@acme/tokens": [],
  "@acme/plant-contracts": [],
  "@acme/api": ["@acme/plant-contracts"],
};

const FOLDERS = {
  "@acme/expo": "apps/expo",
  "@acme/app": "packages/app",
  "@acme/ui": "packages/ui",
  "@acme/tokens": "packages/tokens",
  "@acme/plant-contracts": "packages/plant-contracts",
  "@acme/api": "apps/api",
  "@acme/admin": "apps/admin",
};

const EXPO = {
  own: codeFolders("@acme/expo", DEPENDENCIES, FOLDERS),
  workspace: Object.values(FOLDERS),
  versionFiles: new Set(["apps/expo/app-version.json"]),
};

describe("the code a unit ships", () => {
  it("given the mobile app, when its folders are read, then they are its own and every workspace package it uses, however deep", () => {
    expect(codeFolders("@acme/expo", DEPENDENCIES, FOLDERS).sort()).toEqual([
      "apps/expo",
      "packages/app",
      "packages/plant-contracts",
      "packages/tokens",
      "packages/ui",
    ]);
  });

  it("given only the API and admin changed since the mobile release, when checked, then nothing reaches the mobile app", () => {
    expect(changesReaching(["apps/api/src/main.ts", "apps/admin/src/App.tsx"], EXPO)).toEqual([]);
  });

  it("given a package the mobile app uses changed, when checked, then that change reaches it", () => {
    expect(changesReaching(["apps/api/src/main.ts", "packages/ui/src/Button.tsx"], EXPO)).toEqual([
      "packages/ui/src/Button.tsx",
    ]);
  });

  it("given the lockfile or a root config changed, when checked, then it may reach every app, so it counts", () => {
    expect(changesReaching(["pnpm-lock.yaml", "patches/expo.patch"], EXPO)).toEqual([
      "pnpm-lock.yaml",
      "patches/expo.patch",
    ]);
  });

  it("given only notes, docs, CI config or version files changed, when checked, then none of it ships", () => {
    expect(
      changesReaching(
        [
          ".changeset/new-camera.md",
          ".planning/todos/pending/x.md",
          "docs/release.md",
          "apps/expo/README.md",
          ".github/workflows/ci-quality.yml",
          "apps/expo/app-version.json",
        ],
        EXPO,
      ),
    ).toEqual([]);
  });

  it("given only the app's release unit file changed, when checked, then it says how the app ships, never what", () => {
    expect(changesReaching(["apps/expo/shiplane.unit.yml"], EXPO)).toEqual([]);
  });
});
