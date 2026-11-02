import { styleText } from "node:util";

import type { ReleaseContext } from "./context";

type Style = Parameters<typeof styleText>[0];

export const paint = (style: Style, text: string) => styleText(style, text);

/** A failure, said with what to run next; the caller returns false so nothing else runs. */
export const fail = (
  { output, progress }: ReleaseContext,
  title: string,
  detail: string,
  commands: string[] = [],
) => {
  progress.say("worried", `${paint(["bold", "red"], `✗ ${title}:`)} ${detail}`);
  commands.forEach((command) => output.line(`    ${paint("cyan", command)}`));
};

/** Yes without asking under --yes; without a terminal, no. */
export const confirm = async (
  { prompter, options, output }: ReleaseContext,
  question: string,
  initial = false,
) => {
  if (options.yes) return true;
  if (!prompter.interactive) {
    output.line(paint("yellow", "Not a terminal: pass --yes to run it."));
    return false;
  }
  return prompter.confirm(question, initial);
};

/** `api`, `api and admin`, `api, admin and landing`. */
export const listed = (names: readonly string[]) =>
  names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.slice(-1).join("")}`;

/** The keys a screen offers, each the same way: `d see the diff   o open it on GitHub`. */
export const keyHints = (hints: readonly { key: string; label: string }[]) =>
  hints.map(({ key, label }) => `${paint("cyan", key)} ${paint("dim", label)}`).join("   ");
