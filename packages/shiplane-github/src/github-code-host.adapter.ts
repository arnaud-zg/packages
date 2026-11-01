import type { CodeHostPort, ServiceAdapter, Shell } from "shiplane/plugin";
import { deployRunTitle, deployState, z } from "shiplane/plugin";

import { ghCli, sleep } from "./gh-cli";

const OpenPrsSchema = z.array(
  z.object({ number: z.number(), url: z.string(), headRefName: z.string() }),
);
const PrSchema = z.object({ number: z.number(), url: z.string() });
const PrStateSchema = z.object({ state: z.enum(["OPEN", "MERGED", "CLOSED"]) });
const METHOD = { MERGE: "--merge", SQUASH: "--squash", REBASE: "--rebase" } as const;
const RepoMergeSchema = z.object({
  data: z.object({
    repository: z.object({
      mergeCommitAllowed: z.boolean(),
      squashMergeAllowed: z.boolean(),
      rebaseMergeAllowed: z.boolean(),
      viewerDefaultMergeMethod: z.enum(["MERGE", "SQUASH", "REBASE"]),
    }),
  }),
});
const ReleaseListSchema = z.array(z.object({ tagName: z.string() }));
const DeploymentsSchema = z.object({
  data: z.object({
    repository: z.object({
      deployments: z.object({
        nodes: z.array(
          z.object({
            environment: z.string().nullish(),
            state: z.string().nullish(),
            ref: z.object({ name: z.string() }).nullish(),
          }),
        ),
      }),
    }),
  }),
});
const LinkedPrSchema = z.object({
  number: z.number(),
  url: z.string(),
  body: z.string(),
  closingIssuesReferences: z.object({
    nodes: z.array(
      z.object({
        number: z.number(),
        repository: z.object({ name: z.string(), owner: z.object({ login: z.string() }) }),
      }),
    ),
  }),
});
const CommentsSchema = z.object({
  comments: z.object({ nodes: z.array(z.object({ body: z.string() })) }),
});
// GraphQL answers aliases in the order they were asked, so Object.values reads them back in order.
const PullRequestsSchema = z.object({
  data: z.object({ repository: z.record(z.string(), LinkedPrSchema.nullable()) }),
});
const IssueCommentsSchema = z.object({
  data: z.record(z.string(), z.object({ issueOrPullRequest: CommentsSchema.nullable() })),
});
// GitHub asks for a second between content-creating calls, or its secondary rate limit trips.
const POST_GAP_MS = 1000;
const LINKED_PR_FIELDS = `number url body closingIssuesReferences(first: 20) { nodes { number repository { name owner { login } } } }`;
const COMMENT_FIELDS = `comments(last: 100) { nodes { body } }`;
// The method GitHub's merge button preselects: the viewer's last one, or the repository default.
const MERGE_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed viewerDefaultMergeMethod
  }
}`;
const DEPLOYMENTS_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    deployments(environments: ["preview", "production"], first: 100, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes { environment state ref { name } }
    }
  }
}`;

export const githubHost = (root: string, shell: Shell): CodeHostPort => {
  const { must, json } = ghCli(root, shell);
  const graphql = (query: string, variables: string[] = []) =>
    json(["api", "graphql", ...variables, "-f", `query=${query}`]);
  let lastPost = 0;

  return {
    openPrsFrom: async (branchPrefix) => {
      const prs = OpenPrsSchema.parse(
        await json([
          "pr",
          "list",
          "--state",
          "open",
          "--limit",
          "100",
          "--json",
          "number,url,headRefName",
        ]),
      );
      return prs
        .filter(({ headRefName }) => headRefName.startsWith(branchPrefix))
        .map(({ number, url }) => ({ number, url }))
        .sort((left, right) => left.number - right.number);
    },
    createPr: async ({ base, head, title, body, label }) => {
      // A fresh repository has none of shiplane's labels: gh refuses a PR with a missing one.
      await must(["label", "create", label, "--color", "ededed"]).catch((error: unknown) => {
        if (!(error instanceof Error && /already exists/i.test(error.message))) throw error;
      });
      await must([
        "pr",
        "create",
        "--base",
        base,
        "--head",
        head,
        "--title",
        title,
        "--body",
        body,
        "--label",
        label,
      ]);
      return PrSchema.parse(await json(["pr", "view", head, "--json", "number,url"]));
    },
    closePr: async (pr, comment) => {
      await must(["pr", "close", String(pr.number), "--comment", comment]);
    },
    prState: async (pr) =>
      PrStateSchema.parse(await json(["pr", "view", String(pr.number), "--json", "state"])).state,
    mergeMethods: async () => {
      const { repository } = RepoMergeSchema.parse(
        await json([
          "api",
          "graphql",
          "-F",
          "owner={owner}",
          "-F",
          "name={repo}",
          "-f",
          `query=${MERGE_QUERY}`,
        ]),
      ).data;
      const allowed = [
        repository.mergeCommitAllowed && METHOD.MERGE,
        repository.squashMergeAllowed && METHOD.SQUASH,
        repository.rebaseMergeAllowed && METHOD.REBASE,
      ].filter((method) => method !== false);
      return { allowed, preselected: METHOD[repository.viewerDefaultMergeMethod] };
    },
    merge: async (pr, method) => {
      await shell.attach("gh", ["pr", "merge", String(pr.number), method], { cwd: root });
    },
    showDiff: async (pr) => {
      await shell.attach("gh", ["pr", "diff", String(pr.number)], { cwd: root });
    },
    openInBrowser: async (pr) => {
      await shell.capture("gh", ["pr", "view", String(pr.number), "--web"], { cwd: root });
    },
    releasedTags: async () =>
      new Set(
        ReleaseListSchema.parse(
          await json(["release", "list", "--limit", "200", "--json", "tagName"]),
        ).map(({ tagName }) => tagName),
      ),
    createRelease: async (tag, notes, latest) => {
      await must([
        "release",
        "create",
        tag,
        "--verify-tag",
        "--title",
        tag,
        "--notes",
        notes,
        ...(latest ? [] : ["--latest=false"]),
      ]);
    },
    deployments: async () => {
      const { data } = DeploymentsSchema.parse(
        await json([
          "api",
          "graphql",
          "-F",
          "owner={owner}",
          "-F",
          "name={repo}",
          "-f",
          `query=${DEPLOYMENTS_QUERY}`,
        ]),
      );
      return data.repository.deployments.nodes.flatMap(({ environment, state, ref }) =>
        ref && state && (environment === "preview" || environment === "production")
          ? [{ title: deployRunTitle(ref.name, environment), state: deployState([state]) }]
          : [],
      );
    },
    recordDeployment: async (ref, environment) => {
      const created = z
        .object({ id: z.number() })
        .parse(
          JSON.parse(
            await must(
              ["api", "repos/{owner}/{repo}/deployments", "--method", "POST", "--input", "-"],
              JSON.stringify({ ref, environment, auto_merge: false, required_contexts: [] }),
            ),
          ),
        );
      await must([
        "api",
        `repos/{owner}/{repo}/deployments/${created.id}/statuses`,
        "--method",
        "POST",
        "-f",
        "state=success",
      ]);
    },
    pullRequests: async (numbers) => {
      const fields = numbers.map(
        (number, index) => `a${index}: pullRequest(number: ${number}) { ${LINKED_PR_FIELDS} }`,
      );
      const { data } = PullRequestsSchema.parse(
        await graphql(
          `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields.join(" ")} } }`,
          ["-F", "owner={owner}", "-F", "name={repo}"],
        ),
      );
      return Object.values(data.repository).map((pr, index) => {
        if (!pr) throw new Error(`no pull request #${numbers[index]}`);
        return {
          repository: new URL(pr.url).pathname.split("/").slice(1, 3).join("/"),
          number: pr.number,
          body: pr.body,
          closes: pr.closingIssuesReferences.nodes.map(({ number: issue, repository }) => ({
            repository: `${repository.owner.login}/${repository.name}`,
            number: issue,
          })),
        };
      });
    },
    comments: async (refs) => {
      const fields = refs.map(({ repository, number }, index) => {
        const [owner = "", name = ""] = repository.split("/");
        return `a${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { issueOrPullRequest(number: ${number}) { ... on Issue { ${COMMENT_FIELDS} } ... on PullRequest { ${COMMENT_FIELDS} } } }`;
      });
      const { data } = IssueCommentsSchema.parse(await graphql(`query { ${fields.join(" ")} }`));
      return Object.values(data).map(
        ({ issueOrPullRequest }) =>
          issueOrPullRequest?.comments.nodes.map(({ body }) => body) ?? [],
      );
    },
    comment: async ({ repository, number }, body) => {
      const wait = lastPost + POST_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastPost = Date.now();
      // The issues endpoint, not `gh issue comment`: it takes pull request numbers too.
      await must([
        "api",
        "-X",
        "POST",
        `repos/${repository}/issues/${number}/comments`,
        "-f",
        `body=${body}`,
      ]);
    },
  };
};

export type GitHubCodeHostAdapter = ServiceAdapter<CodeHostPort>;

/** Pull requests, comments, release notes and deploy records through the gh CLI. */
export const gitHubCodeHost = (): GitHubCodeHostAdapter => ({
  name: "github",
  requirements: () => [
    {
      label: "gh",
      check: { command: "gh", args: ["auth", "status"] },
      fix: { command: "gh", args: ["auth", "login"] },
    },
  ],
  create: ({ root, shell }) => githubHost(root, shell),
});
