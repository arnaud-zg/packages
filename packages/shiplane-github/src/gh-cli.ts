import type { Shell } from "shiplane/plugin";

// Primary and secondary limits both say "rate limit"; 429 is the plain HTTP form.
const RATE_LIMITED = /rate limit|HTTP 429/i;
const RETRIES = 4;
const FIRST_WAIT_MS = 2000;

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The gh CLI in the repository: `must` throws on a failed call, `json` parses its output. A call
 * GitHub rate limits is retried, waiting twice as long each time.
 */
export const ghCli = (root: string, shell: Shell, wait: (ms: number) => Promise<void> = sleep) => {
  const must = async (args: string[], input?: string) => {
    for (let attempt = 0; ; attempt++) {
      const result = await shell.capture("gh", args, { cwd: root, input });
      if (result.status === 0) return result.stdout;
      const reason = result.stderr.trim().split("\n")[0] ?? "";
      if (RATE_LIMITED.test(result.stderr) && attempt < RETRIES) {
        await wait(FIRST_WAIT_MS * 2 ** attempt);
        continue;
      }
      throw new Error(
        `gh ${args.slice(0, 2).join(" ")} exited with ${result.status}${reason ? `: ${reason}` : ""}`,
      );
    }
  };
  const json = async (args: string[]): Promise<unknown> => JSON.parse(await must(args));
  return { must, json };
};
