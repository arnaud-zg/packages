import { execFile, spawn } from "node:child_process";

import type { RunOptions, Shell } from "../../ports/shell.port";
import { liveLine } from "../terminal/live-line";

// eas prints megabytes of fingerprint JSON: the default 1 MB buffer is far too small.
const MAX_BUFFER = 256 * 1024 * 1024;

// The tools this CLI drives read their own variables (GH_TOKEN, EXPO_TOKEN, FLY_API_TOKEN).

const environment = (options: RunOptions) => ({ ...process.env, ...options.env });

export const systemShell: Shell = {
  capture: (command, args, options = {}) =>
    new Promise((resolve) => {
      const child = execFile(
        command,
        [...args],
        { cwd: options.cwd, env: environment(options), maxBuffer: MAX_BUFFER },
        (error, stdout, stderr) => {
          // A command that is not installed answers 127, as a shell would.
          const code = error?.code;
          const status = !error ? 0 : typeof code === "number" ? code : code === "ENOENT" ? 127 : 1;
          resolve({ status, stdout, stderr });
        },
      );
      if (options.input !== undefined) child.stdin?.end(options.input);
    }),
  // A child writing to the terminal owns it: the live line steps aside meanwhile.
  attach: (command, args, options = {}) =>
    liveLine.hold(
      () =>
        new Promise<number>((resolve) => {
          const child = spawn(command, [...args], {
            cwd: options.cwd,
            env: environment(options),
            stdio: options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
          });
          if (options.input !== undefined) child.stdin?.end(options.input);
          child.on("error", () => resolve(127));
          child.on("close", (code) => resolve(code ?? 1));
        }),
    ),

  env: (name) => process.env[name],
};
