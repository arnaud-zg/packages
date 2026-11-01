import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { systemShell } from "../adapters/shell/system-shell.adapter";

/** What the built CLI printed and the code it exited with. */
export interface CliRun {
  status: number;
  output: string;
}

export interface ConsumerRepository {
  root: string;
  /** The bare repository the checkout pushes to, standing in for GitHub. */
  origin: string;
  write: (file: string, text: string) => void;
  read: (file: string) => string;
  /** Runs git in the checkout, or in the bare origin with `{ in: "origin" }`. */
  git: (args: string[], where?: { in: "origin" }) => string;
  /** Commits every file as it stands and pushes the branch to the origin. */
  commitAndPush: (title: string) => void;
  /** Runs the built `shiplane` CLI in the checkout, as a person types it. */
  shiplane: (args: string[]) => CliRun;
  remove: () => void;
}

const CORE = "shiplane";

const coreDir = (from: string): string => {
  const manifest = path.join(from, "package.json");
  if (fs.existsSync(manifest)) {
    const { name } = JSON.parse(fs.readFileSync(manifest, "utf8")) as { name?: string };
    if (name === CORE) return from;
  }
  const parent = path.dirname(from);
  if (parent === from) throw new Error(`${CORE} not found above ${import.meta.dirname}`);
  return coreDir(parent);
};

/** The built CLI, as `pnpm add shiplane` installs it. */
export const builtCli = (): string => {
  const cli = path.join(coreDir(import.meta.dirname), "dist", "cli.js");
  if (!fs.existsSync(cli)) {
    throw new Error(`shiplane is not built: run pnpm turbo run build --filter=${CORE}`);
  }
  return cli;
};

// No global git config, signing key, token or CI marker leaks in: a run sees only this repository.
const LEAKS = new Set(["GITHUB_ACTIONS", "CI", "GITHUB_TOKEN", "GH_TOKEN"]);

const hermeticEnv = (home: string, bin: string): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !LEAKS.has(name))),
  PATH: [bin, systemShell.env("PATH") ?? ""].join(path.delimiter),
  HOME: home,
  GIT_CONFIG_GLOBAL: path.join(home, ".gitconfig"),
  GIT_CONFIG_NOSYSTEM: "1",
  NO_COLOR: "1",
  // A fixed date makes each commit's hash depend on its files only, so docs can quote a run.
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
});

// The tools that reach a platform answer offline, so a run that would call one fails at once.
const OFFLINE = ["gh", "npm", "flyctl"];

const offlineTools = (bin: string) => {
  fs.mkdirSync(bin);
  OFFLINE.forEach((tool) => {
    const file = path.join(bin, tool);
    fs.writeFileSync(file, `#!/bin/sh\necho "${tool}: offline in this repository" >&2\nexit 1\n`);
    fs.chmodSync(file, 0o755);
  });
};

/**
 * A repository as a consumer has it: its files, the packages it installed linked in its
 * node_modules, one commit pushed to a local bare origin. gh, npm and flyctl answer offline.
 */
export const consumerRepository = ({
  files,
  packages = {},
  branch = "main",
}: {
  files: Record<string, string>;
  /** The branch releases start from, created first and pushed. */
  branch?: string;
  /** Package name to the folder it installs from, such as a plugin's workspace folder. */
  packages?: Record<string, string>;
}): ConsumerRepository => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shiplane-consumer-"));
  const root = path.join(dir, "checkout");
  const origin = path.join(dir, "origin.git");
  const home = path.join(dir, "home");
  fs.mkdirSync(home);
  fs.writeFileSync(
    path.join(home, ".gitconfig"),
    "[user]\n\tname = Shiplane Consumer\n\temail = consumer@example.com\n" +
      "[commit]\n\tgpgsign = false\n[tag]\n\tgpgsign = false\n[core]\n\thooksPath = /dev/null\n",
  );
  const bin = path.join(dir, "bin");
  offlineTools(bin);
  const env = hermeticEnv(home, bin);
  const git = (args: string[], where?: { in: "origin" }) =>
    execFileSync("git", args, {
      cwd: where ? origin : root,
      env,
      stdio: "pipe",
      encoding: "utf8",
    }).trim();
  const write = (file: string, text: string) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };

  fs.mkdirSync(root);
  execFileSync("git", ["init", "--quiet", "--bare", `--initial-branch=${branch}`, origin], { env });
  git(["init", "--quiet", `--initial-branch=${branch}`]);
  git(["remote", "add", "origin", origin]);
  write(".gitignore", "node_modules\n");
  Object.entries(files).forEach(([file, text]) => write(file, text));
  Object.entries({ [CORE]: coreDir(import.meta.dirname), ...packages }).forEach(([name, from]) => {
    const link = path.join(root, "node_modules", name);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(from, link, "dir");
  });
  const commitAndPush = (title: string) => {
    git(["add", "--all"]);
    git(["commit", "--quiet", "-m", title]);
    git(["push", "--quiet", "origin", branch]);
  };
  commitAndPush("chore: start");

  const cli = builtCli();
  return {
    root,
    origin,
    write,
    read: (file) => fs.readFileSync(path.join(root, file), "utf8"),
    git,
    commitAndPush,
    shiplane: (args) => {
      const run = spawnSync(process.execPath, [cli, ...args], {
        cwd: root,
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { status: run.status ?? 1, output: `${run.stdout}${run.stderr}` };
    },
    remove: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
};
