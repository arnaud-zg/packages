import type { StatusPlan } from "shiplane/plugin";
import { appBumps, onlyVersionFiles, yesAllowed } from "shiplane/plugin";
import { SAMPLE_UNITS, SAMPLE_VERSION_FILES } from "shiplane/testing";
import { describe, expect, it } from "vitest";

import type { PlatformState, ShippedBuild } from "../policy";
import { updateHealth, why } from "../analyse";
import {
  mobileRelease,
  mobileShip,
  needsNewVersion,
  platformVerdict,
  productionMobile,
  releaseChangesets,
  releasePlan,
  rolloutAdvice,
} from "../policy";

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

const expo = bumps.find(({ app }) => app === "expo");

const BUILD_230: ShippedBuild = {
  id: "49d6092f",
  appVersion: "0.1.113",
  buildNumber: "230",
  fingerprint: "52b8d2d2",
  gitCommit: "e0de24604",
  createdAt: "2026-10-09T21:57:35.087Z",
};

const state = (overrides: Partial<PlatformState> = {}): PlatformState => ({
  platform: "android",
  local: { fingerprint: "52b8d2d2", version: "0.1.113", commit: "3ccf03607" },
  shipped: BUILD_230,
  running: null,
  ...overrides,
});

const local = (overrides: Partial<PlatformState["local"]>) => ({ ...state().local, ...overrides });

describe("the mobile release", () => {
  it("given native code changed and an expo changeset, when planned, then the new version is built", () => {
    expect(mobileRelease("build", expo, "0.1.114")).toEqual({
      ships: "build",
      version: "0.2.0",
      nativeChangeset: false,
    });
  });

  it("given native code changed with no expo changeset, when planned, then a patch is built and the release adds its changeset", () => {
    expect(mobileRelease("build", undefined, "0.1.114")).toEqual({
      ships: "build",
      version: "0.1.115",
      nativeChangeset: true,
    });
  });

  it("given the same native layer and an expo changeset, when planned, then the new version ships over the air", () => {
    expect(mobileRelease("update", expo, "0.1.114")).toEqual({ ships: "update", version: "0.2.0" });
  });

  it("given the last build was made from this commit, when planned, then the new version ships over the air too", () => {
    expect(mobileRelease("submit", expo, "0.1.114")).toEqual({ ships: "update", version: "0.2.0" });
  });

  it("given the same native layer and no expo changeset, when planned, then mobile ships nothing", () => {
    expect(mobileRelease("update", undefined, "0.1.114")).toEqual({ ships: "nothing" });
  });

  it("given a preview build still running, when planned, then the release waits for it rather than guess the native layer", () => {
    expect(mobileRelease("wait", expo, "0.1.114")).toEqual({
      ships: "blocked",
      why: "build-running",
    });
  });

  it("given main behind the last build's version, when planned, then the release is blocked until it catches up", () => {
    expect(mobileRelease("pull", expo, "0.1.114")).toEqual({ ships: "blocked", why: "behind" });
  });
});

describe("the changesets the release adds", () => {
  it("given a preview build of a version no changeset names, when planned, then expo gets a patch naming the native change", () => {
    const added = releaseChangesets(
      { ships: "build", version: "0.1.115", nativeChangeset: true },
      ["~ packages/react-native-subject-finder"],
      "@acme/expo",
    );

    expect(added.find(({ id }) => id.startsWith("native-"))).toMatchObject({
      releases: [{ name: "@acme/expo", type: "patch" }],
      summary: "Native code changed: packages/react-native-subject-finder.",
    });
  });

  it("given a preview build with an expo changeset, when planned, then the release adds nothing", () => {
    expect(
      releaseChangesets(
        { ships: "build", version: "0.2.0", nativeChangeset: false },
        [],
        "@acme/expo",
      ),
    ).toEqual([]);
  });

  it("given an over-the-air update, when planned, then the release adds nothing", () => {
    expect(releaseChangesets({ ships: "update", version: "0.2.1" }, [], "@acme/expo")).toEqual([]);
  });
});

describe("shipping mobile to preview", () => {
  const released = { tagged: true, codeSinceTag: false, codeShipped: false };

  it("given the release moved the preview version, when shipping, then it builds", () => {
    expect(mobileShip("build", released)).toBe("build");
  });

  it("given the release only moved JavaScript, when shipping, then it publishes an update", () => {
    expect(mobileShip("update", released)).toBe("update");
  });

  it("given the update for this release was published, when resumed, then mobile is shipped", () => {
    expect(mobileShip("update", { ...released, codeShipped: true })).toBe("shipped");
  });

  it("given the build for this release was made and submitted, when resumed, then mobile is shipped even after main moved", () => {
    expect(mobileShip("update", { ...released, codeSinceTag: true, codeShipped: true })).toBe(
      "shipped",
    );
  });

  it("given the build for this release is still running, when resumed, then it waits", () => {
    expect(mobileShip("wait", released)).toBe("wait");
  });

  it("given the app's code changed since its release before it shipped, when shipping, then it refuses: the binary would carry unreleased code", () => {
    expect(mobileShip("build", { ...released, codeSinceTag: true })).toBe("moved-past");
  });

  it("given no expo version was released, when shipping, then mobile has nothing to ship", () => {
    expect(mobileShip("update", { ...released, tagged: false })).toBe("nothing");
  });
});

describe("production", () => {
  it("given --yes, when releasing to production, then it is refused: production always asks", () => {
    expect(yesAllowed("production", true)).toBe(false);
  });

  it("given --yes, when releasing to preview, then every step is accepted", () => {
    expect(yesAllowed("preview", true)).toBe(true);
  });

  it("given only version files changed since the tag, when checked, then main still ships what preview validated", () => {
    expect(
      onlyVersionFiles(
        ["apps/expo/app-version.json", "apps/api/public/app-version.production.json"],
        SAMPLE_VERSION_FILES,
      ),
    ).toBe(true);
  });

  it("given code changed since the tag, when checked, then main holds code preview never ran", () => {
    expect(
      onlyVersionFiles(
        ["apps/expo/app-version.json", "packages/app/src/home.tsx"],
        SAMPLE_VERSION_FILES,
      ),
    ).toBe(false);
  });

  const state = {
    tagged: true,
    sinceTagOnlyVersionFiles: true,
    expoVersion: "0.2.1",
    productionVersion: "0.1.28",
    codeShipped: false,
    builtVersion: "0.1.28",
    partialRollout: false,
  };

  it("given production's binary predates a native change, when promoted, then a promotion PR moves its version first", () => {
    expect(productionMobile("build", state)).toBe("promote");
  });

  it("given the promotion PR merged, when shipping, then production builds that version", () => {
    expect(productionMobile("build", { ...state, productionVersion: "0.2.1" })).toBe("build");
  });

  it("given the same native layer as production's binary, when shipping, then the release goes over the air", () => {
    expect(productionMobile("update", state)).toBe("update");
  });

  it("given the build is done and live, when resumed, then production is shipped", () => {
    expect(
      productionMobile("submit", {
        ...state,
        productionVersion: "0.2.1",
        codeShipped: true,
        builtVersion: "0.2.1",
      }),
    ).toBe("shipped");
  });

  it("given the update of this release reaches only part of production, when resumed, then the rollout is finished", () => {
    expect(productionMobile("update", { ...state, codeShipped: true, partialRollout: true })).toBe(
      "finish-rollout",
    );
  });

  it("given main holds code preview never ran, when shipping, then production refuses", () => {
    expect(productionMobile("update", { ...state, sinceTagOnlyVersionFiles: false })).toBe(
      "moved-past",
    );
  });

  it("given no expo release yet, when promoting, then production has nothing to take", () => {
    expect(productionMobile("build", { ...state, tagged: false })).toBe("nothing");
  });
});

describe("one platform's verdict", () => {
  it("given the same native layer and version as the last build, when checked, then an update reaches it", () => {
    expect(platformVerdict(state())).toMatchObject({ action: "update" });
  });

  it("given a different native fingerprint, when checked, then a build is needed because native code changed", () => {
    expect(platformVerdict(state({ local: local({ fingerprint: "9fec49ed" }) }))).toMatchObject({
      action: "build",
      why: "native-changed",
    });
  });

  it("given a version bumped since the last build, when checked, then a build is needed: no binary runs that version", () => {
    const bumped = state({ local: local({ version: "0.1.114", fingerprint: "23f706b9" }) });

    expect(platformVerdict(bumped)).toMatchObject({ action: "build", why: "version-changed" });
  });

  it("given the builds since the last finished one errored, when the build is explained, then it names the version that finished build carries", () => {
    const bumped = state({ local: local({ version: "0.1.114", fingerprint: "23f706b9" }) });

    expect(why(platformVerdict(bumped))).toBe(
      "no binary carries this version yet: the last finished build is 0.1.113",
    );
  });

  it("given a branch behind the last build's version bump, when checked, then it says to pull, not to build again", () => {
    const behind = state({ local: local({ version: "0.1.112", fingerprint: "0ld" }) });

    expect(platformVerdict(behind)).toMatchObject({ action: "pull", why: "version-behind" });
  });

  it("given 0.1.9 against a 0.1.10 build, when checked, then versions compare as numbers", () => {
    const verdict = platformVerdict(
      state({
        local: local({ version: "0.1.9" }),
        shipped: { ...BUILD_230, appVersion: "0.1.10" },
      }),
    );

    expect(verdict).toMatchObject({ action: "pull" });
  });

  it("given a build for this version still running, when checked, then it says to wait for it", () => {
    const building = state({
      local: local({ version: "0.1.114", fingerprint: "23f706b9" }),
      running: { id: "b231", appVersion: "0.1.114", buildNumber: "231" },
    });

    expect(platformVerdict(building)).toMatchObject({ action: "wait", why: "build-running" });
  });

  it("given a build of a newer version running, when checked, then the branch is behind its bump: pull", () => {
    const behindRunning = state({
      running: { id: "b231", appVersion: "0.1.114", buildNumber: "231" },
      local: local({ fingerprint: "340d7513" }),
    });

    expect(platformVerdict(behindRunning)).toMatchObject({
      action: "pull",
      why: "version-behind",
      newerVersion: "0.1.114",
    });
  });

  it("given the last build was made from this very commit, when checked, then it says to submit it", () => {
    expect(platformVerdict(state({ local: local({ commit: "e0de24604" }) }))).toMatchObject({
      action: "submit",
    });
  });

  it("given no finished build on the channel, when checked, then a build is needed", () => {
    expect(platformVerdict(state({ shipped: null }))).toMatchObject({
      action: "build",
      why: "no-build",
    });
  });

  it("given a build with no recorded fingerprint, when checked, then a build is needed rather than a blind update", () => {
    const verdict = platformVerdict(state({ shipped: { ...BUILD_230, fingerprint: null } }));

    expect(verdict).toMatchObject({ action: "build", why: "no-fingerprint" });
  });
});

describe("the release plan", () => {
  it("given every platform can take an update, when planned for preview, then it says to publish the update", () => {
    const verdicts = [state({ platform: "ios" }), state()].map(platformVerdict);

    expect(releasePlan("preview", verdicts, "expo")).toEqual({
      action: "update",
      commands: ["pnpm shiplane ship expo"],
    });
  });

  it("given one platform needs a build, when planned, then it says to ship a build, which EAS submits, since an update goes to both", () => {
    const verdicts = [
      state({ platform: "ios" }),
      state({ local: local({ fingerprint: "9fec49ed" }) }),
    ].map(platformVerdict);

    expect(releasePlan("preview", verdicts, "expo")).toEqual({
      action: "build",
      commands: ["pnpm shiplane ship expo"],
    });
  });

  it("given a platform behind the build's version, when planned, then it says to merge main's bump and check again", () => {
    const verdicts = [
      state({ platform: "ios" }),
      state({ local: local({ version: "0.1.112" }) }),
    ].map(platformVerdict);

    expect(releasePlan("preview", verdicts, "expo")).toEqual({
      action: "pull",
      commands: ["git fetch origin", "git merge origin/main", "pnpm shiplane"],
    });
  });

  it("given one platform behind and the other needing a build, when planned, then pulling comes first", () => {
    const verdicts = [
      state({ platform: "ios", local: local({ version: "0.1.112" }) }),
      state({ local: local({ fingerprint: "9fec49ed" }) }),
    ].map(platformVerdict);

    expect(releasePlan("preview", verdicts, "expo").action).toBe("pull");
  });

  it("given production can take an update, when planned, then every command names the channel", () => {
    expect(releasePlan("production", [platformVerdict(state())], "expo").commands).toEqual([
      "pnpm shiplane ship expo --channel production",
    ]);
  });
});

describe("the version a build carries", () => {
  it("given the version of the last build, when building, then a new version is needed: both binaries would take the same updates", () => {
    expect(needsNewVersion([state({ local: local({ fingerprint: "9fec49ed" }) })])).toBe(true);
  });

  it("given a version no build has yet, when building, then it may go ahead", () => {
    expect(needsNewVersion([state({ local: local({ version: "0.1.114" }) })])).toBe(false);
  });

  it("given no build on the channel yet, when building, then any version may go ahead", () => {
    expect(needsNewVersion([state({ shipped: null })])).toBe(false);
  });
});

describe("an update's health on preview", () => {
  it("given launches on both platforms and no crash, when judged, then it looks well", () => {
    expect(
      updateHealth([
        { platform: "ios", installs: 3, failedInstalls: 0 },
        { platform: "android", installs: 12, failedInstalls: 0 },
      ]),
    ).toEqual({ ok: true, summary: "iOS 3 launches, 0 crashes · Android 12 launches, 0 crashes" });
  });

  it("given one crash, when judged, then it looks unwell and says how many", () => {
    expect(
      updateHealth([
        { platform: "ios", installs: 1, failedInstalls: 0 },
        { platform: "android", installs: 12, failedInstalls: 1 },
      ]),
    ).toMatchObject({ ok: false, why: "1 crash on preview" });
  });

  it("given nobody launched it yet, when judged, then it looks unwell: preview never ran it", () => {
    expect(
      updateHealth([
        { platform: "ios", installs: 0, failedInstalls: 0 },
        { platform: "android", installs: 0, failedInstalls: 0 },
      ]),
    ).toMatchObject({ ok: false, why: "nobody has launched it on preview yet" });
  });
});

describe("the next step of a production rollout", () => {
  const healthy = { percentage: 10, launches: 460, crashes: 0, hoursOut: 48 };

  it("given 10% healthy for two days, when advised, then it widens to the next step, 25%", () => {
    expect(rolloutAdvice(healthy)).toEqual({ suggested: 25, why: "healthy for 2 days: widen it" });
  });

  it("given 50% healthy, when advised, then it goes to everyone", () => {
    expect(rolloutAdvice({ ...healthy, percentage: 50 }).suggested).toBe(100);
  });

  it("given a crash, when advised, then it stays and says rolling back is there", () => {
    expect(rolloutAdvice({ ...healthy, crashes: 1 })).toEqual({
      suggested: "stay",
      why: "1 crash since it went out: look before widening, or roll back",
    });
  });

  it("given nobody launched it yet, when advised, then it stays", () => {
    expect(rolloutAdvice({ ...healthy, launches: 0 })).toEqual({
      suggested: "stay",
      why: "nobody has launched it yet: wait for launches",
    });
  });

  it("given it went out three hours ago, when advised, then it stays a day first", () => {
    expect(rolloutAdvice({ ...healthy, hoursOut: 3 })).toEqual({
      suggested: "stay",
      why: "out for 3 hours: give it a day",
    });
  });
});
