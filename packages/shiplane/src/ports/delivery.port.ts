import type { PlannedChangeset } from "../domain/changes";
import type { Environment } from "../domain/environment";
import type { ReleaseUnit } from "../domain/unit";
import type { Adapter } from "./adapter.port";
import type { CiPipelinePort } from "./ci-pipeline.port";
import type { CodeHostPort } from "./code-host.port";
import type { Shell } from "./shell.port";
import type { SourceControlPort } from "./source-control.port";
import type { Choice } from "./terminal.port";

/** One command, as data: run here, printed by a dry run, mirrored by a CI workflow. */
export interface Command {
  command: string;
  args: string[];
  /** Relative to the repository root; the root itself when absent. */
  cwd?: string;
  env?: Record<string, string>;
  /** Variables passed as `<flag> NAME=value` when set; a plan shows only `NAME=$NAME`. */
  secrets?: { flag: string; name: string }[];
}

/** What shipping one tag to one environment takes. Built, never run, by an adapter. */
export interface Job {
  /** What a person reads: "deploy api@0.4.2 to acme-api-preview (Fly)". */
  label: string;
  /** The commands this machine runs, in order. */
  local: Command[];
  /** The ref the CI pipeline's ship workflow runs these commands from; absent when only here can. */
  ci?: { ref: string };
  /** Record the deploy in the host's deploy records once it ran from this machine. */
  record?: boolean;
  /** Runs after `local` whether it failed or not, such as putting a manifest back. */
  cleanup?: Command[];
}

/** What an adapter is told when asked for its jobs. */
export interface JobInput<Options> {
  unit: ReleaseUnit;
  /** The tag being shipped: `<unit>@<version>`. */
  tag: string;
  environment: Environment;
  /** The unit's options for that environment, per-environment values picked, references filled. */
  options: Options;
  /** The commit this machine is on. */
  commit: string;
}

/** What a module's per-app stages may read and run. */
export interface DecideContext {
  root: string;
  shell: Shell;
  sourceControl: SourceControlPort;
  codeHost: CodeHostPort;
  ciPipeline: CiPipelinePort;
  units: readonly ReleaseUnit[];
  /** How a tag names a version, such as `{name}@{version}`. */
  tagFormat: string;
  /** Every file a release may move after a tag without changing what ships. */
  versionFiles: ReadonlySet<string>;
  /** The files changed between two commits that can reach what a unit ships. */
  changedCode: (unit: ReleaseUnit, from: string, to: string) => Promise<string[]>;
  now: () => Date;
  /** The port an adapter gives, created for this repository. */
  open: <Port>(adapter: Adapter<Port>) => Port;
}

/** How a version does where it runs, as its platform reports it. */
export interface Health {
  ok: boolean;
  /** What was measured, as a person reads it: "iOS 3 launches, 0 crashes". */
  summary: string;
  /** Why it looks unwell, when it does. */
  why?: string;
}

/** What a failure says, and what to run next. */
export interface Refusal {
  title: string;
  detail: string;
  commands: string[];
}

/** What a unit needs on an environment, as its adapter decides. */
export type Decision =
  /**
   * Ship: a build, a submit or a publish runs from here; an update or a deploy asks how.
   * `notLocal` says why this machine cannot ship it, leaving GitHub Actions.
   */
  | {
      action: "ship";
      kind: "build" | "submit" | "publish" | "update" | "deploy";
      jobs: Job[];
      notLocal?: string;
    }
  /** Nothing to do; the status says why. */
  | { action: "none"; status: string }
  /**
   * A move only a person picks, such as how far a rollout goes: `lines` say where it stands, then
   * the question; an option with no jobs ships nothing and says `held`.
   */
  | {
      action: "choose";
      lines: string[];
      question: string;
      suggested: string;
      options: (Choice<string> & { jobs: Job[] })[];
      held: string;
    }
  | ({ action: "fail" } & Refusal)
  /** A small PR has to merge first, such as moving a version; the adapter decides again after it. */
  | {
      action: "pull-request";
      question: string;
      branch: string;
      title: string;
      body: string;
      changesets: PlannedChangeset[];
      /** Writes its files and returns them, relative to the root. */
      write: () => Promise<string[]>;
    };

/** A question its detection answers first: the person sees why and may pick another option. */
export interface VersionChoice {
  question: string;
  options: Choice<string>[];
  suggested: string;
}

/** What an adapter adds to a release PR: changesets it writes, files it moves, what a person reads. */
export interface VersionContribution {
  blocked?: Refusal;
  /** Asked before the summary; the adapter runs again with the answer when it differs. */
  choice?: VersionChoice;
  added: PlannedChangeset[];
  writes: { label: string; run: () => Promise<void> }[];
  /** Lines under the unit in the summary. */
  summary: string[];
  /** The "On merge" cell of the release PR. */
  onMerge: string;
  /** A numbered step the release announces before anything runs. */
  step?: string;
}

/** A folder as `init` shows it to an adapter, to recognise what ships from it. */
export interface FolderView {
  /** Relative to the root. */
  dir: string;
  name: string;
  /** Entries directly in it. */
  files: string[];
  has: (file: string) => boolean;
  read: (file: string) => string | null;
}

/** What an adapter recognised in a folder. */
export interface Detection {
  /**
   * `found`: a file only this target uses. `likely`: a strong sign, such as a static build's
   * config. `possible`: a weak one, such as a Dockerfile. The strongest is suggested.
   */
  certainty: "found" | "likely" | "possible";
  /** What was seen, as a person reads it: "fly-preview.toml". */
  reason: string;
  /** Options read from what was seen; `questions` asks for the rest. */
  options: Record<string, unknown>;
}

/** An option `init` asks for when nothing in the folder said it. */
export interface Question {
  key: string;
  message: string;
  initial?: string;
}

/** A tool or sign-in an adapter needs, checked by `shiplane doctor`. */
export interface Requirement {
  label: string;
  /** Exits 0 when the requirement is met. */
  check: Command;
  /** What fixes it, offered to run. */
  fix?: Command;
}

/** A value per environment becomes the value itself, at any depth. */
export type Resolved<Value> = Value extends { preview: infer Inner; production: infer Inner }
  ? Resolved<Inner>
  : Value extends readonly (infer Item)[]
    ? Resolved<Item>[]
    : Value extends object
      ? { [Key in keyof Value]: Resolved<Value[Key]> }
      : Value;

/** What every delivery port does: say where a tag lands, and build the jobs that ship it. */
export interface Delivery<Options = Record<string, unknown>> {
  /** Where a tag lands, as a person reads it. */
  describe(input: JobInput<Options>): string;
  /** What shipping a tag runs: commands as data, never run by the adapter itself. */
  jobs(input: JobInput<Options>): Job[];
}
