import path from "node:path";
import { Document } from "yaml";
import { z } from "zod";

import type { ReleaseModule } from "../modules/module";
import type { AnyDeliveryAdapter } from "../modules/suggest";
import type { FolderView } from "../ports/delivery.port";
import type { Files } from "../ports/files.port";
import type { Release } from "./config/loadRelease";
import { suggestedModule } from "../modules/suggest";
import { UNIT_FILE } from "./config/readUnitFile";
import { unitJsonSchema } from "./config/unitSchema";

export const CONFIG_FILE = "shiplane.config.ts";
// Generated for the editor, never edited or committed: kept out of the repository's own folders.
export const SCHEMA_FILE = "node_modules/.cache/shiplane/schema.json";
const VSCODE_SETTINGS = ".vscode/settings.json";

/** `cloudflare-pages` → `cloudflarePages`. */
export const factoryName = (name: string) =>
  name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());

/** `fly` serving servers → `flyServerHosting`, the factory an official adapter is imported by. */
export const adapterFactory = ({ name, capability }: AnyDeliveryAdapter) =>
  `${factoryName(name)}${factoryName(`-${capability}`)}`;

/** A module as a config writes it: its factory, its name when not its kind, its adapter. */
export interface ModuleEntry {
  /** `webApp`. */
  factory: string;
  /** The port it fills: `staticHosting`. */
  port: string;
  /** The adapter's factory: `cloudflarePagesStaticHosting`. */
  adapter: string;
  /** Set when another module already holds the kind's name. */
  name?: string;
  /** Where the adapter's factory is imported from. */
  from: string;
}

export const moduleCall = ({ factory, port, adapter, name }: ModuleEntry) =>
  `${factory}({ ${name ? `name: "${name}", ` : ""}${port}: ${adapter}() })`;

/**
 * The module an app ships with, given what the release already composes: the one holding this
 * provider for that kind, else a new one under the kind's name, or the provider's when that is taken.
 */
export const placeModule = (
  adapter: AnyDeliveryAdapter,
  modules: readonly ReleaseModule[],
  pkg: string = INSTALLED,
): { name: string; entry?: ModuleEntry } => {
  // A plugin is `<cli>-<provider>`; the shell adapter is built into the CLI itself.
  const from = adapter.name === "shell" ? pkg : pluginPackage(adapter.name);
  const { kind, factory, port } = suggestedModule(adapter);
  const held = modules.find((module) => module.kind === kind && module.provider === adapter.name);
  if (held) return { name: held.name };
  const taken = modules.some((module) => module.name === kind);
  const name = taken ? `${kind}-${adapter.name}` : kind;
  return {
    name,
    entry: {
      factory,
      port,
      adapter: adapterFactory(adapter),
      from,
      ...(taken ? { name } : {}),
    },
  };
};

/** The name other repositories install the CLI under. */
const INSTALLED = "shiplane";
const NAMES = /shiplane/;

/** Where a plugin is installed from. */
export const pluginPackage = (plugin: string) => `@shiplane/${plugin}`;

/** What a written config imports the CLI as. */
export const releasePackage = (files: Files) => {
  const manifest = JSON.parse(files.read("package.json") ?? "{}") as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = { ...manifest.dependencies, ...manifest.devDependencies };
  return "shiplane" in deps ? "shiplane" : INSTALLED;
};

const importLine = (names: Iterable<string>, from: string) =>
  `import { ${[...new Set(names)].sort().join(", ")} } from "${from}";`;

/** Which adapter fills a flow port in the config: its factory and where it is imported from. */
export interface FlowChoice {
  factory: string;
  from: string;
}

export type FlowPort = "sourceControl" | "codeHost" | "ciPipeline" | "versioning";

export const FLOW_PORTS: readonly FlowPort[] = [
  "sourceControl",
  "codeHost",
  "ciPipeline",
  "versioning",
];

/** The flow init writes when nothing else is chosen: git, GitHub, GitHub Actions, changesets. */
export const DEFAULT_FLOW: Record<FlowPort, FlowChoice> = {
  sourceControl: { factory: "gitSourceControl", from: pluginPackage("git") },
  codeHost: { factory: "gitHubCodeHost", from: pluginPackage("github") },
  ciPipeline: { factory: "gitHubActionsCiPipeline", from: pluginPackage("github") },
  versioning: { factory: "changesetsVersioning", from: pluginPackage("changesets") },
};

/** Versioning from commits: same plugin, and setup offers it when no changesets config exists. */
export const COMMITS_VERSIONING: FlowChoice = {
  factory: "commitsVersioning",
  from: pluginPackage("changesets"),
};

/** Both ways of versioning run on changesets. Private packages, such as plugins, version too. */
export const CHANGESETS_CONFIG = `${JSON.stringify(
  {
    changelog: "@changesets/cli/changelog",
    commit: false,
    fixed: [],
    linked: [],
    access: "restricted",
    baseBranch: "main",
    updateInternalDependencies: "patch",
    ignore: [],
    privatePackages: { version: true, tag: false },
  },
  null,
  2,
)}\n`;

export const CHANGESETS_CLI = { name: "@changesets/cli", version: "^3.0.1" };

/** A root config with this flow (today's by default) and these modules, in the order given. */
export const renderConfig = (
  entries: readonly ModuleEntry[],
  pkg: string = INSTALLED,
  flow: Record<FlowPort, FlowChoice> = DEFAULT_FLOW,
  units?: readonly string[],
) => {
  const byPlugin = new Map<string, string[]>();
  const add = (from: string, name: string) =>
    byPlugin.set(from, [...(byPlugin.get(from) ?? []), name]);
  FLOW_PORTS.forEach((port) => add(flow[port].from, flow[port].factory));
  const own = ["defineRelease", "releaseFlow", ...entries.map(({ factory }) => factory)];
  entries.forEach(({ adapter, from }) => {
    if (from === pkg) own.push(adapter);
    else add(from, adapter);
  });
  const local = (from: string) => from.startsWith(".");
  return [
    importLine(own, pkg),
    ...[...byPlugin]
      .filter(([from]) => !local(from))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([from, names]) => importLine(names, from)),
    ...[...byPlugin]
      .filter(([from]) => local(from))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([from, names]) => importLine(names, from)),
    "",
    "export default defineRelease({",
    "  flow: releaseFlow({",
    ...FLOW_PORTS.map((port) => `    ${port}: ${flow[port].factory}(),`),
    "  }),",
    ...(units ? [`  units: [${units.map((unit) => JSON.stringify(unit)).join(", ")}],`] : []),
    "  // What gets released, in this order. The first app is the repository's Latest release.",
    "  modules: [",
    ...entries.map((entry) => `    ${moduleCall(entry)},`),
    "  ],",
    "});",
    "",
  ].join("\n");
};

/** The index of the bracket closing the one at `open`, or -1. */
const closing = (text: string, open: number) => {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "[") depth += 1;
    if (text[index] === "]") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
};

/** Adds a name to the CLI's import, under whichever name it has, or a new import when there is none. */
const withNamedImport = (config: string, name: string, pkg: string) => {
  const match = new RegExp(`import \\{([^}]*)\\} from "(${NAMES.source})";`).exec(config);
  if (!match) return `import { ${name} } from "${pkg}";\n${config}`;
  const names =
    match[1]
      ?.split(",")
      .map((part) => part.trim())
      .filter(Boolean) ?? [];
  if (names.includes(name)) return config;
  const line = `import { ${[...names, name].sort().join(", ")} } from "${match[2] ?? pkg}";`;
  return config.replace(match[0], line);
};

/** Adds a module and its imports to an existing config, or null when its shape is not ours. */
export const addToConfig = (
  config: string,
  entry: ModuleEntry,
  pkg: string = INSTALLED,
): string | null => {
  const start = config.search(/modules:\s*\[/);
  if (start < 0) return null;
  const open = config.indexOf("[", start);
  const close = closing(config, open);
  if (close < 0) return null;
  const call = moduleCall(entry);
  const inner = config.slice(open + 1, close);
  const trimmed = inner.trimEnd();
  const tail = inner.slice(trimmed.length);
  const comma = trimmed === "" || trimmed.endsWith(",") ? "" : ",";
  const added = inner.includes("\n")
    ? `${trimmed}${comma}\n    ${call},${tail}`
    : `${trimmed}${comma}${trimmed === "" ? "" : " "}${call}${tail}`;
  const withCall = withNamedImport(
    `${config.slice(0, open + 1)}${added}${config.slice(close)}`,
    entry.factory,
    pkg,
  );
  // The built-in shell adapter joins the CLI's own import.
  if (entry.from === pkg) {
    return withNamedImport(withCall, entry.adapter, pkg);
  }
  const importLine = `import { ${entry.adapter} } from "${entry.from}";`;
  if (withCall.includes(importLine)) return withCall;
  const imports = [...withCall.matchAll(/^import [^;]*;$/gm)];
  const last = imports.at(-1);
  const at = last?.index === undefined ? 0 : last.index + last[0].length;
  return `${withCall.slice(0, at)}${at === 0 ? "" : "\n"}${importLine}${at === 0 ? "\n" : ""}${withCall.slice(at)}`;
};

/** A unit file naming its module, with the settings init found, and where it found them. */
export const renderUnit = (
  module: string,
  options: Record<string, unknown>,
  { reason, schemaLine }: { reason?: string; schemaLine?: string },
) => {
  const doc = new Document({ module, ...options });
  doc.commentBefore = [
    ...(schemaLine ? [` yaml-language-server: $schema=${schemaLine}`] : []),
    ` Written by shiplane init. Every key: shiplane docs ${module}`,
    ...(reason ? [` Read from ${reason}`] : []),
  ].join("\n");
  return doc.toString();
};

interface JsonProperty {
  description?: string;
  default?: unknown;
  properties?: Record<string, JsonProperty>;
  required?: string[];
}

interface DocumentedKey {
  key: string;
  description: string;
  default: unknown;
  required: boolean;
}

/** A schema's keys as dotted paths: a nested object lists each of its own keys, not itself. */
const flatten = (
  properties: Record<string, JsonProperty>,
  required: readonly string[],
  prefix = "",
): DocumentedKey[] =>
  Object.entries(properties).flatMap(([name, property]) =>
    property.properties
      ? flatten(property.properties, property.required ?? [], `${prefix}${name}.`)
      : [
          {
            key: `${prefix}${name}`,
            description: property.description ?? "",
            default: property.default,
            required: required.includes(name),
          },
        ],
  );

/** Every key a unit file takes, nested ones as `build.command`, for `shiplane docs`. */
export const documentedKeys = (settings: z.ZodObject): DocumentedKey[] => {
  const schema = z.toJSONSchema(settings, { io: "input", unrepresentable: "any" }) as JsonProperty;
  return flatten(schema.properties ?? {}, schema.required ?? []);
};

/** Each key a schema takes, with its description and default, from its JSON Schema. */
export const settingsKeys = (settings: z.ZodObject) => {
  const schema = z.toJSONSchema(settings, { io: "input", unrepresentable: "any" }) as {
    properties?: Record<string, JsonProperty>;
    required?: string[];
  };
  return Object.entries(schema.properties ?? {}).map(([key, property]) => ({
    key,
    description: property.description ?? "",
    default: property.default,
    required: schema.required?.includes(key) ?? false,
  }));
};

/** A unit file with only its module set and every other key commented, described. */
export const renderBlankUnit = (module: string, settings: z.ZodObject, schemaLine?: string) =>
  [
    ...(schemaLine ? [`# yaml-language-server: $schema=${schemaLine}`] : []),
    `# Written by shiplane init --blank. Uncomment and fill what applies.`,
    `module: ${module}`,
    ...settingsKeys(settings).flatMap(({ key, description, default: fallback, required }) => [
      "",
      `# ${description}${required ? " (required)" : ""}`,
      `# ${key}:${fallback === undefined ? "" : ` ${JSON.stringify(fallback)}`}`,
    ]),
    "",
  ].join("\n");

/** The schema a unit file's editor reads, relative to that unit file. */
export const schemaLineFor = (dir: string) => path.posix.relative(dir, SCHEMA_FILE) || SCHEMA_FILE;

/** The JSON Schema for every unit file: the module an app names picks the keys it takes. */
export const schemaText = (modules: readonly ReleaseModule[]) =>
  `${JSON.stringify(unitJsonSchema(modules), null, 2)}\n`;

/**
 * Writes the editor schema when it no longer matches the composed modules. It is generated, never
 * committed: every command keeps it current. True when it wrote.
 */
export const refreshEditorSchema = (files: Files, release: Release) => {
  const text = schemaText(release.modules);
  if (files.read(SCHEMA_FILE) === text) return false;
  files.write(SCHEMA_FILE, text);
  return true;
};

/** Maps every unit file to the schema once, keeping a settings file's comments as they are. */
export const withEditorSchema = (settings: string | null): string | null => {
  const entry = `"yaml.schemas": { "./${SCHEMA_FILE}": "**/${UNIT_FILE}" }`;
  if (settings === null) return `{\n  ${entry}\n}\n`;
  if (settings.includes('"yaml.schemas"')) return null;
  const open = settings.indexOf("{");
  if (open < 0) return null;
  return `${settings.slice(0, open + 1)}\n  ${entry},${settings.slice(open + 1)}`;
};

export const editorSettingsFile = VSCODE_SETTINGS;

/** A folder as adapters see it when recognising what ships from it. */
export const folderView = (files: Files, dir: string): FolderView => ({
  dir,
  name: path.posix.basename(dir),
  files: files.list(dir),
  has: (file) => files.exists(path.posix.join(dir, file)),
  read: (file) => files.read(path.posix.join(dir, file)),
});

/** The repository's short name: its package name without scope, else its folder's. */
export const repositoryName = (files: Files, root: string) => {
  const parsed = z
    .object({ name: z.string() })
    .safeParse(JSON.parse(files.read("package.json") ?? "{}"));
  return parsed.success ? parsed.data.name.replace(/^@[^/]+\//, "") : path.basename(root);
};
