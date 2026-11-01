import type { Release } from "../application/config/loadRelease";
import type { ReleaseContext, Services } from "../application/context";
import type { SetupContext } from "../application/setupContext";
import type { DisplayChoice } from "../domain/display";
import type { Open } from "../modules/module";
import type { Shell } from "../ports/shell.port";
import type { Output, Progress, Prompter } from "../ports/terminal.port";
import { nodeFiles } from "../adapters/files/node-files.adapter";
import { systemShell } from "../adapters/shell/system-shell.adapter";
import { terminalProgress } from "../adapters/terminal/terminal-progress.adapter";
import {
  onGitHubActions,
  systemClock,
  terminalOutput,
  terminalPrompter,
} from "../adapters/terminal/terminal.adapter";
import { loadRelease } from "../application/config/loadRelease";
import { resolveDisplay } from "../domain/display";
import { installedAdapters } from "./plugins";

/** Creates each port the flow runs on, for this repository. */
export const composeServices = (release: Release, open: Open): Services => ({
  sourceControl: open(release.flow.sourceControl),
  codeHost: open(release.flow.codeHost),
  ciPipeline: open(release.flow.ciPipeline),
  versioning: open(release.flow.versioning),
});

/** Ports created on demand, in this repository, through this shell. */
export const opener =
  (root: string, shell: Shell): Open =>
  (adapter) =>
    adapter.create({ root, shell });

/** What a run may take instead of this machine's: a scripted person, a recorded terminal or shell. */
export interface ContextIo {
  prompter?: Prompter;
  output?: Output;
  progress?: Progress;
  shell?: Shell;
  /** Where `shiplane` resolves from inside the config. */
  aliases?: Record<string, string>;
}

/** A context wired to this machine: its shell, its terminal, its clock, unless `io` says otherwise. */
export const composeContext = (
  release: Release,
  { yes, display: flags }: { yes: boolean; display: DisplayChoice },
  io: ContextIo = {},
): ReleaseContext => {
  const ci = onGitHubActions() || systemShell.env("CI") === "true";
  const tty = Boolean(process.stdout.isTTY);
  const display = resolveDisplay(release.display ?? {}, flags, {
    tty,
    ci,
    noMotion: Boolean(systemShell.env("NO_MOTION")),
  });
  const shell = io.shell ?? systemShell;
  const output = io.output ?? terminalOutput;
  const open = opener(release.root, shell);
  return {
    release,
    load: () => loadRelease(release.root, { aliases: io.aliases }),
    services: composeServices(release, open),
    open,
    prompter: io.prompter ?? terminalPrompter(display),
    output,
    progress: io.progress ?? terminalProgress(display, tty && !ci),
    clock: systemClock,
    shell,
    options: { yes, ci: onGitHubActions() },
  };
};

/** What init, add, doctor and the rest need: the repository on disk and the adapters installed. */
export const composeSetup = async (root: string): Promise<SetupContext> => {
  const ci = onGitHubActions() || systemShell.env("CI") === "true";
  const tty = Boolean(process.stdout.isTTY);
  const display = resolveDisplay(
    {},
    { mascot: false },
    {
      tty,
      ci,
      noMotion: Boolean(systemShell.env("NO_MOTION")),
    },
  );
  return {
    root,
    files: nodeFiles(root),
    shell: systemShell,
    prompter: terminalPrompter(),
    output: terminalOutput,
    adapters: await installedAdapters(root),
    load: () => loadRelease(root),
    progress: terminalProgress(display, tty && !ci),
    compose: (release) => composeContext(release, { yes: true, display: { mascot: false } }),
  };
};
