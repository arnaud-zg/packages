import type {
  AfterShipContext,
  CodeHostPort,
  Feature,
  FollowUp,
  IssueRef,
  ServiceAdapter,
  Shipped,
  SourceControlPort,
} from "shiplane/plugin";
import { issueName } from "shiplane/plugin";

import {
  previousTag,
  pullRequestNumbers,
  relatedIssues,
  releaseComment,
  releaseMarker,
} from "./issues";

export interface ReleaseCommentsOptions {
  /** Where the pull requests and issues live, and where the comments go. */
  codeHost: ServiceAdapter<CodeHostPort>;
  /** Where the tags are, to find the version a ship follows. */
  sourceControl: ServiceAdapter<SourceControlPort>;
  /** The apps whose ships comment; every app when absent. */
  apps?: string[];
}

/** Each merged PR with the issues it relates to, all read in one go. */
const linkedPrs = async (codeHost: CodeHostPort, prs: readonly number[]) =>
  prs.length === 0
    ? []
    : (await codeHost.pullRequests(prs)).map((pr) => ({
        pr: { repository: pr.repository, number: pr.number },
        issues: relatedIssues(pr),
      }));

/** Each issue those PRs relate to, with its PRs, in the order they were found. */
const issuesOf = (linked: readonly { pr: IssueRef; issues: IssueRef[] }[]) => {
  const found = new Map<string, { issue: IssueRef; prs: IssueRef[] }>();
  for (const { pr, issues } of linked) {
    for (const issue of issues) {
      const entry = found.get(issueName(issue)) ?? { issue, prs: [] };
      entry.prs.push(pr);
      found.set(issueName(issue), entry);
    }
  }
  return [...found.values()];
};

const followUps = async (
  codeHost: CodeHostPort,
  context: AfterShipContext,
  tags: ReadonlySet<string>,
  { unit, tag, environment }: Shipped,
): Promise<FollowUp[]> => {
  const from = previousTag(tags, unit.name, unit.version, context.tagFormat);
  if (!from) return [];
  const numbers = pullRequestNumbers(await context.subjectsReaching(unit, from, tag));
  const linked = await linkedPrs(
    codeHost,
    numbers.sort((left, right) => left - right),
  );
  const targets = [
    ...linked.map(({ pr, issues }) => ({
      about: pr,
      mention: { kind: "issue" as const, refs: issues },
    })),
    ...issuesOf(linked).map(({ issue, prs }) => ({
      about: issue,
      mention: { kind: "pr" as const, refs: prs },
    })),
  ];
  const marker = releaseMarker(tag, environment);
  const existing =
    targets.length === 0 ? [] : await codeHost.comments(targets.map(({ about }) => about));
  const pending = targets.filter(
    (_, index) => !existing[index]?.some((comment) => comment.includes(marker)),
  );
  return pending.map(({ about, mention }) => ({
    label: `comment on ${issueName(about)}: ${tag} on ${environment}`,
    run: () =>
      codeHost.comment(
        about,
        releaseComment({ about, unit: unit.name, version: unit.version, environment, mention }),
      ),
  }));
};

/** Tells every PR a shipped version holds, and every issue they relate to, that it is out: once per tag and environment. */
export const releaseComments = ({
  codeHost,
  sourceControl,
  apps,
}: ReleaseCommentsOptions): Feature => ({
  type: "feature",
  name: "release-comments",
  adapters: [codeHost, sourceControl],
  requirements: () => [
    ...(codeHost.requirements?.() ?? []),
    ...(sourceControl.requirements?.() ?? []),
  ],
  afterShip: async (context, shipped) => {
    const picked = shipped.filter(({ unit }) => !apps || apps.includes(unit.name));
    if (picked.length === 0) return [];
    const host = context.open(codeHost);
    const tags = await context.open(sourceControl).tags();
    const all: FollowUp[] = [];
    for (const entry of picked) all.push(...(await followUps(host, context, tags, entry)));
    return all;
  },
});
