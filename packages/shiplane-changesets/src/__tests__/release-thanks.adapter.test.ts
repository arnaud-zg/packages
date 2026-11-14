import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Shell } from "shiplane/plugin";
import { afterEach, describe, expect, it } from "vitest";

import type { ChangesetsOptions } from "../changesets-versioning.adapter";
import { changesetsVersioning } from "../changesets-versioning.adapter";

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

describe("thanking contributors in release notes", () => {
  it("given no thanks option, when a release is versioned, then each line keeps changesets' own thanks", async () => {
    expect(await release(undefined)).toBe(RELEASED);
  });

  it("given thanks at the top, when a release is versioned, then one sentence thanks everyone once above the changes", async () => {
    expect(notes(await release({ at: "top" }))).toBe(
      `🙏 Thanks to [@ada](https://github.com/ada) and [@lin](https://github.com/lin) for this release!

### Minor Changes

- [#3](https://github.com/acme/kit/pull/3) [\`abc1234\`](https://github.com/acme/kit/commit/abc1234) - Adds a thing.

### Patch Changes

- [#4](https://github.com/acme/kit/pull/4) [\`def5678\`](https://github.com/acme/kit/commit/def5678) - Fixes a thing.`,
    );
  });

  it("given thanks at the bottom as a list, when a release is versioned, then a Contributors list closes the section", async () => {
    expect(notes(await release({ at: "bottom", style: "list" }))).toMatch(
      /Fixes a thing\.\n\n### Contributors\n\n- \[@ada\]\(https:\/\/github\.com\/ada\)\n- \[@lin\]\(https:\/\/github\.com\/lin\)$/,
    );
  });

  it("given the avatars style, when a release is versioned, then each contributor shows as a linked avatar", async () => {
    expect(notes(await release({ at: "bottom", style: "avatars" }))).toContain(
      '<a href="https://github.com/lin"><img src="https://github.com/lin.png?size=64" width="32" height="32" alt="@lin" title="@lin"></a>',
    );
  });

  it("given a custom text, when a release is versioned, then its placeholders are filled", async () => {
    expect(
      notes(await release({ at: "top", style: "Made by {contributors} ({count} people) ❤️" })),
    ).toMatch(
      /^Made by \[@ada\]\(https:\/\/github\.com\/ada\) and \[@lin\]\(.+\) \(2 people\) ❤️\n/,
    );
  });

  it("given a function, when a release is versioned, then its text is placed", async () => {
    const text = await release({
      at: "bottom",
      style: (contributors) => `Shipped by ${contributors.map(({ login }) => login).join(" & ")}`,
    });

    expect(notes(text)).toMatch(/\n\nShipped by ada & lin$/);
  });

  it("given thanks turned off, when a release is versioned, then no one is thanked and older releases stay as they were", async () => {
    const text = await release(false);

    expect(notes(text)).not.toContain("Thanks");
    expect(text.endsWith(PREVIOUS)).toBe(true);
  });

  it("given a release that thanks no one, when it is versioned, then nothing is added", async () => {
    const written = RELEASED.replace(/ Thanks [^!]+!/g, "");

    expect(await release({ at: "top" }, written)).toBe(written);
  });
});
