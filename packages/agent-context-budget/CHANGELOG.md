# agent-context-budget

## 0.1.1

### Patch Changes

- Version forced to 0.1.1 instead of 0.2.0: rename the config file

- [#48](https://github.com/arnaud-zg/packages/pull/48) [`d4ca535`](https://github.com/arnaud-zg/packages/commit/d4ca53507dc9382c2ad234c2f9e34d61ee7dfcb2) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - Rename the config file to `agent-context-budget.config.json`. `context-budget.config.json` is still
  read, with a deprecation warning, and will be removed in the next release. If both files exist, the
  new one wins and the old one is ignored.

## 0.1.0

### Minor Changes

- [#13](https://github.com/arnaud-zg/packages/pull/13) [`a28c535`](https://github.com/arnaud-zg/packages/commit/a28c5357faf353882935eaac62f52f3b6de367a4) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - First release: `context-budget check` scores CLAUDE.md, AGENTS.md and the docs they reference
  against token budgets, and shows which sections to cut.
