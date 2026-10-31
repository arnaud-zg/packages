[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `agent-context-budget`:
[🚀 Tutorial](./tutorial.md) · [🛠️ How-to](./how-to.md) · [📖 Reference](./reference.md) · **💡
Explanation**

# 💡 Explanation: `agent-context-budget`

## What the score measures

- **Calibrated token estimation** — prose, code, and markdown structure tokenize at different rates;
  a flat chars-per-token estimate is calibrated per content type instead
- **Section-level Pareto analysis** — which headings account for most of a file's tokens, flagged
  for extraction once the file is over 85% of budget
- **Gzip-ratio redundancy scoring** — a low compression ratio is a proxy for repetitive content
  worth tightening
- **TTR + Shannon entropy composite** — type-token ratio and word-level entropy combine into a
  single redundancy score
- **MAD-based adaptive thresholds** — a median + 1.5×MAD outlier line, resistant to a few very large
  files skewing the picture
- **MinHash cross-file similarity** — 128-hash Jaccard estimation flags near-duplicate or
  merge-candidate files across the whole set
