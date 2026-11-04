import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

import type { DisplayChoice } from "../../domain/display";
import type { ReleaseUnit } from "../../domain/unit";
import type { Feature, ReleaseFlow, ReleaseModule } from "../../modules/module";
import type { ServiceAdapter } from "../../ports/adapter.port";
import type { ManifestReader } from "../../ports/manifest.port";
import type { ConfigProblem } from "./problem";
import type { UnitFile } from "./readUnitFile";
import { packageJsonManifest } from "../../adapters/manifest/package-json-manifest.adapter";
import { DEFAULT_TAG_FORMAT, TAG_FORMATS, tagFormatNamed } from "../../domain/tags";
import { releaseFlow } from "../releaseFlow";
import { sortProblems } from "./problem";
import { readUnitFile, UNIT_FILE, UNIT_FILES } from "./readUnitFile";
import { isRecord, referencesIn, valueAt } from "./values";
import { expandPatterns, workspacePatterns } from "./workspaceFolders";

const EXTENSIONS = ["ts", "mts", "js", "mjs"];

/** The config's names, the one from before shiplane last: still read, listed to rename. */
export const CONFIG_FILES = [
  ...EXTENSIONS.map((extension) => `shiplane.config.${extension}`),
  ...EXTENSIONS.map((extension) => `release.config.${extension}`),
];

/** A file still under its name from before shiplane, and the name it takes. */
export interface Rename {
  from: string;
  to: string;
}

const renameOf = (file: string): Rename | null =>
  /(^|\/)release\.(config|unit)\./.test(file)
    ? { from: file, to: file.replace(/(^|\/)release\./, "$1shiplane.") }
    : null;

/** The release as composed: the flow, the modules in release order, the features, then the apps. */
export interface Release {
  root: string;
  flow: ReleaseFlow;
  /** What gets released, in release order. */
  modules: ReleaseModule[];
  /** What happens around a release, in the order they run. */
  features: Feature[];
  /** In release order: by module, then by name inside a module. The first is the Latest release. */
  units: ReleaseUnit[];
  problems: ConfigProblem[];
  /** How a tag names a version, such as `{name}@{version}`. */
  tagFormat: string;
  /** How much the release says while it runs, as the config asks. */
  display?: DisplayChoice;
  /** Files still under their name from before shiplane. */
  renames?: Rename[];
}

type Composed = Pick<Release, "flow" | "modules" | "features" | "display" | "tagFormat"> & {
  units?: string[];
};

export interface LoadOptions {
  /** Where `shiplane` resolves from inside the config; by default, this very package. */
  aliases?: Record<string, string>;
  manifests?: ManifestReader;
}

export const findConfig = (root: string) =>
  CONFIG_FILES.map((file) => path.join(root, file)).find((file) => fs.existsSync(file));

// The name a config imports the CLI under.
const NAMES = ["shiplane"];

const resolves = (specifier: string) => {
  try {
    return fileURLToPath(import.meta.resolve(specifier));
  } catch {
    return null;
  }
};

// One alias per entry: a bare "shiplane" alias would also rewrite "shiplane/fly" into a path
// under index.js.
const selfAliases = (): Record<string, string> => {
  const own = NAMES.find((name) => resolves(name) !== null);
  if (!own) return {};
  return Object.fromEntries(
    ["", "/plugin", "/testing"].flatMap((sub) => {
      const target = resolves(`${own}${sub}`);
      return target ? NAMES.map((name) => [`${name}${sub}`, target]) : [];
    }),
  );
};

/** A port no flow fills yet: a release that never loaded has nothing to run on. */
const unset = <Port>(port: string): ServiceAdapter<Port> => ({
  name: "unset",
  create: () => {
    throw new Error(`no ${port} adapter: shiplane.config.ts sets none`);
  },
});

/** The flow of a release that did not load: every port unset. */
const unsetFlow = () =>
  releaseFlow({
    sourceControl: unset("sourceControl"),
    codeHost: unset("codeHost"),
    ciPipeline: unset("ciPipeline"),
    versioning: unset("versioning"),
  });

const FLOW_MISSING = [
  "flow is missing: give it one, such as",
  "flow: releaseFlow({ sourceControl: gitSourceControl(), codeHost: gitHubCodeHost(),",
  "ciPipeline: gitHubActionsCiPipeline(), versioning: changesetsVersioning() }),",
  "from the shiplane-git, shiplane-github and shiplane-changesets plugins",
].join(" ");

const typed = (value: unknown, type: string) =>
  isRecord(value) && value.type === type && typeof value.name === "string";

const isFlow = (value: unknown): value is ReleaseFlow => isRecord(value) && value.type === "flow";
const isModule = (value: unknown): value is ReleaseModule => typed(value, "module");
const isFeature = (value: unknown): value is Feature => typed(value, "feature");

const listOf = <Item>(
  value: unknown,
  key: string,
  is: (candidate: unknown) => candidate is Item,
  example: string,
): Item[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${key} is not a list, such as ${key}: [${example}]`);
  return value.map((item: unknown, index) => {
    if (!is(item)) throw new Error(`${key}[${index}] is not one of its ${key}, such as ${example}`);
    return item;
  });
};

const LEFTOVERS: Record<string, string> = {
  plugins:
    "plugins is gone: defineRelease takes flow, modules and features, such as modules: [backendService({ serverHosting: flyServerHosting() })]",
  latest: "latest is gone: the first app of the first module is the Latest release",
};

/** The modules, their names unique and their adapters' settings free of `module`. */
const checkModules = (modules: readonly ReleaseModule[], features: readonly Feature[]) => {
  const names = [...modules, ...features].map(({ name }) => name);
  names.forEach((name, index) => {
    if (names.indexOf(name) !== index) {
      throw new Error(
        `two modules are named "${name}": give one its own, such as { name: "${name}-2", ... }`,
      );
    }
  });
  const clash = modules.find(({ settings }) => "module" in settings.shape);
  if (clash) {
    throw new Error(
      `"module" is reserved for the unit file's module, yet ${clash.name}'s adapter takes it`,
    );
  }
};

const tagFormatOf = (tag: unknown) => {
  if (tag === undefined) return DEFAULT_TAG_FORMAT;
  const format = typeof tag === "string" ? tagFormatNamed(tag) : undefined;
  if (!format?.includes("{version}")) {
    const names = Object.keys(TAG_FORMATS)
      .map((name) => `"${name}"`)
      .join(", ");
    throw new Error(`tag is one of ${names}, or a format naming the version, such as "v{version}"`);
  }
  return format;
};

const readConfig = async (file: string, aliases: Record<string, string>): Promise<Composed> => {
  const jiti = createJiti(import.meta.url, { alias: aliases, moduleCache: false, fsCache: false });
  const loaded: unknown = await jiti.import(file, { default: true });
  if (!isRecord(loaded)) throw new Error("its default export is not defineRelease({ modules })");
  for (const [key, message] of Object.entries(LEFTOVERS)) {
    if (key in loaded) throw new Error(message);
  }
  if (loaded.flow === undefined) throw new Error(FLOW_MISSING);
  if (!isFlow(loaded.flow)) {
    throw new Error("flow is not a release flow, such as flow: releaseFlow({ ... })");
  }
  const modules = listOf(loaded.modules, "modules", isModule, "webApp({ ... })");
  const features = listOf(loaded.features, "features", isFeature, "releaseComments({ ... })");
  checkModules(modules, features);
  const units = Array.isArray(loaded.units)
    ? loaded.units.filter((unit): unit is string => typeof unit === "string")
    : undefined;
  const display = isRecord(loaded.display) ? loaded.display : {};
  const flag = (value: unknown) => (typeof value === "boolean" ? value : undefined);
  return {
    flow: loaded.flow,
    modules,
    features,
    units,
    display: { verbose: flag(display.verbose), mascot: mascotOf(display.mascot) },
    tagFormat: tagFormatOf(loaded.tag),
  };
};

/** A config's mascot: true, false, frames per mood, or a function; anything else is ignored. */
const mascotOf = (value: unknown): DisplayChoice["mascot"] => {
  if (typeof value === "boolean" || typeof value === "function")
    return value as DisplayChoice["mascot"];
  if (!isRecord(value)) return undefined;
  const frames = Object.entries(value).filter(
    ([, list]) => Array.isArray(list) && list.every((frame) => typeof frame === "string"),
  );
  return frames.length > 0 ? Object.fromEntries(frames) : undefined;
};

interface Read {
  unit: ReleaseUnit;
  file: UnitFile;
}

/** Apps in release order: by module as the config lists them, then by name. */
const inReleaseOrder = (read: readonly Read[], modules: readonly ReleaseModule[]) => {
  const rank = (unit: ReleaseUnit) => modules.findIndex(({ name }) => name === unit.module);
  return [...read].sort(
    (left, right) =>
      rank(left.unit) - rank(right.unit) || left.unit.name.localeCompare(right.unit.name),
  );
};

const referenceProblems = ({ unit, file }: Read, ordered: readonly Read[]): ConfigProblem[] =>
  referencesIn(unit.options).flatMap(({ unit: name, key, at }) => {
    const other = ordered.find((candidate) => candidate.unit.name === name)?.unit;
    const line = file.lineOf(at);
    if (!other) {
      return [{ file: unit.file, line, message: `"${name}" has no ${UNIT_FILE} to read from` }];
    }
    if (valueAt(other.options, key.split(".")) === undefined) {
      return [{ file: unit.file, line, message: `"${name}" has no "${key}" in ${other.file}` }];
    }
    const position = (target: ReleaseUnit) =>
      ordered.findIndex((candidate) => candidate.unit === target);
    if (other !== unit && position(other) > position(unit)) {
      return [
        {
          file: unit.file,
          line,
          message: `"${unit.name}" reads ${name}.${key}, which is released after it`,
          hint:
            other.module === unit.module
              ? `${unit.name} and ${name} share ${unit.module}: give ${name} a module of its own, listed first`
              : `move ${other.module} before ${unit.module} in the modules of shiplane.config.ts`,
        },
      ];
    }
    return [];
  });

/**
 * The release as written: what `shiplane.config.ts` composes, and one app per folder that holds a
 * `shiplane.unit.yml`, in release order. Every problem is collected, never thrown.
 */
export const loadRelease = async (root: string, options: LoadOptions = {}): Promise<Release> => {
  const empty = (problems: ConfigProblem[]): Release => ({
    root,
    flow: unsetFlow(),
    tagFormat: DEFAULT_TAG_FORMAT,
    modules: [],
    features: [],
    units: [],
    problems,
  });
  const configFile = findConfig(root);
  if (!configFile) {
    return empty([
      {
        file: "shiplane.config.ts",
        message: "No shiplane.config.ts in this repository",
        hint: "shiplane init writes it, with a shiplane.unit.yml next to each app",
      },
    ]);
  }
  let config: Composed;
  try {
    config = await readConfig(configFile, options.aliases ?? selfAliases());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return empty([
      { file: path.basename(configFile), message: `it did not load: ${reason.split("\n")[0]}` },
    ]);
  }
  const manifests = options.manifests ?? packageJsonManifest;
  const problems: ConfigProblem[] = [];
  const features = config.features.map(({ name }) => name);
  const read: Read[] = expandPatterns(root, config.units ?? workspacePatterns(root)).flatMap(
    (dir) => {
      const relative = UNIT_FILES.map((name) => path.posix.join(dir, name)).find((file) =>
        fs.existsSync(path.join(root, file)),
      );
      if (!relative) return [];
      const result = readUnitFile(
        relative,
        fs.readFileSync(path.join(root, relative), "utf8"),
        config.modules,
        features,
      );
      problems.push(...result.problems);
      const manifest = manifests.read(root, dir);
      if (!manifest) {
        problems.push({
          file: relative,
          message: "no package.json next to it to read its name and version",
        });
      }
      if (!result.unit || !manifest) return [];
      const unit: ReleaseUnit = {
        name: dir === "." ? manifest.name.replace(/^@[^/]+\//, "") : path.posix.basename(dir),
        dir,
        file: relative,
        packageName: manifest.name,
        version: manifest.version,
        module: result.unit.module,
        ...(result.unit.buildCommand ? { buildCommand: result.unit.buildCommand } : {}),
        options: result.unit.options,
        after: [],
      };
      return [{ unit, file: result.unit }];
    },
  );

  const ordered = inReleaseOrder(read, config.modules);
  ordered.forEach((entry, index) => {
    const twin = ordered.findIndex(({ unit }) => unit.name === entry.unit.name);
    if (twin !== index) {
      problems.push({
        file: entry.unit.file,
        message: `two folders are both named "${entry.unit.name}"`,
        hint: `rename one of ${ordered[twin]?.unit.dir} and ${entry.unit.dir}`,
      });
    }
    problems.push(...referenceProblems(entry, ordered));
    entry.unit.after = [
      ...new Set(referencesIn(entry.unit.options).map(({ unit }) => unit)),
    ].filter((name) => name !== entry.unit.name && ordered.some(({ unit }) => unit.name === name));
  });

  if (ordered.length > 1 && !config.tagFormat.includes("{name}")) {
    problems.push({
      file: path.basename(configFile),
      message: `tag "${config.tagFormat}" names no unit, so ${ordered.length} units would share each tag`,
      hint: 'add {name} to the format, such as "{name}--v{version}", or release one unit',
    });
  }

  return {
    root,
    flow: config.flow,
    modules: config.modules,
    features: config.features,
    units: ordered.map(({ unit }) => unit),
    problems: sortProblems(problems),
    display: config.display,
    renames: [path.basename(configFile), ...ordered.map(({ unit }) => unit.file)].flatMap(
      (file) => renameOf(file) ?? [],
    ),
    tagFormat: config.tagFormat,
  };
};
