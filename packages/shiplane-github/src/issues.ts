import type { Environment, IssueRef, LinkedPr } from "shiplane/plugin";
import {
  compareVersions,
  DEFAULT_TAG_FORMAT,
  isReleaseSubject,
  issueName,
  tagName,
} from "shiplane/plugin";

/** The tag a unit had before this version, by version order. Null for its first release. */
export const previousTag = (
  tags: ReadonlySet<string>,
  unit: string,
  version: string,
  format: string = DEFAULT_TAG_FORMAT,
) => {
  const [before = "", after = ""] = tagName(unit, "\0", format).split("\0");
  const [newest] = [...tags]
    .filter((tag) => tag.startsWith(before) && tag.endsWith(after))
    .map((tag) => tag.slice(before.length, tag.length - after.length))
    .filter((candidate) => /^\d/.test(candidate) && compareVersions(candidate, version) < 0)
    .sort((left, right) => compareVersions(right, left));
  return newest === undefined ? null : tagName(unit, newest, format);
};

/** The pull requests squash-merged as these subjects (`... (#1912)`), release PRs aside. */
export const pullRequestNumbers = (subjects: readonly string[]): number[] => [
  ...new Set(
    subjects.flatMap((subject) => {
      const found = /\(#(\d+)\)\s*$/.exec(subject)?.[1];
      return found && !isReleaseSubject(subject) ? [Number(found)] : [];
    }),
  ),
];

const sameIssue = (left: IssueRef, right: IssueRef) =>
  left.repository === right.repository && left.number === right.number;

/**
 * What GitHub says a PR closes, plus the template's commented `<!-- Ticket: owner/name#123 -->`
 * line. In that line a bare `#123` counts only right after `Ticket:`: later ones are stacked PRs.
 */
export const relatedIssues = (pr: LinkedPr): IssueRef[] => {
  const ticket = /<!--\s*Ticket:([\s\S]*?)-->/.exec(pr.body)?.[1] ?? "";
  const named = [...ticket.matchAll(/([\w.-]+\/[\w.-]+)#(\d+)/g)].map(([, repository, number]) => ({
    repository: repository ?? pr.repository,
    number: Number(number),
  }));
  const bare = /^\s*#(\d+)\b/.exec(ticket)?.[1];
  const all = [
    ...pr.closes,
    ...named,
    ...(bare ? [{ repository: pr.repository, number: Number(bare) }] : []),
  ];
  return all.filter((issue, index) => all.findIndex((other) => sameIssue(issue, other)) === index);
};

/** The hidden line that says a comment was already posted for this tag on this environment. */
export const releaseMarker = (tag: string, environment: Environment) =>
  `<!-- shiplane-release: ${tag} ${environment} -->`;

const mentions = (about: IssueRef, kind: "pr" | "issue", refs: readonly IssueRef[]) => {
  if (refs.length === 0) return "";
  const links = refs
    .map((ref) => (ref.repository === about.repository ? `#${ref.number}` : issueName(ref)))
    .join(", ");
  const word = kind === "pr" ? "PR" : refs.length > 1 ? "issues" : "issue";
  return `, ${word} ${links}`;
};

/**
 * What a PR or an issue reads once a release it went into ships: short, in English.
 * An issue names its PRs, a PR names its issues.
 */
export const releaseComment = ({
  about,
  unit,
  version,
  environment,
  mention,
}: {
  about: IssueRef;
  unit: string;
  version: string;
  environment: Environment;
  mention: { kind: "pr" | "issue"; refs: readonly IssueRef[] };
}) =>
  `🚀 Released to **${environment}** in version **${version}** (${unit}${mentions(about, mention.kind, mention.refs)}).\n\n${releaseMarker(tagName(unit, version), environment)}`;
