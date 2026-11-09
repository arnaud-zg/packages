import type { Document } from "yaml";
import type { z } from "zod";
import { isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";

import type { EnvVarName } from "../../domain/checkEnvBeforeDeploy";
import type { Environment } from "../../domain/environment";
import type { ReleaseModule } from "../../modules/module";
import type { ConfigProblem } from "./problem";
import { EnvToCheck, isEnvVarName } from "../../domain/checkEnvBeforeDeploy";
import { didYouMean } from "./problem";
import { checkEnvBeforeDeploySchema, keysAt, unitSchema } from "./unitSchema";
import { isRecord } from "./values";

export const UNIT_FILE = "shiplane.unit.yml";
/** The name unit files had before shiplane: still read, listed to rename. */
export const LEGACY_UNIT_FILE = "release.unit.yml";
export const UNIT_FILES = [UNIT_FILE, LEGACY_UNIT_FILE];

export interface UnitFile {
  /** The module that ships it. */
  module: string;
  /** Its `buildCommand:`, when it says one. */
  buildCommand?: string;
  /** Its `checkEnvBeforeDeploy:`, when it lists one. */
  checkEnvBeforeDeploy?: EnvToCheck;
  options: Record<string, unknown>;
  /** The line a key path sits on, for problems found after reading. */
  lineOf: (at: readonly string[]) => number | undefined;
}

const locate =
  (doc: Document, counter: LineCounter) =>
  (at: readonly PropertyKey[], key?: string): number | undefined => {
    let node: unknown = doc.contents;
    for (const segment of at) {
      if (!isMap(node) && !isSeq(node)) return undefined;
      node = node.get(segment, true);
    }
    if (key !== undefined && isMap(node)) {
      node = node.items.find((pair) => isScalar(pair.key) && pair.key.value === key)?.key;
    }
    const offset = (node as { range?: number[] } | undefined)?.range?.[0];
    return offset === undefined ? undefined : counter.linePos(offset).line;
  };

/** Of a union's branches, the one written in the right shape: its problems are inside, not the shape. */
const closestBranch = (branches: readonly (readonly z.core.$ZodIssue[])[]) =>
  branches.find((issues) =>
    issues.every(({ code, path }) => !(code === "invalid_type" && path.length === 0)),
  );

const describeIssue = (
  issue: z.core.$ZodIssue,
  file: string,
  module: ReleaseModule,
  lineAt: ReturnType<typeof locate>,
): ConfigProblem[] => {
  const at = issue.path;
  if (issue.code === "invalid_union") {
    const branch = closestBranch(issue.errors);
    if (branch) {
      return branch.flatMap((inner) =>
        describeIssue({ ...inner, path: [...at, ...inner.path] }, file, module, lineAt),
      );
    }
  }
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => ({
      file,
      line: lineAt(at, key),
      message: `unknown key "${[...at, key].join(".")}" for ${module.name}`,
      hint: didYouMean(key, keysAt(module.settings, at)),
    }));
  }
  const name = at.join(".");
  if (issue.code === "invalid_type" && issue.message.endsWith("received undefined")) {
    // A missing key has no line of its own: its parent map's, unless that is the whole file.
    const line = at.length > 1 ? lineAt(at.slice(0, -1)) : undefined;
    return [{ file, line, message: `"${name}" is required` }];
  }
  return [{ file, line: lineAt(at), message: `"${name}": ${issue.message}` }];
};

const CORE_KEYS = new Set(["module", "buildCommand", "checkEnvBeforeDeploy"]);

const envVarNames = (list: readonly string[] = []) => list.filter(isEnvVarName);

const envToCheck = (written: z.infer<typeof checkEnvBeforeDeploySchema>) =>
  new EnvToCheck(
    Array.isArray(written)
      ? envVarNames(written)
      : {
          all: envVarNames(written.all),
          ...({
            preview: envVarNames(written.preview),
            production: envVarNames(written.production),
          } satisfies Record<Environment, EnvVarName[]>),
        },
  );

const problem = (file: string, line: number | undefined, message: string, hint: string) => ({
  problems: [{ file, line, message, hint }],
});

/** A unit file checked against the adapter of the module it names, every problem with its line. */
export const readUnitFile = (
  file: string,
  text: string,
  modules: readonly ReleaseModule[],
  features: readonly string[] = [],
): { unit?: UnitFile; problems: ConfigProblem[] } => {
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter, uniqueKeys: true, prettyErrors: false });
  if (doc.errors.length > 0) {
    return {
      problems: doc.errors.map((error) => ({
        file,
        line: counter.linePos(error.pos[0]).line,
        message: error.message.split("\n")[0] ?? error.message,
      })),
    };
  }
  const lineAt = locate(doc, counter);
  const data: unknown = doc.toJS();
  const names = modules.map(({ name }) => name);
  const oneOf = `one of: ${names.join(", ")}`;
  if (isRecord(data) && "target" in data && !("module" in data)) {
    return problem(
      file,
      lineAt(["target"]),
      "target: is now module: the module in shiplane.config.ts that ships this app",
      oneOf,
    );
  }
  if (!isRecord(data) || typeof data.module !== "string") {
    return problem(file, 1, "a unit file starts with module: the module that ships it", oneOf);
  }
  const named = data.module;
  const module = modules.find(({ name }) => name === named);
  if (features.includes(named)) {
    return problem(
      file,
      lineAt(["module"]),
      `"${named}" ships no app: it runs on every ship`,
      oneOf,
    );
  }
  if (!module) {
    return problem(
      file,
      lineAt(["module"]),
      `no module named "${named}" in shiplane.config.ts`,
      didYouMean(named, names) ?? oneOf,
    );
  }
  const parsed = unitSchema(module).safeParse(data);
  if (!parsed.success) {
    return {
      problems: parsed.error.issues.flatMap((issue) => describeIssue(issue, file, module, lineAt)),
    };
  }
  const options = Object.fromEntries(Object.entries(data).filter(([key]) => !CORE_KEYS.has(key)));
  const buildCommand = typeof data.buildCommand === "string" ? data.buildCommand : undefined;
  const written = parsed.data.checkEnvBeforeDeploy;
  return {
    unit: {
      module: named,
      ...(buildCommand ? { buildCommand } : {}),
      ...(written ? { checkEnvBeforeDeploy: envToCheck(written) } : {}),
      options,
      lineOf: (at) => lineAt(at),
    },
    problems: [],
  };
};
