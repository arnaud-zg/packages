import { describe, expect, it } from "vitest";

import { changelogSection, releaseTags, tagName } from "../tags";

const RELEASE_COMMIT = {
  sha: "8c1d2e3",
  subject: "chore(release): expo 0.2.0, api 0.0.2 and admin 0.1.1 (#1701)",
};

describe("the tags and release notes", () => {
  it("given expo 0.2.0 came with a release pull request, when tagging, then it gets its tag and release notes on that commit", () => {
    expect(
      releaseTags(
        [{ app: "expo", version: "0.2.0", commit: RELEASE_COMMIT }],
        new Set(),
        new Set(),
      ),
    ).toEqual([
      {
        app: "expo",
        version: "0.2.0",
        tag: "expo@0.2.0",
        sha: "8c1d2e3",
        needsTag: true,
        needsNotes: true,
      },
    ]);
  });

  it("given api 0.0.4 came with a release titled for api alone, when tagging, then it gets its tag", () => {
    const commit = { sha: "9a1b2c3", subject: "chore(api): release v0.0.4 (#1740)" };

    expect(
      releaseTags([{ app: "api", version: "0.0.4", commit }], new Set(), new Set()),
    ).toMatchObject([{ tag: "api@0.0.4", sha: "9a1b2c3", needsTag: true }]);
  });

  it("given a release too long to name its apps, when tagging, then the commit that changed each version tags it", () => {
    const commit = { sha: "9a1b2c3", subject: "chore(release): 8 apps (#24)" };

    expect(
      releaseTags([{ app: "shiplane-npm", version: "0.1.0", commit }], new Set(), new Set()),
    ).toMatchObject([{ tag: "shiplane-npm@0.1.0", sha: "9a1b2c3", needsTag: true }]);
  });

  it("given a release titled for several apps, when tagging, then each version it names gets its tag", () => {
    const commit = {
      sha: "9a1b2c3",
      subject: "chore(release): expo v0.2.0 and api v0.0.4 (#1740)",
    };

    expect(
      releaseTags(
        [
          { app: "expo", version: "0.2.0", commit },
          { app: "api", version: "0.0.4", commit },
        ],
        new Set(),
        new Set(),
      ).map(({ tag }) => tag),
    ).toEqual(["expo@0.2.0", "api@0.0.4"]);
  });

  it("given api 0.0.41 was released, when 0.0.4 is looked for, then that release does not count", () => {
    const commit = { sha: "9a1b2c3", subject: "chore(api): release v0.0.41" };

    expect(releaseTags([{ app: "api", version: "0.0.4", commit }], new Set(), new Set())).toEqual(
      [],
    );
  });

  it("given a version set by hand before releases existed, when tagging, then it is left alone", () => {
    const baseline = {
      sha: "cd43ad5",
      subject: "chore(release): the apps get versions and changelogs too",
    };

    expect(
      releaseTags([{ app: "landing", version: "0.1.0", commit: baseline }], new Set(), new Set()),
    ).toEqual([]);
  });

  it("given a tag pushed but its release notes missing, when resumed, then only the notes are written", () => {
    expect(
      releaseTags(
        [{ app: "api", version: "0.0.2", commit: RELEASE_COMMIT }],
        new Set(["api@0.0.2"]),
        new Set(),
      ),
    ).toMatchObject([{ tag: "api@0.0.2", needsTag: false, needsNotes: true }]);
  });

  it("given the tag and its notes exist, when resumed, then nothing is left to do", () => {
    const done = new Set(["api@0.0.2"]);

    expect(
      releaseTags([{ app: "api", version: "0.0.2", commit: RELEASE_COMMIT }], done, done),
    ).toEqual([]);
  });

  it("given a changelog, when a version's notes are read, then they hold that version's section only", () => {
    const changelog =
      "# @acme/expo\n\n## 0.2.1\n\n### Patch Changes\n\n- A fix.\n\n## 0.2.0\n\n### Minor Changes\n\n- Apple Vision.\n";

    expect(changelogSection(changelog, "0.2.0")).toBe("### Minor Changes\n\n- Apple Vision.");
  });

  it("given a version the changelog never mentions, when its notes are read, then it says so instead of an empty release", () => {
    expect(changelogSection("# @acme/expo\n", "0.1.114")).toBe("No changelog entry for 0.1.114.");
  });
});

describe("a repository's own tag format", () => {
  it("given a single package tagged v<version>, when its version is tagged, then the tag is v0.4.0", () => {
    const commit = { sha: "9a1b2c3", subject: "chore(configs): release v0.4.0 (#40)" };

    expect(
      releaseTags(
        [{ app: "configs", version: "0.4.0", commit }],
        new Set(),
        new Set(),
        "v{version}",
      ),
    ).toMatchObject([{ tag: "v0.4.0", needsTag: true }]);
  });

  it("given plugins tagged <name>--v<version>, when the tag is named, then it follows that format", () => {
    expect(tagName("hexagonal-skill-builder", "1.2.0", "{name}--v{version}")).toBe(
      "hexagonal-skill-builder--v1.2.0",
    );
  });

  it("given no format, when the tag is named, then it stays <name>@<version>", () => {
    expect(tagName("expo", "0.4.8")).toBe("expo@0.4.8");
  });
});
