import { describe, expect, it } from "vitest";

import type { StatusPlan } from "../changes";
import { SAMPLE_UNITS } from "../../testing/sample";
import {
  appBumps,
  changesetApps,
  packageBumps,
  splitChangesets,
  unreleasedApps,
  unreleasedChangesets,
} from "../changes";

// The four changesets that came with #1676, #1677, #1680 and #1681.
const LAST_WEEK: StatusPlan = {
  changesets: [
    {
      id: "android-builds-again",
      summary: "The Android app builds again.",
      releases: [
        { name: "@acme/expo", type: "patch" },
        { name: "react-native-smart-crop", type: "patch" },
      ],
    },
    {
      id: "apple-vision-cut-out",
      summary: "An iPhone on iOS 17 cuts the plant out, with Apple Vision.",
      releases: [
        { name: "@acme/expo", type: "minor" },
        { name: "react-native-subject-finder", type: "minor" },
      ],
    },
    {
      id: "plant-not-in-catalog",
      summary: "A plant not in the catalog yet never blocks its page.",
      releases: [
        { name: "@acme/api", type: "patch" },
        { name: "@acme/plant-contracts", type: "patch" },
      ],
    },
  ],
  releases: [
    {
      name: "@acme/expo",
      type: "minor",
      oldVersion: "0.1.114",
      newVersion: "0.2.0",
      changesets: ["android-builds-again", "apple-vision-cut-out"],
    },
    {
      name: "@acme/api",
      type: "patch",
      oldVersion: "0.0.1",
      newVersion: "0.0.2",
      changesets: ["plant-not-in-catalog"],
    },
    {
      name: "@acme/admin",
      type: "patch",
      oldVersion: "0.1.0",
      newVersion: "0.1.1",
      changesets: [],
    },
    {
      name: "@acme/plant-contracts",
      type: "patch",
      oldVersion: "0.1.0",
      newVersion: "0.1.1",
      changesets: ["plant-not-in-catalog"],
    },
    {
      name: "react-native-smart-crop",
      type: "patch",
      oldVersion: "0.1.0",
      newVersion: "0.1.1",
      changesets: ["android-builds-again"],
    },
  ],
};

const WORKSPACE_DEPENDENCIES = {
  "@acme/admin": ["@acme/plant-contracts", "@acme/ui"],
  "@acme/api": ["@acme/plant-contracts"],
  "@acme/expo": ["@acme/app", "react-native-smart-crop"],
};

const bumps = appBumps(LAST_WEEK, WORKSPACE_DEPENDENCIES, SAMPLE_UNITS);

describe("what each app ships", () => {
  it("given changesets naming expo, when planned, then expo moves to its new version with the notes written for it", () => {
    expect(bumps.find(({ app }) => app === "expo")).toEqual({
      app: "expo",
      from: "0.1.114",
      to: "0.2.0",
      notes: [
        "The Android app builds again.",
        "An iPhone on iOS 17 cuts the plant out, with Apple Vision.",
      ],
      movedWith: [],
    });
  });

  it("given admin moved only because a package it uses moved, when planned, then it says which package", () => {
    expect(bumps.find(({ app }) => app === "admin")).toMatchObject({
      to: "0.1.1",
      notes: [],
      movedWith: ["@acme/plant-contracts"],
    });
  });

  it("given no changeset reaches landing, when planned, then landing is not part of the release", () => {
    expect(bumps.map(({ app }) => app)).toEqual(["expo", "api", "admin"]);
  });

  it("given internal packages moved, when planned, then they are counted apart from the apps", () => {
    expect(packageBumps(LAST_WEEK, SAMPLE_UNITS)).toBe(2);
  });
});

describe("picking what ships", () => {
  const SHARED = {
    id: "plant-names-everywhere",
    summary: "A plant's common name shows in the app and in the admin.",
    releases: [
      { name: "@acme/expo", type: "patch" as const },
      { name: "@acme/admin", type: "patch" as const },
      { name: "@acme/plant-contracts", type: "patch" as const },
    ],
  };

  it("given every app picked, when split, then every changeset ships and none waits", () => {
    expect(splitChangesets(LAST_WEEK.changesets, [], SAMPLE_UNITS)).toEqual({
      ships: LAST_WEEK.changesets,
      waits: [],
    });
  });

  it("given api held, when split, then its changeset waits whole, packages included, and expo's ship", () => {
    const { ships, waits } = splitChangesets(LAST_WEEK.changesets, ["api"], SAMPLE_UNITS);

    expect(ships.map(({ id }) => id)).toEqual(["android-builds-again", "apple-vision-cut-out"]);
    expect(waits).toEqual([LAST_WEEK.changesets[2]]);
  });

  it("given expo held and admin picked, when a changeset names both, then admin's line ships and expo's waits with the package", () => {
    const { ships, waits } = splitChangesets([SHARED], ["expo"], SAMPLE_UNITS);

    expect(ships).toEqual([{ ...SHARED, releases: [{ name: "@acme/admin", type: "patch" }] }]);
    expect(waits).toEqual([
      {
        ...SHARED,
        releases: [
          { name: "@acme/expo", type: "patch" },
          { name: "@acme/plant-contracts", type: "patch" },
        ],
      },
    ]);
  });
});

describe("apps changed with no changeset", () => {
  const ADMIN = {
    app: "admin" as const,
    version: "0.1.0",
    commits: [
      "feat(missions): the admin follows missions and feedback",
      "chore(release): expo 0.1.115 and api 0.0.2 (#1697)",
      "fix(admin): plant status reads correctly in both themes",
    ],
  };

  it("given a pending changeset, when read, then it names the apps it releases and not the packages", () => {
    const text =
      '---\n"@acme/admin": patch\n"@acme/plant-contracts": minor\n"@acme/api": patch\n---\n\nNotes.\n';

    expect(changesetApps(text, SAMPLE_UNITS)).toEqual(["api", "admin"]);
  });

  it("given admin commits since its last release and no changeset naming it, when checked, then admin has unreleased changes", () => {
    expect(unreleasedApps([ADMIN], new Set())).toEqual([
      {
        app: "admin",
        version: "0.1.0",
        commits: [
          "feat(missions): the admin follows missions and feedback",
          "fix(admin): plant status reads correctly in both themes",
        ],
      },
    ]);
  });

  it("given a changeset already names admin, when checked, then nothing is flagged", () => {
    expect(unreleasedApps([ADMIN], new Set(["admin"]))).toEqual([]);
  });

  it("given only a release commit titled for the app since its last release, when checked, then nothing is flagged", () => {
    const api = {
      app: "api" as const,
      version: "0.0.4",
      commits: ["chore(api): release v0.0.4 (#1740)"],
    };

    expect(unreleasedApps([api], new Set())).toEqual([]);
  });

  it("given only a release commit since the last release, when checked, then nothing is flagged", () => {
    const landing = {
      app: "landing" as const,
      version: "0.2.0",
      commits: ["chore(release): landing 0.2.0"],
    };

    expect(unreleasedApps([landing], new Set())).toEqual([]);
  });

  it("given admin's features, fixes and chores, when picked, then each feature or fix becomes one changelog line", () => {
    const commits = [
      "chore(ci): update admin bundle size baseline (1.51 MB → 1.51 MB)",
      "feat(admin): the dashboard says whether anything is wrong before you read it (#1580)",
      "fix(admin): plant status reads correctly in both themes (#1530)",
    ];

    expect(
      unreleasedChangesets({ name: "admin", packageName: "@acme/admin" }, "0.1.0", commits),
    ).toEqual([
      {
        id: "admin-0.1.1-1",
        releases: [{ name: "@acme/admin", type: "minor" }],
        summary: "The dashboard says whether anything is wrong before you read it.",
      },
      {
        id: "admin-0.1.1-2",
        releases: [{ name: "@acme/admin", type: "patch" }],
        summary: "Plant status reads correctly in both themes.",
      },
    ]);
  });

  it("given a commit marked breaking with !, when picked, then it moves a major, whatever its type", () => {
    const commits = [
      "chore(ci): baseline",
      "refactor(api)!: every endpoint moved under /v2 (#1700)",
      "fix(api): the health check answers again (#1690)",
      "feat!: sign-in needs a passkey (#1680)",
    ];

    expect(
      unreleasedChangesets({ name: "admin", packageName: "@acme/admin" }, "0.1.0", commits).map(
        ({ releases, summary }) => [releases[0]?.type, summary],
      ),
    ).toEqual([
      ["major", "Every endpoint moved under /v2."],
      ["patch", "The health check answers again."],
      ["major", "Sign-in needs a passkey."],
    ]);
  });

  it("given a performance fix, when picked, then it moves a patch and keeps its line", () => {
    const commits = ["perf(admin): the plant list opens in half the time (#1720)"];

    expect(
      unreleasedChangesets({ name: "admin", packageName: "@acme/admin" }, "0.1.0", commits),
    ).toEqual([
      {
        id: "admin-0.1.1-1",
        releases: [{ name: "@acme/admin", type: "patch" }],
        summary: "The plant list opens in half the time.",
      },
    ]);
  });

  it("given only chores, when picked, then the latest one becomes the line", () => {
    const commits = ["chore(api): every endpoint lives under /v1 (#1660)", "chore(ci): baseline"];

    expect(
      unreleasedChangesets({ name: "admin", packageName: "@acme/admin" }, "0.1.0", commits),
    ).toEqual([
      {
        id: "admin-0.1.1-1",
        releases: [{ name: "@acme/admin", type: "patch" }],
        summary: "Every endpoint lives under /v1.",
      },
    ]);
  });
});
