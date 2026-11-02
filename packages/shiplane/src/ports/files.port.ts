/** The repository's files, by path relative to its root. */
export interface Files {
  exists: (file: string) => boolean;
  read: (file: string) => string | null;
  write: (file: string, text: string) => void;
  remove: (file: string) => void;
  /** Entries directly in a folder; empty when it does not exist. */
  list: (dir: string) => string[];
  /** The folders directly in a folder, by name; empty when it does not exist. */
  folders: (dir: string) => string[];
}
