import type { Environment } from "./environment";

/** A unit whose live state its own platform knows, not GitHub Deployments: EAS for a mobile app. */
export interface DecidedBy {
  /** Who decides, as a person reads it: "EAS". */
  platform: string;
  /** What it decides between: "build or update". */
  choice: string;
  /** The command that shows its state: "pnpm shiplane:check". */
  check: string;
}

export interface ScopeInfo {
  /** The unit's name. */
  app: string;
  version: string;
  /** Pending changesets naming it. */
  changesets: number;
  /** Commits since its current version, when no changeset names it. */
  commits: number;
  /** Its current version has a release tag. */
  tagged: boolean;
  /** A merged release PR brought its current version: untagged, that release is unfinished. */
  versioned: boolean;
  /** No version of it was ever tagged, and a commit brought its version: its first release. */
  firstRelease?: boolean;
  /** GitHub Deployments record that version on the channel being released. */
  onChannel: boolean;
  /** ...and on preview, which production promotes from. */
  onPreview: boolean;
  decidedBy?: DecidedBy;
  /** Nothing deploys it: once tagged, every environment has it. */
  releaseOnly?: boolean;
}

export interface ScopeChoice {
  app: string;
  /** Something to release: offered and ticked. Otherwise shown greyed, with why. */
  pending: boolean;
  hint: string;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const previewChoice = ({
  version,
  changesets,
  commits,
  tagged,
  versioned,
  firstRelease,
  onChannel,
  decidedBy,
  releaseOnly,
}: ScopeInfo) => {
  const later = decidedBy ? ` · ${decidedBy.platform} decides ${decidedBy.choice} once picked` : "";
  if (changesets > 0) return { pending: true, hint: `${plural(changesets, "changeset")}${later}` };
  if (commits > 0) {
    return {
      pending: true,
      hint: `${plural(commits, "commit")} since ${version}, changelog from its commits${later}`,
    };
  }
  if (!tagged) {
    if (versioned) return { pending: true, hint: `${version} versioned, not tagged yet${later}` };
    return firstRelease
      ? { pending: true, hint: `${version} first release${later}` }
      : { pending: false, hint: "nothing new" };
  }
  if (releaseOnly) return { pending: false, hint: `${version} released, nothing deploys it` };
  // Its builds and updates live on its platform, not in GitHub Deployments: the check reads them.
  if (decidedBy) {
    return {
      pending: false,
      hint: `${version} released, nothing new (${decidedBy.check} shows its builds)`,
    };
  }
  return onChannel
    ? { pending: false, hint: `${version} is on preview, nothing new` }
    : { pending: true, hint: `${version} released, not on preview yet` };
};

const productionChoice = ({
  version,
  tagged,
  onChannel,
  onPreview,
  decidedBy,
  releaseOnly,
}: ScopeInfo) => {
  if (!tagged) return { pending: false, hint: "not released yet" };
  if (releaseOnly) return { pending: false, hint: `${version} released, nothing deploys it` };
  if (decidedBy) {
    return {
      pending: true,
      hint: `${version} released, ${decidedBy.platform} decides once picked`,
    };
  }
  if (onChannel) return { pending: false, hint: `${version} is on production, nothing new` };
  return onPreview
    ? { pending: true, hint: `${version} is on preview, promotes it` }
    : { pending: false, hint: `${version} is not on preview yet: release it there first` };
};

/** The first question: which units have something to release here, and why not the rest. */
export const scopeChoices = (apps: ScopeInfo[], channel: Environment): ScopeChoice[] =>
  apps.map((info) => ({
    app: info.app,
    ...(channel === "production" ? productionChoice(info) : previewChoice(info)),
  }));
