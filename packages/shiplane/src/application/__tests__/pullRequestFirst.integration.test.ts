import { describe, expect, it } from "vitest";

import type { Approval } from "../../domain/releasePr";
import { testContext, testUnit } from "../../testing/releaseContext";
import { pullRequestFirst } from "../pullRequestFirst";

/** The PR number the fake code host gives the first PR it opens. */
const PR = 1800;

const REQUEST = {
  action: "pull-request" as const,
  question: "Move production to 1.2.0 first?",
  branch: "shiplane/move-production",
  title: "chore(api): move production to 1.2.0",
  body: "Production moves before it ships.",
  changesets: [],
  write: () => Promise.resolve([]),
};

const setUp = ({ approval, interactive = true }: { approval?: Approval; interactive?: boolean }) =>
  testContext({ units: [testUnit("api", { version: "1.1.0" })], approval, interactive, yes: true });

describe("Feature: a pull request that has to merge first", () => {
  it("given the PR merges, when shiplane waits, then it pulls main and carries on", async () => {
    // given
    const world = setUp({});
    world.host.seed({ prStates: { [PR]: ["OPEN", "MERGED"] } });

    // when
    const outcome = await pullRequestFirst(world.context, REQUEST);

    // then
    expect(outcome).toBe("merged");
  });

  it("given the PR is closed without a merge, when shiplane waits, then it fails and says nothing shipped", async () => {
    // given
    const world = setUp({});
    world.host.seed({ prStates: { [PR]: ["OPEN", "CLOSED"] } });

    // when
    const outcome = await pullRequestFirst(world.context, REQUEST);

    // then
    expect(outcome).toBe("failed");
    expect(world.output.text).toContain(`#${PR} was closed without a merge`);
  });

  it("given approval is required and no terminal, when the PR is still open, then it leaves it for later instead of shipping", async () => {
    // given
    const world = setUp({ approval: "required", interactive: false });
    world.host.seed({ prStates: { [PR]: ["OPEN"] } });

    // when
    const outcome = await pullRequestFirst(world.context, REQUEST);

    // then
    expect(outcome).toBe("declined");
    expect(world.output.text).toContain(`Left #${PR} waiting. Run shiplane once it's merged.`);
  });
});
