import { describe, expect, it } from "vitest";

import { serverHostingFake } from "../../adapters/server-hosting/__fakes__/server-hosting.fake";
import { RecordingProgress } from "../../adapters/terminal/__fakes__/progress.fake";
import { detecting, memoryRepository } from "../../testing/memoryRepository";
import { runCli } from "../main";

// The CLI as a person types it, from argv to exit code, through the real composer. Only the ports
// that would touch this machine are Fakes: files in memory, a recording shell, a scripted person.

const REPO = {
  "package.json": JSON.stringify({ name: "acme", private: true }),
  "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
  ".git/HEAD": "ref: refs/heads/main\n",
  ".github/workflows/ci.yml": "on: push\n",
  ".changeset/config.json": "{}\n",
  "apps/api/package.json": JSON.stringify({
    name: "@acme/api",
    version: "0.1.0",
    scripts: { build: "tsc" },
  }),
  "apps/api/fly.toml": "",
};

const given = (files: Record<string, string> = REPO) => {
  const repo = memoryRepository(files, [
    detecting(serverHostingFake(), "fly", "fly.toml", (folder) => ({ service: folder.name })),
  ]);
  repo.shell.seed("git remote get-url origin", { stdout: "https://github.com/acme/mono\n" });
  const run = (...argv: string[]) =>
    runCli(argv, repo.context.root, {
      setup: { ...repo.context, progress: new RecordingProgress(repo.output) },
    });
  return { ...repo, run };
};

describe("Feature: shiplane setup from the command line", () => {
  it("given a repository with no config, when the person types shiplane, then setup runs and exits 0 once ready", async () => {
    const { run, prompter, files } = given();
    prompter.answer(true, true);

    expect(await run()).toBe(0);

    expect(files.exists("shiplane.config.ts")).toBe(true);
    expect(files.exists("apps/api/shiplane.unit.yml")).toBe(true);
  });

  it("given a repository with no config, when the person types shiplane setup --yes, then it asks nothing and exits 0", async () => {
    const { run, prompter, output } = given();

    expect(await run("setup", "--yes")).toBe(0);

    expect(prompter.asked).toEqual([]);
    expect(output.text).toContain("Ready.");
  });

  it("given the older habit, when the person types shiplane init, then setup runs instead", async () => {
    const { run, prompter, output } = given();
    prompter.answer(true, true);

    expect(await run("init")).toBe(0);

    expect(output.text).toContain("shiplane setup");
  });

  it("given a build that fails, when the person types shiplane setup --yes, then it exits 1 and the files are as they were", async () => {
    const { run, shell, files } = given();
    shell.seed("pnpm run build", { status: 2 }).seed("npm run build", { status: 2 });
    const before = files.all;

    expect(await run("setup", "--yes")).toBe(1);

    expect(files.all).toEqual(before);
  });
});
