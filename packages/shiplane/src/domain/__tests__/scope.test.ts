import { describe, expect, it } from "vitest";

import { EAS_DECIDES } from "../../testing/sample";
import { scopeChoices } from "../scope";

describe("what the release covers, asked before anything runs", () => {
  const base = {
    changesets: 0,
    tagged: false,
    versioned: false,
    onChannel: false,
    onPreview: false,
  };
  const choose = (
    info: Partial<typeof base> & { app: "expo" | "api" | "admin" | "landing"; version: string },
  ) =>
    scopeChoices(
      [{ ...base, ...info, ...(info.app === "expo" ? { decidedBy: EAS_DECIDES } : {}) }],
      "preview",
    )[0];

  it("given expo has changesets, when asked, then it is offered and says EAS decides build or update later", () => {
    expect(choose({ app: "expo", version: "0.1.115", changesets: 2, tagged: true })).toEqual({
      app: "expo",
      pending: true,
      hint: "2 changesets · EAS decides build or update once picked",
    });
  });

  it("given landing 0.1.1 released but not on preview, when asked, then it is offered to deploy", () => {
    expect(choose({ app: "landing", version: "0.1.1", tagged: true })).toEqual({
      app: "landing",
      pending: true,
      hint: "0.1.1 released, not on preview yet",
    });
  });

  it("given landing 0.1.1 already on preview and nothing new, when asked, then it is greyed out", () => {
    expect(choose({ app: "landing", version: "0.1.1", tagged: true, onChannel: true })).toEqual({
      app: "landing",
      pending: false,
      hint: "0.1.1 is on preview, nothing new",
    });
  });

  it("given a package with no environment, when asked, then it reads live or not, never preview", () => {
    const package_ = { ...base, app: "cli", version: "1.0.0", tagged: true, noEnvironment: true };

    expect(scopeChoices([{ ...package_, onChannel: true }], "preview")[0]?.hint).toBe(
      "1.0.0 is live, nothing new",
    );
    expect(scopeChoices([package_], "preview")[0]?.hint).toBe("1.0.0 released, not live yet");
  });

  it("given expo released with nothing new, when asked, then it is greyed out and points to its build check", () => {
    expect(choose({ app: "expo", version: "0.1.115", tagged: true })).toEqual({
      app: "expo",
      pending: false,
      hint: "0.1.115 released, nothing new (shiplane status shows its builds)",
    });
  });

  it("given nothing new and nothing released, when asked, then it is greyed out", () => {
    expect(choose({ app: "api", version: "0.0.2" })).toEqual({
      app: "api",
      pending: false,
      hint: "nothing new",
    });
  });

  it("given admin 0.1.1 on preview only, when promoting to production, then it is offered", () => {
    expect(
      scopeChoices(
        [{ ...base, app: "admin", version: "0.1.1", tagged: true, onPreview: true }],
        "production",
      )[0],
    ).toEqual({ app: "admin", pending: true, hint: "0.1.1 is on preview, promotes it" });
  });

  it("given admin 0.1.1 not on preview yet, when promoting to production, then it is greyed out", () => {
    expect(
      scopeChoices([{ ...base, app: "admin", version: "0.1.1", tagged: true }], "production")[0],
    ).toEqual({
      app: "admin",
      pending: false,
      hint: "0.1.1 is not on preview yet: release it there first",
    });
  });

  it("given admin 0.1.1 already on production, when promoting, then it is greyed out", () => {
    expect(
      scopeChoices(
        [
          {
            ...base,
            app: "admin",
            version: "0.1.1",
            tagged: true,
            onPreview: true,
            onChannel: true,
          },
        ],
        "production",
      )[0],
    ).toEqual({ app: "admin", pending: false, hint: "0.1.1 is on production, nothing new" });
  });

  it("given the release CLI 0.3.0 released with nothing new, when asked for preview, then it is greyed out since nothing deploys it", () => {
    expect(
      scopeChoices(
        [{ ...base, app: "release", version: "0.3.0", tagged: true, releaseOnly: true }],
        "preview",
      )[0],
    ).toEqual({ app: "release", pending: false, hint: "0.3.0 released, nothing deploys it" });
  });

  it("given the release CLI 0.3.0 released, when promoting to production, then it is greyed out since nothing deploys it", () => {
    expect(
      scopeChoices(
        [{ ...base, app: "release", version: "0.3.0", tagged: true, releaseOnly: true }],
        "production",
      )[0],
    ).toEqual({ app: "release", pending: false, hint: "0.3.0 released, nothing deploys it" });
  });
});
