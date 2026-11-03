import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { PlannedChangeset } from "../../../domain/changes";
import { readUnitFile } from "../../../application/config/readUnitFile";
import { openReleasePr } from "../../../application/openReleasePr";
import { prepareRelease } from "../../../application/prepareRelease";
import { readStatus } from "../../../application/readStatus";
import { shipTo } from "../../../application/ship";
import { TAG_FORMATS } from "../../../domain/tags";
import { planFrom } from "../../../testing/plans";
import { changesetText, testContext, testUnit } from "../../../testing/releaseContext";
import { agentPlugin } from "../agent-plugin.module";

const PLUGIN = testUnit("reviewer", {
  dir: "plugins/reviewer",
  file: "plugins/reviewer/shiplane.unit.yml",
  packageName: "@acme/plugin-reviewer",
  version: "0.7.0",
  module: "agent-plugin",
});

const AUDIT: PlannedChangeset = {
  id: "audit-skill",
  summary: "Add the audit skill.",
  releases: [{ name: "@acme/plugin-reviewer", type: "minor" }],
};

// As the agents write them: Claude's with a nested version first, Codex's on one line.
const MANIFESTS = {
  ".claude-plugin/plugin.json": `{\n  "name": "reviewer",\n  "dependencies": [{ "name": "base", "version": "0.7.0" }],\n  "version": "0.7.0",\n  "keywords": ["review", "audit"]\n}\n`,
  ".codex-plugin/plugin.json": `{ "name": "reviewer", "version": "0.7.0" }\n`,
  ".cursor-plugin/plugin.json": `{\n  "name": "reviewer",\n  "version": "0.7.0"\n}\n`,
};

let root = "";
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const setUp = () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-plugin-"));
  for (const [file, text] of Object.entries(MANIFESTS)) {
    const at = path.join(root, PLUGIN.dir, file);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, text);
  }
  const world = testContext({
    units: [PLUGIN],
    modules: [agentPlugin()],
    root,
    tagFormat: TAG_FORMATS.plugin,
  });
  world.versioning.seed({
    pending: [
      { id: AUDIT.id, text: changesetText({ "@acme/plugin-reviewer": "minor" }, AUDIT.summary) },
    ],
    plan: planFrom([AUDIT], { "@acme/plugin-reviewer": "0.7.0" }),
  });
  world.source.seed({ tags: { "reviewer--v0.7.0": "t1" } });
  return world;
};

const read = (file: string) => fs.readFileSync(path.join(root, PLUGIN.dir, file), "utf8");

describe("a plugin for coding agents, released from the repository agents install it from", () => {
  it("given its unit file names only its module, when read, then it is an app with no problem", () => {
    const { unit, problems } = readUnitFile(PLUGIN.file, "module: agent-plugin\n", [agentPlugin()]);

    expect(problems).toEqual([]);
    expect(unit?.module).toBe("agent-plugin");
  });

  it("given a minor changeset, when the release PR opens, then every agent manifest moves to 0.8.0 before the commit, one line each", async () => {
    const { context, host, prompter } = setUp();
    prompter.answer(true);

    await openReleasePr(context, await prepareRelease(context, new Set(["reviewer"])));

    for (const file of Object.keys(MANIFESTS)) {
      expect(JSON.parse(read(file)), file).toMatchObject({ version: "0.8.0" });
    }
    expect(read(".codex-plugin/plugin.json")).toBe(`{ "name": "reviewer", "version": "0.8.0" }\n`);
    // The nested dependency keeps its own version; only the plugin's moves.
    const claude = JSON.parse(read(".claude-plugin/plugin.json")) as { dependencies: unknown };
    expect(claude.dependencies).toEqual([{ name: "base", version: "0.7.0" }]);
    expect(host.received).toContainEqual(
      expect.objectContaining({ type: "pr", title: "chore(reviewer): release v0.8.0" }),
    );
  });

  it("given the release PR it opens, when it is read, then it says merging is what ships the plugin", async () => {
    const { context, host, prompter } = setUp();
    prompter.answer(true);

    await openReleasePr(context, await prepareRelease(context, new Set(["reviewer"])));

    const pr = host.received.find((event) => event.type === "pr");
    expect(pr && "body" in pr ? pr.body : "").toContain("Agents update to it: merging ships it");
  });

  it("given the person says no, when the release is offered, then no manifest is touched", async () => {
    const { context, prompter } = setUp();
    prompter.answer(false);

    await openReleasePr(context, await prepareRelease(context, new Set(["reviewer"])));

    for (const [file, text] of Object.entries(MANIFESTS)) expect(read(file), file).toBe(text);
  });

  it("given reviewer--v0.7.0 tagged, when shipped and read, then nothing runs and it says agents install it from the repository", async () => {
    const { context, shell, output } = setUp();

    expect(await shipTo(context, "preview", {})).toBe(true);
    const status = await readStatus(context, "preview");

    expect(shell.calls).toEqual([]);
    expect(output.text).toContain(
      "reviewer--v0.7.0  released, agents install it from the repository",
    );
    expect(status.units).toEqual([
      expect.objectContaining({ unit: "reviewer", target: "marketplace", tag: "reviewer--v0.7.0" }),
    ]);
  });
});
