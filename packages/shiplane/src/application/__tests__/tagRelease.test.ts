import { describe, expect, it } from "vitest";

import { testContext, testUnit } from "../../testing/releaseContext";
import { missingTags, tagRelease } from "../tagRelease";

const CHANGELOG = `# @acme/api

## 0.0.2

### Patch Changes

- A plant not in the catalog yet never blocks its page.

## 0.0.1

### Patch Changes

- First release.
`;

// The first app in release order is the Latest release.
const setUp = (first: "api" | "expo" = "expo") => {
  const api = testUnit("api", { version: "0.0.2" });
  const expo = testUnit("expo", { version: "0.2.0" });
  const world = testContext({ units: first === "api" ? [api, expo] : [expo, api] });
  world.source.seed({
    versionCommits: {
      "apps/api@0.0.2": { sha: "r1", subject: "chore(release): api 0.0.2 and expo 0.2.0" },
      "apps/expo@0.2.0": { sha: "r1", subject: "chore(release): api 0.0.2 and expo 0.2.0" },
    },
    files: { "r1:apps/api/CHANGELOG.md": CHANGELOG },
    tags: { "expo@0.2.0": "r1" },
  });
  world.host.seed({ releasedTags: ["expo@0.2.0"] });
  return world;
};

describe("tagging what a release versioned", () => {
  it("given a version to tag, when it asks to tag it, then Yes is preselected", async () => {
    const { context, prompter } = setUp();
    prompter.answer(false);

    await tagRelease(context, await missingTags(context));

    expect(prompter.initials["Tag api@0.0.2 and publish their release notes?"]).toBe(true);
  });

  it("given a merged release that moved api to 0.0.2, when it is tagged, then api@0.0.2 points at that commit with its changelog as release notes", async () => {
    const { context, source, host, prompter } = setUp("expo");
    prompter.answer(true);

    const tags = await missingTags(context);
    const done = await tagRelease(context, tags);

    expect(done).toBe(true);
    expect(tags.map(({ tag }) => tag)).toEqual(["api@0.0.2"]);
    expect(source.received).toEqual([
      expect.objectContaining({ type: "tag", name: "api@0.0.2", sha: "r1" }),
      { type: "push-tags", names: ["api@0.0.2"] },
    ]);
    expect(host.received).toEqual([
      {
        type: "release",
        tag: "api@0.0.2",
        notes: "### Patch Changes\n\n- A plant not in the catalog yet never blocks its page.",
        latest: false,
      },
    ]);
  });

  it("given the first app in release order, when its notes are published, then the repository shows them as the latest release", async () => {
    const { context, host, prompter } = setUp("api");
    prompter.answer(true);

    await tagRelease(context, await missingTags(context));

    expect(host.received).toEqual([expect.objectContaining({ tag: "api@0.0.2", latest: true })]);
  });

  it("given a version that did not come with a release PR, when tags are looked for, then it is not tagged", async () => {
    const { context, source } = setUp();
    source.seed({
      // api was released before: a version moved by hand is not its first release.
      tags: { "expo@0.2.0": "r1", "api@0.0.1": "r0" },
      versionCommits: {
        "apps/api@0.0.2": { sha: "x1", subject: "feat(api): something" },
        "apps/expo@0.2.0": { sha: "r1", subject: "chore(release): api 0.0.2 and expo 0.2.0" },
      },
    });

    expect(await missingTags(context)).toEqual([]);
  });

  it("given the tags cannot be pushed, when tagging stops, then the tags made here are removed, so the next run tags and pushes them again", async () => {
    const { context, source, prompter } = setUp();
    source.failAt("push-tags", 1, new Error("git push exited with 128: early EOF"));
    prompter.answer(true);

    expect(await tagRelease(context, await missingTags(context))).toBe(false);
    expect(await source.tags()).not.toContain("api@0.0.2");
    expect(await missingTags(context)).toEqual([expect.objectContaining({ tag: "api@0.0.2" })]);
  });

  it("given the tags reached origin, when their release notes fail, then the person reads that the tags stay on origin and that tagging again publishes the notes", async () => {
    const { context, host, output, prompter } = setUp();
    host.failRelease(new Error("gh release create exited with 1"));
    prompter.answer(true);

    expect(await tagRelease(context, await missingTags(context))).toBe(false);

    expect(output.text).not.toContain("everything this run did is undone");
    expect(output.text).toContain("api@0.0.2 stays on origin");
    expect(output.text).toContain("shiplane tag");
  });
});
