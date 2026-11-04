import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  BumpLevel,
  PlannedChangeset,
  ServiceAdapter,
  Shell,
  VersioningPort,
} from "shiplane/plugin";
import { expandPatterns, workspacePatterns, z } from "shiplane/plugin";

export interface ChangesetsOptions {
  /** What versions the repository: `changeset version` by default. */
  version?: string[];
}

const BumpSchema = z.enum(["major", "minor", "patch", "none"]);
const StatusPlanSchema = z.object({
  changesets: z.array(
    z.object({
      id: z.string(),
      summary: z.string(),
      releases: z.array(z.object({ name: z.string(), type: BumpSchema })),
    }),
  ),
  releases: z.array(
    z.object({
      name: z.string(),
      type: BumpSchema,
      oldVersion: z.string(),
      newVersion: z.string(),
      changesets: z.array(z.string()),
    }),
  ),
});
const PackageSchema = z.object({
  name: z.string(),
  dependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
});

const LINE = /^"([^"]+)":\s*(\w+)\s*$/;
const BUMP_AT_LINE_END = /(major|minor|patch)(\s*)$/;
const SMALLEST_FIRST: readonly string[] = ["patch", "minor", "major"];

/** A changeset's text with no line above `ceiling`; its summary stays as it was written. */
const cappedText = (text: string, ceiling: BumpLevel) => {
  const [before = "", frontmatter = "", ...rest] = text.split("---");
  const lines = frontmatter
    .split("\n")
    .map((line) =>
      line.replace(BUMP_AT_LINE_END, (bump: string, level: string, end: string) =>
        SMALLEST_FIRST.indexOf(level) > SMALLEST_FIRST.indexOf(ceiling) ? `${ceiling}${end}` : bump,
      ),
    );
  return [before, lines.join("\n"), ...rest].join("---");
};

const changesetsFiles = (
  root: string,
  shell: Shell,
  options: ChangesetsOptions,
): VersioningPort => {
  const dir = path.join(root, ".changeset");
  const fileOf = (id: string) => path.join(dir, `${id}.md`);
  const write = ({ id, releases, summary }: PlannedChangeset) =>
    fs.writeFileSync(
      fileOf(id),
      `---\n${releases.map(({ name, type }) => `"${name}": ${type}`).join("\n")}\n---\n\n${summary}\n`,
    );
  const workspacePackages = () =>
    expandPatterns(root, workspacePatterns(root)).flatMap((folder) => {
      const file = path.join(root, folder, "package.json");
      if (!fs.existsSync(file)) return [];
      const parsed = PackageSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
      return parsed.success ? [{ folder, pkg: parsed.data }] : [];
    });
  const pendingIds = () =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((file) => file.endsWith(".md") && file !== "README.md")
          .map((file) => file.slice(0, -3))
      : [];

  /** Leaves only what ships in `.changeset`; the returned function puts the held files back. */
  const holdBack = (held: readonly PlannedChangeset[]) => {
    const originals = new Map(held.map(({ id }) => [id, fs.readFileSync(fileOf(id), "utf8")]));
    held.forEach(({ id, releases }) => {
      const original = originals.get(id) ?? "";
      const [, frontmatter = "", ...rest] = original.split("---");
      const waiting = new Set(releases.map(({ name }) => name));
      const shipping = frontmatter.split("\n").filter((line) => {
        const match = LINE.exec(line.trim());
        return match && !waiting.has(match[1] ?? "");
      });
      if (shipping.length === 0) fs.rmSync(fileOf(id));
      else fs.writeFileSync(fileOf(id), `---\n${shipping.join("\n")}\n---${rest.join("---")}`);
    });
    return () => originals.forEach((text, id) => fs.writeFileSync(fileOf(id), text));
  };

  /** Rewrites what ships to `ceiling` at most; the returned function puts the files back. */
  const capAt = (ceiling: BumpLevel | undefined) => {
    if (!ceiling) return () => undefined;
    const originals = new Map(pendingIds().map((id) => [id, fs.readFileSync(fileOf(id), "utf8")]));
    originals.forEach((text, id) => fs.writeFileSync(fileOf(id), cappedText(text, ceiling)));
    return () => originals.forEach((text, id) => fs.writeFileSync(fileOf(id), text));
  };

  return {
    pending: () =>
      Promise.resolve(
        pendingIds().map((id) => ({ id, text: fs.readFileSync(fileOf(id), "utf8") })),
      ),
    // changeset status computes every move, dependents included, without writing anything. What
    // the release adds, holds back and caps lasts only for the time of the call.
    plan: async (added, held, ceiling) => {
      const output = path.join(os.tmpdir(), `release-status-${process.pid}.json`);
      added.forEach(write);
      const restore = holdBack(held);
      const uncap = capAt(ceiling);
      try {
        // changeset status writes nothing and exits 1 when no changeset is left.
        if (pendingIds().length === 0) return { changesets: [], releases: [] };
        await shell.capture("pnpm", ["exec", "changeset", "status", `--output=${output}`], {
          cwd: root,
        });
        return StatusPlanSchema.parse(JSON.parse(fs.readFileSync(output, "utf8")));
      } finally {
        uncap();
        restore();
        added.forEach(({ id }) => fs.rmSync(fileOf(id), { force: true }));
        fs.rmSync(output, { force: true });
      }
    },
    apply: async (added, held, ceiling) => {
      added.forEach(write);
      const restore = holdBack(held);
      const uncap = capAt(ceiling);
      try {
        const [command = "pnpm", ...args] = options.version ?? [
          "pnpm",
          "exec",
          "changeset",
          "version",
        ];
        // A GitHub changelog asks GitHub who wrote each change: gh's sign-in answers it.
        const token = shell.env("GITHUB_TOKEN")
          ? undefined
          : (await shell.capture("gh", ["auth", "token"])).stdout.trim();
        const status = await shell.attach(command, args, {
          cwd: root,
          ...(token ? { env: { GITHUB_TOKEN: token } } : {}),
        });
        if (status !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${status}`);
      } catch (error) {
        // Versioning consumes what it caps; had it failed, the undo goes back to main with these.
        uncap();
        added.forEach(({ id }) => fs.rmSync(fileOf(id), { force: true }));
        throw error;
      } finally {
        restore();
      }
      // A held changeset that also named a released unit keeps only its waiting lines.
      held.forEach(write);
    },
    write: (changeset) => {
      write(changeset);
      return Promise.resolve();
    },
    dependencies: () => {
      const packages = workspacePackages().map(({ pkg }) => pkg);
      const names = new Set(packages.map(({ name }) => name));
      // Only runtime dependencies move a dependent's version.
      return Promise.resolve(
        Object.fromEntries(
          packages.map((pkg) => [
            pkg.name,
            Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }).filter((dep) =>
              names.has(dep),
            ),
          ]),
        ),
      );
    },
    folders: () =>
      Promise.resolve(
        Object.fromEntries(workspacePackages().map(({ folder, pkg }) => [pkg.name, folder])),
      ),
    nextChange: "pnpm changeset",
    changesetFile: (id) => path.posix.join(".changeset", `${id}.md`),
    changelogFile: (folder) => path.posix.join(folder, "CHANGELOG.md"),
  };
};

export type ChangesetsVersioningAdapter = ServiceAdapter<VersioningPort>;

/** Versioning from `.changeset` files, through the changesets CLI. */
export const changesetsVersioning = (
  options: ChangesetsOptions = {},
): ChangesetsVersioningAdapter => ({
  name: "changesets",
  create: ({ root, shell }) => changesetsFiles(root, shell, options),
});
