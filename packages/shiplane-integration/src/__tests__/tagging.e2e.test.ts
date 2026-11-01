import type { ConsumerRepository } from "shiplane/testing";
import { afterEach, describe, expect, it } from "vitest";

import { exampleRepository } from "../examples";

// Real git against a local bare origin; the code host is a Fake, or GitHub with gh offline.
const config = (codeHost: "fake" | "github") => `
import { backendService, defineRelease, releaseFlow } from "shiplane";
import { ciPipelineFake, codeHostFake } from "shiplane/testing";
import { changesetsVersioning } from "@shiplane/changesets";
import { flyServerHosting } from "@shiplane/fly";
import { gitSourceControl } from "@shiplane/git";
import { gitHubCodeHost } from "@shiplane/github";

export default defineRelease({
  flow: releaseFlow({
    sourceControl: gitSourceControl(),
    codeHost: ${codeHost === "fake" ? "codeHostFake()" : "gitHubCodeHost()"},
    ciPipeline: ciPipelineFake(),
    versioning: changesetsVersioning(),
  }),
  modules: [backendService({ serverHosting: flyServerHosting() })],
  display: { verbose: false, mascot: false },
});
`;

let repository: ConsumerRepository | undefined;
afterEach(() => repository?.remove());

const merged = (codeHost: "fake" | "github") => {
  repository = exampleRepository("packages/shiplane-fly/examples", {
    files: { "shiplane.config.ts": config(codeHost) },
  });
  return repository;
};

describe("tagging a merged version with the built CLI, real git and a local origin", () => {
  it("given a version on main never tagged, when the maintainer tags it, then origin holds its tag on that commit and the plan reads it as tagged", () => {
    const repo = merged("fake");
    const head = repo.git(["rev-parse", "HEAD"]);

    const { status, output } = repo.shiplane(["tag", "--yes"]);

    expect(status).toBe(0);
    expect(output).toContain("Tags and release notes  api@1.0.0");
    expect(repo.git(["rev-parse", "api@1.0.0^{commit}"], { in: "origin" })).toBe(head);
    expect(repo.shiplane(["plan"]).output).not.toContain("not tagged yet");
  });

  it("given a version already tagged on origin, when the maintainer tags again, then nothing is pushed twice", () => {
    const repo = merged("fake");
    repo.shiplane(["tag", "--yes"]);

    const { status, output } = repo.shiplane(["tag", "--yes"]);

    expect(status).toBe(0);
    expect(output).not.toContain("push the tags");
  });

  it("given the tags reached origin, when their release notes cannot be published, then the run says the tags stay on origin and how to finish, never that all was undone", () => {
    const repo = merged("github");

    const { status, output } = repo.shiplane(["tag", "--yes"]);

    expect(status).toBe(1);
    expect(repo.git(["tag", "--list"], { in: "origin" })).toBe("api@1.0.0");
    expect(output).not.toContain("everything this run did is undone");
    expect(output).toContain("api@1.0.0 stays on origin");
    expect(output).toContain("shiplane tag");
  });
});
