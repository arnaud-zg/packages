import type { SetupContext, Workspace } from "shiplane/testing";
import { cloudflarePagesStaticHosting } from "@shiplane/cloudflare-pages";
import { easMobileDistribution } from "@shiplane/eas";
import { flyServerHosting } from "@shiplane/fly";
import { npmPackageRegistry } from "@shiplane/npm";
import { shellServerHosting } from "shiplane/plugin";
import {
  createWorkspace,
  loadRelease,
  MemoryOutput,
  nodeFiles,
  packageJson,
  RecordingShell,
  ScriptedPrompter,
  setup,
} from "shiplane/testing";
import { afterEach, describe, expect, it } from "vitest";

import { PLUGIN_ALIASES } from "../aliases";

let workspace: Workspace | undefined;
afterEach(() => workspace?.remove());

const FLOW = {
  ".git/HEAD": "ref: refs/heads/main\n",
  ".github/workflows/ci.yml": "on: push\n",
  ".changeset/config.json": "{}\n",
};

const REPO = {
  "package.json": JSON.stringify({ name: "acme", private: true }),
  "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
  "apps/api/package.json": packageJson("@acme/api", "0.0.3", { scripts: { build: "tsc" } }),
  "apps/api/fly-preview.toml": 'app = "acme-api-preview"\nprimary_region = "fra"\n',
  "apps/api/fly-production.toml": 'app = "acme-api-production"\n',
};

const setUp = (files: Record<string, string>, interactive = true) => {
  workspace = createWorkspace({ ...REPO, ...files });
  const prompter = new ScriptedPrompter(interactive);
  const output = new MemoryOutput();
  const shell = new RecordingShell().seed("git remote get-url origin", {
    stdout: "git@github.com:acme/mono.git\n",
  });
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
      npmPackageRegistry(),
      shellServerHosting(),
    ],
    load: () => loadRelease(workspace?.root ?? "", { aliases: PLUGIN_ALIASES }),
  };
  return { context, prompter, output, shell, ws: workspace };
};

describe("shiplane setup, a new repository", () => {
  it("given every part proven, when setup runs, then two answers write a config that loads", async () => {
    const { context, prompter, output, shell, ws } = setUp(FLOW);
    prompter.answer(true, true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(prompter.asked).toHaveLength(2);
    expect(output.text).toContain("proof: fly-preview.toml");
    expect(output.text).toContain("Ready.");
    expect(shell.calls.some(({ command, args }) => command === "npm" && args[1] === "build")).toBe(
      true,
    );
    const release = await context.load();
    expect(release.problems).toEqual([]);
    expect(release.units.map(({ name }) => name)).toEqual(["api"]);
    expect(ws.read("shiplane.config.ts")).toContain("gitHubActionsCiPipeline()");
  });

  it("given a folder no adapter is sure of, when setup runs, then it asks what it is and where it goes", async () => {
    const { context, prompter, ws } = setUp({
      ...FLOW,
      "apps/web/package.json": packageJson("@acme/web", "0.1.0", {
        scripts: { build: "vite build" },
      }),
    });
    prompter.answer(true, "static-hosting", "cloudflare-pages", "acme-web", true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(prompter.asked).toContain("What is apps/web?");
    expect(prompter.asked).toContain("Where does apps/web go?");
    expect(ws.read("apps/web/shiplane.unit.yml")).toContain("module: web-app");
  });

  it("given a failing build, when setup rehearses, then it says so and writes nothing", async () => {
    const { context, prompter, output, shell, ws } = setUp(FLOW);
    shell.seed("npm run build", { status: 1, stderr: "error TS2304: cannot find name" });
    prompter.answer(true);

    expect(await setup(context, { yes: false })).toBe(false);

    expect(output.text).toContain("cannot find name");
    expect(output.text).toContain("Nothing written.");
    expect(ws.exists("shiplane.config.ts")).toBe(false);
    expect(ws.exists("apps/api/shiplane.unit.yml")).toBe(false);
  });

  it("given --yes and a folder no adapter is sure of, when setup runs, then it lists what needs a person and writes nothing", async () => {
    const { context, output, ws } = setUp(
      { ...FLOW, "apps/web/package.json": packageJson("@acme/web", "0.1.0") },
      false,
    );

    expect(await setup(context, { yes: true })).toBe(false);

    expect(output.text).toContain("apps/web (no adapter is sure what it is)");
    expect(ws.exists("shiplane.config.ts")).toBe(false);
  });

  it("given no workspace folders, when setup asks where the apps are, then a path that matches nothing is asked again", async () => {
    const { context, prompter, ws } = setUp({
      ...FLOW,
      "pnpm-workspace.yaml": "packages:\n  - services/*\n",
      "tools/cli/package.json": packageJson("@acme/cli", "0.1.0", { scripts: { build: "tsc" } }),
    });
    prompter.answer("nowhere/*", "tools/*", "skip", true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(prompter.asked.filter((q) => q.startsWith("Where are your apps"))).toHaveLength(2);
    expect(ws.read("shiplane.config.ts")).toContain('units: ["tools/*"]');
  });

  it("given a custom CI pipeline, when setup writes it, then the config imports it and the release loads", async () => {
    const { context, prompter, ws } = setUp({
      ".git/HEAD": "ref: refs/heads/main\n",
      ".changeset/config.json": "{}\n",
    });
    prompter.answer("ready", "ready", "custom", "jenkinsCiPipeline", "ready", true, true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(ws.read("shiplane.config.ts")).toContain(
      'import { jenkinsCiPipeline } from "./shiplane/adapters/jenkins-ci-pipeline";',
    );
    expect(ws.read("shiplane/adapters/jenkins-ci-pipeline.ts")).toContain("ciPipelineMemory");
    expect(ws.read("shiplane/adapters/jenkins-ci-pipeline.test.ts")).toContain(
      "ciPipelineContract",
    );
    expect((await context.load()).problems).toEqual([]);
  });

  it("given an app no adapter fits, when Custom is picked, then a named no-op ships it", async () => {
    const { context, prompter, output, ws } = setUp({
      ...FLOW,
      "apps/bot/package.json": packageJson("@acme/bot", "0.1.0", { scripts: { build: "tsc" } }),
    });
    prompter.answer(true, "server-hosting", "custom", "botDelivery", true);

    const done = await setup(context, { yes: false });
    expect(done, output.text).toBe(true);

    expect(ws.read("apps/bot/shiplane.unit.yml")).toContain("module: bot-delivery");
    expect((await context.load()).units.map(({ module }) => module)).toContain("bot-delivery");
  });

  it("given a folder without a build script, when setup asks for one, then it saves it as buildCommand", async () => {
    const { context, prompter, ws } = setUp({
      ...FLOW,
      "apps/api/package.json": packageJson("@acme/api", "0.0.3"),
    });
    prompter.answer(true, "make api", true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(ws.read("apps/api/shiplane.unit.yml")).toContain("buildCommand: make api");
  });
});

describe("shiplane setup, run again", () => {
  it("given a config with its own module, when a new folder is unclear, then that module is offered first", async () => {
    const { context, prompter, ws } = setUp({
      ...FLOW,
      "apps/bot/package.json": packageJson("@acme/bot", "0.1.0", { scripts: { build: "tsc" } }),
    });
    prompter.answer(true, "server-hosting", "custom", "botDelivery", true);
    await setup(context, { yes: false });
    ws.write(
      "apps/worker/package.json",
      packageJson("@acme/worker", "0.1.0", { scripts: { build: "tsc" } }),
    );
    prompter.answer("module:bot-delivery", true);

    expect(await setup(context, { yes: false })).toBe(true);

    expect(prompter.choices["What is apps/worker?"]?.[0]?.label).toBe("Like backend-service");
    expect(ws.read("apps/worker/shiplane.unit.yml")).toContain("module: bot-delivery");
  });

  it("given nothing changed, when setup runs again, then it says all is set and asks nothing", async () => {
    const { context, prompter, output } = setUp(FLOW);
    prompter.answer(true, true);
    await setup(context, { yes: false });

    expect(await setup(context, { yes: false })).toBe(true);

    expect(output.lines.at(-1)).toContain("all set");
  });

  it("given a broken unit file, when setup runs, then it names the file and line and writes nothing", async () => {
    const { context, prompter, output, ws } = setUp(FLOW);
    prompter.answer(true, true);
    await setup(context, { yes: false });
    ws.write("apps/api/shiplane.unit.yml", "module: backend-servic\n");

    expect(await setup(context, { yes: false })).toBe(false);

    expect(output.text).toContain("apps/api/shiplane.unit.yml:1");
  });
});
