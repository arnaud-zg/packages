import { describe, expect, it } from "vitest";

import type { AppBump } from "../changes";
import { releasePrGroups, releaseTitle, titleFits } from "../releasePr";
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

const titled = (bumps: AppBump[]) =>
  releasePrGroups(bumps, []).map((group) => releaseTitle(group, kindOf));

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
    ["chore(api): release v0.0.2", "chore(admin): release v0.1.0"],
  ],
  [
    "a mobile app and its widget",
    [...mobile("expo", "2.1.0"), ...mobile("expo-widget", "2.1.0")],
    ["chore(expo): release v2.1.0"],
  ],
  ["a package family on one version", shiplane(), ["chore(shiplane): release v0.1.0"]],
  [
    "a package family on several versions",
    [bump("shiplane", "0.2.0"), ...shiplane().slice(1)],
    ["chore(shiplane): release v0.2.0"],
  ],
  [
    "a prerelease package family",
    shiplane("1.0.0-beta.12"),
    ["chore(shiplane): release v1.0.0-beta.12"],
  ],
  [
    "a service family too long to list",
    ["", "-worker", "-scheduler", "-webhooks", "-exports", "-ledger"].flatMap((end) =>
      service(`billing${end}`, "3.2.0"),
    ),
    ["chore(billing): release v3.2.0"],
  ],
  [
    "web apps sharing a prefix on several versions",
    ["", "-docs", "-blog", "-status", "-careers", "-pricing"].flatMap((end, index) =>
      web(`marketing${end}`, `1.${index}.0`),
    ),
    ["chore(marketing): release v1.0.0"],
  ],
  [
    "a package family and two apps",
    [...shiplane(), ...web("landing", "1.2.0"), ...mobile("expo", "2.1.0")],
    [
      "chore(shiplane): release v0.1.0",
      "chore(landing): release v1.2.0",
      "chore(expo): release v2.1.0",
    ],
  ],
  [
    "two families too long to list",
    [
      ...shiplane(),
      ...["", "-worker", "-scheduler", "-webhooks"].flatMap((end) =>
        service(`billing${end}`, "3.2.0"),
      ),
    ],
    ["chore(shiplane): release v0.1.0", "chore(billing): release v3.2.0"],
  ],
  [
    "a whole fleet of every kind",
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
    [
      "chore(api): release v0.3.0",
      "chore(admin): release v1.4.0",
      "chore(landing): release v1.2.0",
      "chore(docs): release v0.9.0",
      "chore(expo): release v2.1.0",
      "chore(seed): release v0.2.0",
      "chore(migrate): release v0.5.1",
      "chore(shiplane): release v0.1.0",
      "chore(notifications): release v0.7.0",
      "chore(design-system-playground): release v0.3.0",
    ],
  ],
];

describe("the release PR titles, from best case to worst", () => {
  it.each(CASES)(
    "given %s, when titled, then each app or family gets its own PR",
    (_, bumps, titles) => {
      expect(titled(bumps)).toEqual(titles);
    },
  );

  it.each(CASES)(
    "given %s, when squash merged as #12345, then the header stays within commitlint's 100",
    (_, bumps) => {
      titled(bumps).forEach((title) => expect(titleFits(title)).toBe(true));
    },
  );

  it.each(CASES)(
    "given %s, when each PR merges, then every app it brings is tagged on its commit",
    (_, bumps) => {
      releasePrGroups(bumps, []).forEach((group) => {
        const commit = { sha: "9a1b2c3", subject: `${releaseTitle(group, kindOf)} (#12345)` };
        group.forEach(({ app, to }) => {
          expect(cameWithRelease({ app, version: to, commit })).toBe(true);
        });
      });
    },
  );

  it("given apps one changeset names, when grouped, then they share one PR", () => {
    const bumps = [...service("api", "0.0.2"), ...web("admin"), ...web("landing", "1.2.0")];

    expect(
      releasePrGroups(bumps, [["api", "landing"]]).map((group) => releaseTitle(group, kindOf)),
    ).toEqual(["chore(release): api v0.0.2 and landing v1.2.0", "chore(admin): release v0.1.0"]);
  });

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
