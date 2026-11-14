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

Every package `tsconfig` extends `@arnaud-zg/configs`, then the root `tsconfig.base.json`, which
turns `noUncheckedIndexedAccess` back on: an indexed read stays `T | undefined`, so guards on it
keep checking a real case.

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

For every published package. Why: see
[Explanation](./explanation.md#why-every-package-is-written-to-be-found).

| Where                         | Rule                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `description`                 | One plain sentence, under 160 characters: what it does and the tool it works with. No error messages                   |
| `keywords`                    | 3 to 7 tags with a big community (`expo`, `vite`, `monorepo`, `claude-code`...). Plugins: `shiplane` + the host's tags |
| `homepage`, `repository`      | The package's README on GitHub, and `directory: packages/<dir>`                                                        |
| README, top                   | The problem in the reader's words, then one picture of the result (screenshot, diagram or terminal output)             |
| README, "Fixes" section       | The exact error text, when the package fixes one                                                                       |
| README, first code example    | Complete, `import` line included                                                                                       |
| Root README and `docs/README` | One symptom line per top-level package, linking to its README. Details stay in the package README                      |

A private package needs no search work, but still a README: what it is for, how to run it, and when
to add to it.
