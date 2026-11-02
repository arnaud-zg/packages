import type { AnyDeliveryAdapter } from "../modules/suggest";
import type { Files } from "../ports/files.port";
import type { Shell } from "../ports/shell.port";
import type { Output, Progress, Prompter } from "../ports/terminal.port";
import type { Release } from "./config/loadRelease";
import type { ReleaseContext } from "./context";

/** What setting a release up needs: the repository, the person, the adapters init can offer. */
export interface SetupContext {
  root: string;
  files: Files;
  shell: Shell;
  prompter: Prompter;
  output: Output;
  /** The official delivery adapters, offered to folders before any config exists. */
  adapters: AnyDeliveryAdapter[];
  /** Loads the release as the files now say. */
  load: () => Promise<Release>;
  /** Spinners while setup waits; plain steps when absent. */
  progress?: Progress;
  /** A release's context, for the rehearsal's plan; without it, the plan is not rehearsed. */
  compose?: (release: Release) => ReleaseContext;
}
