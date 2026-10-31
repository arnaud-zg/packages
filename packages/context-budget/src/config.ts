import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

// ─── Defaults ─────────────────────────────────────────────────────────────────

const ROOT_DEFAULTS = {
  file: "CLAUDE.md",
  referencePattern: "`(\\.planning/codebase/[^`]+\\.md)`",
  threshold: 3500,
} as const;

const REF_DEFAULTS = {
  threshold: 2000,
  failOnExceed: false,
} as const;

const SUBDIR_DEFAULTS = {
  dirs: ["apps", "packages"],
  threshold: 1500,
  failOnExceed: false,
} as const;

const HEALTH_DEFAULTS = {
  goodBelow: 0.6,
  normalBelow: 0.85,
} as const;

export const ConfigSchema = z.object({
  charsPerToken: z.number().int().positive().default(4),
  root: z
    .object({
      file: z.string().default(ROOT_DEFAULTS.file),
      referencePattern: z.string().default(ROOT_DEFAULTS.referencePattern),
      threshold: z.number().int().positive().default(ROOT_DEFAULTS.threshold),
    })
    .default(ROOT_DEFAULTS),
  references: z
    .object({
      threshold: z.number().int().positive().default(REF_DEFAULTS.threshold),
      failOnExceed: z.boolean().default(REF_DEFAULTS.failOnExceed),
    })
    .default(REF_DEFAULTS),
  subdir: z
    .object({
      dirs: z.array(z.string()).default([...SUBDIR_DEFAULTS.dirs]),
      threshold: z.number().int().positive().default(SUBDIR_DEFAULTS.threshold),
      failOnExceed: z.boolean().default(SUBDIR_DEFAULTS.failOnExceed),
    })
    .default({ ...SUBDIR_DEFAULTS, dirs: [...SUBDIR_DEFAULTS.dirs] }),
  health: z
    .object({
      goodBelow: z.number().min(0).max(1).default(HEALTH_DEFAULTS.goodBelow),
      normalBelow: z.number().min(0).max(1).default(HEALTH_DEFAULTS.normalBelow),
    })
    .refine((health) => health.goodBelow < health.normalBelow, {
      message: "health.goodBelow must be lower than health.normalBelow",
    })
    .default(HEALTH_DEFAULTS),
  // Directory scanned for orphaned reference docs (files not linked from `root.file`).
  planningDir: z.string().default(".planning/codebase"),
});

export type Config = z.infer<typeof ConfigSchema>;

const DEFAULT_CONFIG_FILE = "context-budget.config.json";

/**
 * Loads config overrides from a JSON file (defaulting to ./context-budget.config.json), deep-merged
 * over ConfigSchema's own per-field defaults. With no file present, returns the defaults.
 */
export function loadConfig(configPath?: string): Config {
  const resolvedPath = configPath ?? DEFAULT_CONFIG_FILE;
  if (!existsSync(resolvedPath)) return ConfigSchema.parse({});

  const overrides: unknown = JSON.parse(readFileSync(resolvedPath, "utf-8"));
  return ConfigSchema.parse(overrides);
}
