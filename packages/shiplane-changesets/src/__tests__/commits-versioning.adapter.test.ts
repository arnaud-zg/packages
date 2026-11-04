import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Shell } from "shiplane/plugin";
import { systemShell } from "shiplane/testing";
import { afterEach, describe, expect, it } from "vitest";

import { commitsVersioning } from "../commits-versioning.adapter";

const CHANGESET = path.resolve(import.meta.dirname, "../../../../node_modules/.bin/changeset");

let root = "";
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });

/** A shell running real git and the real changesets CLI in the repository under test. */
const shell: Shell = {
  ...systemShell,
  env: (name) => (name === "GITHUB_TOKEN" ? "token" : undefined),
  capture: (command, args, options) =>
    command === "pnpm"
      ? systemShell.capture(CHANGESET, args.slice(2), options)
      : systemShell.capture(command, args, options),
  attach: (command, args, options) =>
    systemShell.capture(CHANGESET, args.slice(2), options).then(({ status }) => status),
};

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
};

const commit = (file: string, subject: string) => {
  write(file, subject);
  git("add", "-A");
  git("commit", "-qm", subject);
};

const manifest = (name: string, version: string) =>
  `${JSON.stringify({ name, version, private: true }, null, 2)}\n`;

/** Two plugins at their release: `ignored` sits in the changesets config. */
const setUp = () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "commits-versioning-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  write("pnpm-workspace.yaml", "packages:\n  - plugins/*\n");
  write("package.json", JSON.stringify({ name: "repo", private: true }));
  write(
    ".changeset/config.json",
    JSON.stringify({
      changelog: false,
      commit: false,
      baseBranch: "main",
      ignore: ["@acme/ignored"],
      privatePackages: { version: true, tag: false },
    }),
  );
  write("plugins/reviewer/package.json", manifest("@acme/reviewer", "0.7.0"));
  write("plugins/writer/package.json", manifest("@acme/writer", "1.2.0"));
  write("plugins/ignored/package.json", manifest("@acme/ignored", "3.0.0"));
  git("add", "-A");
  git("commit", "-qm", "chore(release): every plugin");
  return commitsVersioning().create({ root, shell });
};

const version = (folder: string) =>
  (
    JSON.parse(fs.readFileSync(path.join(root, folder, "package.json"), "utf8")) as {
      version: string;
    }
  ).version;

describe("versioning from commits, with no changeset to write", () => {
  it.each([
    ["fix(reviewer): a typo", "patch", "0.7.1"],
    ["perf(reviewer): faster", "patch", "0.7.1"],
    ["feat(reviewer): add the audit skill (#12)", "minor", "0.8.0"],
    ["refactor(reviewer)!: rename the skill", "minor", "0.8.0"],
  ])("given %s below 1.0, when planned, then it moves a %s to %s", async (subject, type, to) => {
    const port = setUp();
    commit("plugins/reviewer/a.md", subject);

    const plan = await port.plan([], []);

    expect(plan.releases).toEqual([
      expect.objectContaining({ name: "@acme/reviewer", type, newVersion: to }),
    ]);
  });

  it("given a subject marked ! from 1.0, when planned, then it moves a major", async () => {
    const port = setUp();
    commit("plugins/writer/a.md", "refactor(writer)!: rename the skill");

    const plan = await port.plan([], []);

    expect(plan.releases).toEqual([
      expect.objectContaining({ name: "@acme/writer", type: "major", newVersion: "2.0.0" }),
    ]);
  });

  it.each(["chore(reviewer): tidy up", "docs: the skill", "test: more", "no type at all"])(
    "given only %s in a package, when pending is read, then it still ships as a patch",
    async (subject) => {
      const port = setUp();
      commit("plugins/reviewer/a.md", subject);

      const pending = await port.pending();

      expect(pending).toHaveLength(1);
      expect(pending[0]?.text).toContain('"@acme/reviewer": patch');
    },
  );

  it("given several chores, when pending is read, then only the latest is told", async () => {
    const port = setUp();
    commit("plugins/reviewer/a.md", "chore(reviewer): the first");
    commit("plugins/reviewer/b.md", "chore(reviewer): the second");

    const pending = await port.pending();

    expect(pending).toHaveLength(1);
    expect(pending[0]?.text).toContain("The second.");
  });

  it("given nothing queued, when a person is told what to do, then a commit is what it asks for", () => {
    expect(setUp().nextChange).toBe("a commit in the package");
  });

  it("given a feature and a chore, when pending is read, then the feature alone is told, naming its package, as a sentence", async () => {
    const port = setUp();
    commit("plugins/reviewer/a.md", "feat(reviewer): add the audit skill (#12)");
    commit("plugins/reviewer/b.md", "chore(ci): baseline");

    const pending = await port.pending();

    expect(pending).toHaveLength(1);
    expect(pending[0]?.text).toContain('"@acme/reviewer": minor');
    expect(pending[0]?.text).toContain("Add the audit skill.");
  });

  it("given commits outside any package or only on a unit file, when pending is read, then nothing is pending", async () => {
    const port = setUp();
    commit("README.md", "docs: the readme");
    commit("plugins/reviewer/shiplane.unit.yml", "chore: its release config");

    expect(await port.pending()).toEqual([]);
  });

  it("given the root listed in the workspace beside its packages, when a plugin changes, then only the plugin releases", async () => {
    const port = setUp();
    write("pnpm-workspace.yaml", 'packages:\n  - "."\n  - plugins/*\n');
    write("package.json", manifest("repo", "2.0.0"));
    git("add", "-A");
    git("commit", "-qm", "chore(release): the root");
    commit("plugins/reviewer/a.md", "feat(reviewer): add the audit skill");
    commit("scripts/a.md", "feat: a script of the repository");

    const pending = await port.pending();

    expect(pending).toHaveLength(1);
    expect(pending[0]?.text).toContain('"@acme/reviewer": minor');
  });

  it("given a single package at the root, when it changes, then it releases", async () => {
    setUp();
    fs.rmSync(path.join(root, "plugins"), { recursive: true });
    write("pnpm-workspace.yaml", 'packages:\n  - "."\n');
    write("package.json", manifest("@acme/solo", "2.0.0"));
    git("add", "-A");
    git("commit", "-qm", "chore(release): solo");
    commit("src/a.md", "feat: something");

    const pending = await commitsVersioning().create({ root, shell }).pending();

    expect(pending).toHaveLength(1);
    expect(pending[0]?.text).toContain('"@acme/solo": minor');
  });

  it("given a package the changesets config ignores, when pending is read, then its commits release nothing", async () => {
    const port = setUp();
    commit("plugins/ignored/a.md", "feat: something");

    expect(await port.pending()).toEqual([]);
  });

  it("given a changeset someone wrote for a package, when planned, then it takes over from that package's commits", async () => {
    const port = setUp();
    commit("plugins/reviewer/a.md", "fix(reviewer): a typo");
    commit("plugins/writer/a.md", "fix(writer): a typo");
    commit(".changeset/by-hand.md", `---\n"@acme/reviewer": major\n---\n\nBy hand.\n`);

    const plan = await port.plan([], []);

    expect(plan.releases.map(({ name, newVersion }) => [name, newVersion]).sort()).toEqual([
      ["@acme/reviewer", "1.0.0"],
      ["@acme/writer", "1.2.1"],
    ]);
  });

  it("given a release applied and committed, when pending is read again, then nothing is left and no changeset file stays", async () => {
    const port = setUp();
    commit("plugins/reviewer/a.md", "feat(reviewer): add the audit skill");

    await port.apply([], []);

    expect(version("plugins/reviewer")).toBe("0.8.0");
    git("add", "-A");
    git("commit", "-qm", "chore(reviewer): release v0.8.0");
    expect(await port.pending()).toEqual([]);
    expect(fs.readdirSync(path.join(root, ".changeset"))).toEqual(["config.json"]);
  });

  it("given a unit held back, when applied, then the other moves, nothing is written for the held one and its commits stay pending", async () => {
    const port = setUp();
    commit("plugins/reviewer/a.md", "fix(reviewer): a typo");
    commit("plugins/writer/a.md", "fix(writer): a typo");
    const { changesets } = await port.plan([], []);
    const held = changesets.filter(({ releases }) => releases[0]?.name === "@acme/writer");

    expect((await port.plan([], held)).releases.map(({ name }) => name)).toEqual([
      "@acme/reviewer",
    ]);
    await port.apply([], held);

    expect(version("plugins/reviewer")).toBe("0.7.1");
    expect(version("plugins/writer")).toBe("1.2.0");
    expect(fs.readdirSync(path.join(root, ".changeset"))).toEqual(["config.json"]);
    git("add", "-A");
    git("commit", "-qm", "chore(reviewer): release v0.7.1");
    const pending = await port.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.text).toContain('"@acme/writer": patch');
  });
});
