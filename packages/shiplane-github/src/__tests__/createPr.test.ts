import type { Shell, ShellResult } from "shiplane/plugin";
import { describe, expect, it } from "vitest";

import { githubHost } from "../github-code-host.adapter";

const ok = (stdout = ""): ShellResult => ({ status: 0, stdout, stderr: "" });
const EXISTS: ShellResult = {
  status: 1,
  stdout: "",
  stderr: 'label with name "type: chore" already exists; use `--force` to update its color',
};
const PR = ok('{"number":24,"url":"https://github.com/o/r/pull/24"}');

const replying = (...results: ShellResult[]) => {
  const calls: string[][] = [];
  const shell: Shell = {
    capture: (_command, args) => {
      calls.push([...args]);
      return Promise.resolve(results.shift() ?? ok());
    },
    attach: () => Promise.resolve(0),
    env: () => undefined,
  };
  return { shell, calls };
};

const PR_INPUT = {
  base: "main",
  head: "shiplane/release-x",
  title: "t",
  body: "b",
  label: "type: chore",
};

describe("opening the release pull request", () => {
  it("given a repository without the release label, when the PR opens, then the label is created first", async () => {
    const { shell, calls } = replying(ok(), ok(), PR);

    await expect(githubHost("/repo", shell).createPr(PR_INPUT)).resolves.toMatchObject({
      number: 24,
    });
    expect(calls[0]?.slice(0, 3)).toEqual(["label", "create", "type: chore"]);
    expect(calls[1]?.slice(0, 2)).toEqual(["pr", "create"]);
  });

  it("given the label already exists, when the PR opens, then it opens all the same", async () => {
    const { shell } = replying(EXISTS, ok(), PR);

    await expect(githubHost("/repo", shell).createPr(PR_INPUT)).resolves.toMatchObject({
      number: 24,
    });
  });
});
