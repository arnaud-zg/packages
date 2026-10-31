[🏠 Home](../../README.md) · [📚 Docs](../README.md) · Contributing: [🛠️ How-to](./how-to.md) · **📖
Reference** · [💡 Explanation](./explanation.md)

# 📖 Reference: Contributing

## Package layout

```
packages/
  expo-native-guard/     src/index.ts (barrel), src/core.ts (no React import)
  expo-pnpm-catalog/     src/index.ts (programmatic API), src/cli.ts (bin entry point)
  vite-workspace-resolver/ src/index.ts (Vite plugin)
  context-budget/        src/index.ts (programmatic API), src/cli.ts (bin entry point)
docs/                    this documentation
```

Each package's `dist/` (gitignored) is what its `package.json` `exports` actually resolve to.
`expo-native-guard` and `vite-workspace-resolver` build through `tsdown`; `expo-pnpm-catalog` and
`context-budget` build through `tsc` directly, since their `bin` entry point (`dist/cli.js`) isn't
part of the `exports` map `tsdown` generates from.

## Scripts (for contributors to this repo)

| Script (from repo root)        | Runs                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `pnpm lint`                    | `eslint .`                                                                         |
| `pnpm lint:md`                 | `remark . --frail --quiet`                                                         |
| `pnpm format` / `format:check` | `prettier --write .` / `prettier --check .`                                        |
| `pnpm typecheck`               | `tsc` (or the package's typecheck config) in every package                         |
| `pnpm test`                    | `vitest run` in every package                                                      |
| `pnpm build`                   | builds every package (`tsdown` or `tsc`, per package)                              |
| `pnpm verify`                  | typecheck, lint, lint:md, format:check, test, build                                |
| `pnpm changeset`               | records a pending version bump, see [How-to](./how-to.md#release-a-new-version)    |
| `pnpm release`                 | `pnpm build && changeset publish`, see [How-to](./how-to.md#release-a-new-version) |
| `pnpm release:notes`           | `node scripts/release-notes.mjs`, see [How-to](./how-to.md#release-a-new-version)  |
