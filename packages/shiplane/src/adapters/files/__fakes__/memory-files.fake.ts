import path from "node:path";

import type { Files } from "../../../ports/files.port";

/** A repository held in memory, one entry per file: nothing touches the disk. */
export class MemoryFiles implements Files {
  private readonly texts = new Map<string, string>();
  /** Every write and removal, in order, for a test to read back. */
  readonly changes: { kind: "write" | "remove"; file: string }[] = [];

  constructor(files: Record<string, string> = {}) {
    Object.entries(files).forEach(([file, text]) =>
      this.texts.set(path.posix.normalize(file), text),
    );
  }

  private entries(dir: string) {
    const prefix = dir === "." || dir === "" ? "" : `${path.posix.normalize(dir)}/`;
    return [...this.texts.keys()]
      .filter((file) => file.startsWith(prefix))
      .map((file) => file.slice(prefix.length).split("/"));
  }

  exists = (file: string) => {
    const at = path.posix.normalize(file);
    return this.texts.has(at) || [...this.texts.keys()].some((key) => key.startsWith(`${at}/`));
  };

  read = (file: string) => this.texts.get(path.posix.normalize(file)) ?? null;

  write = (file: string, text: string) => {
    this.texts.set(path.posix.normalize(file), text);
    this.changes.push({ kind: "write", file });
  };

  remove = (file: string) => {
    this.texts.delete(path.posix.normalize(file));
    this.changes.push({ kind: "remove", file });
  };

  list = (dir: string) => [...new Set(this.entries(dir).map(([first = ""]) => first))].sort();

  folders = (dir: string) =>
    [
      ...new Set(
        this.entries(dir)
          .filter((parts) => parts.length > 1)
          .map(([first = ""]) => first),
      ),
    ].sort();

  /** Every file, as a snapshot a test compares before and after. */
  get all(): Record<string, string> {
    return Object.fromEntries([...this.texts].sort(([a], [b]) => a.localeCompare(b)));
  }
}
