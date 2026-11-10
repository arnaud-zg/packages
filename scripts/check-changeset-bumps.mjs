#!/usr/bin/env node
// A `feat` (or a breaking `!`) on this branch needs a minor changeset, not only patches: Changesets
// reads the bump from the file alone, so a feature written as `patch` ships as a patch unnoticed.
// Runs in `pnpm verify`; on `main` there is nothing to compare, so it passes.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const lines = (text) => text.split("\n").filter(Boolean);

const baseRef = ["origin/main", "main"].find((ref) => {
  try {
    git("rev-parse", "--verify", "--quiet", ref);
    return true;
  } catch {
    return false;
  }
});
if (!baseRef) process.exit(0);
const base = git("merge-base", "HEAD", baseRef);

const needsMinor = lines(git("log", "--format=%s", `${base}..HEAD`)).filter((subject) =>
  /^(feat(\([^)]*\))?!?|\w+(\([^)]*\))?!):/.test(subject),
);
if (needsMinor.length === 0) process.exit(0);

const added = [
  ...lines(git("diff", "--name-only", "--diff-filter=A", base, "--", ".changeset")),
  ...lines(git("ls-files", "--others", "--exclude-standard", "--", ".changeset")),
].filter((file) => file.endsWith(".md") && !file.endsWith("README.md"));
if (added.length === 0) process.exit(0);

const bumps = added.flatMap((file) => {
  const frontMatter = fs.readFileSync(path.join(root, file), "utf8").split("---")[1] ?? "";
  return [...frontMatter.matchAll(/:\s*["']?(major|minor|patch)["']?\s*$/gm)].map((m) => m[1]);
});
if (bumps.some((bump) => bump !== "patch")) process.exit(0);

console.error(`This branch adds a feature, but its changesets are all patch:

${needsMinor.map((subject) => `  ${subject}`).join("\n")}

${added.map((file) => `  ${file}`).join("\n")}

Change the bump to minor (breaking: minor below 1.0, major after). See
docs/contributing/how-to.md#release-a-new-version.`);
process.exit(1);
