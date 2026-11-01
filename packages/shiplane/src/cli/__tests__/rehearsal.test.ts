import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { Workspace } from "../../testing/workspace";
import { RecordingShell } from "../../adapters/shell/__fakes__/shell.fake";
import { RecordingProgress } from "../../adapters/terminal/__fakes__/progress.fake";
import { MemoryOutput, ScriptedPrompter } from "../../adapters/terminal/__fakes__/terminal.fake";
import { endRehearsal, rehearsal } from "../../testing/rehearsal";
import { createWorkspace, packageJson, SOURCE_ALIASES } from "../../testing/workspace";
import { runCli } from "../main";

// A repository whose config composes a Fake for every port, as a person would rehearse a release.
const CONFIG = `
import { backendService, defineRelease, releaseFlow, webApp } from "shiplane";
import { rehearsal } from "shiplane/rehearsal";

const fakes = rehearsal();

export default defineRelease({
  flow: releaseFlow({
    sourceControl: fakes.sourceControl,
    codeHost: fakes.codeHost,
    ciPipeline: fakes.ciPipeline,
    versioning: fakes.versioning,
  }),
  modules: [
    backendService({ serverHosting: fakes.serverHosting }),
    webApp({ staticHosting: fakes.staticHosting }),
  ],
  display: { verbose: false, mascot: false },
});
`;

const ALIASES = {
  ...SOURCE_ALIASES,
  "shiplane/rehearsal": path.resolve(import.meta.dirname, "../../testing/rehearsal.ts"),
};

let workspace: Workspace | undefined;
afterEach(() => {
  workspace?.remove();
  endRehearsal();
});

const setUp = (answers: Parameters<ScriptedPrompter["answer"]> = []) => {
  workspace = createWorkspace({
    "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    "shiplane.config.ts": CONFIG,
    "apps/api/package.json": packageJson("@acme/api", "1.0.0"),
    "apps/api/shiplane.unit.yml": "module: backend-service\nservice: api\n",
    "apps/site/package.json": packageJson("@acme/site", "1.0.0"),
    "apps/site/shiplane.unit.yml": "module: web-app\nsite: site\n",
  });
  const fakes = rehearsal();
  fakes.sourceControl.fake.seed({
    position: { branch: "main", head: "h1", originMain: "h1" },
    tags: { "api@1.0.0": "t1", "site@1.0.0": "t2" },
    files: {
      "api@1.0.0:.github/workflows/ship.yml": "on: workflow_dispatch",
      "site@1.0.0:.github/workflows/ship.yml": "on: workflow_dispatch",
    },
  });
  const prompter = new ScriptedPrompter();
  prompter.answer(...answers);
  const output = new MemoryOutput();
  const io = {
    aliases: ALIASES,
    prompter,
    output,
    progress: new RecordingProgress(output),
    shell: new RecordingShell(),
  };
  const run = (...argv: string[]) => runCli(argv, workspace?.root ?? "", io);
  return { fakes, prompter, output, run };
};

describe("a release rehearsed on Fakes, through the CLI's entry", () => {
  it("given two tagged apps, when shipped to preview through CI, then each app's workflow is dispatched on its tag, in release order", async () => {
    const { fakes, run } = setUp();

    expect(await run("ship", "--via", "github", "--yes")).toBe(0);

    expect(fakes.serverHosting.fake.received).toEqual([
      { tag: "api@1.0.0", environment: "preview", service: "api" },
    ]);
    expect(fakes.staticHosting.fake.received).toEqual([
      { tag: "site@1.0.0", environment: "preview", site: "site" },
    ]);
    expect(fakes.ciPipeline.fake.received).toEqual([
      {
        type: "dispatch",
        workflow: "ship.yml",
        ref: "api@1.0.0",
        inputs: { units: "api", environment: "preview" },
      },
      {
        type: "dispatch",
        workflow: "ship.yml",
        ref: "site@1.0.0",
        inputs: { units: "site", environment: "preview" },
      },
    ]);
  });

  it("given both apps on preview, when promoted through CI, then each is dispatched to production", async () => {
    const { fakes, prompter, run } = setUp([["api", "site"], "production", true]);
    fakes.codeHost.fake.seed({
      deployments: [
        { title: "Deploy api@1.0.0 to preview", state: "done" },
        { title: "Deploy site@1.0.0 to preview", state: "done" },
      ],
    });

    const code = await run("promote", "--via", "github");

    expect(code).toBe(0);
    expect(prompter.asked).toEqual([
      "What do you want to release to production? Greyed units have nothing to release.",
      'Type "production" to start:',
      "Ship api@1.0.0, site@1.0.0 to production through GitHub Actions?",
    ]);
    expect(
      fakes.ciPipeline.fake.received.map(({ ref, inputs }) => `${ref} ${inputs.environment ?? ""}`),
    ).toEqual(["api@1.0.0 production", "site@1.0.0 production"]);
  });
});
