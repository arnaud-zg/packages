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

/** The server adapter of MODULE_CONFIG, given a platform that holds these names on every environment. */
const serverHolding = (held: string[]) =>
  MODULE_CONFIG.replace(
    "  jobs: () => [],\n});\n\nexport default",
    `  jobs: () => [],
  env: () => ({
    listNames: () => Promise.resolve(new Set(${JSON.stringify(held)})),
    setCommand: ({ names }) => \`server env set \${names.join(" ")}\`,
  }),
});

export default`,
  );

const CHECKED = `${SERVER_UNIT}checkEnvBeforeDeploy:
  all:
    - SENTRY_DSN
  production:
    - REVENUECAT_PROJECT_ID
`;

const doctorOn = async ({ config, unit }: { config: string; unit: string }) => {
  const ws = createWorkspace({
    "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    "shiplane.config.ts": config,
    "apps/api/package.json": packageJson("@acme/api", "0.4.2"),
    "apps/api/shiplane.unit.yml": unit,
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
  const passed = await doctor(context);
  return { passed, text: output.text };
};

describe("doctor and the env checked before deploy", () => {
  it("given every listed name on the platform, when doctor runs, then each environment is set and it passes", async () => {
    const { passed, text } = await doctorOn({
      config: serverHolding(["SENTRY_DSN", "REVENUECAT_PROJECT_ID"]),
      unit: CHECKED,
    });

    expect(passed).toBe(true);
    expect(text).toContain("Check env before deploy");
    expect(text).toContain("api on preview: 1 of 1 set");
    expect(text).toContain("api on production: 2 of 2 set");
  });

  it("given a production name unset, when doctor runs, then it names it with the command to set it and fails", async () => {
    const { passed, text } = await doctorOn({
      config: serverHolding(["SENTRY_DSN"]),
      unit: CHECKED,
    });

    expect(passed).toBe(false);
    expect(text).toContain("api on production: 1 unset env vars: REVENUECAT_PROJECT_ID");
    expect(text).toContain("server env set REVENUECAT_PROJECT_ID");
  });

  it("given a name listed in all and again for production, when doctor runs, then it says so", async () => {
    const { text } = await doctorOn({
      config: serverHolding(["SENTRY_DSN"]),
      unit: `${SERVER_UNIT}checkEnvBeforeDeploy:\n  all:\n    - SENTRY_DSN\n  production:\n    - SENTRY_DSN\n`,
    });

    expect(text).toContain("api: SENTRY_DSN is in all and listed again");
  });

  it("given a platform plugin that cannot list names, when doctor runs, then it warns and still passes", async () => {
    const { passed, text } = await doctorOn({ config: MODULE_CONFIG, unit: CHECKED });

    expect(passed).toBe(true);
    expect(text).toContain("api: can't check env on server");
  });

  it("given no unit lists env to check, when doctor runs, then it prints no env section at all", async () => {
    const { text } = await doctorOn({ config: serverHolding([]), unit: SERVER_UNIT });

    expect(text).not.toContain("Check env before deploy");
  });
});
