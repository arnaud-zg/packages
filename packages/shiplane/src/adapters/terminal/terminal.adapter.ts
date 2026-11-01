import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { styleText } from "node:util";
import type { Option } from "@clack/prompts";
import { confirm, isCancel, multiselect, select, text } from "@clack/prompts";

import type { Display } from "../../domain/display";
import type { Choice, Clock, Output, Prompter } from "../../ports/terminal.port";
import { liveLine } from "./live-line";
import { paintMascot } from "./terminal-progress.adapter";

export const terminalOutput: Output = {
  line: (line = "") => liveLine.above(line),
};

/** Whether this process runs inside a GitHub Actions job. */

export const onGitHubActions = () => process.env.GITHUB_ACTIONS === "true";

export const systemClock: Clock = {
  now: () => new Date(),
  sleep: async (ms) => {
    await sleep(ms);
  },
};

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** A spinner, or the mascot waiting, on one line until a listed key is pressed or `ms` pass. Ctrl-C ends the process. */
const waitForKey = (display: Display, label: string, ms: number, keys: readonly string[]) =>
  new Promise<string | null>((resolve) => {
    const startedAt = Date.now();
    let frame = 0;
    const draw = () => {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      const tick = frame++;
      const glyph = display.mascot
        ? paintMascot("waiting", display.motion ? Math.floor(tick / 5) : 0)
        : styleText("cyan", FRAMES[tick % FRAMES.length] ?? "");
      process.stdout.write(`\r  ${glyph} ${label} ${styleText("dim", `${seconds}s`)}`);
    };
    const timer = setInterval(draw, 80);
    const finish = (key: string | null) => {
      clearInterval(timer);
      clearTimeout(timeout);
      process.stdin.off("keypress", onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\r\u001B[2K");
      resolve(key);
    };
    const onKey = (_text: string, key: { name?: string; ctrl?: boolean } | undefined) => {
      if (key?.ctrl && key.name === "c") {
        finish(null);
        process.stdout.write(
          `${styleText("dim", "  Stopped waiting. release picks up right here.")}\n`,
        );
        process.exit(130);
      }
      if (key?.name && keys.includes(key.name)) finish(key.name);
    };
    const timeout = setTimeout(() => finish(null), ms);
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("keypress", onKey);
  });

// clack types an option per primitive value; a Choice has the same fields.
const asOptions = <Value extends string>(choices: Choice<Value>[]) =>
  choices as unknown as Option<Value>[];

const orNull = <Value>(answer: Value | symbol): Value | null => (isCancel(answer) ? null : answer);

const NO_MASCOT: Display = { verbose: false, mascot: false, motion: false };

/** Questions through @clack/prompts, each owning the terminal; without one, every answer is no. */
export const terminalPrompter = (display: Display = NO_MASCOT): Prompter => {
  const interactive = Boolean(process.stdin.isTTY);
  const hold = <T>(work: () => Promise<T>) => liveLine.hold(work);
  return {
    interactive,
    confirm: (question, initial = false) =>
      hold(
        async () =>
          interactive &&
          orNull(await confirm({ message: question, initialValue: initial })) === true,
      ),
    typed: (question, word) =>
      hold(async () => {
        if (!interactive) return false;
        const prompt = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await prompt.question(`${styleText("bold", question)} `);
        prompt.close();
        return answer.trim() === word;
      }),
    select: (message, choices, initial) =>
      hold(async () =>
        interactive
          ? orNull(await select({ message, options: asOptions(choices), initialValue: initial }))
          : null,
      ),
    multiselect: (message, choices, initial) =>
      hold(async () =>
        interactive
          ? orNull(
              await multiselect({
                message,
                options: asOptions(choices),
                initialValues: initial,
                required: false,
              }),
            )
          : null,
      ),
    text: (message, initial) =>
      hold(async () =>
        interactive ? orNull(await text({ message, initialValue: initial })) : null,
      ),
    waitForKey: (label, ms, keys) =>
      hold(async () => {
        if (interactive) return waitForKey(display, label, ms, keys);
        await sleep(ms);
        return null;
      }),
  };
};
