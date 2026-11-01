import type { SetupContext, Workspace } from "shiplane/testing";
import { cloudflarePagesStaticHosting } from "@shiplane/cloudflare-pages";
import { easMobileDistribution } from "@shiplane/eas";
import { flyServerHosting } from "@shiplane/fly";
import { shellServerHosting } from "shiplane/plugin";
import {
  addUnit,
  createWorkspace,
  docsFor,
  doctor,
  initRelease,
  loadRelease,
  MemoryOutput,
  newAdapter,
  nodeFiles,
  packageJson,
  RecordingShell,
  refreshEditorSchema,
  removeUnit,
  ScriptedPrompter,
} from "shiplane/testing";
import { afterEach, describe, expect, it } from "vitest";

import { PLUGIN_ALIASES } from "../aliases";

let workspace: Workspace | undefined;
afterEach(() => workspace?.remove());

const REPO = {
  "package.json": JSON.stringify({ name: "acme", private: true }),
  "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
  ".vscode/settings.json": '{\n  // the team\'s settings\n  "editor.formatOnSave": true\n}\n',
  "apps/api/package.json": packageJson("@acme/api", "0.0.3"),
  "apps/api/fly-preview.toml": 'app = "acme-api-preview"\nprimary_region = "fra"\n',
  "apps/api/fly-production.toml": 'app = "acme-api-production"\n',
  "apps/api/Dockerfile": "FROM node:22\n",
  "apps/admin/package.json": packageJson("@acme/admin", "0.1.3"),
  "apps/admin/vite.config.ts": "export default {};\n",
  "apps/admin/index.html": "<!doctype html>\n",
  "apps/admin/Dockerfile": "FROM nginx\n",
  "apps/expo/package.json": packageJson("@acme/expo", "0.1.115", {
    scripts: {
      "eas:update:preview": "eas update --channel preview",
      "eas:update:production:gated": "eas update --channel production --rollout-percentage 10",
    },
  }),
  "apps/expo/eas.json": "{}\n",
  "apps/ui/package.json": packageJson("@acme/ui", "0.1.0", { private: true }),
};

const setUp = (files: Record<string, string> = {}) => {
  workspace = createWorkspace({ ...REPO, ...files });
  const prompter = new ScriptedPrompter();
  const output = new MemoryOutput();
  const shell = new RecordingShell();
  const context: SetupContext = {
    root: workspace.root,
    files: nodeFiles(workspace.root),
    shell,
    prompter,
    output,
    adapters: [
      flyServerHosting(),
      cloudflarePagesStaticHosting(),
      easMobileDistribution(),
      shellServerHosting(),
    ],
    load: () => loadRelease(workspace?.root ?? "", { aliases: PLUGIN_ALIASES }),
  };
  return { context, prompter, output, shell, workspace };
};

const yaml = (ws: Workspace, file: string) => ws.read(file);

describe("shiplane init --yes", () => {
  it("given a repository, when init writes the config, then it imports shiplane and each plugin from @shiplane", async () => {
    const { context, workspace: ws } = setUp();

    await initRelease(context, { yes: true, blank: false });

    expect(ws.read("shiplane.config.ts")).toContain('from "shiplane";');
    expect(ws.read("shiplane.config.ts")).toContain('from "@shiplane/fly";');
  });

  it("given an API with fly files, an admin built by Vite and an Expo app, when init takes every guess, then each gets a unit file read from its folder and the release loads clean", async () => {
    const { context, workspace: ws, output } = setUp();

    expect(await initRelease(context, { yes: true, blank: false })).toBe(true);

    const config = ws.read("shiplane.config.ts");
    expect(config).toContain("flow: releaseFlow({");
    expect(config).toContain("webApp({ staticHosting: cloudflarePagesStaticHosting() })");
    expect(config).toContain("backendService({ serverHosting: flyServerHosting() })");
    expect(config).toContain("mobileApp({ mobileDistribution: easMobileDistribution() })");
    expect(yaml(ws, "apps/api/shiplane.unit.yml")).toContain("module: backend-service");
    expect(yaml(ws, "apps/api/shiplane.unit.yml")).toContain("preview: acme-api-preview");
    expect(yaml(ws, "apps/api/shiplane.unit.yml")).toContain("production: fly-production.toml");
    expect(yaml(ws, "apps/admin/shiplane.unit.yml")).toContain("project: acme-admin");
    expect(yaml(ws, "apps/expo/shiplane.unit.yml")).toContain(
      "production: eas:update:production:gated",
    );
    expect(ws.exists("apps/ui/shiplane.unit.yml")).toBe(false);
    expect(ws.exists(".release")).toBe(false);
    expect(ws.read("node_modules/.cache/shiplane/schema.json")).toContain(
      '"const": "backend-service"',
    );
    expect(ws.read(".vscode/settings.json")).toContain(
      '"./node_modules/.cache/shiplane/schema.json": "**/shiplane.unit.yml"',
    );
    expect(ws.read(".vscode/settings.json")).toContain('"yaml.schemas"');
    expect(ws.read(".vscode/settings.json")).toContain("// the team's settings");
    expect(output.text).toContain("1 folder with nothing to ship them, versioned only");

    const release = await context.load();
    expect(release.problems).toEqual([]);
    expect(release.units.map(({ name, module }) => `${name}:${module}`).sort()).toEqual([
      "admin:web-app",
      "api:backend-service",
      "expo:mobile-app",
    ]);
  });

  it("given init ran before and a docs site since, when init runs again, then it adds the new folder and keeps the edits", async () => {
    const { context, workspace: ws, output } = setUp();
    await initRelease(context, { yes: true, blank: false });
    const config = ws.read("shiplane.config.ts");
    ws.write(
      "apps/api/shiplane.unit.yml",
      `${ws.read("apps/api/shiplane.unit.yml")}buildSecrets: [SENTRY_AUTH_TOKEN]\n`,
    );
    ws.write("apps/docs/package.json", packageJson("@acme/docs", "0.1.0"));
    ws.write("apps/docs/astro.config.mjs", "export default {};\n");

    await initRelease(context, { yes: true, blank: false });

    expect(output.text).toContain("+ apps/docs");
    expect(ws.read("apps/docs/shiplane.unit.yml")).toContain("module: web-app");
    expect(ws.read("shiplane.config.ts")).toBe(config);
    expect(ws.read("apps/api/shiplane.unit.yml")).toContain("buildSecrets: [SENTRY_AUTH_TOKEN]");
  });
});

describe("shiplane init, guided", () => {
  it("given the person picks the folders, how the admin ships and its project, when they review and write, then the files are written and doctor runs", async () => {
    const { context, prompter, workspace: ws, output } = setUp();
    prompter.answer(
      ["apps/api", "apps/admin", "apps/expo"],
      "cloudflare-pages",
      "acme-admin",
      ["editor"],
      "write",
    );

    expect(await initRelease(context, { yes: false, blank: false })).toBe(true);

    expect(prompter.asked).toEqual([
      "Which folders ship somewhere?",
      "How does apps/admin ship?",
      "apps/admin · Pages project?",
      "Also set up",
      "Write these files?",
    ]);
    expect(ws.read("apps/admin/shiplane.unit.yml")).toContain("project: acme-admin");
    expect(output.text).toContain("shiplane doctor");
    expect(output.text).toContain("✓ flyctl");
  });

  it("given the person cancels at the review, when init ends, then nothing is written", async () => {
    const { context, prompter, workspace: ws } = setUp();
    prompter.answer(["apps/api"], [], "cancel");

    await initRelease(context, { yes: false, blank: false });

    expect(ws.exists("shiplane.config.ts")).toBe(false);
    expect(ws.exists("apps/api/shiplane.unit.yml")).toBe(false);
  });
});

describe("shiplane init --blank", () => {
  it("given a folder init can place, when blank templates are asked for, then its unit file lists every key commented out", async () => {
    const { context, workspace: ws } = setUp();

    await initRelease(context, { yes: true, blank: true });

    const api = ws.read("apps/api/shiplane.unit.yml");
    expect(api).toContain("module: backend-service");
    expect(api).toContain("# app:");
    expect(api).toContain("# The Fly app, per environment");
  });
});

describe("changing the setup later", () => {
  it("given a landing page built with Astro, when it is added, then its unit file is written for the module of the adapter picked", async () => {
    const { context, prompter, workspace: ws } = setUp();
    await initRelease(context, { yes: true, blank: false });
    ws.write("apps/landing/package.json", packageJson("@acme/landing", "0.1.1"));
    ws.write("apps/landing/astro.config.mjs", "export default {};\n");
    prompter.answer("cloudflare-pages", "acme-landing", true);

    expect(await addUnit(context, "apps/landing")).toBe(true);

    expect(ws.read("apps/landing/shiplane.unit.yml")).toContain("project: acme-landing");
  });

  it("given admin ships today, when it is removed, then its unit file goes and it is only versioned", async () => {
    const { context, prompter, workspace: ws } = setUp();
    await initRelease(context, { yes: true, blank: false });
    prompter.answer(true);

    expect(await removeUnit(context, "admin")).toBe(true);

    expect(ws.exists("apps/admin/shiplane.unit.yml")).toBe(false);
  });

  it("given a host no official adapter covers, when an adapter is scaffolded, then it, its contract test and its module are written and the release still loads", async () => {
    const { context, workspace: ws } = setUp();
    await initRelease(context, { yes: true, blank: false });

    expect(await newAdapter(context, "render")).toBe(true);

    expect(ws.read("release/adapters/render.ts")).toContain('name: "render"');
    expect(ws.read("release/adapters/render.test.ts")).toContain("serverHostingContract([");
    expect(ws.read("shiplane.config.ts")).toContain(
      'import { renderServerHosting } from "./release/adapters/render";',
    );
    expect(ws.read("shiplane.config.ts")).toContain(
      'backendService({ name: "render", serverHosting: renderServerHosting() })',
    );
    const release = await context.load();
    expect(release.problems).toEqual([]);
    expect(release.modules.map(({ name }) => name)).toContain("render");
  });
});

describe("shiplane doctor", () => {
  it("given a misspelt key, when doctor runs, then it names the file and line and fails", async () => {
    const { context, workspace: ws, output } = setUp();
    await initRelease(context, { yes: true, blank: false });
    ws.write("apps/admin/shiplane.unit.yml", "module: web-app\nprojet: acme-admin\n");

    expect(await doctor(context)).toBe(false);

    expect(output.text).toContain("apps/admin/shiplane.unit.yml:2");
    expect(output.text).toContain('did you mean "project"?');
  });

  it("given wrangler signed out, when doctor runs, then it names the fix and offers to run it", async () => {
    const { context, prompter, shell, output } = setUp();
    await initRelease(context, { yes: true, blank: false });
    shell.seed("npx --yes wrangler@4.141.0 whoami", { status: 1 });
    prompter.answer(false);

    expect(await doctor(context)).toBe(false);

    expect(output.text).toContain("✗ wrangler");
    expect(prompter.asked).toEqual(["Run npx --yes wrangler@4.141.0 login now?"]);
  });
});

describe("every key an adapter takes", () => {
  it("given fly, when its docs are printed, then each key shows its description and default", async () => {
    const { context, output } = setUp();

    expect(await docsFor(context, "fly")).toBe(true);

    expect(output.text).toContain("app");
    expect(output.text).toContain("The Fly app, per environment");
    expect(output.text).toContain("default: fly.toml");
  });
});

describe("the editor schema", () => {
  it("given an adapter gained a key since the schema was written, when any command loads the release, then the schema is written again", async () => {
    const { context, workspace: ws } = setUp();
    await initRelease(context, { yes: true, blank: false });
    ws.write("node_modules/.cache/shiplane/schema.json", "{}\n");

    expect(refreshEditorSchema(context.files, await context.load())).toBe(true);

    expect(ws.read("node_modules/.cache/shiplane/schema.json")).toContain("buildSecrets");
  });

  it("given the schema matches the modules, when a command loads the release, then it is left as it is", async () => {
    const { context } = setUp();
    await initRelease(context, { yes: true, blank: false });

    expect(refreshEditorSchema(context.files, await context.load())).toBe(false);
  });
});
