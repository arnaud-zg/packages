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

const readText = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);

/** The folders the workspace file lists: pnpm's first, then package.json, else the root alone. */
export const workspacePatterns = (root: string): string[] => {
  const pnpm = readText(path.join(root, "pnpm-workspace.yaml"));
  const fromPnpm = pnpm === null ? undefined : PnpmWorkspaceSchema.parse(parse(pnpm))?.packages;
  if (fromPnpm && fromPnpm.length > 0) return fromPnpm;
  const manifest = readText(path.join(root, "package.json"));
  const { workspaces } =
    manifest === null
      ? { workspaces: undefined }
      : PackageWorkspacesSchema.parse(JSON.parse(manifest));
  if (workspaces) return Array.isArray(workspaces) ? workspaces : workspaces.packages;
  return ["."];
};

const childFolders = (root: string, parent: string) => {
  const absolute = path.join(root, parent);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules",
    )
    .map((entry) => path.posix.join(parent, entry.name));
};

/** Folders matching `dir/*` or an exact path, sorted. Negations and deeper globs are skipped. */
export const expandPatterns = (root: string, patterns: readonly string[]): string[] => {
  const folders = patterns
    .filter((pattern) => !pattern.startsWith("!"))
    .map((pattern) => pattern.replace(/\/+$/, ""))
    .flatMap((pattern) => {
      if (pattern.endsWith("/*")) return childFolders(root, pattern.slice(0, -2));
      if (pattern.includes("*")) return [];
      return fs.existsSync(path.join(root, pattern)) ? [path.posix.normalize(pattern)] : [];
    });
  return [...new Set(folders)].sort();
};
