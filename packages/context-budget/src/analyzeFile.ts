import { z } from "zod";

import {
  computeGzipRatio,
  computeRedundancyScore,
  computeShannonEntropy,
  computeTTR,
  detectStructuralNoise,
  estimateTokens,
  redundancyLevelFromGzip,
} from "./helpers";

const HealthSchema = z.enum(["good", "normal", "warning", "bad"]);
export type Health = z.infer<typeof HealthSchema>;

export const FileResultSchema = z.object({
  path: z.string(),
  tokens: z.number(),
  threshold: z.number(),
  adaptiveThresholdValue: z.number().optional(),
  ratio: z.number(),
  health: HealthSchema,
  status: z.enum(["ok", "warn", "error"]),
  gzipRatio: z.number().optional(),
  redundancyLevel: z.enum(["shrink", "ok", "dense"]).optional(),
  noiseTokens: z.number().optional(),
  noisePct: z.number().optional(),
  noiseFlagged: z.boolean().optional(),
  ttr: z.number().optional(),
  redundancyScore: z.number().optional(),
  similarityFlags: z
    .array(
      z.object({
        other: z.string(),
        jaccard: z.number(),
        flag: z.enum(["duplication", "merge-candidate"]),
      }),
    )
    .optional(),
});

export type FileResult = z.infer<typeof FileResultSchema>;

const DEFAULT_GOOD_BELOW = 0.6;
const DEFAULT_NORMAL_BELOW = 0.85;

export function toHealth(ratio: number, goodBelow: number, normalBelow: number): Health {
  if (ratio <= goodBelow) return "good";
  if (ratio <= normalBelow) return "normal";
  if (ratio <= 1) return "warning";
  return "bad";
}

export interface AnalyzeFileOptions {
  threshold: number;
  charsPerToken?: number;
  goodBelow?: number;
  normalBelow?: number;
}

/**
 * Pure per-file analysis: calibrated token estimate, gzip-ratio redundancy, structural noise, and
 * the TTR/Shannon-entropy redundancy score. Returns `path: ""` and `status: "ok" | "warn"` —
 * attaching a real path and upgrading `warn` to `error` for a hard-failing file is the caller's
 * policy decision (see cli.ts's checkFile).
 */
export function analyzeFile(content: string, opts: AnalyzeFileOptions): FileResult {
  const { threshold, goodBelow = DEFAULT_GOOD_BELOW, normalBelow = DEFAULT_NORMAL_BELOW } = opts;

  const tokens = estimateTokens(content);
  const ratio = tokens / threshold;
  const health = toHealth(ratio, goodBelow, normalBelow);
  const status = health === "bad" ? "warn" : "ok";
  const gzip = computeGzipRatio(content);
  const noise = detectStructuralNoise(content);
  const ttr = computeTTR(content);
  const entropy = computeShannonEntropy(content);
  const maxEntropy = Math.log2(Math.max(content.split(/\s+/).length, 2));
  const redundancyScore = computeRedundancyScore(gzip, ttr, entropy, maxEntropy);

  return FileResultSchema.parse({
    path: "",
    tokens,
    threshold,
    ratio,
    health,
    status,
    gzipRatio: Math.round(gzip * 1000) / 1000,
    redundancyLevel: redundancyLevelFromGzip(gzip),
    noiseTokens: noise.tokens,
    noisePct: Math.round(noise.pct * 1000) / 1000,
    noiseFlagged: noise.flagged,
    ttr: Math.round(ttr * 1000) / 1000,
    redundancyScore: Math.round(redundancyScore * 1000) / 1000,
  });
}
