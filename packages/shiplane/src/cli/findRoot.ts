import fs from "node:fs";
import path from "node:path";

import { findConfig } from "../application/config/loadRelease";

/** The nearest folder up from here with a release config, else the git root, else here. */
export const findRoot = (from: string): string => {
  const ancestors = (dir: string): string[] => {
    const parent = path.dirname(dir);
    return parent === dir ? [dir] : [dir, ...ancestors(parent)];
  };
  const chain = ancestors(path.resolve(from));
  return (
    chain.find((dir) => findConfig(dir)) ??
    chain.find((dir) => fs.existsSync(path.join(dir, ".git"))) ??
    path.resolve(from)
  );
};
