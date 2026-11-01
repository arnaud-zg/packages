import { publishedPackage } from "shiplane/plugin";
import { planFrom, readStatus, releaseToPreview, testContext, testUnit } from "shiplane/testing";
import { describe, expect, it } from "vitest";

import { npmPackageRegistry } from "../npm-package-registry.adapter";

const RESOLVER = testUnit("vite-workspace-resolver", {
  dir: "packages/vite-workspace-resolver",
  packageName: "vite-workspace-resolver",
  version: "0.1.0",
  module: "published-package",
});

const setUp = (tags: Record<string, string> = {}) => {
  const world = testContext({
    units: [RESOLVER],
    modules: [publishedPackage({ packageRegistry: npmPackageRegistry() })],
    yes: true,
  });
  world.versioning.seed({
    pending: [],
    plan: planFrom([], { "vite-workspace-resolver": "0.1.0" }),
  });
  world.source.seed({
    tags,
    versionCommits: {
      "packages/vite-workspace-resolver@0.1.0": {
        sha: "f1",
        subject: "feat(vite-workspace-resolver): add Vite plugin resolving workspace exports (#11)",
      },
    },
  });
  world.shell.seed("npm view vite-workspace-resolver@0.1.0 version", {
    status: 1,
    stderr: "npm error code E404",
  });
  return world;
};

describe("the first release of a new package", () => {
  it("given a package added at 0.1.0 with no changeset and never tagged, when the status is read, then its first release is pending", async () => {
    const { context } = setUp();

    const status = await readStatus(context, "preview");

    expect(status.units).toEqual([
      expect.objectContaining({
        unit: "vite-workspace-resolver",
        pending: true,
        hint: "0.1.0 first release",
      }),
    ]);
  });

  it("given a package added at 0.1.0 and never tagged, when a release runs, then it is tagged on the commit that added it and published, with no release PR", async () => {
    const { context, source, host, shell } = setUp();

    expect(await releaseToPreview(context)).toBe(true);

    expect(host.received.filter(({ type }) => type === "pr")).toEqual([]);
    expect(source.received).toContainEqual(
      expect.objectContaining({ type: "tag", name: "vite-workspace-resolver@0.1.0", sha: "f1" }),
    );
    expect(shell.calls.at(-1)).toMatchObject({
      command: "pnpm",
      args: ["publish", "--no-git-checks", "--access", "public", "--tag", "latest"],
    });
  });

  it("given an earlier version was tagged, when a version moved by hand is read, then it is not taken for a first release", async () => {
    const { context } = setUp({ "vite-workspace-resolver@0.0.9": "old" });

    const status = await readStatus(context, "preview");

    expect(status.units).toEqual([
      expect.objectContaining({ unit: "vite-workspace-resolver", pending: false }),
    ]);
  });

  it("given a package at 0.0.0, never versioned, when the status is read, then it waits for its first changeset", async () => {
    const world = testContext({
      units: [{ ...RESOLVER, version: "0.0.0" }],
      modules: [publishedPackage({ packageRegistry: npmPackageRegistry() })],
    });
    world.versioning.seed({
      pending: [],
      plan: planFrom([], { "vite-workspace-resolver": "0.0.0" }),
    });
    world.source.seed({
      versionCommits: {
        "packages/vite-workspace-resolver@0.0.0": { sha: "f0", subject: "feat(new): add it" },
      },
    });

    const status = await readStatus(world.context, "preview");

    expect(status.units).toEqual([
      expect.objectContaining({ unit: "vite-workspace-resolver", pending: false }),
    ]);
  });

  it("given a never-tagged package a pending changeset names, when tags are looked for, then it waits for its release PR", async () => {
    const { context, versioning } = setUp();
    versioning.seed({
      pending: [
        { id: "renamed", text: '---\n"vite-workspace-resolver": minor\n---\n\nRenamed.\n' },
      ],
    });

    const status = await readStatus(context, "preview");

    expect(status.untagged).toEqual([]);
    expect(status.next).toEqual({ step: "release-pr" });
  });
});
