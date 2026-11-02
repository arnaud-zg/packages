import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const PnpmWorkspaceSchema = z.object({ packages: z.array(z.string()).optional() }).nullish();
const PackageWorkspacesSchema = z.object({
  workspaces: z
    .union([z.array(z.string()), z.object({ packages: z.array(z.string()) })])
    .optional(),
});

/** What reading a workspace needs, by path relative to its root: a disk, or files in memory. */
export interface WorkspaceReader {
  read: (file: string) => string | null;
  /** The folders directly inside `dir`, by name. */
  folders: (dir: string) => string[];
  exists: (file: string) => boolean;
}

/** The repository on disk, under `root`, as a workspace reader. */
export const diskReader = (root: string): WorkspaceReader => ({
  read: (file) => {
    const absolute = path.join(root, file);
    return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
  },
  folders: (dir) => {
    const absolute = path.join(root, dir);
    if (!fs.existsSync(absolute)) return [];
    return fs
      .readdirSync(absolute, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  },
  exists: (file) => fs.existsSync(path.join(root, file)),
});

const readerOf = (from: string | WorkspaceReader) =>
  typeof from === "string" ? diskReader(from) : from;

/** The folders the workspace file lists: pnpm's first, then package.json, else the root alone. */
export const workspacePatterns = (from: string | WorkspaceReader): string[] => {
  const reader = readerOf(from);
  const pnpm = reader.read("pnpm-workspace.yaml");
  const fromPnpm = pnpm === null ? undefined : PnpmWorkspaceSchema.parse(parse(pnpm))?.packages;
  if (fromPnpm && fromPnpm.length > 0) return fromPnpm;
  const manifest = reader.read("package.json");
  const { workspaces } =
    manifest === null
      ? { workspaces: undefined }
      : PackageWorkspacesSchema.parse(JSON.parse(manifest));
  if (workspaces) return Array.isArray(workspaces) ? workspaces : workspaces.packages;
  return ["."];
};

/** Folders matching `dir/*` or an exact path, sorted. Negations and deeper globs are skipped. */
export const expandPatterns = (
  from: string | WorkspaceReader,
  patterns: readonly string[],
): string[] => {
  const reader = readerOf(from);
  const folders = patterns
    .filter((pattern) => !pattern.startsWith("!"))
    .map((pattern) => pattern.replace(/\/+$/, ""))
    .flatMap((pattern) => {
      if (pattern.endsWith("/*")) {
        const parent = pattern.slice(0, -2);
        return reader
          .folders(parent)
          .filter((name) => !name.startsWith(".") && name !== "node_modules")
          .map((name) => path.posix.join(parent, name));
      }
      if (pattern.includes("*")) return [];
      return reader.exists(pattern) ? [path.posix.normalize(pattern)] : [];
    });
  return [...new Set(folders)].sort();
};
