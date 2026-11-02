import { describe, expect, it } from "vitest";

import { MemoryFiles } from "../../../adapters/files/__fakes__/memory-files.fake";
import { expandPatterns, workspacePatterns } from "../workspaceFolders";

describe("Feature: where the apps are", () => {
  it("given a pnpm workspace, when its folders are read, then they come from pnpm-workspace.yaml", () => {
    const files = new MemoryFiles({ "pnpm-workspace.yaml": "packages:\n  - apps/*\n" });

    expect(workspacePatterns(files)).toEqual(["apps/*"]);
  });

  it("given package.json workspaces, when its folders are read, then they come from package.json", () => {
    const files = new MemoryFiles({ "package.json": '{"workspaces":["services/*"]}' });

    expect(workspacePatterns(files)).toEqual(["services/*"]);
  });

  it("given no workspace, when its folders are read, then the root is the only one", () => {
    expect(workspacePatterns(new MemoryFiles())).toEqual(["."]);
  });

  it("given apps/*, when it is expanded, then every folder in apps is listed, hidden and node_modules aside", () => {
    const files = new MemoryFiles({
      "apps/web/package.json": "{}",
      "apps/api/package.json": "{}",
      "apps/.cache/x": "",
      "apps/node_modules/x/package.json": "{}",
      "apps/README.md": "",
    });

    expect(expandPatterns(files, ["apps/*"])).toEqual(["apps/api", "apps/web"]);
  });

  it("given a pattern that matches nothing, when it is expanded, then nothing is listed", () => {
    expect(expandPatterns(new MemoryFiles(), ["nowhere/*", "web"])).toEqual([]);
  });
});
