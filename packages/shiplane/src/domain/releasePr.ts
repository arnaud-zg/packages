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
const MAX_TITLE = MAX_LINE - " (#12345)".length;

const counted = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The app every other one is named after (`shiplane` for `shiplane-npm`), when there is one. */
const familyRoot = (bumps: AppBump[]) =>
  bumps.find(({ app }) =>
    bumps.every((bump) => bump.app === app || bump.app.startsWith(`${app}-`)),
  );

/**
 * Conventional and always within 91 characters, tried from most to least telling:
 * `chore(api): release v0.0.4`, `chore(release): api v0.0.2 and admin v0.1.0`,
 * `chore(release): shiplane and 7 plugins v0.1.0`, `chore(release): shiplane v0.2.0 and 7 plugins`,
 * then `chore(release): 8 packages`. The commit body names every version either way.
 */
export const releaseTitle = (bumps: AppBump[]) => {
  const [first, ...others] = bumps;
  if (!first) return "chore(release): package changelogs";
  const root = familyRoot(bumps);
  const plugins = counted(others.length, "plugin");
  const tries = [
    others.length === 0
      ? releaseCommitTitle(first)
      : `chore(release): ${sentence(bumps.map(({ app, to }) => `${app} v${to}`))}`,
    root && others.length > 0 && bumps.every(({ to }) => to === root.to)
      ? `chore(release): ${root.app} and ${plugins} v${root.to}`
      : null,
    root && others.length > 0 ? `chore(release): ${root.app} v${root.to} and ${plugins}` : null,
  ];
  return (
    tries.find((title): title is string => title !== null && title.length <= MAX_TITLE) ??
    `chore(release): ${counted(bumps.length, "package")}`
  );
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
