import { afterEach, describe, expect, it } from "vitest";

import type { Workspace } from "../../../testing/workspace";
import { ADMIN_UNIT, MODULE_CONFIG, SERVER_UNIT, withModules } from "../../../testing/moduleConfig";
import { createWorkspace, packageJson, SOURCE_ALIASES } from "../../../testing/workspace";
import { loadRelease } from "../loadRelease";

let workspace: Workspace | undefined;

const setUp = (files: Record<string, string>) => {
  workspace = createWorkspace({
    "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    "shiplane.config.ts": MODULE_CONFIG,
    "apps/api/package.json": packageJson("@acme/api", "0.4.2"),
    "apps/admin/package.json": packageJson("@acme/admin", "0.1.2"),
    ...files,
  });
  return workspace;
};

const load = (root: string) => loadRelease(root, { aliases: SOURCE_ALIASES });

const COMMENTS = "notes";

afterEach(() => workspace?.remove());

describe("each app names the module that ships it", () => {
  it("given each app's unit file names a module the config composes, when the release loads, then every app ships", async () => {
    const { root } = setUp({
      "apps/api/shiplane.unit.yml": SERVER_UNIT,
      "apps/admin/shiplane.unit.yml": ADMIN_UNIT,
    });

    const release = await load(root);

    expect(release.problems).toEqual([]);
    expect(release.units.map(({ name }) => name)).toEqual(["api", "admin"]);
  });

  it("given a module given its own name, when an app's unit file names it, then the release loads clean", async () => {
    const { root } = setUp({
      "shiplane.config.ts": withModules(
        'webApp({ staticHosting: pages }), webApp({ name: "docs", staticHosting: pages })',
      ),
      "apps/admin/shiplane.unit.yml": "module: docs\nproject: docs-site\n",
    });

    const release = await load(root);

    expect(release.problems).toEqual([]);
    expect(release.modules.map(({ name }) => name)).toEqual(["web-app", "docs"]);
  });

  it("given a module the config does not compose, when the release loads, then the problem suggests the closest one", async () => {
    const { root } = setUp({
      "apps/admin/shiplane.unit.yml": "module: web-ap\nproject: admin-site\n",
    });

    const release = await load(root);

    expect(release.problems).toEqual([
      {
        file: "apps/admin/shiplane.unit.yml",
        line: 1,
        message: 'no module named "web-ap" in shiplane.config.ts',
        hint: 'did you mean "web-app"?',
      },
    ]);
  });

  it("given a unit file that still names a target, when the release loads, then it says to name a module", async () => {
    const { root } = setUp({
      "apps/admin/shiplane.unit.yml": "target: pages\nproject: admin-site\n",
    });

    const release = await load(root);

    expect(release.problems).toEqual([
      {
        file: "apps/admin/shiplane.unit.yml",
        line: 1,
        message: "target: is now module: the module in shiplane.config.ts that ships this app",
        hint: "one of: backend-service, web-app",
      },
    ]);
  });

  it("given a unit file naming a feature, when the release loads, then it names the modules that ship apps", async () => {
    const { root } = setUp({
      "shiplane.config.ts": withModules(
        "backendService({ serverHosting: server }), webApp({ staticHosting: pages })",
        COMMENTS,
      ),
      "apps/admin/shiplane.unit.yml": "module: release-comments\n",
    });

    const release = await load(root);

    expect(release.problems).toEqual([
      {
        file: "apps/admin/shiplane.unit.yml",
        line: 1,
        message: '"release-comments" ships no app: it runs on every ship',
        hint: "one of: backend-service, web-app",
      },
    ]);
  });
});

describe("what the config composes", () => {
  it("given issue comments given the adapters they use, when the release loads, then they are a feature apart from the modules", async () => {
    const { root } = setUp({
      "shiplane.config.ts": withModules(
        "backendService({ serverHosting: server }), webApp({ staticHosting: pages })",
        COMMENTS,
      ),
    });

    const release = await load(root);

    expect(release.problems).toEqual([]);
    expect(release.modules.map(({ name }) => name)).toEqual(["backend-service", "web-app"]);
    expect(release.features.map(({ name }) => name)).toEqual(["release-comments"]);
  });

  it("given two modules with the same name, when the release loads, then the config is refused with that name", async () => {
    const { root } = setUp({
      "shiplane.config.ts": withModules(
        "webApp({ staticHosting: pages }), webApp({ staticHosting: pages })",
      ),
    });

    const release = await load(root);

    expect(release.problems).toEqual([
      expect.objectContaining({
        file: "shiplane.config.ts",
        message: expect.stringContaining('two modules are named "web-app"'),
      }),
    ]);
  });

  it("given a config that still lists plugins, when the release loads, then it says which keys replace them", async () => {
    const { root } = setUp({ "shiplane.config.ts": "export default { plugins: [] };\n" });

    const release = await load(root);

    expect(release.problems).toEqual([
      expect.objectContaining({
        file: "shiplane.config.ts",
        message: expect.stringMatching(/plugins.*flow, modules and features/),
      }),
    ]);
  });

  it("given a config that still names its latest app, when the release loads, then it says the first app is", async () => {
    const { root } = setUp({
      "shiplane.config.ts": MODULE_CONFIG.replace("modules: [", 'latest: "admin",\n  modules: ['),
    });

    const release = await load(root);

    expect(release.problems).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("the first app of the first module is the Latest release"),
      }),
    ]);
  });

  it("given an adapter whose settings hold a module key, when the release loads, then the clash is refused", async () => {
    const { root } = setUp({
      "shiplane.config.ts": MODULE_CONFIG.replace(
        "project: z.string(),",
        "project: z.string(),\n    module: z.string().optional(),",
      ),
    });

    const release = await load(root);

    expect(release.problems).toEqual([
      expect.objectContaining({
        file: "shiplane.config.ts",
        message: expect.stringContaining('"module" is reserved'),
      }),
    ]);
  });
});
