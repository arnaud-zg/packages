import { afterEach, describe, expect, it } from "vitest";

import type { Workspace } from "../../testing/workspace";
import type { SetupContext } from "../setupContext";
import { nodeFiles } from "../../adapters/files/node-files.adapter";
import { RecordingShell } from "../../adapters/shell/__fakes__/shell.fake";
import { MemoryOutput, ScriptedPrompter } from "../../adapters/terminal/__fakes__/terminal.fake";
import { MODULE_CONFIG, SERVER_UNIT } from "../../testing/moduleConfig";
import { createWorkspace, packageJson, SOURCE_ALIASES } from "../../testing/workspace";
import { loadRelease } from "../config/loadRelease";
import { doctor } from "../doctor";

let workspace: Workspace | undefined;
afterEach(() => workspace?.remove());

const setUp = (files: Record<string, string>) => {
  const ws = createWorkspace({
    "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    "shiplane.config.ts": MODULE_CONFIG,
    "apps/api/package.json": packageJson("@acme/api", "0.4.2"),
    ...files,
  });
  workspace = ws;
  const output = new MemoryOutput();
  const context: SetupContext = {
    root: ws.root,
    files: nodeFiles(ws.root),
    shell: new RecordingShell(),
    prompter: new ScriptedPrompter(false),
    output,
    adapters: [],
    load: () => loadRelease(ws.root, { aliases: SOURCE_ALIASES }),
  };
  return { context, output };
};

describe("modules no app names", () => {
  it("given a module no unit file names, when doctor runs, then it warns about it and still passes", async () => {
    const { context, output } = setUp({ "apps/api/shiplane.unit.yml": SERVER_UNIT });

    expect(await doctor(context)).toBe(true);

    expect(output.text).toContain("web-app");
    expect(output.text).toContain("no app names it");
    expect(output.text).not.toContain("backend-service  no app names it");
  });
});

describe("files still named release.*", () => {
  it("given a unit file named release.unit.yml, when doctor runs, then it says to rename it and still passes", async () => {
    const { context, output } = setUp({ "apps/api/release.unit.yml": SERVER_UNIT });

    expect(await doctor(context)).toBe(true);

    expect(output.text).toContain("rename apps/api/release.unit.yml to apps/api/shiplane.unit.yml");
  });
});
