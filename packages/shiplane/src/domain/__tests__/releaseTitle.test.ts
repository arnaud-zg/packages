import { describe, expect, it } from "vitest";

import type { AppBump } from "../changes";
import { releaseTitle } from "../releasePr";
import { cameWithRelease } from "../tags";

const bump = (app: string, to = "0.1.0"): AppBump => ({
  app,
  from: "0.0.0",
  to,
  notes: [],
  movedWith: [],
});
const PLUGINS = ["changesets", "cloudflare-pages", "eas", "fly", "git", "github", "npm"];
const shiplane = (to = "0.1.0") => [
  bump("shiplane", to),
  ...PLUGINS.map((name) => bump(`shiplane-${name}`, to)),
];
const LONG =
  "a-workspace-package-with-a-name-long-enough-to-fill-most-of-a-commit-header-by-itself";

const CASES: [string, AppBump[], string][] = [
  ["nothing moves", [], "chore(release): package changelogs"],
  ["one app", [bump("api", "0.0.4")], "chore(api): release v0.0.4"],
  [
    "a few apps",
    [bump("api", "0.0.2"), bump("admin")],
    "chore(release): api v0.0.2 and admin v0.1.0",
  ],
  ["a family on one version", shiplane(), "chore(release): shiplane and 7 plugins v0.1.0"],
  [
    "a family on several versions",
    [bump("shiplane", "0.2.0"), ...shiplane().slice(1)],
    "chore(release): shiplane v0.2.0 and 7 plugins",
  ],
  [
    "a family of two too long to list",
    [bump(LONG, "1.0.0-beta.12"), bump(`${LONG}-x`, "1.0.0-beta.12")],
    "chore(release): 2 packages",
  ],
  [
    "unrelated apps too many to list",
    [...shiplane(), bump("landing"), bump("expo")],
    "chore(release): 10 packages",
  ],
  ["one app whose name fills the header", [bump(LONG)], "chore(release): 1 package"],
  [
    "a prerelease family",
    shiplane("1.0.0-beta.12"),
    "chore(release): shiplane and 7 plugins v1.0.0-beta.12",
  ],
];

describe("the release title, from best case to worst", () => {
  it.each(CASES)("given %s, when titled, then it reads well", (_, bumps, title) => {
    expect(releaseTitle(bumps)).toBe(title);
  });

  it.each(CASES)(
    "given %s, when squash merged as #12345, then the header stays within commitlint's 100",
    (_, bumps) => {
      expect(`${releaseTitle(bumps)} (#12345)`.length).toBeLessThanOrEqual(100);
    },
  );

  it.each(CASES)(
    "given %s, when merged, then every version it brings is tagged and nothing else",
    (_, bumps) => {
      const commit = { sha: "9a1b2c3", subject: `${releaseTitle(bumps)} (#12345)` };
      bumps.forEach(({ app, to }) => {
        expect(cameWithRelease({ app, version: to, commit })).toBe(true);
      });
    },
  );

  it("given a family title, when an outsider or another version is checked, then it is not tagged", () => {
    const subject = "chore(release): shiplane and 7 plugins v0.1.0 (#27)";
    const commit = { sha: "9a1b2c3", subject };

    expect(cameWithRelease({ app: "landing", version: "0.1.0", commit })).toBe(false);
    expect(cameWithRelease({ app: "shiplane-npm", version: "0.2.0", commit })).toBe(false);
    expect(cameWithRelease({ app: "shiplanex", version: "0.1.0", commit })).toBe(false);
  });
});
