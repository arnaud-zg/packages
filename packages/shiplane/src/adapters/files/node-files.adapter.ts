import fs from "node:fs";
import path from "node:path";

import type { Files } from "../../ports/files.port";

/** The repository on disk, under `root`. */
export const nodeFiles = (root: string): Files => {
  const at = (file: string) => path.join(root, file);
  return {
    exists: (file) => fs.existsSync(at(file)),
    read: (file) => (fs.existsSync(at(file)) ? fs.readFileSync(at(file), "utf8") : null),
    write: (file, text) => {
      fs.mkdirSync(path.dirname(at(file)), { recursive: true });
      fs.writeFileSync(at(file), text);
    },
    remove: (file) => fs.rmSync(at(file), { force: true }),
    list: (dir) => (fs.existsSync(at(dir)) ? fs.readdirSync(at(dir)) : []),
    folders: (dir) =>
      fs.existsSync(at(dir))
        ? fs
            .readdirSync(at(dir), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
        : [],
  };
};
