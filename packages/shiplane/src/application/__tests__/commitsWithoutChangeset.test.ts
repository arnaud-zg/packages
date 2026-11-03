import { describe, expect, it } from "vitest";

import type { PlannedChangeset } from "../../domain/changes";
import { planFrom } from "../../testing/plans";
import { changesetText, testContext, testUnit } from "../../testing/releaseContext";
import { prepareRelease } from "../prepareRelease";
import { readStatus } from "../readStatus";

const setUp = (commitsWithoutChangeset?: "release" | "ignore") => {
  const world = testContext({
    units: [testUnit("site", { version: "0.1.1" })],
    ...(commitsWithoutChangeset ? { commitsWithoutChangeset } : {}),
  });
  world.versioning.seed({ pending: [], plan: planFrom([], { "@acme/site": "0.1.1" }) });
  world.source.seed({
    tags: { "site@0.1.1": "t1" },
    subjects: { "t1:apps/site": ["chore(repo): rename repo and refresh docs (#10)"] },
  });
  world.host.seed({ deployments: [{ title: "Deploy site@0.1.1 to preview", state: "done" }] });
  return world;
};

describe("commits no changeset names", () => {
  it("given a commit touched a unit with no changeset and the config says nothing, when the status is read, then nothing is offered for release", async () => {
    const { context } = setUp("ignore");

    const status = await readStatus(context, "preview");

    expect(status.units).toEqual([
      expect.objectContaining({ unit: "site", pending: false, commits: 0 }),
    ]);
    expect(status.next).toEqual({ step: "ship" });
  });

  it("given the config releases commits without a changeset, when the status is read, then the unit is offered with a changelog from its commits", async () => {
    const { context } = setUp("release");

    const status = await readStatus(context, "preview");

    expect(status.units).toEqual([
      expect.objectContaining({
        unit: "site",
        pending: true,
        hint: "1 commit since 0.1.1, changelog from its commits",
      }),
    ]);
  });

  it("given a changeset names the unit too, when the release is prepared, then it alone sets the move and the commits are skipped", async () => {
    const REDESIGN: PlannedChangeset = {
      id: "redesign",
      summary: "The site has a new look.",
      releases: [{ name: "@acme/site", type: "patch" }],
    };
    const { context, source, versioning } = setUp("release");
    source.seed({ subjects: { "t1:apps/site": ["feat(site): the search finds plants (#12)"] } });
    versioning.seed({
      pending: [
        { id: REDESIGN.id, text: changesetText({ "@acme/site": "patch" }, REDESIGN.summary) },
      ],
      plan: planFrom([REDESIGN], { "@acme/site": "0.1.1" }),
    });

    const { bumps, added } = await prepareRelease(context, new Set(["site"]));

    expect(added).toEqual([]);
    expect(bumps).toEqual([expect.objectContaining({ app: "site", to: "0.1.2" })]);
  });

  it.each([
    ["fix(site): the footer links work again (#11)", "0.1.2"],
    ["feat(site): the search finds plants by photo (#12)", "0.2.0"],
    ["feat(site)!: every page moved under /plants (#13)", "1.0.0"],
  ])(
    "given only %s, when the release is prepared, then the unit moves to %s",
    async (commit, to) => {
      const { context, source } = setUp("release");
      source.seed({ subjects: { "t1:apps/site": [commit] } });

      const { bumps } = await prepareRelease(context, new Set(["site"]));

      expect(bumps).toEqual([expect.objectContaining({ app: "site", from: "0.1.1", to })]);
    },
  );
});
