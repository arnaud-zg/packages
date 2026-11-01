import { describe, expect, it } from "vitest";

import { channelChoice, releaseSource } from "../governance";

describe("where a release goes", () => {
  it("given --channel production, when releasing, then it goes there without asking", () => {
    expect(channelChoice({ flag: "production", yes: false, interactive: true })).toBe("production");
  });

  it("given no --channel in a terminal, when releasing, then the person is asked, preview first", () => {
    expect(channelChoice({ flag: undefined, yes: false, interactive: true })).toBeNull();
  });

  it("given --yes or no terminal, when releasing, then it goes to preview", () => {
    expect(channelChoice({ flag: undefined, yes: true, interactive: true })).toBe("preview");
    expect(channelChoice({ flag: undefined, yes: false, interactive: false })).toBe("preview");
  });
});

describe("where a release may start from", () => {
  const main = { branch: "main", head: "abc", originMain: "abc" };

  it("given main in sync with origin, when building, then it may start", () => {
    expect(releaseSource("build", "preview", main)).toEqual({ allowed: true });
  });

  it("given a feature branch, when building, then it is refused: the binary would ship unmerged code", () => {
    expect(releaseSource("build", "preview", { ...main, branch: "feat/x" })).toEqual({
      allowed: false,
      why: "not-main",
    });
  });

  it("given main behind origin, when building, then it is refused until pulled", () => {
    expect(releaseSource("build", "preview", { ...main, originMain: "def" })).toEqual({
      allowed: false,
      why: "behind-main",
    });
  });

  it("given a feature branch, when updating preview, then testers may get it", () => {
    expect(releaseSource("update", "preview", { ...main, branch: "feat/x" })).toEqual({
      allowed: true,
    });
  });

  it("given a feature branch, when updating production, then it is refused", () => {
    expect(releaseSource("update", "production", { ...main, branch: "feat/x" })).toEqual({
      allowed: false,
      why: "not-main",
    });
  });
});
