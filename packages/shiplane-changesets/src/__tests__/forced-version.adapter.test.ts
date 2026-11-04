import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Shell, VersioningPort } from "shiplane/plugin";
import { systemShell } from "shiplane/testing";
import { afterEach, describe, expect, it } from "vitest";

import { changesetsVersioning } from "../changesets-versioning.adapter";
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

const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const change = (id: string, lines: string[]) =>
  write(`.changeset/${id}.md`, `---\n${lines.join("\n")}\n---\n\nThe ${id} change.\n`);

const manifest = (name: string, version: string) =>
  `${JSON.stringify({ name, version, private: true }, null, 2)}\n`;

const setUp = () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "forced-version-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  write("pnpm-workspace.yaml", "packages:\n  - packages/*\n");
  write("package.json", JSON.stringify({ name: "repo", private: true }));
  write(
    ".changeset/config.json",
    JSON.stringify({
      changelog: "@changesets/cli/changelog",
      commit: false,
      baseBranch: "main",
      fixed: [["@acme/kit", "@acme/kit-*"]],
      privatePackages: { version: true, tag: false },
    }),
  );
  write("packages/kit/package.json", manifest("@acme/kit", "0.4.0"));
  write("packages/kit-cli/package.json", manifest("@acme/kit-cli", "0.4.0"));
  write("packages/solo/package.json", manifest("@acme/solo", "2.0.0"));
  git("add", "-A");
  git("commit", "-qm", "chore(release): every package");
};

const moves = async (port: VersioningPort, ...args: Parameters<VersioningPort["plan"]>) =>
  Object.fromEntries(
    (await port.plan(...args)).releases.map(({ name, newVersion }) => [name, newVersion]),
  );

const REASON = {
  id: "forced-0.4.1",
  releases: [
    { name: "@acme/kit", type: "patch" as const },
    { name: "@acme/kit-cli", type: "patch" as const },
  ],
  summary: "Version forced to 0.4.1 instead of 0.5.0: Docs and wording only",
};

const versionOf = (folder: string) =>
  (JSON.parse(read(`packages/${folder}/package.json`)) as { version: string }).version;

describe("forcing a version through changesets", () => {
  const files = () => changesetsVersioning().create({ root, shell });

  it("given a minor on one package of a fixed group and another on its sibling, when planned with a patch ceiling, then the whole group moves by a patch", async () => {
    setUp();
    change("one", ['"@acme/kit": minor']);
    change("two", ['"@acme/kit-cli": minor']);

    expect(await moves(files(), [], [])).toMatchObject({
      "@acme/kit": "0.5.0",
      "@acme/kit-cli": "0.5.0",
    });
    expect(await moves(files(), [], [], "patch")).toMatchObject({
      "@acme/kit": "0.4.1",
      "@acme/kit-cli": "0.4.1",
    });
  });

  it("given a plan with a ceiling, when it ends, then every changeset reads as it did", async () => {
    setUp();
    change("one", ['"@acme/kit": minor']);
    const before = read(".changeset/one.md");

    await files().plan([REASON], [], "patch");

    expect(read(".changeset/one.md")).toBe(before);
    expect(fs.existsSync(path.join(root, ".changeset/forced-0.4.1.md"))).toBe(false);
  });

  it("given a line already below the ceiling, when planned, then it keeps its own bump", async () => {
    setUp();
    change("one", ['"@acme/kit": patch']);

    expect(await moves(files(), [], [], "major")).toMatchObject({ "@acme/kit": "0.4.1" });
  });

  it("given a summary naming a level at a line's end, when capped, then the summary stays", async () => {
    setUp();
    write(".changeset/one.md", '---\n"@acme/kit": major\n---\n\nThis is minor\n');

    await files().apply([], [], "patch");

    expect(read("packages/kit/CHANGELOG.md")).toContain("This is minor");
    expect(versionOf("kit")).toBe("0.4.1");
  });

  it("given a line in single quotes, when capped, then it moves down too", async () => {
    setUp();
    change("one", ["'@acme/kit': minor"]);

    expect(await moves(files(), [], [], "patch")).toMatchObject({ "@acme/kit": "0.4.1" });
  });

  it("given a forced patch, when applied, then versions land, the changelog says why and no changeset is left", async () => {
    setUp();
    change("one", ['"@acme/kit": minor']);

    await files().apply([REASON], [], "patch");

    expect(versionOf("kit")).toBe("0.4.1");
    expect(versionOf("kit-cli")).toBe("0.4.1");
    expect(read("packages/kit/CHANGELOG.md")).toContain(REASON.summary);
    expect(read("packages/kit-cli/CHANGELOG.md")).toContain(REASON.summary);
    expect(read("packages/kit/CHANGELOG.md")).not.toContain("Minor Changes");
    expect((await files().pending()).map(({ id }) => id)).toEqual([]);
  });

  it("given a forced major, when applied, then the reason heads the changelog and the change keeps its section", async () => {
    setUp();
    change("one", ['"@acme/kit": minor']);
    const summary = "Version forced to 1.0.0 instead of 0.5.0: Drops the old config";
    const major = {
      ...REASON,
      id: "forced-1.0.0",
      releases: REASON.releases.map(({ name }) => ({ name, type: "major" as const })),
      summary,
    };

    await files().apply([major], [], "major");

    const changelog = read("packages/kit/CHANGELOG.md");
    expect(versionOf("kit")).toBe("1.0.0");
    expect(changelog.indexOf("### Major Changes")).toBeLessThan(changelog.indexOf(summary));
    expect(changelog).toContain("### Minor Changes");
    expect(changelog).toContain("The one change.");
  });

  it("given versioning failing, when a forced patch is applied, then every changeset reads as it did and the reason is gone", async () => {
    setUp();
    change("one", ['"@acme/kit": minor']);
    const before = read(".changeset/one.md");
    const failing: Shell = { ...shell, attach: () => Promise.resolve(1) };
    const port = changesetsVersioning().create({ root, shell: failing });

    await expect(port.apply([REASON], [], "patch")).rejects.toThrow("exited with 1");

    expect(read(".changeset/one.md")).toBe(before);
    expect(fs.existsSync(path.join(root, ".changeset/forced-0.4.1.md"))).toBe(false);
  });

  it("given a held changeset, when a forced patch is applied, then it keeps waiting at its own bump", async () => {
    setUp();
    change("one", ['"@acme/kit": minor']);
    change("later", ['"@acme/solo": major']);
    const held = {
      id: "later",
      summary: "The later change.",
      releases: [{ name: "@acme/solo", type: "major" as const }],
    };

    await files().apply([REASON], [held], "patch");

    expect(versionOf("solo")).toBe("2.0.0");
    expect(read(".changeset/later.md")).toContain('"@acme/solo": major');
  });
});

describe("forcing a version through commits", () => {
  const commits = () => commitsVersioning().create({ root, shell });
  const commit = (file: string, subject: string) => {
    write(file, subject);
    git("add", "-A");
    git("commit", "-qm", subject);
  };

  it("given a feat, when planned with a patch ceiling, then it moves by a patch", async () => {
    setUp();
    commit("packages/solo/a.md", "feat(solo): a feature");

    expect(await moves(commits(), [], [])).toEqual({ "@acme/solo": "2.1.0" });
    expect(await moves(commits(), [], [], "patch")).toEqual({ "@acme/solo": "2.0.1" });
  });

  it("given a feat and a forced major, when applied, then it lands with no file left behind", async () => {
    setUp();
    commit("packages/solo/a.md", "feat(solo): a feature");
    const reason = {
      id: "forced-3.0.0",
      releases: [{ name: "@acme/solo", type: "major" as const }],
      summary: "Version forced to 3.0.0 instead of 2.1.0: Removes the old flag",
    };

    await commits().apply([reason], [], "major");

    expect(versionOf("solo")).toBe("3.0.0");
    expect(read("packages/solo/CHANGELOG.md")).toContain(reason.summary);
    const left = fs.readdirSync(path.join(root, ".changeset"));
    expect(left).toEqual(["config.json"]);
  });
});
