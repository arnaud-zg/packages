#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";

import type { FileResult, Health } from "./analyzeFile";
import type { Config } from "./config";
import type { SimilarityPair } from "./helpers";
import { analyzeFile, toHealth } from "./analyzeFile";
import { loadConfig } from "./config";
import {
  adaptiveThreshold,
  coefficientOfVariation,
  computePareto,
  findSimilarFiles,
  parseSections,
  percentile,
} from "./helpers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Group = "root" | "reference" | "subdir";

function healthIcon(health: Health): string {
  return { good: "✓", normal: "~", warning: "⚠", bad: "✗" }[health];
}

function healthLabel(health: Health): string {
  return { good: "GOOD", normal: "NORMAL", warning: "WARNING", bad: "BAD" }[health];
}

function bar(ratio: number, width = 10): string {
  const filled = Math.min(Math.round(ratio * width), width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function readContent(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function extractReferences(content: string, referencePattern: string): string[] {
  const pattern = new RegExp(referencePattern, "g");
  const refs = [...content.matchAll(pattern)]
    .map((m) => m[1])
    .filter((ref): ref is string => ref !== undefined);
  return [...new Set(refs)];
}

function findSubdirClaudeMd(dirs: string[]): string[] {
  const results: string[] = [];
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidate = join(dir, entry, "CLAUDE.md");
      try {
        statSync(candidate);
        results.push(candidate);
      } catch {
        // not found
      }
    }
  }
  return results.sort();
}

function checkFile(
  path: string,
  content: string,
  threshold: number,
  failOnExceed: boolean,
  config: Config,
): FileResult {
  const metrics = analyzeFile(content, {
    threshold,
    goodBelow: config.health.goodBelow,
    normalBelow: config.health.normalBelow,
  });
  const status = metrics.health === "bad" ? (failOnExceed ? "error" : "warn") : "ok";
  return { ...metrics, path, status };
}

// ─── Reference-graph health ───────────────────────────────────────────────────

function analyzeRefGraph(
  refs: string[],
  planningDir: string,
): { orphans: string[]; deadRefs: string[] } {
  const deadRefs = refs.filter((r) => !existsSync(r));
  let orphans: string[] = [];
  try {
    const planningFiles = readdirSync(planningDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(planningDir, f));
    orphans = planningFiles.filter((f) => !refs.includes(f));
  } catch {
    // dir not found — not an error
  }
  return { orphans, deadRefs };
}

// ─── Print helpers ────────────────────────────────────────────────────────────

function printSection(title: string, results: FileResult[]): void {
  console.info(`\n${title}`);
  for (const r of results) {
    const pct = Math.round(r.ratio * 100);
    const noiseTag = r.noiseFlagged ? " ⚠ noise" : "";
    const redundancyTag = r.redundancyLevel === "shrink" ? " ⚠ redundant" : "";
    console.info(
      `  ${healthIcon(r.health)} ${r.path.padEnd(52)} ${String(r.tokens).padStart(5)} tokens  ${bar(r.ratio)}  ${pct}%  ${healthLabel(r.health)}${noiseTag}${redundancyTag}`,
    );
  }
}

function printPareto(result: FileResult, content: string): void {
  const sections = parseSections(content);
  const pareto = computePareto(sections, result.tokens, result.ratio);
  if (pareto.length === 0) return;

  console.info(`\n  Pareto breakdown — ${result.path}`);
  const shown = pareto.slice(0, 5);
  for (const s of shown) {
    const pct = Math.round(s.pct * 100);
    const flag = s.flagExtract ? "  ← EXTRACT" : "";
    const indent = "  ".repeat(Math.max(0, s.level - 1));
    console.info(
      `    ${indent}${"#".repeat(s.level)} ${s.heading.padEnd(44 - indent.length)} ${String(s.tokens).padStart(5)} tokens  ${pct}%${flag}`,
    );
  }
  if (pareto.length > 5) {
    const rest = pareto.slice(5).reduce((s, p) => s + p.tokens, 0);
    console.info(`    … ${pareto.length - 5} more sections — ${rest} tokens combined`);
  }
}

function printExplain(result: FileResult, content: string): void {
  console.info(`\n=== Detailed report: ${result.path} ===`);
  const pct = Math.round(result.ratio * 100);
  console.info(
    `  Tokens: ${result.tokens.toLocaleString()} / ${result.threshold.toLocaleString()}  ${bar(result.ratio)}  ${pct}%  ${healthLabel(result.health)}`,
  );
  console.info(`  Gzip ratio:       ${result.gzipRatio}  (${result.redundancyLevel})`);
  console.info(
    `  Structural noise: ${result.noiseTokens} tokens (${Math.round((result.noisePct ?? 0) * 100)}%)${result.noiseFlagged ? "  ← FLAG: reformat" : ""}`,
  );
  console.info(
    `  Type-Token Ratio: ${result.ttr}${(result.ttr ?? 1) < 0.35 ? "  ← low (repetitive)" : ""}`,
  );
  console.info(`  Redundancy Score: ${result.redundancyScore}`);

  if (result.similarityFlags && result.similarityFlags.length > 0) {
    console.info(`  Similarity flags:`);
    for (const sf of result.similarityFlags) {
      console.info(
        `    ${sf.flag.toUpperCase().padEnd(16)} J=${sf.jaccard.toFixed(2)}  vs  ${sf.other}`,
      );
    }
  }

  printPareto(result, content);
}

// ─── Adaptive threshold advisory ─────────────────────────────────────────────

function printAdaptiveAdvisory(label: string, results: FileResult[], hardThreshold: number): void {
  if (results.length < 3) return;
  const tokenCounts = results.map((r) => r.tokens);
  const adaptive = adaptiveThreshold(tokenCounts);
  if (adaptive > 0 && adaptive < hardThreshold) {
    const p95val = percentile(tokenCounts, 95);
    const cv = coefficientOfVariation(tokenCounts);
    const cvTag = cv > 0.5 ? "  ← uneven (high CV)" : "";
    console.info(
      `  ${label}: p95 ${p95val} tokens  adaptive outlier line ${adaptive}  CV ${cv.toFixed(2)}${cvTag}`,
    );
  }
}

// ─── Check command ────────────────────────────────────────────────────────────

interface CheckOptions {
  json?: boolean;
  explain?: string;
}

function exitCodeFor(
  results: FileResult[],
  similarPairs: SimilarityPair[],
  orphans: string[],
  deadRefs: string[],
): 0 | 1 | 2 {
  if (results.some((r) => r.status === "error")) return 1;
  const hasAdvisory =
    results.some((r) => r.noiseFlagged || r.redundancyLevel === "shrink") ||
    similarPairs.some((p) => p.flag === "duplication") ||
    orphans.length > 0 ||
    deadRefs.length > 0;
  return hasAdvisory ? 2 : 0;
}

function loadConfigOrReport(): Config | null {
  try {
    return loadConfig();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`✗ Invalid context-budget.config.json: ${reason}`);
    return null;
  }
}

function runCheck(opts: CheckOptions): void {
  const config = loadConfigOrReport();
  if (!config) {
    process.exitCode = 1;
    return;
  }
  const rootContent = readContent(config.root.file);
  if (rootContent === null) {
    console.error(`✗ Root context file not found: ${config.root.file}`);
    process.exitCode = 1;
    return;
  }
  const refs = extractReferences(rootContent, config.root.referencePattern).sort();
  const subdirFiles = findSubdirClaudeMd(config.subdir.dirs);

  const allFiles: Array<{
    group: Group;
    path: string;
    content: string;
    threshold: number;
    failOnExceed: boolean;
  }> = [
    {
      group: "root",
      path: config.root.file,
      content: rootContent,
      threshold: config.root.threshold,
      failOnExceed: true,
    },
    ...refs
      .map((ref) => ({
        group: "reference" as const,
        path: ref,
        content: readContent(ref) ?? "",
        threshold: config.references.threshold,
        failOnExceed: config.references.failOnExceed,
      }))
      .filter((f) => f.content !== ""),
    ...subdirFiles
      .map((f) => ({
        group: "subdir" as const,
        path: f,
        content: readContent(f) ?? "",
        threshold: config.subdir.threshold,
        failOnExceed: config.subdir.failOnExceed,
      }))
      .filter((f) => f.content !== ""),
  ];

  const deadRefs = refs.filter((r) => !existsSync(r));
  for (const ref of deadRefs) {
    console.warn(`⚠ ${ref}: not found (dead reference in ${config.root.file})`);
  }

  const { orphans } = analyzeRefGraph(refs, config.planningDir);

  const results = allFiles.map(({ group, path, content, threshold, failOnExceed }) => ({
    group,
    result: checkFile(path, content, threshold, failOnExceed, config),
    content,
  }));

  const similarityInput = allFiles.map(({ path, content }) => ({ path, content }));
  const similarPairs = findSimilarFiles(similarityInput);

  const resultMap = new Map(
    results.map(({ result, content }) => [result.path, { result, content }]),
  );
  for (const pair of similarPairs) {
    const a = resultMap.get(pair.fileA);
    const b = resultMap.get(pair.fileB);
    const flagValue = pair.flag as "duplication" | "merge-candidate";
    if (a) {
      a.result.similarityFlags = [
        ...(a.result.similarityFlags ?? []),
        { other: pair.fileB, jaccard: pair.jaccard, flag: flagValue },
      ];
    }
    if (b) {
      b.result.similarityFlags = [
        ...(b.result.similarityFlags ?? []),
        { other: pair.fileA, jaccard: pair.jaccard, flag: flagValue },
      ];
    }
  }

  const allResults = results.map(({ result }) => result);
  const resultsIn = (group: Group): FileResult[] =>
    results.filter((entry) => entry.group === group).map(({ result }) => result);
  const [rootResult] = resultsIn("root");
  const refResults = resultsIn("reference");
  const subdirResults = resultsIn("subdir");
  const exitCode = exitCodeFor(allResults, similarPairs, orphans, deadRefs);

  // ─── --explain mode ───────────────────────────────────────────────────────

  if (opts.explain) {
    const target = resultMap.get(opts.explain);
    if (!target) {
      console.error(`✗ File not found in results: ${opts.explain}`);
      process.exitCode = 1;
      return;
    }
    printExplain(target.result, target.content);
    return;
  }

  // ─── --json mode ────────────────────────────────────────────────────────────

  if (opts.json) {
    console.info(
      JSON.stringify(
        {
          root: rootResult,
          references: refResults,
          subdir: subdirResults,
          similarityPairs: similarPairs,
          orphans,
          deadRefs,
        },
        null,
        2,
      ),
    );
    if (exitCode !== 0) process.exitCode = exitCode;
    return;
  }

  // ─── Human-readable output ──────────────────────────────────────────────────

  console.info("=== CLAUDE.md Token Budget ===");

  if (rootResult) {
    printSection("Root (always loaded):", [rootResult]);
    const rootEntry = resultMap.get(rootResult.path);
    if (rootEntry && rootResult.ratio >= config.health.normalBelow) {
      printPareto(rootResult, rootEntry.content);
    }
  }

  if (refResults.length > 0) {
    printSection("Reference docs (on-demand):", refResults);
    printAdaptiveAdvisory("Refs", refResults, config.references.threshold);
  }

  if (subdirResults.length > 0) {
    printSection("Subdirectory CLAUDE.md (context-sensitive):", subdirResults);
    printAdaptiveAdvisory("Subdir", subdirResults, config.subdir.threshold);
  }

  if (deadRefs.length > 0) {
    console.info(`\n⚠ Dead references (${deadRefs.length}):`);
    for (const r of deadRefs) console.info(`  × ${r}`);
  }

  if (orphans.length > 0) {
    console.info(
      `\n⚠ Orphaned planning files not referenced in ${config.root.file} (${orphans.length}):`,
    );
    for (const o of orphans) console.info(`  ? ${o}`);
  }

  if (similarPairs.length > 0) {
    console.info(`\n=== Similarity Report ===`);
    for (const p of similarPairs) {
      const icon = p.flag === "duplication" ? "✗" : "~";
      console.info(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        `  ${icon} ${p.flag!.toUpperCase().padEnd(16)} J=${p.jaccard.toFixed(2)}  ${p.fileA}  ↔  ${p.fileB}`,
      );
    }
  }

  console.info("\n=== Health Summary ===");

  if (rootResult) {
    const pct = Math.round(rootResult.ratio * 100);
    console.info(
      `  Root:       ${rootResult.tokens.toLocaleString()} / ${rootResult.threshold.toLocaleString()} tokens  ${bar(rootResult.ratio)}  ${pct}%  ${healthLabel(rootResult.health)}`,
    );
  }

  if (refResults.length > 0) {
    const p95val = percentile(
      refResults.map((r) => r.tokens),
      95,
    );
    const p95ratio = p95val / config.references.threshold;
    const pct = Math.round(p95ratio * 100);
    const cv = coefficientOfVariation(refResults.map((r) => r.tokens));
    console.info(
      `  References: p95 ${p95val} / ${config.references.threshold} tokens  ${bar(p95ratio)}  ${pct}%  ${healthLabel(toHealth(p95ratio, config.health.goodBelow, config.health.normalBelow))}  CV=${cv.toFixed(2)}`,
    );
  }

  if (subdirResults.length > 0) {
    const p95val = percentile(
      subdirResults.map((r) => r.tokens),
      95,
    );
    const p95ratio = p95val / config.subdir.threshold;
    const pct = Math.round(p95ratio * 100);
    const cv = coefficientOfVariation(subdirResults.map((r) => r.tokens));
    console.info(
      `  Subdir:     p95 ${p95val} / ${config.subdir.threshold} tokens  ${bar(p95ratio)}  ${pct}%  ${healthLabel(toHealth(p95ratio, config.health.goodBelow, config.health.normalBelow))}  CV=${cv.toFixed(2)}`,
    );
  }

  const goodPct = Math.round(config.health.goodBelow * 100);
  const normalPct = Math.round(config.health.normalBelow * 100);
  console.info(
    `\n  Thresholds:  GOOD ≤ ${goodPct}%  |  NORMAL ≤ ${normalPct}%  |  WARNING ≤ 100%  |  BAD > 100%`,
  );

  if (exitCode === 1) {
    console.info("\n✗ Token budget exceeded.");
    process.exitCode = 1;
  } else if (exitCode === 2) {
    console.info("\n~ Advisory: optimization opportunities detected (see above). Exit 2.");
    process.exitCode = 2;
  } else {
    console.info("\n✓ All files within budget.");
  }
}

// ─── Program ──────────────────────────────────────────────────────────────────

const program = new Command()
  .name("context-budget")
  .description("Token-budget analysis for AI agent context files (CLAUDE.md, AGENTS.md, etc.)");

program
  .command("check")
  .description("Analyze context files against their token budgets")
  .option("--json", "output machine-readable JSON instead of the human-readable report")
  .option("--explain <path>", "print a detailed breakdown for a single file")
  .action((opts: CheckOptions) => {
    runCheck(opts);
  });

program.parse(process.argv);
