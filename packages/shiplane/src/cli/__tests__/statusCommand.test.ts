import { describe, expect, it } from "vitest";

import { nextLabel } from "../statusCommand";

const unit = (pending: boolean) => ({ pending });

describe("what shiplane status says to run next", () => {
  it("given every unit released and nothing untagged, when the next step is read, then it says nothing is left and how to queue a change", () => {
    expect(nextLabel({ next: { step: "ship" }, units: [unit(false)], untagged: [] })).toBe(
      "nothing to release: queue a change with pnpm changeset",
    );
  });

  it("given a unit released but not shipped, when the next step is read, then it says to ship it", () => {
    expect(nextLabel({ next: { step: "ship" }, units: [unit(true)], untagged: [] })).toBe(
      "tag what was versioned and ship it: shiplane",
    );
  });

  it("given a release PR to open, when the next step is read, then it says so", () => {
    expect(nextLabel({ next: { step: "release-pr" }, units: [unit(true)], untagged: [] })).toBe(
      "open the release PR: shiplane",
    );
  });
});
