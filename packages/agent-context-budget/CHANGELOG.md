# agent-context-budget

## 0.1.3

### Patch Changes

- [#61](https://github.com/arnaud-zg/packages/pull/61) [`0afa067`](https://github.com/arnaud-zg/packages/commit/0afa067ce4d46dad2c9abf6690119367c83f2374) - README: same layout as every package, links to each guide page

🙏 Thanks to [@arnaud-zg](https://github.com/arnaud-zg) for this release!

## 0.1.2

### Patch Changes

- [#59](https://github.com/arnaud-zg/packages/pull/59) [`956673f`](https://github.com/arnaud-zg/packages/commit/956673f131cda3b7e1b25fe01c0dfb9124657147) - Update runtime dependencies to their latest stable versions.

- [#58](https://github.com/arnaud-zg/packages/pull/58) [`2b11fcf`](https://github.com/arnaud-zg/packages/commit/2b11fcf651ff2f47946199c0db726fc6938f8110) - The README links each guide page directly (tutorial, how-to, reference, explanation, or the example
  config) instead of a folder listing.

- [#56](https://github.com/arnaud-zg/packages/pull/56) [`8517d57`](https://github.com/arnaud-zg/packages/commit/8517d57bf1ff7ed13561d9686529a4718cf581da) - Clearer npm description and keywords, so the package shows up in npm and web search.

🙏 Thanks to [@arnaud-zg](https://github.com/arnaud-zg) for this release!

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
