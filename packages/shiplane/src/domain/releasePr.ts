import type { AppBump } from "./changes";

export interface OpenPr {
  number: number;
  url: string;
}

export type MergeMethod = "--squash" | "--merge" | "--rebase";

/** What the pull request page offers: the methods the repository allows, and the one it preselects. */
export interface MergeMethods {
  allowed: MergeMethod[];
  preselected: MergeMethod | null;
}

export type ReleaseStep =
  { step: "wait-merge"; prs: OpenPr[] } | { step: "release-pr" } | { step: "ship" };

/**
 * Where `pnpm shiplane` picks up, from what main and GitHub hold right now. A merged release is
 * tagged and shipped before the next one is opened.
 */
export const nextStep = ({
  pending,
  releasePrs,
  untagged,
  unreleased,
}: {
  pending: number;
  /** The open release PR, if any; older releases may have left one per app. */
  releasePrs: OpenPr[];
  /** Versions a merged release moved that have no tag or release notes yet. */
  untagged: number;
  /** Apps changed since their current version with no changeset naming them. */
  unreleased: number;
}): ReleaseStep => {
  if (releasePrs.length > 0) return { step: "wait-merge", prs: releasePrs };
  if ((pending > 0 || unreleased > 0) && untagged === 0) return { step: "release-pr" };
  return { step: "ship" };
};

// The tool's own name: a branch a person names chore/release-notes is never taken for one.
export const RELEASE_BRANCH_PREFIX = "shiplane/release-";

export const twoDigits = (value: number) => String(value).padStart(2, "0");

export const releaseBranchName = (now: Date) =>
  `${RELEASE_BRANCH_PREFIX}${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}-${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}`;

const sentence = (items: string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

const MAX_LINE = 100;

/** One app's release commit: `chore(api): release v0.0.4`. */
export const releaseCommitTitle = ({ app, to }: AppBump) => `chore(${app}): release v${to}`;

// commitlint caps a header at 100; a squash merge appends " (#12345)", so a title keeps 9 spare.
export const MAX_TITLE = MAX_LINE - " (#12345)".length;

const counted = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Each app's module kind, so a title calls services services and packages plugins. */
export type KindOf = (app: string) => string | undefined;

/** What a title calls a unit of each module kind; several kinds at once are apps. */
const NOUN: Record<string, string> = {
  "published-package": "package",
  "backend-service": "service",
  "web-app": "web app",
  "mobile-app": "mobile app",
  "internal-tool": "tool",
};

/**
 * The apps, gathered into families in their own order: a root moving with its `root-*` apps
 * (`shiplane`, `shiplane-npm`) is one family; any other app is a family of one.
 */
export const releaseFamilies = (bumps: AppBump[]): AppBump[][] => {
  const roots = bumps.filter(
    ({ app }) => !bumps.some((other) => other.app !== app && app.startsWith(`${other.app}-`)),
  );
  return roots.map((root) =>
    bumps.filter(({ app }) => app === root.app || app.startsWith(`${root.app}-`)),
  );
};

/** One family as a title names it: `api v0.0.4`, `shiplane and 7 plugins v0.1.0`, `api v0.3.0 and 2 more services`. */
const familyLabel = ([root, ...members]: AppBump[], kindOf: KindOf) => {
  if (!root) return "";
  // One member is clearer named than counted: `api v0.3.0, api-worker v0.3.0`.
  if (members.length < 2)
    return [root, ...members].map(({ app, to }) => `${app} v${to}`).join(", ");
  const kinds = new Set([root, ...members].map(({ app }) => kindOf(app)));
  const [kind] = kinds;
  const noun = (kinds.size === 1 && kind && NOUN[kind]) || "app";
  // A package's siblings extend it: plugins. Siblings of anything else are more of it.
  const rest =
    noun === "package"
      ? counted(members.length, "plugin")
      : `${members.length} more ${counted(members.length, noun).replace(/^\d+ /, "")}`;
  return members.every(({ to }) => to === root.to)
    ? `${root.app} and ${rest} v${root.to}`
    : `${root.app} v${root.to} and ${rest}`;
};

/**
 * The release PRs a release opens, all from main at once: one per app, a family counting as one.
 * Apps `linked` (one changeset naming both, or one moving with the other) share a PR, so no two
 * PRs ever touch the same file.
 */
export const releasePrGroups = (
  bumps: AppBump[],
  linked: readonly (readonly string[])[],
): AppBump[][] => {
  const groups = releaseFamilies(bumps).map((family) => new Set(family.map(({ app }) => app)));
  const merged = linked.reduce((current, apps) => {
    const touched = current.filter((group) => apps.some((app) => group.has(app)));
    if (touched.length < 2) return current;
    const union = new Set(touched.flatMap((group) => [...group]));
    return [...current.filter((group) => !touched.includes(group)), union];
  }, groups);
  // Kept in the release's own order, by each group's first app.
  const order = (group: Set<string>) => bumps.findIndex(({ app }) => group.has(app));
  return merged
    .sort((left, right) => order(left) - order(right))
    .map((group) => bumps.filter(({ app }) => group.has(app)));
};

/** Whether a title still fits once a squash merge appends its PR number. */
export const titleFits = (title: string) => title.length <= MAX_TITLE;

/**
 * Conventional, and naming every app it brings, never a bare count: `chore(api): release v0.0.4`,
 * `chore(release): api v0.0.2 and admin v0.1.0`, or, when listing each one is too long, families
 * by their root: `chore(release): shiplane and 7 plugins v0.1.0, landing v1.2.0 and expo v2.1.0`.
 * One release is one PR: a title too long even then stays whole, see `titleFits`.
 */
export const releaseTitle = (bumps: AppBump[], kindOf: KindOf = () => undefined) => {
  const [first, ...others] = bumps;
  if (!first) return "chore(release): package changelogs";
  if (others.length === 0) return releaseCommitTitle(first);
  // One family is one app's release: `chore(shiplane): release v0.1.0`, its plugins in the body.
  const families = releaseFamilies(bumps);
  const [only] = families;
  if (families.length === 1 && only?.[0]) return releaseCommitTitle(only[0]);
  const every = `chore(release): ${sentence(bumps.map(({ app, to }) => `${app} v${to}`))}`;
  if (titleFits(every)) return every;
  // Families first: their own "and" never runs into the list's last one.
  families.sort((left, right) => Number(right.length > 1) - Number(left.length > 1));
  const labels = families.map((family) => familyLabel(family, kindOf));
  // Two families end the list: commas alone keep "a and 2 more and b and 7 plugins" from happening.
  const list = labels.at(-1)?.includes(" and ") ? labels.join(", ") : sentence(labels);
  return `chore(release): ${list}`;
};

/** A bullet wrapped to commitlint's 100-character body lines, continued under its text. */
const bullet = (text: string) =>
  text
    .split(" ")
    .reduce<string[]>((lines, word) => {
      const last = lines.at(-1);
      if (last !== undefined && `${last} ${word}`.length <= MAX_LINE) {
        return [...lines.slice(0, -1), `${last} ${word}`];
      }
      return [...lines, `${last === undefined ? "-" : " "} ${word}`];
    }, [])
    .join("\n");

/** The release commit's body: each app's version, then what its users get. */
export const releaseCommitBody = (bumps: AppBump[]) =>
  bumps
    .map(({ app, to, notes, movedWith }) => {
      const lines =
        notes.length > 0
          ? notes
          : movedWith.length > 0
            ? [`Moves with ${movedWith.join(", ")}.`]
            : [];
      return [`${app} ${to}`, ...lines.map(bullet)].join("\n");
    })
    .join("\n\n");

/** The release PR's body; `onMerge` says what happens to each unit once it is merged. */
export const releasePrBody = (bumps: AppBump[], onMerge: (bump: AppBump) => string) => {
  const appWidth = Math.max(3, ...bumps.map(({ app }) => app.length));
  const versionWidth = Math.max(7, ...bumps.map(({ from, to }) => `${from} → ${to}`.length));
  const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const table = [
    row(["App".padEnd(appWidth), "Version".padEnd(versionWidth), "On merge"]),
    row(["-".repeat(appWidth), "-".repeat(versionWidth), "--------"]),
    ...bumps.map((bump) =>
      row([
        bump.app.padEnd(appWidth),
        `${bump.from} → ${bump.to}`.padEnd(versionWidth),
        onMerge(bump),
      ]),
    ),
  ];
  const notes = bumps.flatMap(({ app, to, notes: lines }) =>
    lines.length > 0 ? ["", `### ${app} ${to}`, "", ...lines.map((line) => `- ${line}`)] : [],
  );
  return [
    "## 🎯 What & why",
    "",
    "Versions the changesets merged since the last release. Squash and merge it by hand: `pnpm shiplane`, still running or run again, tags and ships to preview once it is merged.",
    "",
    ...(bumps.length > 0 ? table : ["Internal packages only: changelogs, nothing ships."]),
    ...notes,
    "",
    "## ✅ Testing",
    "",
    "Versions, changelogs and version files only. No UI change.",
  ].join("\n");
};

const MERGE_BUTTON: { value: MergeMethod; label: string; hint: string }[] = [
  {
    value: "--merge",
    label: "Create a merge commit",
    hint: "every commit, joined by a merge commit",
  },
  { value: "--squash", label: "Squash and merge", hint: "the commits combined into one" },
  { value: "--rebase", label: "Rebase and merge", hint: "every commit, rebased onto main" },
];

/** The methods as GitHub's merge button lists them, preselected as the pull request page does. */
export const mergeChoices = ({ allowed, preselected }: MergeMethods) => {
  const choices = MERGE_BUTTON.filter(({ value }) => allowed.includes(value));
  const initial = preselected && allowed.includes(preselected) ? preselected : choices[0]?.value;
  return { choices, initial };
};

export type WaitAction = "diff" | "merge" | "open";

const WAIT_KEYS: Record<string, WaitAction> = { d: "diff", m: "merge", o: "open" };

/** What a key does while the release waits for its pull request to merge. */
export const waitKey = (name: string | undefined): WaitAction | null =>
  (name && WAIT_KEYS[name]) || null;
