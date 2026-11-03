/** Tag formats a config can name instead of writing one out. */
export const TAG_FORMATS = {
  /** `api@1.2.0`: one tag per unit, as changesets tags a monorepo. */
  package: "{name}@{version}",
  /**
   * `my-plugin--v1.2.0`: an agent plugin's tag. Claude Code resolves versions from it; Gemini CLI and
   * Codex install from any tag, so one tag serves all three.
   */
  plugin: "{name}--v{version}",
  /** `v1.2.0`: a repository that releases one unit, the most common tag there is. */
  single: "v{version}",
  /** `api/v1.2.0`: a tag per folder, as Go requires for a module below the repository root. */
  module: "{name}/v{version}",
} as const;

export type TagFormatName = keyof typeof TAG_FORMATS;

/** How a tag names a unit's version unless the config says otherwise. */
export const DEFAULT_TAG_FORMAT = TAG_FORMATS.package;

/** A format's name resolved to the format; anything else is a format already. */
export const tagFormatNamed = (format: string): string =>
  Object.hasOwn(TAG_FORMATS, format) ? TAG_FORMATS[format as TagFormatName] : format;

/** A unit's tag for a version, through a format like `v{version}` or `{name}--v{version}`. */
export const tagName = (app: string, version: string, format: string = DEFAULT_TAG_FORMAT) =>
  format.replaceAll("{name}", app).replaceAll("{version}", version);

export interface TagCandidate {
  /** The unit's name. */
  app: string;
  version: string;
  /** The commit that brought this version, as `git log -S` finds it. */
  commit: { sha: string; subject: string };
  /** No version of the unit was ever tagged: the commit that added it brings its first release. */
  first?: boolean;
}

/**
 * No tag names any version of the unit yet: the version it holds is its first release. 0.0.0 is a
 * unit never versioned, waiting for its first changeset.
 */
export const firstRelease = (
  app: string,
  version: string,
  tags: ReadonlySet<string>,
  format: string = DEFAULT_TAG_FORMAT,
) => {
  const prefix = tagName(app, "", format);
  return version !== "0.0.0" && ![...tags].some((tag) => tag.startsWith(prefix));
};

export interface ReleaseTag {
  /** The unit's name. */
  app: string;
  version: string;
  tag: string;
  sha: string;
  needsTag: boolean;
  needsNotes: boolean;
}

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A release pull request's subject: `chore(api): release v0.0.4`, or `chore(release): ...` for several. */
export const isReleaseSubject = (subject: string) =>
  subject.startsWith("chore(release):") || /^chore\([^)]+\): release v\d/.test(subject);

/**
 * A family a title names by its root brings the root and every `root-*`: `shiplane and 7 plugins
 * v0.1.0` at that version, `shiplane v0.2.0 and 7 plugins` with each plugin at whichever it moved to.
 */
const FAMILY =
  /(?:: |, | and )(\S+?)(?: v(\S+?))? and \d+ (?:plugins?|more [a-z ]+?)(?: v(\S+?))?(?=,| and | \(#\d+\)$|$)/g;
const inFamily = (app: string, version: string, subject: string) =>
  [...subject.matchAll(FAMILY)].some(([, root, rootVersion, shared]) => {
    if (!root) return false;
    if (app === root) return (rootVersion ?? shared) === version;
    return app.startsWith(`${root}-`) && (shared === undefined || shared === version);
  });

const familyRelease = (app: string, subject: string) => {
  const root = /^chore\(([^)]+)\): release v\d/.exec(subject)?.[1];
  return root !== undefined && root !== "release" && app.startsWith(`${root}-`);
};

// Older titles named versions without the v ("chore(release): api 0.0.3 brings ..."): both count.
export const cameWithRelease = ({ app, version, commit }: TagCandidate) => {
  const exact = `${literal(version)}(?![\\w.])`;
  return (
    new RegExp(`^chore\\(${literal(app)}\\): release v${exact}`).test(commit.subject) ||
    // A family's release names its root alone: each `root-*` came with it, at whatever version.
    familyRelease(app, commit.subject) ||
    (commit.subject.startsWith("chore(release):") &&
      (new RegExp(`(?:: |, | and )${literal(app)} v?${exact}`).test(commit.subject) ||
        // An early release titled by its count alone: the commit that changed the version is it.
        /^chore\(release\): \d+ (?:(?:web |mobile )?apps?|packages?|services?|tools?)(?: \(#\d+\))?$/.test(
          commit.subject,
        ) ||
        inFamily(app, version, commit.subject)))
  );
};

/** The tags and release notes still missing for the versions releases brought. */
export const releaseTags = (
  candidates: TagCandidate[],
  tags: Set<string>,
  notes: Set<string>,
  format: string = DEFAULT_TAG_FORMAT,
): ReleaseTag[] =>
  candidates
    .filter((candidate) => candidate.first === true || cameWithRelease(candidate))
    .flatMap(({ app, version, commit }) => {
      const tag = tagName(app, version, format);
      const needsTag = !tags.has(tag);
      const needsNotes = !notes.has(tag);
      return needsTag || needsNotes
        ? [{ app, version, tag, sha: commit.sha, needsTag, needsNotes }]
        : [];
    });

/** One version's section of a changesets CHANGELOG.md, used as its release notes. */
export const changelogSection = (changelog: string, version: string) => {
  const section = changelog.split(`\n## ${version}\n`)[1]?.split("\n## ")[0]?.trim();
  return section || `No changelog entry for ${version}.`;
};
