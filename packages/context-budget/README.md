# context-budget

Token-budget analysis for AI agent context files (CLAUDE.md, AGENTS.md, etc.).

Large context files (CLAUDE.md, AGENTS.md, per-package context docs) load on every agent session —
every extra token is a recurring tax. `context-budget` scores a repo's context files against
configurable token thresholds and surfaces where to cut:

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

📚 Full guides:
[tutorial, how-to, reference and explanation](https://github.com/arnaud-zg/packages/tree/main/docs/context-budget).

## Install

```sh
npm install --save-dev context-budget
```

## Usage

```sh
npx context-budget check
npx context-budget check --json
npx context-budget check --explain CLAUDE.md
```

File discovery is relative to the current working directory, so run it from the directory containing
the root context file.

### `context-budget check`

Analyzes the root context file, every file it references (matched via `root.referencePattern`), and
every `CLAUDE.md` found one level under the configured `subdir.dirs`. Reports a health bar per file,
a Pareto breakdown for files near their budget, dead/orphaned reference-graph warnings, and a
cross-file similarity report.

```
Usage: context-budget check [options]

Options:
  --json             output machine-readable JSON instead of the human-readable report
  --explain <path>   print a detailed breakdown for a single file
```

Exit codes: `0` all files within budget, `1` a hard-failing file exceeded its threshold, `2`
advisory-only findings (noise, redundancy, orphans, dead refs, near-duplicate files) with nothing
over budget. `--json` exits with the same code as the human report. A missing root file or an
invalid config file prints the reason and exits `1`.

## Configuration

Reads `./context-budget.config.json` if present (or an explicit path via `loadConfig(path)`
programmatically), deep-merged over the built-in defaults — a partial override only needs the fields
it changes:

```json
{
  "root": { "threshold": 4000 },
  "subdir": { "dirs": ["apps", "packages", "tooling"] }
}
```

| Field                     | Default                                   | Meaning                                                                   |
| ------------------------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| `charsPerToken`           | `4`                                       | Reserved for future use; the calibrated estimator does not read this      |
| `root.file`               | `"CLAUDE.md"`                             | The always-loaded root context file                                       |
| `root.referencePattern`   | `` `(\\.planning/codebase/[^`]+\\.md)` `` | Regex matching on-demand reference docs linked from the root file         |
| `root.threshold`          | `3500`                                    | Token budget for the root file (hard-fails the check when exceeded)       |
| `references.threshold`    | `2000`                                    | Token budget for each referenced doc                                      |
| `references.failOnExceed` | `false`                                   | Whether exceeding a reference doc's budget is a hard failure              |
| `subdir.dirs`             | `["apps", "packages"]`                    | Top-level directories scanned one level deep for `CLAUDE.md`              |
| `subdir.threshold`        | `1500`                                    | Token budget for each subdirectory `CLAUDE.md`                            |
| `subdir.failOnExceed`     | `false`                                   | Whether exceeding a subdirectory budget is a hard failure                 |
| `health.goodBelow`        | `0.6`                                     | Ratio-of-budget below which a file is "good" (must be below normalBelow)  |
| `health.normalBelow`      | `0.85`                                    | Ratio-of-budget below which a file is "normal" (above is "warning"/"bad") |
| `planningDir`             | `".planning/codebase"`                    | Directory scanned for orphaned reference docs not linked from `root.file` |

With no config file present, `loadConfig()` returns exactly these defaults.

## Programmatic use

```ts
import { analyzeFile, estimateTokens, findSimilarFiles, loadConfig } from "context-budget";

const config = loadConfig();
const content = "# My CLAUDE.md\n...";

const tokens = estimateTokens(content);
const result = analyzeFile(content, { threshold: config.root.threshold });

const pairs = findSimilarFiles([
  { path: "a.md", content: "..." },
  { path: "b.md", content: "..." },
]);
```

`analyzeFile` is path-agnostic and returns `path: ""` — attaching a real path and deciding whether a
`"bad"` health upgrades `"warn"` to a hard `"error"` is the caller's policy, matching how the CLI's
`check` command wires it up per file kind (root vs. reference vs. subdirectory).

## Run it on every commit

Point a pre-commit hook at your context files so a bloated CLAUDE.md never lands. With
[Lefthook](https://github.com/evilmartians/lefthook):

```yaml
pre-commit:
  commands:
    context-budget:
      glob: ["CLAUDE.md", "AGENTS.md", ".planning/codebase/*.md"]
      run: npx context-budget check
```

Exit code `2` means advisory findings only; treat it as a pass if you only want to block on budgets:
`npx context-budget check || [ $? -eq 2 ]`.
