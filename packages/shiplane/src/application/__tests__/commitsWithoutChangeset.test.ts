import { describe, expect, it } from "vitest";

import { planFrom } from "../../testing/plans";
import { testContext, testUnit } from "../../testing/releaseContext";
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
});
