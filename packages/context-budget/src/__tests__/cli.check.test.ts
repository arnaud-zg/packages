import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmpDir: string;
let originalCwd: string;
let infoLines: string[];
let warnLines: string[];

async function runCli(args: string[]): Promise<void> {
  vi.resetModules();
  process.argv = ["node", "cli.js", "check", ...args];
  await import("../cli");
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-budget-cli-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  infoLines = [];
  warnLines = [];
  vi.spyOn(console, "info").mockImplementation((line: string) => {
    infoLines.push(String(line));
  });
  vi.spyOn(console, "warn").mockImplementation((line: string) => {
    warnLines.push(String(line));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("context-budget check", () => {
  it("given a root file well within budget, when checked, then it exits clean and reports all files within budget", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Small\n\nJust a few words.");

    await runCli([]);

    expect(process.exitCode).toBeUndefined();
    expect(infoLines.some((line) => line.includes("All files within budget"))).toBe(true);
  });

  it("given a config file lowering the root threshold below the file's size, when checked, then it exits 1 and reports the budget exceeded", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Big\n\n" + "word ".repeat(200));
    fs.writeFileSync(
      path.join(tmpDir, "context-budget.config.json"),
      JSON.stringify({ root: { threshold: 10 } }),
    );

    await runCli([]);

    expect(process.exitCode).toBe(1);
    expect(infoLines.some((line) => line.includes("Token budget exceeded"))).toBe(true);
  });

  it("given --json, when checked, then it prints a single JSON payload with root/references/subdir/orphans/deadRefs", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Small\n\nJust a few words.");

    await runCli(["--json"]);

    const payload = JSON.parse(infoLines[0] ?? "") as Record<string, unknown>;
    expect(payload).toHaveProperty("root");
    expect(payload).toHaveProperty("references");
    expect(payload).toHaveProperty("subdir");
    expect(payload).toHaveProperty("orphans");
    expect(payload).toHaveProperty("deadRefs");
  });

  it("given --explain for the root file, when checked, then it prints a detailed report for that file", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Small\n\nJust a few words.");

    await runCli(["--explain", "CLAUDE.md"]);

    expect(infoLines.some((line) => line.includes("Detailed report: CLAUDE.md"))).toBe(true);
  });

  it("given --explain for a file not in the results, when checked, then it errors instead of throwing", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Small\n\nJust a few words.");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runCli(["--explain", "does-not-exist.md"]);

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("does-not-exist.md"));
  });

  it("given a root reference to a file that doesn't exist, when checked, then it warns about the dead reference", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "# Root\n\nSee `.planning/codebase/MISSING.md` for details.",
    );

    await runCli([]);

    expect(warnLines.some((line) => line.includes("MISSING.md"))).toBe(true);
    expect(warnLines.some((line) => line.includes("dead reference"))).toBe(true);
  });

  it("given an empty referenced doc, when checked as JSON, then subdirectory files stay in the subdir group", async () => {
    fs.mkdirSync(path.join(tmpDir, ".planning/codebase"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "packages/kit"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "# Root\n\nSee `.planning/codebase/EMPTY.md` and `.planning/codebase/FULL.md`.",
    );
    fs.writeFileSync(path.join(tmpDir, ".planning/codebase/EMPTY.md"), "");
    fs.writeFileSync(path.join(tmpDir, ".planning/codebase/FULL.md"), "# Full\n\nSome words.");
    fs.writeFileSync(path.join(tmpDir, "packages/kit/CLAUDE.md"), "# Kit\n\nOther words.");

    await runCli(["--json"]);

    const payload = JSON.parse(infoLines[0] ?? "") as {
      references: { path: string }[];
      subdir: { path: string }[];
    };
    expect(payload.references.map((r) => r.path)).toEqual([".planning/codebase/FULL.md"]);
    expect(payload.subdir.map((r) => r.path)).toEqual(["packages/kit/CLAUDE.md"]);
  });

  it("given a dead reference, when checked with and without --json, then both exit with the same code", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "# Root\n\nSee `.planning/codebase/MISSING.md` for details.",
    );

    await runCli([]);
    const humanCode = process.exitCode;
    process.exitCode = undefined;
    await runCli(["--json"]);

    expect(process.exitCode).toBe(humanCode);
  });

  it("given custom health bands, when checked, then the summary legend shows them", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Small\n\nJust a few words.");
    fs.writeFileSync(
      path.join(tmpDir, "context-budget.config.json"),
      JSON.stringify({ health: { goodBelow: 0.5, normalBelow: 0.7 } }),
    );

    await runCli([]);

    expect(infoLines.some((line) => line.includes("GOOD ≤ 50%  |  NORMAL ≤ 70%"))).toBe(true);
  });

  it("given a run, when checked, then no unused token cache is written", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Small\n\nJust a few words.");

    await runCli([]);

    expect(fs.existsSync(path.join(tmpDir, ".cache"))).toBe(false);
  });

  it("given no root file, when checked, then it reports the missing file and exits 1", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runCli([]);

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("CLAUDE.md"));
  });

  it("given a config file that is not valid JSON, when checked, then it reports the config file and exits 1", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Small\n\nJust a few words.");
    fs.writeFileSync(path.join(tmpDir, "context-budget.config.json"), "{ not json");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runCli([]);

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("context-budget.config.json"));
  });
});
