import { execFileSync } from "node:child_process";
import { z } from "zod";

import { systemShell } from "../adapters/shell/system-shell.adapter";

/**
 * Contract suites against hosted services run only with RELEASE_CONTRACT_LIVE=1, on a sandbox
 * repository checked out at RELEASE_CONTRACT_REPO: they open pull requests, publish releases and
 * dispatch workflows there.
 */
export const LIVE = systemShell.env("RELEASE_CONTRACT_LIVE") === "1";

/** The sandbox checkout, refused when unset so a live run never touches this repository. */
export const sandbox = () =>
  z
    .string({ message: "RELEASE_CONTRACT_REPO names a sandbox checkout for live contracts" })
    .min(1)
    .parse(systemShell.env("RELEASE_CONTRACT_REPO"));

/** Runs git in the sandbox and returns what it printed. */
export const inSandbox = (args: string[]) =>
  execFileSync("git", args, { cwd: sandbox(), encoding: "utf8" }).trim();
