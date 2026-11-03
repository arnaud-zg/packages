import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { Workspace } from "../../../testing/workspace";
import { ADMIN_UNIT, MODULE_CONFIG, SERVER_UNIT } from "../../../testing/moduleConfig";
import { createWorkspace, packageJson, SOURCE_ALIASES } from "../../../testing/workspace";
import { loadRelease } from "../loadRelease";
import { optionsFor } from "../optionsFor";

let workspace: Workspace | undefined;

const setUp = (files: Record<string, string>) => {
  workspace = createWorkspace({
    "pnpm-workspace.yaml": "packages:\n  - apps/*\n  - packages/*\n",
    "shiplane.config.ts": MODULE_CONFIG,
    "apps/api/package.json": packageJson("@acme/api", "0.4.2"),
    "apps/admin/package.json": packageJson("@acme/admin", "0.1.2"),
    "packages/ui/package.json": packageJson("@acme/ui", "0.1.0"),
    ...files,
  });
  return workspace;
};

const load = (root: string) => loadRelease(root, { aliases: SOURCE_ALIASES });

afterEach(() => workspace?.remove());

describe("finding what ships", () => {
  it("given the files still named release.config.ts and release.unit.yml, when the release loads, then they load and each is listed to rename", async () => {
    workspace = createWorkspace({
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "release.config.ts": MODULE_CONFIG,
      "apps/api/package.json": packageJson("@acme/api", "0.4.2"),
      "apps/api/release.unit.yml": SERVER_UNIT,
    });

    const release = await load(workspace.root);

    expect(release.problems).toEqual([]);
    expect(release.units.map(({ name, file }) => ({ name, file }))).toEqual([
      { name: "api", file: "apps/api/release.unit.yml" },
    ]);
    expect(release.renames).toEqual([
      { from: "release.config.ts", to: "shiplane.config.ts" },
      { from: "apps/api/release.unit.yml", to: "apps/api/shiplane.unit.yml" },
    ]);
  });

  it.each(["release", "ignore"])(
    'given a config still setting commitsWithoutChangeset to "%s", when the release loads, then it loads and says only changesets release',
    async (value) => {
      workspace = setUp({ "apps/api/shiplane.unit.yml": SERVER_UNIT });
      fs.writeFileSync(
        path.join(workspace.root, "shiplane.config.ts"),
        MODULE_CONFIG.replace(
          "defineRelease({",
          `defineRelease({\n  commitsWithoutChangeset: "${value}",`,
        ),
      );

      const release = await load(workspace.root);

      expect(release.problems).toEqual([]);
      expect(release.units.map(({ name }) => name)).toEqual(["api"]);
      expect(release.deprecations).toEqual([
        expect.stringContaining("commitsWithoutChangeset is deprecated and ignored"),
      ]);
    },
  );

  it("given a config without it, when the release loads, then nothing is deprecated", async () => {
    workspace = setUp({ "apps/api/shiplane.unit.yml": SERVER_UNIT });

    expect((await load(workspace.root)).deprecations).toEqual([]);
  });

  it("given both names next to an app, when the release loads, then shiplane.unit.yml wins and nothing is to rename", async () => {
    workspace = setUp({
      "apps/api/shiplane.unit.yml": SERVER_UNIT,
      "apps/api/release.unit.yml": "module: nothing\n",
    });

    const release = await load(workspace.root);

    expect(release.problems).toEqual([]);
    expect(release.renames).toEqual([]);
  });

  it("given a single package at the repository root, when the release loads, then its unit is named after its package, not the folder it was cloned into", async () => {
    workspace = createWorkspace({
      "shiplane.config.ts": MODULE_CONFIG,
      "package.json": packageJson("@arnaud-zg/configs", "0.4.0"),
      "shiplane.unit.yml": SERVER_UNIT,
    });

    const release = await load(workspace.root);

    expect(release.units.map(({ name, dir }) => ({ name, dir }))).toEqual([
      { name: "configs", dir: "." },
    ]);
  });

  it("given a unit file next to two apps, when the release loads, then each app is a unit with its module, version and folder", async () => {
    const { root } = setUp({
      "apps/api/shiplane.unit.yml": SERVER_UNIT,
      "apps/admin/shiplane.unit.yml": ADMIN_UNIT,
    });

    const release = await load(root);

    expect(release.problems).toEqual([]);
    expect(
      release.units.map(({ name, module, version, dir, packageName }) => ({
        name,
        module,
        version,
        dir,
        packageName,
      })),
    ).toEqual([
      {
        name: "api",
        module: "backend-service",
        version: "0.4.2",
        dir: "apps/api",
        packageName: "@acme/api",
      },
      {
        name: "admin",
        module: "web-app",
        version: "0.1.2",
        dir: "apps/admin",
        packageName: "@acme/admin",
      },
    ]);
  });

  it("given a folder with no unit file, when the release loads, then it is not shipped", async () => {
    const { root } = setUp({ "apps/api/shiplane.unit.yml": SERVER_UNIT });

    const release = await load(root);

    expect(release.units.map(({ name }) => name)).toEqual(["api"]);
  });

  it("given folders listed in the root config, when the release loads, then only those are looked at", async () => {
    const { root } = setUp({
      "shiplane.config.ts": MODULE_CONFIG.replace(
        "modules: [",
        'units: ["services/*"],\n  modules: [',
      ),
      "apps/api/shiplane.unit.yml": SERVER_UNIT,
      "services/billing/package.json": packageJson("billing", "2.0.0"),
      "services/billing/shiplane.unit.yml": SERVER_UNIT,
    });

    const release = await load(root);

    expect(release.units.map(({ dir }) => dir)).toEqual(["services/billing"]);
  });

  it("given package.json workspaces and no pnpm workspace file, when the release loads, then those folders are looked at", async () => {
    workspace = createWorkspace({
      "package.json": JSON.stringify({ workspaces: ["services/*"] }),
      "shiplane.config.ts": MODULE_CONFIG,
      "services/billing/package.json": packageJson("billing", "2.0.0"),
      "services/billing/shiplane.unit.yml": SERVER_UNIT,
    });

    const release = await load(workspace.root);

    expect(release.units.map(({ name }) => name)).toEqual(["billing"]);
  });

  it("given no root config, when the release loads, then it says how to create one", async () => {
    workspace = createWorkspace({ "pnpm-workspace.yaml": "packages:\n  - apps/*\n" });

    const release = await load(workspace.root);

    expect(release.problems).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("No shiplane.config.ts"),
        hint: expect.stringContaining("shiplane init"),
      }),
    ]);
  });
});

describe("values that differ per environment", () => {
  it("given a value per environment, when preview and production are read, then each gets its own", async () => {
    const { root } = setUp({ "apps/api/shiplane.unit.yml": SERVER_UNIT });

    const release = await load(root);
    const [api] = release.units;

    expect(api && optionsFor(api, "preview", release.units)).toMatchObject({ app: "api-preview" });
    expect(api && optionsFor(api, "production", release.units)).toMatchObject({
      app: "api-production",
    });
  });

  it("given an app that reads another app's url, when it is read per environment, then it gets that environment's url and ships after it", async () => {
    const { root } = setUp({
      "apps/api/shiplane.unit.yml": SERVER_UNIT,
      "apps/admin/shiplane.unit.yml": ADMIN_UNIT,
    });

    const release = await load(root);
    const admin = release.units.find(({ name }) => name === "admin");

    expect(admin?.after).toEqual(["api"]);
    expect(admin && optionsFor(admin, "production", release.units)).toEqual({
      project: "admin-site",
      build: { env: { API_URL: "https://api.example.com" } },
    });
  });

  it("given an app that reads an app with no unit file, when the release loads, then the problem names the missing app", async () => {
    const { root } = setUp({ "apps/admin/shiplane.unit.yml": ADMIN_UNIT });

    const release = await load(root);

    expect(release.problems).toEqual([
      expect.objectContaining({
        file: "apps/admin/shiplane.unit.yml",
        line: 5,
        message: expect.stringContaining('"api" has no shiplane.unit.yml'),
      }),
    ]);
  });

  it("given two apps that read each other, when the release loads, then the later one is told it reads an app released after it", async () => {
    const { root } = setUp({
      "apps/api/shiplane.unit.yml": `${SERVER_UNIT.replace("url:\n  preview: https://api-preview.example.com\n  production: https://api.example.com", "url: ${units.admin.project}")}`,
      "apps/admin/shiplane.unit.yml": ADMIN_UNIT,
    });

    const release = await load(root);

    expect(release.problems).toEqual([
      expect.objectContaining({
        file: "apps/api/shiplane.unit.yml",
        message: '"api" reads admin.project, which is released after it',
        hint: "move web-app before backend-service in the modules of shiplane.config.ts",
      }),
    ]);
  });
});

describe("how tags are named", () => {
  it("given a tag format named by its kind, when the release loads, then the tag uses that format", async () => {
    const { root } = setUp({
      "shiplane.config.ts": MODULE_CONFIG.replace("modules: [", 'tag: "plugin",\n  modules: ['),
    });

    const release = await load(root);

    expect(release.tagFormat).toBe("{name}--v{version}");
  });

  it("given no tag in the config, when the release loads, then tags use the package format", async () => {
    const { root } = setUp({});

    const release = await load(root);

    expect(release.tagFormat).toBe("{name}@{version}");
  });

  it("given a tag that is neither a known name nor a format, when the release loads, then it lists the names", async () => {
    const { root } = setUp({
      "shiplane.config.ts": MODULE_CONFIG.replace("modules: [", 'tag: "plugins",\n  modules: ['),
    });

    const release = await load(root);

    expect(release.problems[0]?.message).toContain('"plugin"');
  });
});

describe("tags that would collide", () => {
  it("given a tag format without the name and two units, when the release loads, then it says their tags would collide", async () => {
    const { root } = setUp({
      "shiplane.config.ts": MODULE_CONFIG.replace("modules: [", 'tag: "single",\n  modules: ['),
      "apps/api/shiplane.unit.yml": SERVER_UNIT,
      "apps/admin/shiplane.unit.yml": ADMIN_UNIT,
    });

    const release = await load(root);

    expect(release.problems.map(({ message }) => message)).toContainEqual(
      expect.stringContaining("would share each tag"),
    );
  });
});

describe("how the release talks", () => {
  it("given the config turns the mascot off and stays verbose, when the release loads, then it keeps both choices", async () => {
    const { root } = setUp({
      "shiplane.config.ts": MODULE_CONFIG.replace(
        "modules: [",
        "display: { verbose: true, mascot: false },\n  modules: [",
      ),
    });

    const release = await load(root);

    expect(release.problems).toEqual([]);
    expect(release.display).toEqual({ verbose: true, mascot: false });
  });
});

describe("mistakes in a unit file", () => {
  it("given a misspelt key, when the release loads, then the problem gives the file, the line and the key it meant", async () => {
    const { root } = setUp({
      "apps/admin/shiplane.unit.yml": "module: web-app\nprojet: admin-site\n",
    });

    const release = await load(root);

    expect(release.problems).toEqual([
      {
        file: "apps/admin/shiplane.unit.yml",
        line: 2,
        message: 'unknown key "projet" for web-app',
        hint: 'did you mean "project"?',
      },
      expect.objectContaining({ message: expect.stringContaining("project") }),
    ]);
  });

  it("given a key written twice, when the release loads, then the problem points at the second one", async () => {
    const { root } = setUp({
      "apps/admin/shiplane.unit.yml": "module: web-app\nproject: a\nproject: b\n",
    });

    const release = await load(root);

    expect(release.problems).toEqual([
      expect.objectContaining({ file: "apps/admin/shiplane.unit.yml", line: 3 }),
    ]);
  });
});
