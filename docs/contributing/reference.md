[🏠 Home](../../README.md) · [📚 Docs](../README.md) · Contributing: [🛠️ How-to](./how-to.md) · **📖
Reference** · [💡 Explanation](./explanation.md)

# 📖 Reference: Contributing

## Package layout

```
packages/
  expo-native-guard/        src/index.ts (barrel), src/core.ts (no React import)
  expo-pnpm-catalog/        src/index.ts (programmatic API), src/cli.ts (bin entry point)
  vite-workspace-resolver/  src/index.ts (Vite plugin)
  agent-context-budget/     src/index.ts (programmatic API), src/cli.ts (bin entry point)
  shiplane/                 src/cli.ts (bin entry point), the release core
  shiplane-<host>/          one plugin per host: changesets, cloudflare-pages, eas, fly, git, github, npm
  shiplane-integration/     private: tests across several plugins
docs/                       this documentation
```

Each package's `dist/` (gitignored) is what its `package.json` `exports` actually resolve to.
`expo-native-guard` and `vite-workspace-resolver` build through `tsdown`; `expo-pnpm-catalog` and
`agent-context-budget` build through `tsc` directly, since their `bin` entry point (`dist/cli.js`)
isn't part of the `exports` map `tsdown` generates from.

## Scripts (for contributors to this repo)

| Script (from repo root)        | Runs                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `pnpm lint`                    | `eslint .`                                                                      |
| `pnpm lint:md`                 | `remark . --frail --quiet`                                                      |
| `pnpm format` / `format:check` | `prettier --write .` / `prettier --check .`                                     |
| `pnpm typecheck`               | `tsc` (or the package's typecheck config) in every package                      |
| `pnpm test`                    | `vitest run` in every package                                                   |
| `pnpm build`                   | builds every package (`tsdown` or `tsc`, per package)                           |
| `pnpm verify`                  | typecheck, lint, lint:md, format:check, test, build                             |
| `pnpm changeset`               | records a pending version bump, see [How-to](./how-to.md#release-a-new-version) |
| `pnpm release`                 | `pnpm build && shiplane`, see [How-to](./how-to.md#release-a-new-version)       |
| `pnpm shiplane status`         | what each package would release next                                            |

## Findability rules

Every package that is not `private` follows these. Why: see
[Explanation § Why every package is written to be found](./explanation.md#why-every-package-is-written-to-be-found).

| Where                         | Rule                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` `description`  | One clear sentence, under 160 characters, saying what the package does and the tool it works with (Expo, Vite, CLAUDE.md, ...). No error messages: those go in the README's "Fixes" section  |
| `package.json` `keywords`     | 3 to 7, lowercase. Only tags with a big community (`expo`, `react-native`, `vite`, `vitest`, `monorepo`, `claude-code`, ...): niche words add noise. Error text goes in the README, not here |
| `package.json` `homepage`     | The package's README on GitHub: `https://github.com/arnaud-zg/packages/tree/main/packages/<dir>#readme`                                                                                      |
| `package.json` `repository`   | `git+https://github.com/arnaud-zg/packages.git`, with `directory: packages/<dir>`                                                                                                            |
| README, first paragraph       | The problem in the reader's words, then what the package does. It is the snippet npm and Google show                                                                                         |
| README, "Fixes" section       | When the package fixes an error, quote the exact error text in a code block, so a search for that text finds it                                                                              |
| README, visual                | One picture of the result (screenshot, GIF, diagram or terminal output) above the API sections                                                                                               |
| `@shiplane/*` plugins         | Keywords: `shiplane`, then the host's own big tags (`cloudflare`, `expo`, `github-actions`, `docker`, ...)                                                                                   |
| Where details live            | In the package README, which npm publishes as the package page. Root README: one line per package, no copied details                                                                         |
| Private packages              | Not for search, but still a README: what it is for, how to run it, what each test proves, when to add to it                                                                                  |
| README, first code example    | Copy-paste complete: the `import` line included, so an AI assistant can quote it as is                                                                                                       |
| Root README and `docs/README` | Every top-level package is listed in both tables (`@shiplane/*` plugins are reached through `shiplane`), with a "You're hitting" line written as a symptom                                   |
| GitHub repo topics            | Cover every package's main ecosystem. Update them when a package for a new ecosystem is added                                                                                                |
