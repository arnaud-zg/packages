import type { DeployState } from "../domain/deploys";
import type { Environment } from "../domain/environment";
import type { IssueRef, LinkedPr } from "../domain/issues";
import type { MergeMethod, MergeMethods, OpenPr } from "../domain/releasePr";

export interface Deploy {
  /** The run title every deploy records: `Deploy <tag> to <environment>`. */
  title: string;
  state: DeployState;
}

/** Where pull requests, comments, release notes and deploy records live. */
export interface CodeHostPort {
  /** Open pull requests whose branch starts with the prefix, oldest first. */
  openPrsFrom: (branchPrefix: string) => Promise<OpenPr[]>;
  createPr: (pr: {
    base: string;
    head: string;
    title: string;
    body: string;
    label: string;
  }) => Promise<OpenPr>;
  prState: (pr: OpenPr) => Promise<"OPEN" | "MERGED" | "CLOSED">;
  closePr: (pr: OpenPr, comment: string) => Promise<void>;
  mergeMethods: () => Promise<MergeMethods>;
  merge: (pr: OpenPr, method: MergeMethod) => Promise<void>;
  showDiff: (pr: OpenPr) => Promise<void>;
  openInBrowser: (pr: OpenPr) => Promise<void>;
  /** Tags that already have release notes. */
  releasedTags: () => Promise<Set<string>>;
  createRelease: (tag: string, notes: string, latest: boolean) => Promise<void>;
  /** Every deploy recorded for a tag, by a workflow or by this machine. */
  deployments: () => Promise<Deploy[]>;
  recordDeployment: (ref: string, environment: Environment) => Promise<void>;
  /** Each pull request's body and the issues it closes, in the order asked, read in one go. */
  pullRequests: (numbers: readonly number[]) => Promise<LinkedPr[]>;
  /** The recent comments of each issue or pull request, in the order asked, read in one go. */
  comments: (on: readonly IssueRef[]) => Promise<string[][]>;
  /** Posts a comment on an issue or a pull request, paced so a burst stays under the host's limits. */
  comment: (on: IssueRef, body: string) => Promise<void>;
}
