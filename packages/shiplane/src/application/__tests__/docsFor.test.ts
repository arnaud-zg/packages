import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import type { Workspace } from "../../testing/workspace";
import type { SetupContext } from "../setupContext";
import { defineStaticHosting } from "../../adapters/defineDelivery";
import { nodeFiles } from "../../adapters/files/node-files.adapter";
import { RecordingShell } from "../../adapters/shell/__fakes__/shell.fake";
import { MemoryOutput, ScriptedPrompter } from "../../adapters/terminal/__fakes__/terminal.fake";
import { MODULE_CONFIG } from "../../testing/moduleConfig";
import { createWorkspace, SOURCE_ALIASES } from "../../testing/workspace";
import { loadRelease } from "../config/loadRelease";
import { perEnv } from "../config/perEnv";
import { docsFor } from "../docsFor";

let workspace: Workspace | undefined;
afterEach(() => workspace?.remove());

// A static host whose build keys sit in a nested object, as Cloudflare Pages has them.
const nestedHost = defineStaticHosting({
  name: "nested-host",
  settings: z.object({
    project: z.string().describe("The project"),
    build: z
      .object({
        command: z.array(z.string()).optional().describe("The build, run from the root"),
        env: z
          .record(z.string(), perEnv(z.string()))
          .optional()
          .describe("Variables the build reads"),
      })
      .default({}),
  }),
  describe: () => "",
  jobs: () => [],
});

const docsOf = async (name: string) => {
  workspace = createWorkspace({
    "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    "shiplane.config.ts": MODULE_CONFIG,
  });
  const output = new MemoryOutput();
  const context: SetupContext = {
    root: workspace.root,
    files: nodeFiles(workspace.root),
    shell: new RecordingShell(),
    prompter: new ScriptedPrompter(false),
    output,
    adapters: [nestedHost],
    load: () => loadRelease(workspace?.root ?? "", { aliases: SOURCE_ALIASES }),
  };
  await docsFor(context, name);
  return output.text;
};

describe("the keys an adapter documents", () => {
  it("given build keys in a nested object, when its docs are printed, then each nested key is listed with its description", async () => {
    const text = await docsOf("nested-host");

    expect(text).toContain("build.command");
    expect(text).toContain("The build, run from the root");
    expect(text).toContain("build.env");
    expect(text).toContain("Variables the build reads");
  });
});
