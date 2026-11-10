import { z } from "zod";

import type { Environment } from "../../domain/environment";
import type { ReleaseModule } from "../../modules/module";
import { ENV_VAR_NAME } from "../../domain/checkEnvBeforeDeploy";

interface Inspectable {
  def: {
    type: string;
    innerType?: z.ZodType;
    defaultValue?: unknown;
    keyType?: z.ZodType;
    valueType?: z.ZodType;
    element?: z.ZodType;
    options?: z.ZodType[];
    shape?: Record<string, z.ZodType>;
  };
  description?: string;
}

const definition = (schema: z.ZodType) => (schema as unknown as Inspectable).def;

const mapShape = (shape: Record<string, z.ZodType>, map: (schema: z.ZodType) => z.ZodType) =>
  Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, map(value)]));

/**
 * The same schema, refusing unknown keys at every depth. Read through `def.type` rather than
 * `instanceof`: a config loads its own copy of zod.
 */
export const deepStrict = (schema: z.ZodType): z.ZodType => {
  const def = definition(schema);
  const strict = (): z.ZodType => {
    switch (def.type) {
      case "object":
        return z.strictObject(mapShape(def.shape ?? {}, deepStrict));
      case "optional":
        return def.innerType ? deepStrict(def.innerType).optional() : schema;
      case "nullable":
        return def.innerType ? deepStrict(def.innerType).nullable() : schema;
      case "default":
        return def.innerType ? deepStrict(def.innerType).default(def.defaultValue) : schema;
      case "union":
        return z.union((def.options ?? []).map(deepStrict));
      case "record":
        return def.keyType && def.valueType
          ? z.record(def.keyType as z.ZodString, deepStrict(def.valueType))
          : schema;
      case "array":
        return def.element ? z.array(deepStrict(def.element)) : schema;
      default:
        return schema;
    }
  };
  const result = strict();
  const { description } = schema as unknown as Inspectable;
  return description && result !== schema ? result.describe(description) : result;
};

/** The keys an object schema allows at a path, best effort, for "did you mean". */
export const keysAt = (schema: z.ZodType, at: readonly PropertyKey[]): string[] => {
  const def = definition(schema);
  if (def.type === "optional" || def.type === "nullable" || def.type === "default") {
    return def.innerType ? keysAt(def.innerType, at) : [];
  }
  if (def.type === "union") return (def.options ?? []).flatMap((option) => keysAt(option, at));
  if (def.type === "record" && at.length > 0 && def.valueType) {
    return keysAt(def.valueType, at.slice(1));
  }
  if (def.type !== "object") return [];
  const [first, ...rest] = at;
  if (first === undefined) return Object.keys(def.shape ?? {});
  const child = def.shape?.[String(first)];
  return child ? keysAt(child, rest) : [];
};

const envVarNames = z
  .array(z.string().regex(ENV_VAR_NAME, "an env var name is UPPER_SNAKE, like SENTRY_DSN"))
  .describe("Env var names, one per line");

const onlyOn = (environment: Environment) =>
  envVarNames.optional().describe(`Checked on ${environment} only, on top of all`);

const environmentLists = {
  preview: onlyOn("preview"),
  production: onlyOn("production"),
} satisfies Record<Environment, z.ZodOptional<typeof envVarNames>>;

/** One list for every environment, or `all` plus a list per environment. */
export const checkEnvBeforeDeploySchema = z
  .union([
    envVarNames,
    z.strictObject({
      all: envVarNames.optional().describe("Checked on every environment, current and future"),
      ...environmentLists,
    }),
  ])
  .describe(
    "Before each deploy, shiplane checks these env var names are set on the platform; you set the values",
  );

/** What a unit file naming this module may hold: `module`, then its adapter's settings. */
export const unitSchema = (module: ReleaseModule) =>
  z.strictObject({
    module: z
      .literal(module.name)
      .describe(`The module that ships this app, with ${module.provider}`),
    buildCommand: z
      .string()
      .optional()
      .describe('How to build this app, when its package.json has no "build" script'),
    checkEnvBeforeDeploy: checkEnvBeforeDeploySchema.optional(),
    ...mapShape(module.settings.shape, deepStrict),
  });

/** The JSON Schema editors read for `shiplane.unit.yml`: the module an app names picks its keys. */
export const unitJsonSchema = (modules: readonly ReleaseModule[]) =>
  z.toJSONSchema(z.union(modules.map(unitSchema)), { io: "input", unrepresentable: "any" });
