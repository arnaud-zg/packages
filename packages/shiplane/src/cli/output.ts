import { styleText } from "node:util";

import type { ConfigProblem } from "../application/config/problem";

type Style = Parameters<typeof styleText>[0];

export const paint = (style: Style, text: string) => styleText(style, text);

export const out = (line = "") => process.stdout.write(`${line}\n`);

/** Problems as `file:line  message`, each hint on the line below. */
export const printProblems = (problems: readonly ConfigProblem[]) => {
  problems.forEach(({ file, line, message, hint }) => {
    const where = line === undefined ? file : `${file}:${line}`;
    out(`${paint("red", "✗")}  ${paint("bold", where)}  ${message}`);
    if (hint) out(`   ${paint("dim", hint)}`);
  });
};
