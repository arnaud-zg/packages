import { describe, expect, it } from "vitest";

import type { AppBump } from "../changes";
import { releaseTitle, titleFits } from "../releasePr";
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
const KINDS: Record<string, string> = {};
const of = (kind: string, ...apps: AppBump[]) => {
  apps.forEach(({ app }) => (KINDS[app] = kind));
  return apps;
};
const kindOf = (app: string) => KINDS[app];
const service = (app: string, to?: string) => of("backend-service", bump(app, to));
const web = (app: string, to?: string) => of("web-app", bump(app, to));
const mobile = (app: string, to?: string) => of("mobile-app", bump(app, to));
const tool = (app: string, to?: string) => of("internal-tool", bump(app, to));
of("published-package", ...shiplane(), ...shiplane("0.2.0"));

const titled = (bumps: AppBump[]) => (bumps.length === 0 ? [] : [releaseTitle(bumps, kindOf)]);

// Every case: the release PR titles it opens, in order.
const CASES: [string, AppBump[], string[]][] = [
  ["nothing moves", [], []],
  ["one service", service("api", "0.0.4"), ["chore(api): release v0.0.4"]],
  ["one web app", web("landing", "1.2.0"), ["chore(landing): release v1.2.0"]],
  ["one mobile app", mobile("expo", "2.1.0"), ["chore(expo): release v2.1.0"]],
  ["one internal tool", tool("seed", "0.2.0"), ["chore(seed): release v0.2.0"]],
  ["one published package", shiplane().slice(0, 1), ["chore(shiplane): release v0.1.0"]],
  [
    "a service and a web app",
    [...service("api", "0.0.2"), ...web("admin")],
    ["chore(release): api v0.0.2 and admin v0.1.0"],
  ],
  [
    "a mobile app and its widget",
    [...mobile("expo", "2.1.0"), ...mobile("expo-widget", "2.1.0")],
    ["chore(release): expo v2.1.0 and expo-widget v2.1.0"],
  ],
  [
    "a package family on one version",
    shiplane(),
    ["chore(release): shiplane and 7 plugins v0.1.0"],
  ],
  [
    "a package family on several versions",
    [bump("shiplane", "0.2.0"), ...shiplane().slice(1)],
    ["chore(release): shiplane v0.2.0 and 7 plugins"],
  ],
  [
    "a prerelease package family",
    shiplane("1.0.0-beta.12"),
    ["chore(release): shiplane and 7 plugins v1.0.0-beta.12"],
  ],
  [
    "a service family too long to list",
    ["", "-worker", "-scheduler", "-webhooks", "-exports", "-ledger"].flatMap((end) =>
      service(`billing${end}`, "3.2.0"),
    ),
    ["chore(release): billing and 5 more services v3.2.0"],
  ],
  [
    "web apps sharing a prefix on several versions",
    ["", "-docs", "-blog", "-status", "-careers", "-pricing"].flatMap((end, index) =>
      web(`marketing${end}`, `1.${index}.0`),
    ),
    ["chore(release): marketing v1.0.0 and 5 more web apps"],
  ],
  [
    "a package family and two apps",
    [...shiplane(), ...web("landing", "1.2.0"), ...mobile("expo", "2.1.0")],
    ["chore(release): shiplane and 7 plugins v0.1.0, landing v1.2.0 and expo v2.1.0"],
  ],
  [
    "two families too long to list",
    [
      ...shiplane(),
      ...["", "-worker", "-scheduler", "-webhooks"].flatMap((end) =>
        service(`billing${end}`, "3.2.0"),
      ),
    ],
    ["chore(release): shiplane and 7 plugins v0.1.0, billing and 3 more services v3.2.0"],
  ],
  [
    "a whole fleet of every kind, too many for one title",
    [
      ...service("api", "0.3.0"),
      ...service("api-worker", "0.3.0"),
      ...web("admin", "1.4.0"),
      ...web("landing", "1.2.0"),
      ...web("docs", "0.9.0"),
      ...mobile("expo", "2.1.0"),
      ...tool("seed", "0.2.0"),
      ...tool("migrate", "0.5.1"),
      ...shiplane(),
      ...service("notifications", "0.7.0"),
      ...web("design-system-playground", "0.3.0"),
    ],
    [],
  ],
];

describe("the release PR titles, from best case to worst", () => {
  it.each(CASES.filter(([name]) => !name.startsWith("a whole fleet")))(
    "given %s, when titled, then its one PR names its apps",
    (_, bumps, titles) => {
      expect(titled(bumps)).toEqual(titles);
    },
  );

  it("given a whole fleet of every kind, when titled, then its one PR still names every app, past the header limit", () => {
    const [, fleet] = CASES.at(-1) ?? [];
    expect(titled(fleet ?? [])).toMatchInlineSnapshot(`
      [
        "chore(release): api v0.3.0, api-worker v0.3.0, shiplane and 7 plugins v0.1.0, admin v1.4.0, landing v1.2.0, docs v0.9.0, expo v2.1.0, seed v0.2.0, migrate v0.5.1, notifications v0.7.0 and design-system-playground v0.3.0",
      ]
    `);
  });

  it.each(CASES.filter(([name]) => !name.startsWith("a whole fleet")))(
    "given %s, when squash merged as #12345, then the header stays within commitlint's 100",
    (_, bumps) => {
      titled(bumps).forEach((title) => expect(titleFits(title)).toBe(true));
    },
  );

  it.each(CASES)(
    "given %s, when merged, then every app it brings is tagged on that commit",
    (_, bumps) => {
      titled(bumps).forEach((title) => {
        const commit = { sha: "9a1b2c3", subject: `${title} (#12345)` };
        bumps.forEach(({ app, to }) => {
          expect(cameWithRelease({ app, version: to, commit })).toBe(true);
        });
      });
    },
  );

  it("given a family title, when an outsider, a near name or another version is checked, then it is not tagged", () => {
    const commit = {
      sha: "9a1b2c3",
      subject:
        "chore(release): shiplane and 7 plugins v0.1.0, landing v1.2.0 and expo v2.1.0 (#27)",
    };

    expect(cameWithRelease({ app: "admin", version: "0.1.0", commit })).toBe(false);
    expect(cameWithRelease({ app: "shiplane-npm", version: "0.2.0", commit })).toBe(false);
    expect(cameWithRelease({ app: "shiplanex", version: "0.1.0", commit })).toBe(false);
    expect(cameWithRelease({ app: "landing", version: "1.2.0", commit })).toBe(true);
  });

  it("given an app named inside another's name, when a release names only the other, then it is not tagged there", () => {
    const commit = {
      sha: "9a1b2c3",
      subject: "chore(release): shiplane-api v0.1.0 and expo v2.1.0 (#30)",
    };

    expect(cameWithRelease({ app: "api", version: "0.1.0", commit })).toBe(false);
    expect(cameWithRelease({ app: "shiplane-api", version: "0.1.0", commit })).toBe(true);
  });
});
