import { afterEach, describe, expect, it } from "vitest";

import type { Workspace } from "../../../testing/workspace";
import { ADMIN_UNIT, SERVER_UNIT, withModules } from "../../../testing/moduleConfig";
import { createWorkspace, packageJson, SOURCE_ALIASES } from "../../../testing/workspace";
import { loadRelease } from "../loadRelease";

let workspace: Workspace | undefined;
afterEach(() => workspace?.remove());

const LANDING_UNIT = ADMIN_UNIT.replace("project: admin-site", "project: landing-site");

const setUp = (config: string) => {
  workspace = createWorkspace({
    "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    "shiplane.config.ts": config,
    "apps/api/package.json": packageJson("@acme/api", "0.4.2"),
    "apps/landing/package.json": packageJson("@acme/landing", "0.2.0"),
    "apps/admin/package.json": packageJson("@acme/admin", "0.1.2"),
    "apps/api/shiplane.unit.yml": SERVER_UNIT,
    "apps/landing/shiplane.unit.yml": LANDING_UNIT,
    "apps/admin/shiplane.unit.yml": ADMIN_UNIT,
  });
  return loadRelease(workspace.root, { aliases: SOURCE_ALIASES });
};

describe("the order of modules is the release order", () => {
  it("given the backend listed before the web apps, when the release loads, then api goes first and the web apps follow by name", async () => {
    const release = await setUp(
      withModules("backendService({ serverHosting: server }), webApp({ staticHosting: pages })"),
    );

    expect(release.problems).toEqual([]);
    expect(release.units.map(({ name }) => name)).toEqual(["api", "admin", "landing"]);
  });

  it("given the web apps listed before the backend whose url they read, when the release loads, then each says to move the backend first", async () => {
    const release = await setUp(
      withModules("webApp({ staticHosting: pages }), backendService({ serverHosting: server })"),
    );

    expect(release.problems).toEqual([
      expect.objectContaining({
        file: "apps/admin/shiplane.unit.yml",
        message: '"admin" reads api.url, which is released after it',
        hint: "move backend-service before web-app in the modules of shiplane.config.ts",
      }),
      expect.objectContaining({
        file: "apps/landing/shiplane.unit.yml",
        message: '"landing" reads api.url, which is released after it',
      }),
    ]);
  });
});
