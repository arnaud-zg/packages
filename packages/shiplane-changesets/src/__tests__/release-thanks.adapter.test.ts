import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Shell } from "shiplane/plugin";
import { afterEach, describe, expect, it } from "vitest";

import type { ChangesetsOptions } from "../changesets-versioning.adapter";
import { changesetsVersioning } from "../changesets-versioning.adapter";
import { presets } from "../thanks";

const PREVIOUS = `## 1.0.0

### Major Changes

- [#1](https://github.com/acme/kit/pull/1) Thanks [@old](https://github.com/old)! - First.
`;

// What @changesets/changelog-github writes for a release with two changes by two people.
const RELEASED = `# @acme/kit

## 1.1.0

### Minor Changes

- [#3](https://github.com/acme/kit/pull/3) [\`abc1234\`](https://github.com/acme/kit/commit/abc1234) Thanks [@ada](https://github.com/ada), [@lin](https://github.com/lin)! - Adds a thing.

### Patch Changes

- [#4](https://github.com/acme/kit/pull/4) [\`def5678\`](https://github.com/acme/kit/commit/def5678) Thanks [@ada](https://github.com/ada)! - Fixes a thing.

${PREVIOUS}`;

let root = "";
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const changelog = () => path.join(root, "packages/kit/CHANGELOG.md");

/** A release whose `changeset version` writes `written` as the kit's changelog. */
const release = async (thanks: ChangesetsOptions["thanks"], written = RELEASED) => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "release-thanks-"));
  fs.mkdirSync(path.join(root, ".changeset"));
  fs.mkdirSync(path.join(root, "packages/kit"), { recursive: true });
  fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  fs.writeFileSync(path.join(root, "packages/kit/package.json"), '{ "name": "@acme/kit" }\n');
  fs.writeFileSync(changelog(), `# @acme/kit\n\n${PREVIOUS}`);
  const shell: Shell = {
    env: () => "token",
    capture: () => Promise.resolve({ status: 0, stdout: "", stderr: "" }),
    attach: () => {
      fs.writeFileSync(changelog(), written);
      return Promise.resolve(0);
    },
  };
  await changesetsVersioning({ thanks }).create({ root, shell }).apply([], []);
  return fs.readFileSync(changelog(), "utf8");
};

/** The section of the release just written, as the release notes show it. */
const notes = (text: string) => text.split("## 1.1.0\n")[1]?.split("\n## ")[0]?.trim();

const CHANGES = `### Minor Changes

- [#3](https://github.com/acme/kit/pull/3) [\`abc1234\`](https://github.com/acme/kit/commit/abc1234) - Adds a thing.

### Patch Changes

- [#4](https://github.com/acme/kit/pull/4) [\`def5678\`](https://github.com/acme/kit/commit/def5678) - Fixes a thing.`;

const ADA = "[@ada](https://github.com/ada)";
const LIN = "[@lin](https://github.com/lin)";

describe("thanking contributors in release notes", () => {
  it("given no thanks option, when a release is versioned, then each line keeps changesets' own thanks", async () => {
    expect(await release(undefined)).toBe(RELEASED);
  });

  it("given the sentence preset, when a release is versioned, then one line thanks everyone once under the changes", async () => {
    expect(notes(await release(presets.sentence))).toBe(
      `${CHANGES}\n\n🙏 Thanks to ${ADA} and ${LIN} for this release!`,
    );
  });

  it("given the list preset, when a release is versioned, then a Contributors list closes the section", async () => {
    expect(notes(await release(presets.list))).toBe(
      `${CHANGES}\n\n### Contributors\n\n- ${ADA}\n- ${LIN}`,
    );
  });

  it("given the avatars preset, when a release is versioned, then each contributor shows as a linked Markdown avatar", async () => {
    expect(notes(await release(presets.avatars))).toBe(
      `${CHANGES}\n\n### Contributors\n\n[![@ada](https://github.com/ada.png?size=32)](https://github.com/ada) [![@lin](https://github.com/lin.png?size=32)](https://github.com/lin)`,
    );
  });

  it("given the none preset, when a release is versioned, then no one is thanked and older releases stay as they were", async () => {
    const text = await release(presets.none);

    expect(notes(text)).toBe(CHANGES);
    expect(text.endsWith(PREVIOUS)).toBe(true);
  });

  it("given a template with the thanks before {changes}, when a release is versioned, then the thanks open the section", async () => {
    expect(notes(await release("💜 Made by {contributors}\n\n{changes}"))).toBe(
      `💜 Made by ${ADA} and ${LIN}\n\n${CHANGES}`,
    );
  });

  it("given a template without {changes}, when a release is versioned, then the thanks go under the changes", async () => {
    expect(notes(await release("Thanks {contributors}!"))).toBe(
      `${CHANGES}\n\nThanks ${ADA} and ${LIN}!`,
    );
  });

  it("given an extended preset, when a release is versioned, then the extra text follows the preset", async () => {
    expect(notes(await release(`${presets.sentence}\n\n🚀 Ship it!`))).toMatch(
      /for this release!\n\n🚀 Ship it!$/,
    );
  });

  it("given a release that thanks no one, when it is versioned, then nothing is added", async () => {
    const written = RELEASED.replace(/ Thanks [^!]+!/g, "");

    expect(await release(presets.sentence, written)).toBe(written);
  });
});
