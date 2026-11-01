import type { Environment } from "../../../domain/environment";
import type { IssueRef, LinkedPr } from "../../../domain/issues";
import type { MergeMethod, MergeMethods, OpenPr } from "../../../domain/releasePr";
import type { ServiceAdapter } from "../../../ports/adapter.port";
import type { CodeHostPort, Deploy } from "../../../ports/code-host.port";
import { issueName } from "../../../domain/issues";

interface HostState {
  openPrs: { branch: string; pr: OpenPr }[];
  /** States a pull request goes through, one per poll; the last one stays. */
  prStates: Record<number, ("OPEN" | "MERGED" | "CLOSED")[]>;
  /** The merge methods the repository allows, and the one its pull request page preselects. */
  merges: MergeMethods;
  releasedTags: string[];
  deployments: Deploy[];
  nextPrNumber: number;
  /** Merged pull requests by number, as a release reads their linked issues. */
  pullRequests: Record<number, LinkedPr>;
  /** `owner/name#123` → the text of its comments. */
  comments: Record<string, string[]>;
}

export type HostEvent =
  | {
      type: "pr";
      pr: OpenPr;
      base: string;
      head: string;
      title: string;
      body: string;
      label: string;
    }
  | { type: "merge"; pr: OpenPr; method: MergeMethod }
  | { type: "close"; pr: OpenPr; comment: string }
  | { type: "release"; tag: string; notes: string; latest: boolean }
  | { type: "record"; ref: string; environment: Environment }
  | { type: "comment"; issue: string; body: string };

/** A code host held in memory: seed its pull requests and deploys, read back what it received. */
export class CodeHostFake implements CodeHostPort {
  private state: HostState = {
    openPrs: [],
    prStates: {},
    merges: { allowed: ["--squash", "--merge", "--rebase"], preselected: "--squash" },
    releasedTags: [],
    deployments: [],
    nextPrNumber: 1800,
    pullRequests: {},
    comments: {},
  };

  readonly received: HostEvent[] = [];
  /** Each pull request number, once per state check. */
  readonly polled: number[] = [];
  /** Each batched read of pull requests or comments, in order. */
  readonly reads: ("pull-requests" | "comments")[] = [];

  seed(state: Partial<HostState>) {
    this.state = { ...this.state, ...state };
    return this;
  }

  openPrsFrom = (branchPrefix: string) =>
    Promise.resolve(
      this.state.openPrs
        .filter(({ branch }) => branch.startsWith(branchPrefix))
        .map(({ pr }) => pr),
    );

  createPr = (pr: { base: string; head: string; title: string; body: string; label: string }) => {
    const number = this.state.nextPrNumber++;
    const created = { number, url: `https://github.com/acme/repo/pull/${number}` };
    this.received.push({ type: "pr", pr: created, ...pr });
    this.state.openPrs.push({ branch: pr.head, pr: created });
    return Promise.resolve(created);
  };

  private closeError: Error | null = null;

  /** Every pull request close throws `error`. */
  failClose(error: Error) {
    this.closeError = error;
    return this;
  }

  closePr = (pr: OpenPr, comment: string) => {
    if (this.closeError) return Promise.reject(this.closeError);
    this.received.push({ type: "close", pr, comment });
    this.state.openPrs = this.state.openPrs.filter((open) => open.pr.number !== pr.number);
    this.state.prStates[pr.number] = ["CLOSED"];
    return Promise.resolve();
  };

  prState = (pr: OpenPr) => {
    this.polled.push(pr.number);
    const states = this.state.prStates[pr.number] ?? ["OPEN"];
    const [state = "OPEN", ...rest] = states;
    if (rest.length > 0) this.state.prStates[pr.number] = rest;
    return Promise.resolve(state);
  };

  mergeMethods = () => Promise.resolve(this.state.merges);

  merge = (pr: OpenPr, method: MergeMethod) => {
    this.received.push({ type: "merge", pr, method });
    this.state.prStates[pr.number] = ["MERGED"];
    return Promise.resolve();
  };

  showDiff = () => Promise.resolve();
  openInBrowser = () => Promise.resolve();
  releasedTags = () => Promise.resolve(new Set(this.state.releasedTags));

  private releaseError: Error | null = null;

  /** Every release notes publish throws `error`. */
  failRelease(error: Error) {
    this.releaseError = error;
    return this;
  }

  createRelease = (tag: string, notes: string, latest: boolean) => {
    if (this.releaseError) return Promise.reject(this.releaseError);
    this.received.push({ type: "release", tag, notes, latest });
    this.state.releasedTags.push(tag);
    return Promise.resolve();
  };

  deployments = () => Promise.resolve(this.state.deployments);

  recordDeployment = (ref: string, environment: Environment) => {
    this.received.push({ type: "record", ref, environment });
    this.state.deployments.push({ title: `Deploy ${ref} to ${environment}`, state: "done" });
    return Promise.resolve();
  };

  pullRequests = (numbers: readonly number[]) => {
    this.reads.push("pull-requests");
    const missing = numbers.find((number) => !this.state.pullRequests[number]);
    if (missing !== undefined) return Promise.reject(new Error(`no pull request #${missing}`));
    return Promise.resolve(numbers.flatMap((number) => this.state.pullRequests[number] ?? []));
  };

  comments = (on: readonly IssueRef[]) => {
    this.reads.push("comments");
    return Promise.resolve(on.map((ref) => this.state.comments[issueName(ref)] ?? []));
  };

  private commentError: Error | null = null;

  /** Every comment throws `error`. */
  failComment(error: Error) {
    this.commentError = error;
    return this;
  }

  comment = (on: IssueRef, body: string) => {
    if (this.commentError) return Promise.reject(this.commentError);
    this.received.push({ type: "comment", issue: issueName(on), body });
    this.state.comments[issueName(on)] = [...(this.state.comments[issueName(on)] ?? []), body];
    return Promise.resolve();
  };
}

/** The Fake as a config holds an adapter; `.fake` is what a test seeds and reads. */
export const codeHostFake = (
  fake = new CodeHostFake(),
): ServiceAdapter<CodeHostPort> & { fake: CodeHostFake } => ({
  name: "fake",
  create: () => fake,
  fake,
});
