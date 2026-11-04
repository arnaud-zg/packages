import { describe, expect, it } from "vitest";

import type { AppBump } from "../changes";
import { forcedVersion, versionChoices } from "../versionChoice";

const moved = (app: string, from: string, to: string): AppBump => ({
  app,
  from,
  to,
  notes: [],
  movedWith: [],
});

describe("the versions a release can go to", () => {
  it.each([
    ["0.4.0", "0.4.1", "patch"],
    ["0.4.0", "0.5.0", "minor"],
    ["0.4.0", "1.0.0", "major"],
    ["2.3.4", "2.4.0", "minor"],
  ])("given %s moving to %s, when read, then %s is the computed level", (from, to, computed) => {
    expect(versionChoices([moved("api", from, to)])?.computed).toBe(computed);
  });

  it("given 0.4.0, when read, then each level names the version it leads to", () => {
    expect(versionChoices([moved("api", "0.4.0", "0.5.0")])?.versions).toEqual({
      major: "1.0.0",
      minor: "0.5.0",
      patch: "0.4.1",
    });
  });

  it("given units landing on one version, when read, then one choice covers them", () => {
    const choices = versionChoices([
      moved("kit", "1.0.0", "1.1.0"),
      moved("cli", "1.0.0", "1.1.0"),
    ]);

    expect(choices?.computed).toBe("minor");
  });

  it("given units moving apart, when read, then no one version covers them", () => {
    expect(
      versionChoices([moved("api", "0.4.0", "0.5.0"), moved("site", "0.1.0", "0.1.1")]),
    ).toBeNull();
  });

  it("given two units reaching one version from two, when read, then no one bump covers them", () => {
    expect(
      versionChoices([moved("api", "0.4.0", "0.5.0"), moved("site", "0.4.9", "0.5.0")]),
    ).toBeNull();
  });

  it("given a prerelease, when read, then no bump explains it", () => {
    expect(versionChoices([moved("api", "1.0.0-beta.1", "1.0.0-beta.2")])).toBeNull();
  });

  it("given nothing moving, when read, then there is nothing to choose", () => {
    expect(versionChoices([])).toBeNull();
  });
});

describe("a version a person forced", () => {
  const choices = versionChoices([moved("kit", "0.4.0", "0.5.0")]);
  if (!choices) throw new Error("0.4.0 to 0.5.0 is a minor");

  it("given a reason, when forced, then the changeset says the move and why", () => {
    const { changeset } = forcedVersion(choices, "major", "Drops the old config", ["@acme/kit"]);

    expect(changeset.summary).toBe(
      "Version forced to 1.0.0 instead of 0.5.0: Drops the old config",
    );
  });

  it("given every package moving, when forced, then each is named at the level", () => {
    const forced = forcedVersion(choices, "patch", "Docs only", ["@acme/kit", "@acme/cli"]);

    expect(forced.level).toBe("patch");
    expect(forced.changeset.releases).toEqual([
      { name: "@acme/kit", type: "patch" },
      { name: "@acme/cli", type: "patch" },
    ]);
  });
});
