import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sourceControlContract, systemShell } from "shiplane/testing";
import { afterAll } from "vitest";

import { gitSourceControl } from "../git-source-control.adapter";

const made: string[] = [];
afterAll(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

// A checkout of main with one commit, pushed to a bare origin next to it.
const repository = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "release-git-contract-"));
  made.push(dir);
  const root = path.join(dir, "checkout");
  const origin = path.join(dir, "origin.git");
  const run = (args: string[], cwd = root) => execFileSync("git", args, { cwd, stdio: "pipe" });
  fs.mkdirSync(root);
  run(["init", "--quiet", "--bare", "--initial-branch=main", origin], dir);
  run(["init", "--quiet", "--initial-branch=main"]);
  for (const [key, value] of [
    ["user.name", "Release Contract"],
    ["user.email", "contract@example.com"],
    ["commit.gpgsign", "false"],
    ["tag.gpgsign", "false"],
    ["core.hooksPath", "/dev/null"],
  ] as const) {
    run(["config", key, value]);
  }
  fs.writeFileSync(path.join(root, "README.md"), "# app\n");
  run(["add", "README.md"]);
  run(["commit", "--quiet", "-m", "chore: start"]);
  run(["remote", "add", "origin", origin]);
  run(["push", "--quiet", "origin", "main"]);
  return root;
};

sourceControlContract("git", () => {
  const root = repository();
  const port = gitSourceControl().create({ root, shell: systemShell });
  return Promise.resolve({
    port,
    head: async () => (await port.position()).head,
    change: (file, text) => {
      fs.writeFileSync(path.join(root, file), text);
      return Promise.resolve();
    },
  });
});
