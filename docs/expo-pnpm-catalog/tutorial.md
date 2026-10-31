[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `expo-pnpm-catalog`: **🚀 Tutorial** ·
[🛠️ How-to](./how-to.md) · [📖 Reference](./reference.md) · [💡 Explanation](./explanation.md)

# 🚀 `expo-pnpm-catalog`: Keep Expo SDK versions in sync across a pnpm catalog

If your Expo app's dependencies are pinned through a [pnpm catalog](https://pnpm.io/catalogs)
(`catalog:` or `catalog:expo`), `expo-doctor` and `expo install --fix` can't read those references
directly: they expect concrete version strings. This walks through checking and syncing them
instead.

Needs a pnpm workspace (a `pnpm-workspace.yaml` above your Expo app) with the app's Expo-managed
dependencies declared as `catalog:` references, e.g. `"expo-camera": "catalog:expo"`.

## 1. Install

```sh
npm install --save-dev expo-pnpm-catalog
```

## 2. Add scripts

```json
// package.json (workspace root)
{
  "scripts": {
    "catalog:check": "expo-pnpm-catalog check --app-dir apps/expo",
    "catalog:sync": "expo-pnpm-catalog sync --app-dir apps/expo"
  }
}
```

## 3. Check for drift

```sh
pnpm catalog:check
```

Resolves every `catalog:*` reference (in the Expo app, and in every other workspace package that
shares an Expo-managed dependency) to its concrete version, runs `expo-doctor` against that resolved
manifest, then restores the original `package.json`, pass or fail.

## 4. Fix drift when it's found

```sh
pnpm catalog:sync
```

Runs `expo install --fix` to compute the versions the current Expo SDK actually wants, shows a
from/to table, and, after you confirm, writes them back into `pnpm-workspace.yaml`'s matching
`catalogs.*` section and runs `pnpm install`.

Done. Re-run `catalog:check` to confirm it's clean. For `--dry-run`, `-y`/`--yes`, excluding a
package, or the programmatic API, see
[How-to guides](./how-to.md#check-expo-sdk-versions-against-a-pnpm-catalog).
