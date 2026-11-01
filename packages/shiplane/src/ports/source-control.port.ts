import type { GitPosition } from "../domain/governance";

/** The repository's history, as a release reads and writes it. */
export interface SourceControlPort {
  /** After fetching main: the branch, its head and origin/main. */
  position: () => Promise<GitPosition>;
  /** No tracked file changed. */
  isClean: () => Promise<boolean>;
  tagCommit: (tag: string) => Promise<string | null>;
  /** The commit that brought a version into a folder's manifest. */
  versionCommit: (
    dir: string,
    manifest: string,
    version: string,
  ) => Promise<{ sha: string; subject: string } | null>;
  /** Subjects of the commits that touched a folder since a commit, newest first, `ignore` aside. */
  subjectsSince: (sha: string, dir: string, ignore?: readonly string[]) => Promise<string[]>;
  /** The commits after `from` up to `to`, newest first: each subject and the files it touched. */
  commitsBetween: (from: string, to: string) => Promise<{ subject: string; files: string[] }[]>;
  /** Modified and untracked files, relative to the root. */
  changedFiles: () => Promise<string[]>;
  diffNames: (from: string, to: string) => Promise<string[]>;
  fileAt: (ref: string, file: string) => Promise<string | null>;
  tags: () => Promise<Set<string>>;
  createBranch: (name: string) => Promise<void>;
  switchTo: (branch: string) => Promise<void>;
  /** `skipHooks` commits without the repository's hooks: a release title longer than they allow. */
  commit: (
    files: string[],
    title: string,
    body?: string,
    options?: { skipHooks?: boolean },
  ) => Promise<void>;
  push: (branch: string) => Promise<void>;
  pull: () => Promise<void>;
  tag: (name: string, sha: string, message: string) => Promise<void>;
  pushTags: (names: string[]) => Promise<void>;
  /** Puts tracked files back as committed and removes `files` this release created. */
  discard: (files: string[]) => Promise<void>;
  deleteBranch: (name: string) => Promise<void>;
  deleteRemoteBranch: (branch: string) => Promise<void>;
  deleteTag: (name: string) => Promise<void>;
}
