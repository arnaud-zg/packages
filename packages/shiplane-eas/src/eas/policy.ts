import type { AppBump, Environment, PlannedChangeset, VersionChoice } from "shiplane/plugin";
import { compareVersions, nextPatch } from "shiplane/plugin";

export type Platform = "ios" | "android";

export interface ShippedBuild {
  id: string;
  appVersion: string | null;
  buildNumber: string | null;
  fingerprint: string | null;
  gitCommit: string | null;
  createdAt: string;
}

export interface RunningBuild {
  id: string;
  appVersion: string | null;
  buildNumber: string | null;
}

export interface PlatformState {
  platform: Platform;
  /** This commit: its native fingerprint (the runtime version updates target), app version and sha. */
  local: { fingerprint: string; version: string; commit: string };
  /** The newest finished store build on the channel, or null when there is none. */
  shipped: ShippedBuild | null;
  /** The newest store build on the channel still queued or running. */
  running: RunningBuild | null;
}

export type BuildReason = "no-build" | "no-fingerprint" | "native-changed" | "version-changed";

export type PlatformVerdict =
  | { platform: Platform; action: "update"; shipped: ShippedBuild }
  | { platform: Platform; action: "submit"; shipped: ShippedBuild }
  | {
      platform: Platform;
      action: "pull";
      why: "version-behind";
      shipped: ShippedBuild;
      /** The newest version built on the channel, whose bump this branch misses. */
      newerVersion: string;
    }
  | { platform: Platform; action: "wait"; why: "build-running"; running: RunningBuild }
  | { platform: Platform; action: "build"; why: BuildReason; shipped: ShippedBuild | null };

export type ReleaseAction = PlatformVerdict["action"];

/** What this commit needs on one platform, given the builds on its channel. */
export const platformVerdict = ({
  platform,
  local,
  shipped,
  running,
}: PlatformState): PlatformVerdict => {
  if (running?.appVersion === local.version) {
    return { platform, action: "wait", why: "build-running", running };
  }
  // A running build of a newer version means its bump commit exists: this branch is behind it.
  const newestVersion = running?.appVersion ?? shipped?.appVersion;
  if (shipped && newestVersion && compareVersions(local.version, newestVersion) < 0) {
    return {
      platform,
      action: "pull",
      why: "version-behind",
      shipped,
      newerVersion: newestVersion,
    };
  }
  if (!shipped) return { platform, action: "build", why: "no-build", shipped };

  // The version is part of the fingerprint and names the binary: it decides first.
  if (shipped.appVersion && shipped.appVersion !== local.version) {
    return { platform, action: "build", why: "version-changed", shipped };
  }
  if (!shipped.fingerprint) return { platform, action: "build", why: "no-fingerprint", shipped };
  if (shipped.fingerprint !== local.fingerprint) {
    return { platform, action: "build", why: "native-changed", shipped };
  }
  if (shipped.gitCommit === local.commit) return { platform, action: "submit", shipped };
  return { platform, action: "update", shipped };
};

export interface ReleasePlan {
  action: ReleaseAction;
  commands: string[];
}

// One update reaches every platform, so the most demanding platform decides; a stale branch
// is caught up first, since every other verdict is about an older version.
const PRECEDENCE: ReleaseAction[] = ["pull", "build", "wait", "submit", "update"];

/** The next step for the whole release, with the release CLI commands that take it. */
export const releasePlan = (
  channel: Environment,
  verdicts: PlatformVerdict[],
  unit: string,
): ReleasePlan => {
  const action =
    PRECEDENCE.find((candidate) => verdicts.some((verdict) => verdict.action === candidate)) ??
    "update";
  const flag = channel === "preview" ? "" : ` --channel ${channel}`;
  const COMMANDS: Record<ReleaseAction, string[]> = {
    // EAS submits a build when it is done: shipping it is one command.
    build: [`pnpm shiplane ship ${unit}${flag}`],
    // The release that versioned the build is on main: the branch catches up from there.
    pull: ["git fetch origin", "git merge origin/main", `pnpm shiplane${flag}`],
    wait: [`pnpm shiplane status${flag}`],
    // The build made from this commit exists and EAS submitted it.
    submit: [`pnpm shiplane status${flag}`],
    update: [`pnpm shiplane ship ${unit}${flag}`],
  };

  return { action, commands: COMMANDS[action] };
};

/**
 * A build of a version some binary already carries would give two native layers one version: each
 * binary keeps its own. The release pull request, or the promotion one, moves it first.
 */
export const needsNewVersion = (states: PlatformState[]) =>
  states.some(({ local, shipped }) => shipped?.appVersion === local.version);

export type MobileRelease =
  | { ships: "build"; version: string; nativeChangeset: boolean }
  | { ships: "update"; version: string }
  | { ships: "nothing" }
  | { ships: "blocked"; why: "build-running" | "behind" };

/**
 * What the release does for mobile, from preview's verdict. A new native layer gets a new
 * version, so each binary's version names one native layer.
 */
export const mobileRelease = (
  action: ReleaseAction,
  expo: AppBump | undefined,
  currentVersion: string,
): MobileRelease => {
  if (action === "wait") return { ships: "blocked", why: "build-running" };
  if (action === "pull") return { ships: "blocked", why: "behind" };
  if (action === "build") {
    return expo
      ? { ships: "build", version: expo.to, nativeChangeset: false }
      : { ships: "build", version: nextPatch(currentVersion), nativeChangeset: true };
  }
  return expo ? { ships: "update", version: expo.to } : { ships: "nothing" };
};

/** The changeset the release writes itself: a build gets a version even with no expo changeset. */
export const releaseChangesets = (
  mobile: MobileRelease,
  changes: string[],
  app: string,
): PlannedChangeset[] =>
  mobile.ships === "build" && mobile.nativeChangeset
    ? [
        {
          id: `native-${mobile.version}`,
          releases: [{ name: app, type: "patch" }],
          summary:
            changes.length > 0
              ? `Native code changed: ${changes.map((change) => change.replace(/^[+~-] /, "")).join(", ")}.`
              : "A new build of the app, with the same native code.",
        },
      ]
    : [];

const BUILD_LABEL = "New build, iOS and Android";
const UPDATE_LABEL = "Over-the-air update";

/**
 * What the person may pick once detection spoke, the suggestion first: a build is always possible,
 * an update only on the native layer the installed binaries carry.
 */
export const mobileChoice = (
  action: ReleaseAction,
  why: string,
  app: string,
): VersionChoice | undefined => {
  if (action === "wait" || action === "pull") return undefined;
  const question = `What should ${app} ship to preview?`;
  if (action === "build") {
    return {
      question,
      suggested: "build",
      options: [
        { value: "build", label: `${BUILD_LABEL} (suggested)`, hint: why },
        {
          value: "update",
          label: UPDATE_LABEL,
          hint: "not safe: installed binaries lack this native layer",
          disabled: true,
        },
      ],
    };
  }
  return {
    question,
    suggested: "update",
    options: [
      { value: "update", label: `${UPDATE_LABEL} (suggested)`, hint: why },
      {
        value: "build",
        label: BUILD_LABEL,
        hint: "not needed: a new binary anyway, under its own version",
      },
    ],
  };
};

export type MobileShip =
  "build" | "update" | "wait" | "shipped" | "moved-past" | "behind" | "nothing";

/**
 * What mobile still needs for the expo version a release tagged. A binary or an update ships its
 * commit: once the app's code moved past the release, it would carry code no release named.
 */
export const mobileShip = (
  action: ReleaseAction,
  state: {
    /** The current expo version has a release tag. */
    tagged: boolean;
    /** Code reaching the app changed between that tag and main. */
    codeSinceTag: boolean;
    /** The last build or update shipped the tagged code. */
    codeShipped: boolean;
  },
): MobileShip => {
  if (!state.tagged) return "nothing";
  if (action === "wait") return "wait";
  if (action === "pull") return "behind";
  if (action === "submit") return "shipped";
  if (action === "update" && state.codeShipped) return "shipped";
  if (state.codeSinceTag) return "moved-past";
  return action;
};

export type ProductionMobile =
  | "promote"
  | "finish-rollout"
  | "build"
  | "update"
  | "wait"
  | "shipped"
  | "moved-past"
  | "behind"
  | "nothing";

/**
 * What production still needs to run the expo version preview validated. A new native layer needs
 * production's version moved first (the promotion PR).
 */
export const productionMobile = (
  action: ReleaseAction,
  state: {
    /** The current expo version has a release tag. */
    tagged: boolean;
    /** Main differs from that tag by version files at most. */
    sinceTagOnlyVersionFiles: boolean;
    expoVersion: string;
    /** apps/expo/app-version.json production: the binary version production builds carry. */
    productionVersion: string;
    /** The last production build or update shipped the tagged code. */
    codeShipped: boolean;
    /** The version of the last finished production build. */
    builtVersion: string | null;
    /** The last update, made from the tagged code, reaches only part of production. */
    partialRollout: boolean;
  },
): ProductionMobile => {
  if (!state.tagged) return "nothing";
  if (action === "wait") return "wait";
  if (action === "pull") return "behind";
  if (action !== "build" && state.codeShipped) {
    return state.partialRollout ? "finish-rollout" : "shipped";
  }
  if (!state.sinceTagOnlyVersionFiles) return "moved-past";
  if (action === "build") {
    return state.productionVersion === state.expoVersion ? "build" : "promote";
  }
  return "update";
};

const MOBILE_SHIPS: Partial<Record<MobileRelease["ships"], string>> = {
  build: "Build iOS and Android, submitted when done",
  update: "Over-the-air update",
};

/** What happens to each unit once the release pull request is merged, the mobile app's from EAS. */
export const onMerge = (mobile: MobileRelease, mobileApp: string) => (bump: AppBump) => {
  if (bump.app === mobileApp) return MOBILE_SHIPS[mobile.ships] ?? "Nothing ships";
  const reason = bump.movedWith.length > 0 ? ` (moved with ${bump.movedWith.join(", ")})` : "";
  return `Deploy preview${reason}`;
};

/** The shares of people a production rollout widens through, in order. */
export const ROLLOUT_STEPS = [10, 25, 50, 100] as const;

const counted = (total: number, one: string, many: string) =>
  `${total} ${total === 1 ? one : many}`;

/** How long an update has been out, as a person says it: hours under two days, then days. */
export const timeOut = (hours: number) =>
  hours < 48
    ? counted(Math.max(1, Math.floor(hours)), "hour", "hours")
    : counted(Math.floor(hours / 24), "day", "days");

/**
 * The next move for an update reaching part of production: hold while it crashed, nobody ran it or
 * it is under a day old; otherwise the next step up.
 */
export const rolloutAdvice = ({
  percentage,
  launches,
  crashes,
  hoursOut,
}: {
  percentage: number;
  launches: number;
  crashes: number;
  hoursOut: number;
}): { suggested: number | "stay"; why: string } => {
  if (crashes > 0) {
    return {
      suggested: "stay",
      why: `${counted(crashes, "crash", "crashes")} since it went out: look before widening, or roll back`,
    };
  }
  if (launches === 0) {
    return { suggested: "stay", why: "nobody has launched it yet: wait for launches" };
  }
  if (hoursOut < 24)
    return { suggested: "stay", why: `out for ${timeOut(hoursOut)}: give it a day` };
  return {
    suggested: ROLLOUT_STEPS.find((step) => step > percentage) ?? 100,
    why: `healthy for ${timeOut(hoursOut)}: widen it`,
  };
};
