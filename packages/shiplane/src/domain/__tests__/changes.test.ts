import { describe, expect, it } from "vitest";

import type { StatusPlan } from "../changes";
import { SAMPLE_UNITS } from "../../testing/sample";
import { appBumps, changesetApps, packageBumps, splitChangesets } from "../changes";

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

describe("a pending changeset", () => {
  it("given a pending changeset, when read, then it names the apps it releases and not the packages", () => {
    const text =
      '---\n"@acme/admin": patch\n"@acme/plant-contracts": minor\n"@acme/api": patch\n---\n\nNotes.\n';

    expect(changesetApps(text, SAMPLE_UNITS)).toEqual(["api", "admin"]);
  });
});
