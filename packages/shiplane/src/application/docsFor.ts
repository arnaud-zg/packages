import type { z } from "zod";

import type { SetupContext } from "./setupContext";
import { paint } from "./say";
import { documentedKeys } from "./setupFiles";

/**
 * `shiplane docs <module or adapter>`: every key a unit file takes, described, with its default. A
 * module name reads the release config; an adapter name, the official adapters and those composed.
 */
export const docsFor = async (context: SetupContext, name: string) => {
  const { output } = context;
  const release = await context.load();
  const module = release.modules.find((candidate) => candidate.name === name);
  const adapters = [
    ...context.adapters,
    ...release.modules.map(({ provider, settings }) => ({ name: provider, settings })),
  ];
  const adapter = adapters.find((candidate) => candidate.name === name);
  const found: { title: string; settings: z.ZodObject } | undefined = module
    ? {
        title: `module: ${module.name}  ${paint("dim", `with ${module.provider}`)}`,
        settings: module.settings,
      }
    : adapter && {
        title: `${adapter.name}  ${paint("dim", "adapter")}`,
        settings: adapter.settings,
      };
  if (!found) {
    const known = [
      ...new Set([
        ...release.modules.map((candidate) => candidate.name),
        ...adapters.map((candidate) => candidate.name),
      ]),
    ];
    output.line(`${paint("red", "✗")}  no module or adapter "${name}": ${known.join(", ")}`);
    return false;
  }
  const keys = documentedKeys(found.settings);
  const width = Math.max(8, ...keys.map(({ key }) => key.length)) + 2;
  output.line();
  output.line(`  ${paint("bold", found.title)}`);
  output.line();
  keys.forEach(({ key, description, default: fallback, required }) => {
    const note = required
      ? paint("yellow", "required")
      : fallback === undefined
        ? "optional"
        : `default: ${typeof fallback === "string" ? fallback : JSON.stringify(fallback)}`;
    output.line(`  ${key.padEnd(width)}${description}`);
    output.line(`  ${" ".repeat(width)}${paint("dim", note)}`);
  });
  output.line();
  return true;
};
