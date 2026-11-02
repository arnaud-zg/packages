import { describe, expect, it } from "vitest";

import type { ReleaseModule } from "../../modules/module";
import { serverHostingFake } from "../../adapters/server-hosting/__fakes__/server-hosting.fake";
import { RecordingProgress } from "../../adapters/terminal/__fakes__/progress.fake";
import { detecting, memoryRepository } from "../../testing/memoryRepository";
import { testContext } from "../../testing/releaseContext";
import { rehearse } from "../rehearse";

// A rehearsal in memory: the release loads from Fake files, builds and checks go to a Fake shell.

const SIGNED_IN = {
  label: "fly signed in",
  check: { command: "flyctl", args: ["auth", "whoami"] },
  fix: { command: "flyctl", args: ["auth", "login"] },
};

const fly = () => ({
  ...detecting(serverHostingFake(), "fly", "fly.toml"),
  requirements: () => [SIGNED_IN],
});

const REPO = {
  "shiplane.config.ts": "// composed in memory",
  "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
  "pnpm-lock.yaml": "",
  "apps/api/package.json": JSON.stringify({
    name: "@acme/api",
    version: "1.0.0",
    scripts: { build: "tsc" },
  }),
  "apps/api/shiplane.unit.yml": "module: backend-service\nservice: api\n",
};

const given = (files: Record<string, string> = {}) =>
  memoryRepository({ ...REPO, ...files }, [fly()]);

describe("Feature: rehearsing a release", () => {
  it("given an app with a build script, when the release is rehearsed, then it builds in its folder with the repository's package manager", async () => {
    const { context, shell, output } = given();

    expect(await rehearse(context)).toBe(true);

    expect(shell.calls).toContainEqual(
      expect.objectContaining({
        command: "pnpm",
        args: ["run", "build"],
        cwd: "/memory/acme/apps/api",
      }),
    );
    expect(output.text).toContain("✓ apps/api");
  });

  it("given an app with a buildCommand, when the release is rehearsed, then that command builds it instead", async () => {
    const { context, shell } = given({
      "apps/api/shiplane.unit.yml": "module: backend-service\nbuildCommand: make\nservice: api\n",
    });

    await rehearse(context);

    expect(shell.calls).toContainEqual(
      expect.objectContaining({ command: "sh", args: ["-c", "make"] }),
    );
  });

  it("given a sign-in that is missing, when the release is rehearsed, then it fails and says what to run", async () => {
    const { context, shell, output } = given();
    shell.seed("flyctl auth whoami", { status: 1 });

    expect(await rehearse(context)).toBe(false);

    expect(output.text).toContain("✗ fly signed in");
    expect(output.text).toContain("run flyctl auth login, then shiplane setup");
  });

  it("given a tool that is not installed, when the release is rehearsed, then it says which one", async () => {
    const { context, shell, output } = given();
    shell.seed("flyctl", { status: 127 });

    expect(await rehearse(context)).toBe(false);

    expect(output.text).toContain("not installed: flyctl");
  });

  it("given a unit file naming no module, when the release is rehearsed, then nothing builds and the file is named", async () => {
    const { context, shell, output } = given({ "apps/api/shiplane.unit.yml": "module: nope\n" });

    expect(await rehearse(context)).toBe(false);

    expect(output.text).toContain("apps/api/shiplane.unit.yml");
    expect(shell.calls).toEqual([]);
  });

  it("given a module whose ship plan throws, when the release is rehearsed, then the plan step fails with its reason", async () => {
    const { context, output } = given();
    context.compose = (release) => {
      const broken: ReleaseModule[] = release.modules.map((module) => ({
        ...module,
        ship: () => {
          throw new Error("service is not set for preview");
        },
      }));
      return testContext({ units: release.units, modules: broken }).context;
    };

    expect(await rehearse(context)).toBe(false);

    expect(output.text).toContain("service is not set for preview");
  });

  it("given a module that plans cleanly, when the release is rehearsed, then the plan step passes and nothing runs", async () => {
    const { context, shell } = given();
    context.compose = (release) =>
      testContext({ units: release.units, modules: release.modules }).context;

    expect(await rehearse(context)).toBe(true);

    expect(shell.calls.map(({ command }) => command)).toEqual(["pnpm", "flyctl"]);
  });

  it("given a terminal, when the release is rehearsed, then each wait runs under a spinner", async () => {
    const { context, output } = given();
    const progress = new RecordingProgress(output);
    context.progress = progress;

    await rehearse(context);

    expect(progress.events.map(({ text }) => text)).toEqual(["build 1 app", "fly signed in"]);
  });
});
