import { describe, expect, it } from "vitest";

import type { StatusPlan } from "../changes";
import { SAMPLE_UNITS } from "../../testing/sample";
import { appBumps } from "../changes";
import {
  mergeChoices,
  nextStep,
  releaseBranchName,
  releaseCommitBody,
  releasePrBody,
  releaseTitle,
  waitKey,
} from "../releasePr";

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

describe("the next step", () => {
  const pr = { number: 1701, url: "https://github.com/acme/app/pull/1701" };

  it("given an open release pull request, when resumed, then it waits for the merge", () => {
    expect(nextStep({ pending: 0, releasePrs: [pr], untagged: 0 })).toEqual({
      step: "wait-merge",
      prs: [pr],
    });
  });

  it("given changesets pending and no release pull request, when run, then it opens one", () => {
    expect(nextStep({ pending: 4, releasePrs: [], untagged: 0 })).toEqual({
      step: "release-pr",
    });
  });

  it("given a merged release not tagged yet and new changesets, when run, then it finishes that release first", () => {
    expect(nextStep({ pending: 2, releasePrs: [], untagged: 3 })).toEqual({
      step: "ship",
    });
  });

  it("given nothing pending, when run, then it goes on to ship what main has", () => {
    expect(nextStep({ pending: 0, releasePrs: [], untagged: 0 })).toEqual({
      step: "ship",
    });
  });
});

describe("the release pull request", () => {
  it("given a Monday 09:13 release, when named, then its branch carries the time", () => {
    expect(releaseBranchName(new Date(2026, 9, 12, 9, 13))).toBe(
      "shiplane/release-2026-10-12-0913",
    );
  });

  const landing = (notes: string[]) => [
    { app: "landing" as const, from: "0.1.0", to: "0.1.1", notes, movedWith: [] },
  ];

  it("given three apps moving, when titled, then the title names each version", () => {
    expect(releaseTitle(bumps)).toBe("chore(release): expo v0.2.0, api v0.0.2 and admin v0.1.1");
  });

  it("given one app with one change, when titled, then the title is that app releasing its version", () => {
    expect(
      releaseTitle(landing(["Characters beside their words look at them, the mascot first."])),
    ).toBe("chore(landing): release v0.1.1");
  });

  it("given one app with twelve changes, when titled, then the title stays the same short line", () => {
    expect(
      releaseTitle(landing(Array.from({ length: 12 }, (_, index) => `Change ${index}.`))),
    ).toBe("chore(landing): release v0.1.1");
  });

  it("given a change longer than a commit line, when committed, then it wraps under its bullet", () => {
    const note = `The admin ${"follows missions ".repeat(8)}done.`;
    const lines = releaseCommitBody(landing([note])).split("\n");

    expect(lines.every((line) => line.length <= 100)).toBe(true);
    expect(lines[1]?.startsWith("- The admin")).toBe(true);
    expect(lines[2]?.startsWith("  ")).toBe(true);
  });

  it("given three apps moving, when committed, then the body lists each app's changes under its version", () => {
    expect(releaseCommitBody(bumps)).toBe(
      [
        "expo 0.2.0",
        "- The Android app builds again.",
        "- An iPhone on iOS 17 cuts the plant out, with Apple Vision.",
        "",
        "api 0.0.2",
        "- A plant not in the catalog yet never blocks its page.",
        "",
        "admin 0.1.1",
        "- Moves with @acme/plant-contracts.",
      ].join("\n"),
    );
  });

  it("given only internal packages moving, when titled, then the title says so", () => {
    expect(releaseTitle([])).toBe("chore(release): package changelogs");
  });

  it("given a preview build, when described, then the body says what ships on merge and what each app's users get", () => {
    const body = releasePrBody(
      bumps,
      // What each module says on merge: the mobile app builds, a web app deploys.
      ({ app, movedWith }) =>
        app === "expo"
          ? "Build iOS and Android, submitted when done"
          : `Deploy preview${movedWith.length > 0 ? ` (moved with ${movedWith.join(", ")})` : ""}`,
      "to preview",
    );

    expect(body).toContain(
      "| expo  | 0.1.114 → 0.2.0 | Build iOS and Android, submitted when done |",
    );
    expect(body).toContain(
      "| admin | 0.1.0 → 0.1.1   | Deploy preview (moved with @acme/plant-contracts) |",
    );
    expect(body).toContain("- An iPhone on iOS 17 cuts the plant out, with Apple Vision.");
  });
});

describe("merging the release PR from the terminal", () => {
  it("given squash only, as this repository allows, when merging, then Squash and merge is the one choice, preselected", () => {
    expect(mergeChoices({ allowed: ["--squash"], preselected: "--squash" })).toEqual({
      choices: [
        { value: "--squash", label: "Squash and merge", hint: "the commits combined into one" },
      ],
      initial: "--squash",
    });
  });

  it("given every method allowed and rebase preselected on the PR page, when merging, then they are listed in GitHub's order with rebase preselected", () => {
    const { choices, initial } = mergeChoices({
      allowed: ["--squash", "--rebase", "--merge"],
      preselected: "--rebase",
    });

    expect(choices.map(({ label }) => label)).toEqual([
      "Create a merge commit",
      "Squash and merge",
      "Rebase and merge",
    ]);
    expect(initial).toBe("--rebase");
  });

  it("given the PR page preselects a method the repository no longer allows, when merging, then the first allowed one is preselected", () => {
    expect(
      mergeChoices({ allowed: ["--squash", "--rebase"], preselected: "--merge" }).initial,
    ).toBe("--squash");
  });

  it("given no merge method allowed, when merging, then there is nothing to offer", () => {
    expect(mergeChoices({ allowed: [], preselected: null }).choices).toEqual([]);
  });

  it("given d, m or o while waiting, when pressed, then it shows the diff, merges or opens GitHub", () => {
    expect([waitKey("d"), waitKey("m"), waitKey("o")]).toEqual(["diff", "merge", "open"]);
  });

  it("given any other key while waiting, when pressed, then nothing happens", () => {
    expect([waitKey("x"), waitKey(undefined)]).toEqual([null, null]);
  });
});
