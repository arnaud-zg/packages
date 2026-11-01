import type { Open } from "../modules/module";
import type { CiPipelinePort } from "../ports/ci-pipeline.port";
import type { CodeHostPort } from "../ports/code-host.port";
import type { Shell } from "../ports/shell.port";
import type { SourceControlPort } from "../ports/source-control.port";
import type { Clock, Output, Progress, Prompter } from "../ports/terminal.port";
import type { VersioningPort } from "../ports/versioning.port";
import type { Release } from "./config/loadRelease";

/** Everything a use case reads and drives: the release as written, its services, the person. */
export interface ReleaseContext {
  release: Release;
  /** Reads the release from disk again: a pull moves the versions a merged release PR brought. */
  load: () => Promise<Release>;
  services: Services;
  /** Creates the port an adapter gives, for this repository. */
  open: Open;
  prompter: Prompter;
  output: Output;
  /** Where the release is: its stage, what it reads or runs, the mascot's mood. */
  progress: Progress;
  clock: Clock;
  /** Runs the jobs plugins return, when they run from this machine. */
  shell: Shell;
  options: {
    /** Answers yes to every confirmation; production never accepts it. */
    yes: boolean;
    /** Running inside GitHub Actions: a ship runs on this runner, never dispatching another. */
    ci: boolean;
  };
}

/** The ports the release flow runs on. */
export interface Services {
  sourceControl: SourceControlPort;
  codeHost: CodeHostPort;
  ciPipeline: CiPipelinePort;
  versioning: VersioningPort;
}
