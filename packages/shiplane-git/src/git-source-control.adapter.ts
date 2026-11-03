import { setTimeout as sleep } from "node:timers/promises";
import type { ServiceAdapter, Shell, ShellResult, SourceControlPort } from "shiplane/plugin";
import { CommandFailed } from "shiplane/plugin";

export interface GitOptions {
  /** The branch releases start from. */
  main?: string;
  /** Run on the files of a commit before it is made, such as a formatter. */
  format?: string[];
  /** How long to wait before each new try of a push the network dropped, in ms. */
  retryDelays?: number[];
}

// The network let go; a rejection or a missing right fails the same way on every try.
const DROPPED =
  /closed by remote host|connection (reset|refused|timed out)|could not resolve host|operation timed out|early eof|rpc failed|remote end hung up|unexpected disconnect|broken pipe|kex_exchange_identification/i;

// What a release pushes is versions, changelogs and tags of code main already checked. The
// pre-push checks would redo minutes of work with the connection open, until GitHub drops it.
const PUSH = ["push", "--no-verify", "--quiet"];

const gitSource = (root: string, shell: Shell, options: GitOptions): SourceControlPort => {
  const main = options.main ?? "main";
  const retryDelays = options.retryDelays ?? [2_000, 10_000];
  const run = (args: string[]) => shell.capture("git", args, { cwd: root });
  const failed = (args: string[], { status, stdout, stderr }: ShellResult) => {
    const reason = stderr.trim().split("\n")[0] ?? "";
    return new CommandFailed(
      `git ${args[0] ?? ""} exited with ${status}${reason ? `: ${reason}` : ""}`,
      [stderr, stdout]
        .map((text) => text.trim())
        .filter(Boolean)
        .join("\n"),
    );
  };
  const must = async (args: string[]) => {
    const result = await run(args);
    if (result.status !== 0) throw failed(args, result);
    return result.stdout.trim();
  };
  const network = async (args: string[]) => {
    let result = await run(args);
    for (const delay of retryDelays) {
      if (result.status === 0 || !DROPPED.test(result.stderr)) break;
      await sleep(delay);
      result = await run(args);
    }
    if (result.status !== 0) throw failed(args, result);
  };
  const maybe = async (args: string[]) => {
    const result = await run(args);
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const lines = (text: string | null) => (text ?? "").split("\n").filter(Boolean);

  return {
    position: async () => {
      // Offline, the last fetched origin/main still says whether main moved.
      await run(["fetch", "--quiet", "origin", main]);
      return {
        branch: await must(["rev-parse", "--abbrev-ref", "HEAD"]),
        head: await must(["rev-parse", "HEAD"]),
        originMain: await must(["rev-parse", `origin/${main}`]),
      };
    },
    isClean: async () => (await must(["status", "--porcelain", "--untracked-files=no"])) === "",
    tagCommit: (tag) => maybe(["rev-parse", "--verify", "--quiet", `${tag}^{commit}`]),
    versionCommit: async (dir, manifest, version) => {
      const found = await maybe([
        "log",
        "-1",
        "--format=%H%x00%s",
        "-S",
        `"version": "${version}"`,
        "--",
        `${dir}/${manifest}`,
      ]);
      const [sha = "", subject = ""] = (found ?? "").split("\0");
      return sha ? { sha, subject } : null;
    },
    commitsBetween: async (from, to) =>
      (await must(["log", "--format=%x00%s", "--name-only", `${from}..${to}`]))
        .split("\0")
        .filter(Boolean)
        .map((entry) => {
          const [subject = "", ...files] = lines(entry);
          return { subject, files };
        }),
    changedFiles: async () => [
      ...lines(await maybe(["diff", "--name-only"])),
      ...lines(await maybe(["ls-files", "--others", "--exclude-standard"])),
    ],
    diffNames: async (from, to) => lines(await maybe(["diff", "--name-only", from, to])),
    fileAt: (ref, file) => maybe(["show", `${ref}:${file}`]),
    tags: async () => {
      // Offline, the tags fetched last still say what is tagged.
      await run(["fetch", "--quiet", "--tags", "origin"]);
      return new Set(lines(await maybe(["tag", "--list"])));
    },
    createBranch: async (name) => {
      await must(["switch", "--quiet", "-c", name]);
    },
    switchTo: async (branch) => {
      await must(["switch", "--quiet", branch]);
    },
    commit: async (files, title, body, { skipHooks = false } = {}) => {
      const [command, ...args] = options.format ?? [];
      if (command && files.length > 0) {
        await shell.capture(command, [...args, ...files], { cwd: root });
      }
      await must(["add", "--", ...files]);
      await must([
        "commit",
        "--quiet",
        ...(skipHooks ? ["--no-verify"] : []),
        "-m",
        title,
        ...(body ? ["-m", body] : []),
      ]);
    },
    push: async (branch) => {
      await network([...PUSH, "-u", "origin", branch]);
    },
    pull: async () => {
      await network(["pull", "--quiet", "--ff-only"]);
    },
    tag: async (name, sha, message) => {
      // GitHub shows an unsigned tag as Unverified even when the commit it names is signed.
      const signed = (await maybe(["config", "--type=bool", "--get", "commit.gpgsign"])) === "true";
      await must(["tag", signed ? "-s" : "-a", name, sha, "-m", message]);
    },
    pushTags: async (names) => {
      await network([...PUSH, "origin", ...names.map((name) => `refs/tags/${name}`)]);
    },
    discard: async (files) => {
      await must(["reset", "--quiet", "--hard", "HEAD"]);
      if (files.length > 0) await must(["clean", "--quiet", "--force", "--", ...files]);
    },
    deleteBranch: async (name) => {
      await must(["branch", "--quiet", "-D", name]);
    },
    deleteRemoteBranch: async (branch) => {
      await network([...PUSH, "origin", "--delete", branch]);
    },
    deleteTag: async (name) => {
      await must(["tag", "--delete", name]);
    },
  };
};

export type GitSourceControlAdapter = ServiceAdapter<SourceControlPort>;

/** The repository through the git CLI. */
export const gitSourceControl = (options: GitOptions = {}): GitSourceControlAdapter => ({
  name: "git",
  requirements: () => [{ label: "git", check: { command: "git", args: ["--version"] } }],
  create: ({ root, shell }) => gitSource(root, shell, options),
});
