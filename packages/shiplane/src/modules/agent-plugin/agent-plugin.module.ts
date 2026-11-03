import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { Named } from "../deliveryModule";
import type { ReleaseModule } from "../module";

/**
 * Where each agent reads a plugin's version, relative to the plugin's folder: Claude Code and
 * Copilot CLI, Codex, Cursor, then Gemini CLI.
 */
export const AGENT_MANIFESTS = [
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  "gemini-extension.json",
] as const;

const Versioned = z.object({ version: z.string() });

/** A manifest's version, or null when the file is missing or holds no top-level version. */
const versionIn = (file: string) => {
  if (!fs.existsSync(file)) return null;
  const parsed = Versioned.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  return parsed.success ? parsed.data.version : null;
};

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Moves only the version's value, so the release PR shows one changed line per manifest. */
const setVersion = (file: string, from: string, to: string) => {
  const text = fs.readFileSync(file, "utf8");
  const moved = text.replace(
    new RegExp(`("version"\\s*:\\s*)"${literal(from)}"`),
    `$1${JSON.stringify(to)}`,
  );
  // The first such value may sit under another key: then the file is written whole instead.
  const top = Versioned.safeParse(JSON.parse(moved));
  const json = JSON.parse(text) as Record<string, unknown>;
  fs.writeFileSync(
    file,
    top.success && top.data.version === to
      ? moved
      : `${JSON.stringify({ ...json, version: to }, null, 2)}\n`,
  );
};

/**
 * A plugin for coding agents, such as a Claude Code, Codex or Cursor plugin: a release versions it,
 * writes the version into each agent's manifest in the release PR, tags it and publishes its notes.
 * Nothing deploys it: agents install it from the repository, so merging the release PR ships it.
 */
export const agentPlugin = ({ name = "agent-plugin" }: Named = {}): ReleaseModule => ({
  type: "module",
  name,
  kind: "agent-plugin",
  provider: "marketplace",
  settings: z.object({}),
  adapters: [],
  releaseOnly: true,
  version: ({ root }, { unit, bump }) => {
    if (!bump) return Promise.resolve({ added: [], writes: [], summary: [], onMerge: "" });
    const manifests = AGENT_MANIFESTS.map((file) => path.posix.join(unit.dir, file)).flatMap(
      (file) => {
        const from = versionIn(path.join(root, file));
        return from === null ? [] : [{ file, from }];
      },
    );
    return Promise.resolve({
      added: [],
      writes: manifests.map(({ file, from }) => ({
        label: `${file} → ${bump.to}`,
        run: () => {
          setVersion(path.join(root, file), from, bump.to);
          return Promise.resolve();
        },
      })),
      summary: [],
      onMerge: "Agents update to it: merging ships it",
    });
  },
  ship: () => ({
    where: "its tag and release notes; agents install it from the repository",
    jobs: [],
  }),
  decide: () =>
    Promise.resolve({ action: "none", status: "released, agents install it from the repository" }),
});
