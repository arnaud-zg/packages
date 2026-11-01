import type { RunOptions, Shell, ShellResult } from "../../../ports/shell.port";

export interface ShellCall {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

/** A shell that runs nothing: it keeps every call and answers from what was seeded. */
export class RecordingShell implements Shell {
  readonly calls: ShellCall[] = [];
  private answers: { prefix: string; result: Partial<ShellResult>; once?: boolean }[] = [];
  private variables: Record<string, string> = {};

  seedEnv(variables: Record<string, string>) {
    this.variables = { ...this.variables, ...variables };
    return this;
  }

  env = (name: string) => this.variables[name];

  /** Answers every call whose `command args` line starts with `prefix`. */
  seed(prefix: string, result: Partial<ShellResult>) {
    this.answers.push({ prefix, result });
    return this;
  }

  /** Answers the next call starting with `prefix` only, ahead of what `seed` answers. */
  seedOnce(prefix: string, result: Partial<ShellResult>) {
    this.answers.unshift({ prefix, result, once: true });
    return this;
  }

  private answer(command: string, args: readonly string[], options: RunOptions): ShellResult {
    this.calls.push({ command, args: [...args], cwd: options.cwd, env: options.env });
    const line = [command, ...args].join(" ");
    const found = this.answers.find(({ prefix }) => line.startsWith(prefix));
    if (found?.once) this.answers.splice(this.answers.indexOf(found), 1);
    return { status: 0, stdout: "", stderr: "", ...found?.result };
  }

  capture = (command: string, args: readonly string[], options: RunOptions = {}) =>
    Promise.resolve(this.answer(command, args, options));

  attach = (command: string, args: readonly string[], options: RunOptions = {}) =>
    Promise.resolve(this.answer(command, args, options).status);
}
