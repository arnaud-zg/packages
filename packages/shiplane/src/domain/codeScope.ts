/** Where a unit's code comes from, to tell which changed files can reach what it ships. */
export interface CodeScope {
  /** Its own folder and those of the workspace packages it uses. */
  own: readonly string[];
  /** Every workspace package's folder. */
  workspace: readonly string[];
  versionFiles: ReadonlySet<string>;
}

// Notes, docs, CI and release config: they change how a release is made or read, never what it ships.
const NOT_SHIPPED = [
  /(^|\/)(shiplane|release)\.unit\.yml$/,
  /^\.changeset\//,
  /^\.planning\//,
  /^\.github\//,
  /^\.claude\//,
  /^docs\//,
  /\.md$/,
];

/** A package's folder and the folders of every workspace package it uses, however deep. */
export const codeFolders = (
  packageName: string,
  dependencies: Record<string, string[]>,
  folders: Record<string, string>,
): string[] => {
  const seen = new Set<string>([packageName]);
  const queue = [packageName];
  for (const name of queue) {
    for (const dependency of dependencies[name] ?? []) {
      if (seen.has(dependency)) continue;
      seen.add(dependency);
      queue.push(dependency);
    }
  }
  return [...seen].flatMap((name) => folders[name] ?? []);
};

/**
 * The changed files that can reach what a unit ships: in its own code folders, or at the root
 * outside every workspace folder, such as the lockfile. Another app's folder never does.
 */
export const changesReaching = (files: readonly string[], scope: CodeScope): string[] =>
  files.filter((file) => {
    if (scope.versionFiles.has(file) || NOT_SHIPPED.some((pattern) => pattern.test(file))) {
      return false;
    }
    const inside = (folder: string) => file.startsWith(`${folder}/`);
    return scope.own.some(inside) || !scope.workspace.some(inside);
  });
