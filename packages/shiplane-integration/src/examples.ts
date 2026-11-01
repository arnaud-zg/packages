import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { ConsumerRepository } from "shiplane/testing";
import { consumerRepository } from "shiplane/testing";

export const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

const PLUGINS = ["git", "github", "changesets", "fly", "cloudflare-pages", "eas", "npm"];

const resolve = createRequire(import.meta.url).resolve;
const folderOf = (name: string) => path.dirname(resolve(`${name}/package.json`));

/** Every plugin, linked as `pnpm add` installs it, and the changesets CLI the versioning runs. */
const INSTALLED: Record<string, string> = {
  ...Object.fromEntries(
    PLUGINS.map((plugin) => [`@shiplane/${plugin}`, folderOf(`@shiplane/${plugin}`)]),
  ),
  "@changesets/cli": path.join(REPOSITORY_ROOT, "node_modules", "@changesets", "cli"),
};

/** Each file of a folder, by its path inside it. */
export const filesOf = (folder: string): Record<string, string> =>
  Object.fromEntries(
    fs
      .readdirSync(folder, { recursive: true, encoding: "utf8" })
      .filter((file) => fs.statSync(path.join(folder, file)).isFile())
      .map((file) => [
        file.split(path.sep).join("/"),
        fs.readFileSync(path.join(folder, file), "utf8"),
      ]),
  );

/** A consumer repository made of an example folder, every plugin installed. */
export const exampleRepository = (
  folder: string,
  { branch, files = {} }: { branch?: string; files?: Record<string, string> } = {},
): ConsumerRepository =>
  consumerRepository({
    files: { ...filesOf(path.join(REPOSITORY_ROOT, folder)), ...files },
    packages: INSTALLED,
    ...(branch ? { branch } : {}),
  });

/** Output as a page quotes it: no blank lines around it, no spaces at the end of a line. */
export const quoted = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
