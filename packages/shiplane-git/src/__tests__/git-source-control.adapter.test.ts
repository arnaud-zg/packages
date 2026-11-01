import { RecordingShell } from "shiplane/testing";
import { describe, expect, it } from "vitest";

import { gitSourceControl } from "../git-source-control.adapter";

const SIGNING = "git config --type=bool --get commit.gpgsign";

const tagWith = async (shell: RecordingShell) => {
  const source = gitSourceControl().create({ root: "/repo", shell });
  await source.tag("expo@0.3.0", "a472548", "expo 0.3.0");
  return shell.calls.find(({ args }) => args[0] === "tag")?.args;
};

describe("tagging a release", () => {
  it("given commits are signed, when a release is tagged, then its tag is signed too, so GitHub shows it Verified", async () => {
    const shell = new RecordingShell().seed(SIGNING, { stdout: "true\n" });

    expect(await tagWith(shell)).toEqual([
      "tag",
      "-s",
      "expo@0.3.0",
      "a472548",
      "-m",
      "expo 0.3.0",
    ]);
  });

  it("given nothing signs commits, such as a CI runner with no key, when a release is tagged, then its tag is annotated without a signature", async () => {
    const shell = new RecordingShell().seed(SIGNING, { status: 1 });

    expect(await tagWith(shell)).toEqual([
      "tag",
      "-a",
      "expo@0.3.0",
      "a472548",
      "-m",
      "expo 0.3.0",
    ]);
  });
});

const PUSH = "git push";
const DROPPED = { status: 128, stderr: "Connection to github.com closed by remote host.\n" };

const pushWith = async (shell: RecordingShell) => {
  const source = gitSourceControl({ retryDelays: [0, 0] }).create({ root: "/repo", shell });
  return source.push("chore/release-2026-10-19-1636-api").then(
    () => null,
    (error: unknown) => error,
  );
};

const pushes = (shell: RecordingShell) => shell.calls.filter(({ args }) => args[0] === "push");

describe("pushing a release branch", () => {
  it("given GitHub drops the connection once, when the release branch is pushed, then it is pushed again and the release goes on", async () => {
    const shell = new RecordingShell().seedOnce(PUSH, DROPPED);

    expect(await pushWith(shell)).toBeNull();
    expect(pushes(shell)).toHaveLength(2);
  });

  it("given the connection keeps dropping, when the release branch is pushed, then it gives up after its retries with everything git said", async () => {
    const shell = new RecordingShell().seed(PUSH, {
      status: 128,
      stderr:
        "fatal: the remote end hung up unexpectedly\nConnection to github.com closed by remote host.\n",
    });

    const error = await pushWith(shell);

    expect(pushes(shell)).toHaveLength(3);
    expect(error).toMatchObject({
      message: "git push exited with 128: fatal: the remote end hung up unexpectedly",
      output:
        "fatal: the remote end hung up unexpectedly\nConnection to github.com closed by remote host.",
    });
  });

  it("given GitHub refuses the push, when the release branch is pushed, then it fails at once, since trying again cannot help", async () => {
    const shell = new RecordingShell().seed(PUSH, {
      status: 1,
      stderr: " ! [rejected]        chore/release (non-fast-forward)\n",
    });

    expect(await pushWith(shell)).toBeInstanceOf(Error);
    expect(pushes(shell)).toHaveLength(1);
  });
  it("given a release branch holds only versions and changelogs, when it is pushed, then the pre-push checks are skipped, since main already passed them", async () => {
    const shell = new RecordingShell();

    await pushWith(shell);

    expect(pushes(shell)[0]?.args).toContain("--no-verify");
  });
});

describe("reading what went into a release", () => {
  it("given two squash-merged PRs between tags, when a release reads them, then each comes with its subject and the files it touched", async () => {
    const shell = new RecordingShell().seed("git log", {
      stdout:
        "\0fix(release): deploy runs name the version (#1913)\n\napps/expo/eas.json\n\0fix(build): iOS builds bundle (#1912)\n\npackages/app/src/index.ts\napps/expo/metro.config.js\n",
    });
    const source = gitSourceControl().create({ root: "/repo", shell });

    expect(await source.commitsBetween("expo@0.4.1", "expo@0.4.2")).toEqual([
      {
        subject: "fix(release): deploy runs name the version (#1913)",
        files: ["apps/expo/eas.json"],
      },
      {
        subject: "fix(build): iOS builds bundle (#1912)",
        files: ["packages/app/src/index.ts", "apps/expo/metro.config.js"],
      },
    ]);
    expect(shell.calls[0]?.args.at(-1)).toBe("expo@0.4.1..expo@0.4.2");
  });
});
