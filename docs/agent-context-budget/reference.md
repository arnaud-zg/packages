[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `agent-context-budget`:
[🚀 Tutorial](./tutorial.md) · [🛠️ How-to](./how-to.md) · **📖 Reference** ·
[💡 Explanation](./explanation.md)

# 📖 Reference: `agent-context-budget`

## Exports

| Package                | Subpath              | Resolves to     | Needs                                      |
| ---------------------- | -------------------- | --------------- | ------------------------------------------ |
| `agent-context-budget` | `.`                  | `dist/index.js` | nothing extra (bundles `commander`, `zod`) |
| `agent-context-budget` | bin `context-budget` | `dist/cli.js`   | same                                       |

## CLI

```sh
npx agent-context-budget check
npx agent-context-budget check --json
npx agent-context-budget check --explain CLAUDE.md
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
import { analyzeFile, estimateTokens, findSimilarFiles, loadConfig } from "agent-context-budget";

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
