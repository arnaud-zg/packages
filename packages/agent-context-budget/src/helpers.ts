/* eslint-disable @typescript-eslint/no-non-null-assertion */
// noUncheckedIndexedAccess is enabled; ! assertions below are all bounded-loop accesses
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

// ─── A: Calibrated piecewise token estimator ─────────────────────────────────

// Empirically derived coefficients per content type.
// Prose merges well under BPE (4 chars → 1 token on average English).
// Code/identifiers and symbols are less compressible (~2.8 chars/token).
// Markdown structure (pipes, dashes, hashes) tokenizes poorly (~2.2 chars/token).
const CHARS_PER_TOKEN = {
  prose: 4.0,
  code: 2.8,
  structural: 2.2,
} as const;

export function estimateTokens(content: string): number {
  const lines = content.split("\n");
  let proseChars = 0;
  let codeChars = 0;
  let structuralChars = 0;
  let inCodeFence = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^```|^~~~/.test(trimmed)) {
      inCodeFence = !inCodeFence;
      structuralChars += line.length + 1;
      continue;
    }

    if (inCodeFence) {
      codeChars += line.length + 1;
      continue;
    }

    if (trimmed.startsWith("|")) {
      structuralChars += line.length + 1;
      continue;
    }

    if (/^[-─═*_]{3,}\s*$/.test(trimmed)) {
      structuralChars += line.length + 1;
      continue;
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      structuralChars += line.length + 1;
      continue;
    }

    // Blank lines cost almost nothing — count as 1 char each
    if (trimmed === "") {
      proseChars += 1;
      continue;
    }

    proseChars += line.length + 1;
  }

  return Math.round(
    proseChars / CHARS_PER_TOKEN.prose +
      codeChars / CHARS_PER_TOKEN.code +
      structuralChars / CHARS_PER_TOKEN.structural,
  );
}

// ─── B: Section-level Pareto analysis ────────────────────────────────────────

export interface Section {
  heading: string;
  level: number;
  tokens: number;
}

export function parseSections(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];
  let heading = "(preamble)";
  let level = 0;
  let buf: string[] = [];
  let inCodeFence = false;

  const flush = () => {
    if (buf.length > 0) {
      sections.push({ heading, level, tokens: estimateTokens(buf.join("\n")) });
      buf = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^```|^~~~/.test(trimmed)) {
      inCodeFence = !inCodeFence;
    }

    if (!inCodeFence) {
      const m = /^(#{1,6})\s+(.+)/.exec(trimmed);
      if (m) {
        flush();
        level = m[1]!.length;
        heading = m[2]!.trim();
        continue;
      }
    }

    buf.push(line);
  }

  flush();
  return sections;
}

export interface ParetoSection extends Section {
  pct: number;
  flagExtract: boolean;
}

export function computePareto(
  sections: Section[],
  fileTokens: number,
  fileRatio: number,
): ParetoSection[] {
  return [...sections]
    .sort((a, b) => b.tokens - a.tokens)
    .map((s) => ({
      ...s,
      pct: fileTokens > 0 ? s.tokens / fileTokens : 0,
      flagExtract: fileTokens > 0 && s.tokens / fileTokens >= 0.2 && fileRatio >= 0.85,
    }));
}

// ─── E: Gzip-ratio redundancy proxy ──────────────────────────────────────────

export type RedundancyLevel = "shrink" | "ok" | "dense";

export function computeGzipRatio(content: string): number {
  const raw = Buffer.from(content, "utf-8");
  if (raw.length === 0) return 1;
  const compressed = gzipSync(raw, { level: 9 });
  return compressed.length / raw.length;
}

export function redundancyLevelFromGzip(ratio: number): RedundancyLevel {
  if (ratio < 0.3) return "shrink";
  if (ratio > 0.55) return "dense";
  return "ok";
}

// ─── D: Structural-noise budget ───────────────────────────────────────────────

export interface NoiseResult {
  tokens: number;
  pct: number;
  flagged: boolean;
}

const NOISE_THRESHOLD = 0.1;

export function detectStructuralNoise(content: string): NoiseResult {
  let noiseChars = 0;

  // Horizontal rules
  for (const m of content.matchAll(/^[-─═*_]{3,}\s*$/gm)) {
    noiseChars += m[0].length + 1;
  }

  // HTML comments
  for (const m of content.matchAll(/<!--[\s\S]*?-->/g)) {
    noiseChars += m[0].length;
  }

  // Table separator rows (| :--- | :---: | ---: |)
  for (const m of content.matchAll(/^\|[-: |]+\|$/gm)) {
    noiseChars += m[0].length + 1;
  }

  // Consecutive blank lines beyond 1 (each extra newline is waste)
  for (const m of content.matchAll(/\n{3,}/g)) {
    noiseChars += m[0].length - 2;
  }

  const noiseTokens = Math.round(noiseChars / CHARS_PER_TOKEN.structural);
  const fileTokens = estimateTokens(content);
  const pct = fileTokens > 0 ? noiseTokens / fileTokens : 0;

  return { tokens: noiseTokens, pct, flagged: pct > NOISE_THRESHOLD };
}

// ─── F: TTR + Shannon entropy + Redundancy Score ──────────────────────────────

function stripMarkdown(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^#{1,6}\s/gm, "")
    .replace(/\|[^\n]*/g, "")
    .replace(/[*_~[\]()]/g, "")
    .toLowerCase();
}

export function computeTTR(content: string): number {
  const words = stripMarkdown(content).match(/\b[a-z]{2,}\b/g) ?? [];
  if (words.length < 10) return 1;
  return new Set(words).size / words.length;
}

export function computeShannonEntropy(content: string): number {
  const words = stripMarkdown(content).match(/\b[a-z]{2,}\b/g) ?? [];
  if (words.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  let H = 0;
  for (const count of freq.values()) {
    const p = count / words.length;
    H -= p * Math.log2(p);
  }
  return H;
}

export function computeRedundancyScore(
  gzipRatio: number,
  ttr: number,
  entropy: number,
  maxEntropy: number,
): number {
  const w1 = 0.5,
    w2 = 0.3,
    w3 = 0.2;
  const H = maxEntropy > 0 ? entropy / maxEntropy : 0;
  return w1 * (1 - gzipRatio) + w2 * (1 - ttr) + w3 * (1 - H);
}

// ─── H + I: Robust statistics ─────────────────────────────────────────────────

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function mad(values: number[], med: number): number {
  return median(values.map((v) => Math.abs(v - med)));
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
}

export function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

export function adaptiveThreshold(tokenValues: number[]): number {
  if (tokenValues.length < 3) return 0;
  const med = median(tokenValues);
  return Math.round(med + 1.5 * mad(tokenValues, med));
}

// ─── C: MinHash cross-file similarity ────────────────────────────────────────

// Deterministic multiplicative hash — no external deps required
function hashStr(s: string, seed: number): number {
  let h = (seed >>> 0) ^ 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const K_SHINGLE = 5;
const NUM_HASHES = 128;
const SEEDS = Array.from({ length: NUM_HASHES }, (_, i) => (i * 2654435761) >>> 0);

export function extractShingles(content: string, k = K_SHINGLE): Set<string> {
  const words = stripMarkdown(content).match(/\b[a-z]{2,}\b/g) ?? [];
  const out = new Set<string>();
  for (let i = 0; i <= words.length - k; i++) {
    out.add(words.slice(i, i + k).join(" "));
  }
  return out;
}

export function minHash(shingles: Set<string>, numHashes = NUM_HASHES): number[] {
  const sig = new Array<number>(numHashes).fill(Infinity);
  for (const s of shingles) {
    for (let i = 0; i < numHashes; i++) {
      const h = hashStr(s, SEEDS[i]!);
      if (h < sig[i]!) sig[i] = h;
    }
  }
  return sig;
}

export function jaccardFromMinHash(sigA: number[], sigB: number[]): number {
  // An all-Infinity signature comes from an empty shingle set: nothing to compare.
  if (sigA[0] === Infinity || sigB[0] === Infinity) return 0;
  let matches = 0;
  for (let i = 0; i < sigA.length; i++) {
    if (sigA[i] === sigB[i]) matches++;
  }
  return matches / sigA.length;
}

export type SimilarityFlag = "duplication" | "merge-candidate" | null;

export interface SimilarityPair {
  fileA: string;
  fileB: string;
  jaccard: number;
  flag: SimilarityFlag;
}

export function findSimilarFiles(
  files: Array<{ path: string; content: string }>,
  jMerge = 0.3,
  jDup = 0.6,
): SimilarityPair[] {
  const sigs = files.map((f) => ({ path: f.path, sig: minHash(extractShingles(f.content)) }));
  const pairs: SimilarityPair[] = [];

  for (let i = 0; i < sigs.length; i++) {
    for (let j = i + 1; j < sigs.length; j++) {
      const jaccard = jaccardFromMinHash(sigs[i]!.sig, sigs[j]!.sig);
      const flag: SimilarityFlag =
        jaccard >= jDup ? "duplication" : jaccard >= jMerge ? "merge-candidate" : null;
      if (flag !== null) {
        pairs.push({ fileA: sigs[i]!.path, fileB: sigs[j]!.path, jaccard, flag });
      }
    }
  }

  return pairs.sort((a, b) => b.jaccard - a.jaccard);
}

// ─── L: SHA-1 cache key ───────────────────────────────────────────────────────

export function sha1(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}
