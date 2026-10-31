import { describe, expect, it } from "vitest";

import {
  adaptiveThreshold,
  coefficientOfVariation,
  computeGzipRatio,
  computePareto,
  computeRedundancyScore,
  computeShannonEntropy,
  computeTTR,
  detectStructuralNoise,
  estimateTokens,
  extractShingles,
  findSimilarFiles,
  jaccardFromMinHash,
  mad,
  median,
  minHash,
  parseSections,
  percentile,
  redundancyLevelFromGzip,
} from "../helpers";

describe("tiny or empty files", () => {
  it("given two files too short to form a shingle, when compared, then they are not flagged as duplicates", () => {
    const pairs = findSimilarFiles([
      { path: "a.md", content: "Short note." },
      { path: "b.md", content: "Another one here." },
    ]);

    expect(pairs).toEqual([]);
  });

  it("given an empty shingle set, when estimating Jaccard, then similarity is 0", () => {
    expect(jaccardFromMinHash(minHash(new Set()), minHash(new Set()))).toBe(0);
  });

  it("given empty content, when computing the gzip ratio, then it is a finite number", () => {
    expect(Number.isFinite(computeGzipRatio(""))).toBe(true);
  });
});

// ─── A: Calibrated token estimator ────────────────────────────────────────────

describe("estimateTokens", () => {
  it("counts prose at ~1 token per 4 chars", () => {
    const prose = "This is a normal English sentence without any special markdown.";
    const tokens = estimateTokens(prose);
    // 63 chars / 4.0 ≈ 16 tokens — allow ±20% tolerance
    expect(tokens).toBeGreaterThan(12);
    expect(tokens).toBeLessThan(20);
  });

  it("counts code blocks at a higher token rate than equivalent prose", () => {
    const codeBlock =
      "```typescript\nconst x: Record<string, number> = {};\nconst y = x['key'] ?? 0;\n```";
    const equivalentProse = "the quick brown fox jumps over the lazy dog and then some";
    expect(estimateTokens(codeBlock)).toBeGreaterThan(estimateTokens(equivalentProse));
  });

  it("counts table rows at higher rate than prose", () => {
    const table =
      "| Column A | Column B | Column C |\n| -------- | -------- | -------- |\n| value 1  | value 2  | value 3  |";
    const prose = "Column A Column B Column C value one value two value three";
    // same chars, table should cost more per char
    expect(estimateTokens(table) / table.length).toBeGreaterThan(
      estimateTokens(prose) / prose.length,
    );
  });

  it("counts headings as structural", () => {
    const headings = "# Title\n## Section\n### Subsection\n";
    const tokens = estimateTokens(headings);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(20);
  });

  it("returns more tokens for identical text in code vs prose context", () => {
    const content = "```\nfoo bar baz qux\n```";
    const prose = "foo bar baz qux";
    expect(estimateTokens(content)).toBeGreaterThan(estimateTokens(prose));
  });
});

// ─── B: Section Pareto ────────────────────────────────────────────────────────

describe("parseSections", () => {
  it("splits markdown into heading-delimited sections", () => {
    const md = `# Heading 1\n\nSome text here.\n\n## Heading 2\n\nMore text.\n`;
    const sections = parseSections(md);
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(sections.some((s) => s.heading === "Heading 1")).toBe(true);
    expect(sections.some((s) => s.heading === "Heading 2")).toBe(true);
  });

  it("assigns token counts to each section", () => {
    const md = `# Big Section\n\n${"word ".repeat(100)}\n\n## Small\n\nHi.\n`;
    const sections = parseSections(md);
    const big = sections.find((s) => s.heading === "Big Section");
    const small = sections.find((s) => s.heading === "Small");
    expect(big?.tokens).toBeGreaterThan(small?.tokens ?? Infinity);
  });

  it("does not split on headings inside code fences", () => {
    const md = `# Real Heading\n\n\`\`\`md\n# Fake Heading\n\`\`\`\n`;
    const sections = parseSections(md);
    expect(sections.some((s) => s.heading === "Fake Heading")).toBe(false);
    expect(sections.some((s) => s.heading === "Real Heading")).toBe(true);
  });

  it("records section heading levels", () => {
    const md = `# H1\n\ntext\n\n## H2\n\nmore text\n`;
    const sections = parseSections(md);
    expect(sections.find((s) => s.heading === "H1")?.level).toBe(1);
    expect(sections.find((s) => s.heading === "H2")?.level).toBe(2);
  });
});

describe("computePareto", () => {
  it("flags sections that account for ≥20% of file tokens when file is ≥85% full", () => {
    const sections = [
      { heading: "Big", level: 1, tokens: 800 },
      { heading: "Medium", level: 2, tokens: 200 },
      { heading: "Small", level: 2, tokens: 100 },
    ];
    const fileTokens = 1100;
    const fileRatio = 0.95; // over 85%
    const pareto = computePareto(sections, fileTokens, fileRatio);
    const big = pareto.find((p) => p.heading === "Big");
    expect(big?.flagExtract).toBe(true);
    expect(pareto.find((p) => p.heading === "Small")?.flagExtract).toBe(false);
  });

  it("does NOT flag when file ratio is below 85%", () => {
    const sections = [{ heading: "Big", level: 1, tokens: 800 }];
    const pareto = computePareto(sections, 1000, 0.5);
    expect(pareto[0]?.flagExtract).toBe(false);
  });

  it("sorts sections by token count descending", () => {
    const sections = [
      { heading: "Small", level: 2, tokens: 100 },
      { heading: "Big", level: 1, tokens: 900 },
    ];
    const pareto = computePareto(sections, 1000, 0.9);
    expect(pareto[0]?.heading).toBe("Big");
  });

  it("computes percentage of file for each section", () => {
    const sections = [{ heading: "Half", level: 1, tokens: 500 }];
    const pareto = computePareto(sections, 1000, 0.5);
    expect(pareto[0]?.pct).toBeCloseTo(0.5);
  });
});

// ─── E: Gzip ratio ────────────────────────────────────────────────────────────

describe("computeGzipRatio", () => {
  it("returns a ratio between 0 and 1 for sufficiently large content", () => {
    // Gzip adds a fixed header (~18 bytes) so content must be large enough to compress below raw
    const content = "# Documentation\n\n" + "This is a typical markdown sentence. ".repeat(30);
    const ratio = computeGzipRatio(content);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });

  it("returns lower ratio for highly repetitive content", () => {
    const repetitive = "hello world ".repeat(200);
    const unique = Array.from({ length: 100 }, (_, i) => `uniqueword${i}`).join(" ");
    expect(computeGzipRatio(repetitive)).toBeLessThan(computeGzipRatio(unique));
  });
});

describe("redundancyLevelFromGzip", () => {
  it("flags ratio below 0.30 as shrink", () => {
    expect(redundancyLevelFromGzip(0.2)).toBe("shrink");
    expect(redundancyLevelFromGzip(0.29)).toBe("shrink");
  });

  it("flags ratio above 0.55 as dense", () => {
    expect(redundancyLevelFromGzip(0.6)).toBe("dense");
    expect(redundancyLevelFromGzip(0.8)).toBe("dense");
  });

  it("returns ok for middle range", () => {
    expect(redundancyLevelFromGzip(0.4)).toBe("ok");
    expect(redundancyLevelFromGzip(0.55)).toBe("ok");
  });
});

// ─── D: Structural noise ──────────────────────────────────────────────────────

describe("detectStructuralNoise", () => {
  it("counts horizontal rules as noise", () => {
    const content = "Some text.\n\n---\n\nMore text.\n\n───────────\n\nEnd.";
    const result = detectStructuralNoise(content);
    expect(result.tokens).toBeGreaterThan(0);
  });

  it("counts HTML comments as noise", () => {
    const content = "<!-- This is a comment -->\nActual content here.";
    const result = detectStructuralNoise(content);
    expect(result.tokens).toBeGreaterThan(0);
  });

  it("counts table separator rows as noise", () => {
    const content = "| A | B |\n|---|---|\n| 1 | 2 |";
    const result = detectStructuralNoise(content);
    expect(result.tokens).toBeGreaterThan(0);
  });

  it("flags content when noise exceeds 10% of tokens", () => {
    const horizRules = "---\n".repeat(50);
    const content = horizRules + "word ".repeat(50);
    const result = detectStructuralNoise(content);
    expect(result.flagged).toBe(true);
  });

  it("does not flag clean content", () => {
    const content =
      "# Title\n\nThis is a clean document with prose and no noise.\n\nAnother paragraph here.\n";
    const result = detectStructuralNoise(content);
    expect(result.flagged).toBe(false);
  });

  it("exposes pct between 0 and 1", () => {
    const content = "Some text here with no noise at all.";
    const result = detectStructuralNoise(content);
    expect(result.pct).toBeGreaterThanOrEqual(0);
    expect(result.pct).toBeLessThanOrEqual(1);
  });
});

// ─── F: TTR + Shannon entropy + Redundancy Score ──────────────────────────────

describe("computeTTR", () => {
  it("returns 1 for content with all unique words", () => {
    const unique = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu";
    expect(computeTTR(unique)).toBe(1);
  });

  it("returns lower ratio for repetitive content", () => {
    const repetitive = "word word word word word word word word word word word word word word";
    const diverse = "one two three four five six seven eight nine ten eleven twelve";
    expect(computeTTR(repetitive)).toBeLessThan(computeTTR(diverse));
  });

  it("returns 1 for short content (below minimum word count)", () => {
    expect(computeTTR("hi")).toBe(1);
  });
});

describe("computeShannonEntropy", () => {
  it("returns higher entropy for uniform distribution", () => {
    // Use distinct real words (no digits, which get stripped by regex) so each is a unique token
    const uniform =
      "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
    const skewed = "the the the the the the cat cat cat sat";
    expect(computeShannonEntropy(uniform)).toBeGreaterThan(computeShannonEntropy(skewed));
  });

  it("returns 0 for empty content", () => {
    expect(computeShannonEntropy("")).toBe(0);
  });

  it("returns a non-negative number", () => {
    expect(computeShannonEntropy("hello world hello")).toBeGreaterThanOrEqual(0);
  });
});

describe("computeRedundancyScore", () => {
  it("returns higher score for redundant content (low gzip, low TTR)", () => {
    const highRedundancy = computeRedundancyScore(0.15, 0.1, 1.0, 10.0);
    const lowRedundancy = computeRedundancyScore(0.65, 0.85, 9.0, 10.0);
    expect(highRedundancy).toBeGreaterThan(lowRedundancy);
  });

  it("returns value between 0 and 1", () => {
    const score = computeRedundancyScore(0.4, 0.6, 4.0, 8.0);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ─── H + I: Statistics ────────────────────────────────────────────────────────

describe("median", () => {
  it("returns middle value for odd-length array", () => {
    expect(median([1, 3, 5])).toBe(3);
  });

  it("returns average of two middle values for even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });

  it("handles unsorted input", () => {
    expect(median([5, 1, 3])).toBe(3);
  });
});

describe("mad", () => {
  it("returns 0 for identical values", () => {
    expect(mad([5, 5, 5], 5)).toBe(0);
  });

  it("returns correct MAD for known dataset", () => {
    // [1, 1, 2, 2, 4, 6, 9] median=2 MAD=1
    expect(mad([1, 1, 2, 2, 4, 6, 9], 2)).toBe(1);
  });
});

describe("percentile", () => {
  it("returns max for p=100", () => {
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
  });

  it("returns min for p=0 (or lowest)", () => {
    expect(percentile([1, 2, 3, 4, 5], 1)).toBeGreaterThanOrEqual(1);
  });

  it("returns approximately correct p95", () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(arr, 95)).toBeGreaterThanOrEqual(94);
    expect(percentile(arr, 95)).toBeLessThanOrEqual(96);
  });

  it("returns 0 for empty array", () => {
    expect(percentile([], 95)).toBe(0);
  });
});

describe("coefficientOfVariation", () => {
  it("returns 0 for identical values", () => {
    expect(coefficientOfVariation([5, 5, 5, 5])).toBe(0);
  });

  it("returns higher value for more spread out data", () => {
    const spread = [1, 100, 200, 300];
    const tight = [98, 100, 102, 100];
    expect(coefficientOfVariation(spread)).toBeGreaterThan(coefficientOfVariation(tight));
  });

  it("returns 0 for single-element array", () => {
    expect(coefficientOfVariation([42])).toBe(0);
  });
});

describe("adaptiveThreshold", () => {
  it("returns 0 for fewer than 3 values", () => {
    expect(adaptiveThreshold([1000, 2000])).toBe(0);
  });

  it("returns median + 1.5*MAD", () => {
    // median([100, 200, 300]) = 200, MAD = median([100, 0, 100]) = 100
    // adaptive = 200 + 1.5 * 100 = 350
    expect(adaptiveThreshold([100, 200, 300])).toBe(350);
  });

  it("is resistant to outliers", () => {
    // Without outlier: [100, 110, 120, 130] → median=115, MAD=15 → 115+22.5=137.5
    // With outlier: [100, 110, 120, 130, 10000] → median=120, MAD=20 → 120+30=150
    // The adaptive threshold stays low despite the outlier (unlike mean+stddev which would spike)
    const withOutlier = adaptiveThreshold([100, 110, 120, 130, 10000]);
    const meanPlusStddev = (() => {
      const vals = [100, 110, 120, 130, 10000];
      const mean = vals.reduce((a, b) => a + b) / vals.length;
      const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
      return mean + 1.5 * std;
    })();
    expect(withOutlier).toBeLessThan(meanPlusStddev);
  });
});

// ─── C: MinHash similarity ────────────────────────────────────────────────────

describe("extractShingles", () => {
  it("returns empty set for content with fewer than k words", () => {
    const shingles = extractShingles("one two three", 5);
    expect(shingles.size).toBe(0);
  });

  it("returns non-empty set for content with enough words", () => {
    const text = "the quick brown fox jumps over the lazy dog and then some";
    expect(extractShingles(text, 5).size).toBeGreaterThan(0);
  });

  it("produces same shingles for identical content", () => {
    const text = "hello world this is a test sentence";
    const a = extractShingles(text);
    const b = extractShingles(text);
    expect(a).toEqual(b);
  });

  it("produces different shingles for different content", () => {
    const a = extractShingles("alpha beta gamma delta epsilon zeta eta theta");
    const b = extractShingles("one two three four five six seven eight nine");
    const intersection = new Set([...a].filter((x) => b.has(x)));
    expect(intersection.size).toBe(0);
  });
});

describe("minHash", () => {
  it("produces a signature of the specified length", () => {
    const shingles = new Set(["a b c d e", "b c d e f", "c d e f g"]);
    const sig = minHash(shingles, 64);
    expect(sig.length).toBe(64);
  });

  it("produces identical signatures for the same shingle set", () => {
    const shingles = new Set(["hello world test", "world test foo", "test foo bar"]);
    expect(minHash(shingles)).toEqual(
      minHash(new Set(["hello world test", "world test foo", "test foo bar"])),
    );
  });
});

describe("jaccardFromMinHash", () => {
  it("returns 1 for identical signatures", () => {
    const shingles = extractShingles("the quick brown fox jumps over the lazy dog");
    const sig = minHash(shingles);
    expect(jaccardFromMinHash(sig, sig)).toBe(1);
  });

  it("returns a value between 0 and 1", () => {
    const a = minHash(extractShingles("alpha beta gamma delta epsilon zeta eta theta iota"));
    const b = minHash(extractShingles("one two three four five six seven eight nine ten eleven"));
    const j = jaccardFromMinHash(a, b);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(j).toBeLessThanOrEqual(1);
  });
});

// Helper: sentence built from real words (no digits that get stripped by the shingle extractor)
function sentence(words: string[]): string {
  return words.join(" ");
}

const WORDS_A = [
  "the",
  "quick",
  "brown",
  "fox",
  "jumps",
  "over",
  "lazy",
  "dog",
  "and",
  "then",
  "some",
  "more",
  "words",
  "that",
  "are",
  "all",
  "unique",
  "adding",
  "content",
  "here",
  "budget",
  "estimation",
  "report",
  "agent",
  "session",
  "turbo",
  "repo",
  "monorepo",
  "nestjs",
  "expo",
  "react",
  "native",
  "hexagonal",
  "architecture",
  "ports",
  "adapters",
  "command",
  "query",
  "separation",
  "event",
  "sourcing",
  "projection",
  "handler",
  "repository",
  "domain",
  "service",
  "module",
  "schema",
  "validation",
  "token",
  "budget",
];

const WORDS_B = [
  "completely",
  "different",
  "vocabulary",
  "nothing",
  "shared",
  "between",
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "zeta",
  "eta",
  "theta",
  "iota",
  "kappa",
  "lambda",
  "sigma",
  "upsilon",
  "omega",
  "abstract",
  "concrete",
  "implementation",
  "interface",
  "protocol",
  "strategy",
  "pattern",
  "factory",
  "observer",
  "decorator",
  "builder",
  "specification",
  "proxy",
  "chain",
  "responsibility",
  "state",
  "mediator",
  "memento",
  "visitor",
  "iterator",
  "composite",
  "flyweight",
  "bridge",
  "facade",
  "template",
  "method",
  "algorithm",
  "structure",
  "behavior",
  "creational",
];

describe("findSimilarFiles", () => {
  it("returns empty array for completely dissimilar files", () => {
    // Repeat each vocabulary enough times to produce many shingles
    const contentA = sentence([...WORDS_A, ...WORDS_A, ...WORDS_A]);
    const contentB = sentence([...WORDS_B, ...WORDS_B, ...WORDS_B]);
    const files = [
      { path: "a.md", content: contentA },
      { path: "b.md", content: contentB },
    ];
    const pairs = findSimilarFiles(files);
    expect(pairs.length).toBe(0);
  });

  it("flags identical files as duplication", () => {
    const shared = sentence([...WORDS_A, ...WORDS_A, ...WORDS_A]);
    const files = [
      { path: "a.md", content: shared },
      { path: "b.md", content: shared },
    ];
    const pairs = findSimilarFiles(files);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0]?.flag).toBe("duplication");
  });

  it("flags highly similar files as merge-candidate or duplication", () => {
    // File b is ~90% the same as file a (append a small tail of different words)
    const base = sentence([...WORDS_A, ...WORDS_A, ...WORDS_A]);
    const tail = sentence(WORDS_B.slice(0, 5));
    const files = [
      { path: "a.md", content: base },
      { path: "b.md", content: base + " " + tail },
    ];
    const pairs = findSimilarFiles(files);
    expect(pairs.length).toBeGreaterThan(0);
    expect(["merge-candidate", "duplication"]).toContain(pairs[0]?.flag);
  });

  it("sorts pairs by jaccard descending", () => {
    const base = sentence([...WORDS_A, ...WORDS_A, ...WORDS_A]);
    const files = [
      { path: "a.md", content: base },
      { path: "b.md", content: base },
      { path: "c.md", content: base + " " + sentence(WORDS_B) },
    ];
    const pairs = findSimilarFiles(files);
    if (pairs.length >= 2) {
      expect(pairs[0]?.jaccard).toBeGreaterThanOrEqual(pairs[1]?.jaccard ?? 0);
    }
  });
});
