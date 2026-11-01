import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** The public API a test config imports, resolved to source since tests run before any build. */
export const SOURCE_ALIASES: Record<string, string> = {
  shiplane: path.resolve(import.meta.dirname, "../index.ts"),
  "shiplane/plugin": path.resolve(import.meta.dirname, "../plugin.ts"),
  "shiplane/testing": path.resolve(import.meta.dirname, "public.ts"),
};

export interface Workspace {
  root: string;
  write: (file: string, text: string) => void;
  read: (file: string) => string;
  exists: (file: string) => boolean;
  remove: () => void;
}

/** A throwaway repository on disk, one entry per file, removed by `remove()`. */
export const createWorkspace = (files: Record<string, string>): Workspace => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-workspace-"));
  const write = (file: string, text: string) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  Object.entries(files).forEach(([file, text]) => write(file, text));
  return {
    root,
    write,
    read: (file) => fs.readFileSync(path.join(root, file), "utf8"),
    exists: (file) => fs.existsSync(path.join(root, file)),
    remove: () => fs.rmSync(root, { recursive: true, force: true }),
  };
};

export const packageJson = (name: string, version = "1.0.0", extra: object = {}) =>
  JSON.stringify({ name, version, ...extra }, null, 2);
