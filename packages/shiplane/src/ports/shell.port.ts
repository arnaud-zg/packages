export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  input?: string;
}

export interface ShellResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Every vendor tool this CLI drives (git, gh, eas, flyctl, wrangler) goes through here. */
export interface Shell {
  /** Runs and captures its output; a non-zero exit is a result, never an error. */
  capture: (command: string, args: readonly string[], options?: RunOptions) => Promise<ShellResult>;
  /** Runs in the person's terminal with its output shown; resolves with the exit status. */
  attach: (command: string, args: readonly string[], options?: RunOptions) => Promise<number>;
  /** A variable of this process's environment, such as a token a command needs. */
  env: (name: string) => string | undefined;
}

/** A command that exited non-zero, carrying all it printed so a failure can show why. */
export class CommandFailed extends Error {
  readonly output: string;

  constructor(message: string, output: string) {
    super(message);
    this.name = "CommandFailed";
    this.output = output;
  }
}
