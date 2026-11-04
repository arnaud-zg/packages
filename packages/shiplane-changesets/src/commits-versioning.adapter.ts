import fs from "node:fs";
import path from "node:path";
import type { PlannedChangeset, ServiceAdapter, Shell, VersioningPort } from "shiplane/plugin";
import { isReleaseSubject, z } from "shiplane/plugin";

import type { ChangesetsOptions } from "./changesets-versioning.adapter";
import { changesetsVersioning } from "./changesets-versioning.adapter";

const BREAKING = /^\w+(\(.+?\))?!:/;
const FEATURE = /^feat(\(.+?\))?:/;
const USER_FACING = /^(feat|fix|perf)(\(.+?\))?:/;
const UNIT_FILES = ["shiplane.unit.yml", "release.unit.yml"];

const Manifest = z.object({ version: z.string() });
const Config = z.object({ ignore: z.array(z.string()).optional() });

/** The Conventional Commits bump: `!` a major (a minor below 1.0), `feat` a minor, else a patch. */
const bumpOf = (subject: string, version: string): PlannedChangeset["releases"][number]["type"] => {
  if (BREAKING.test(subject)) return version.startsWith("0.") ? "minor" : "major";
  return FEATURE.test(subject) ? "minor" : "patch";
};

// Subjects are written as user value already: drop the type, scope and PR number.
const asSentence = (subject: string) => {
  const text = subject
    .replace(/^\w+(\(.+?\))?!?:\s*/, "")
    .replace(/\s*\(#\d+\)$/, "")
    .trim();
  const sentence = `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
};

/** One changeset per feature, fix or breaking commit: nothing else releases. */
const changesetsFrom = (
  name: string,
  version: string,
  subjects: readonly string[],
): PlannedChangeset[] => {
  const slug = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return subjects
    .filter((subject) => USER_FACING.test(subject) || BREAKING.test(subject))
    .map((subject, index) => ({
      id: `commits-${slug}-${index + 1}`,
      releases: [{ name, type: bumpOf(subject, version) }],
      summary: asSentence(subject),
    }));
};

const textOf = ({ releases, summary }: PlannedChangeset) =>
  `---\n${releases.map(({ name, type }) => `"${name}": ${type}`).join("\n")}\n---\n\n${summary}\n`;

const readJson = (file: string) =>
  fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as unknown) : {};

/** Changesets versioning fed by commits: what a person would write is written from the history. */
const commitsFiles = (root: string, shell: Shell, options: ChangesetsOptions): VersioningPort => {
  const files = changesetsVersioning(options).create({ root, shell });
  const git = async (args: string[]) => {
    const { status, stdout } = await shell.capture("git", args, { cwd: root });
    return status === 0 ? stdout.trim() : "";
  };

  /** The subjects since the commit that brought a version, a release's own aside. */
  const subjectsSince = async (folder: string, version: string) => {
    const since = await git([
      "log",
      "-1",
      "--format=%H",
      "-S",
      `"version": "${version}"`,
      "--",
      path.posix.join(folder, "package.json"),
    ]);
    if (!since) return [];
    const log = await git([
      "log",
      "--format=%s",
      `${since}..HEAD`,
      "--",
      folder,
      ...UNIT_FILES.map((file) => `:(exclude)${path.posix.join(folder, file)}`),
    ]);
    return log.split("\n").filter((subject) => subject && !isReleaseSubject(subject));
  };

  /** A pending changeset naming a package takes over from its commits. */
  const fromCommits = async () => {
    const [folders, written] = await Promise.all([files.folders(), files.pending()]);
    const config = Config.safeParse(readJson(path.join(root, ".changeset", "config.json")));
    const ignored = new Set(config.success ? config.data.ignore : []);
    const moving = Object.entries(folders).filter(
      ([name]) => !ignored.has(name) && !written.some(({ text }) => text.includes(`"${name}":`)),
    );
    const found = await Promise.all(
      moving.map(async ([name, folder]) => {
        const manifest = Manifest.safeParse(readJson(path.join(root, folder, "package.json")));
        if (!manifest.success) return [];
        const { version } = manifest.data;
        return changesetsFrom(name, version, await subjectsSince(folder, version));
      }),
    );
    return found.flat();
  };

  return {
    ...files,
    nextChange: "a feat or fix commit",
    pending: async () => [
      ...(await files.pending()),
      ...(await fromCommits()).map((changeset) => ({
        id: changeset.id,
        text: textOf(changeset),
      })),
    ],
    plan: async (added, held) => files.plan([...(await fromCommits()), ...added], held),
    apply: async (added, held) => {
      const commits = await fromCommits();
      await files.apply([...commits, ...added], held);
      // A held unit's commits are still there next time: no file keeps them.
      commits.forEach(({ id }) =>
        fs.rmSync(path.join(root, files.changesetFile(id)), { force: true }),
      );
    },
  };
};

export type CommitsVersioningAdapter = ServiceAdapter<VersioningPort>;

/**
 * Versioning from Conventional Commits, with no changeset to write: the commits since each
 * package's version become the changesets of the release, and changesets does the rest. A pending
 * changeset naming a package still takes over from its commits.
 */
export const commitsVersioning = (options: ChangesetsOptions = {}): CommitsVersioningAdapter => ({
  name: "commits",
  create: ({ root, shell }) => commitsFiles(root, shell, options),
});
