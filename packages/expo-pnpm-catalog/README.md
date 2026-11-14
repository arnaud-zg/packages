# 📦 expo-pnpm-catalog

`expo-doctor` and `expo install --fix` can't read `catalog:` references from a
[pnpm catalog](https://pnpm.io/catalogs): they expect concrete version strings. `expo-pnpm-catalog`
resolves the catalog references across your whole pnpm workspace, runs the real Expo tooling against
the resolved manifest, and restores the original `package.json` afterwards.

```text
$ npx expo-pnpm-catalog check

  Expo catalog check — 26 packages
  17 from . · 9 additional from other workspace packages

  ✗ expo-doctor reported issues
  → Run expo-pnpm-catalog sync to fix version drift
```

## ⚡ Install

```bash
npm install --save-dev expo-pnpm-catalog
npx expo-pnpm-catalog check --app-dir apps/expo
```

## ⚙️ Usage

Run directly with `npx`, or add scripts to your workspace root `package.json`:

```json
{
  "scripts": {
    "catalog:check": "expo-pnpm-catalog check --app-dir apps/expo",
    "catalog:sync": "expo-pnpm-catalog sync --app-dir apps/expo"
  }
}
```

`check` resolves every `catalog:*` reference, in the Expo app and in every other workspace package
that shares an Expo-managed dependency, runs `expo-doctor` against that resolved manifest, then
restores the original file regardless of outcome (including on `Ctrl-C`).

`sync` runs `expo install --fix` against the resolved manifest, writes the versions the current Expo
SDK wants back into the matching `catalogs.*` section of `pnpm-workspace.yaml` (preserving comments
and formatting), and runs `pnpm install`. Packages listed under `expo.install.exclude` in the Expo
app's `package.json` are skipped.

## 📋 Options

```
Usage: expo-pnpm-catalog check [options]

Options:
  --dry-run         show resolved versions per package without running expo-doctor
  --app-dir <path>  path to the Expo app (defaults to the current working directory)
```

```
Usage: expo-pnpm-catalog sync [options]

Options:
  --dry-run         show what would change without applying it
  -y, --yes         skip the confirmation prompt
  --app-dir <path>  path to the Expo app (defaults to the current working directory)
```

Source: `src/cli.ts`.

## 🧰 Programmatic use

```ts
import path from "path";
import { findWorkspaceRoot, runCheck, runSync } from "expo-pnpm-catalog";

const appDir = path.resolve("apps/expo");
const rootDir = findWorkspaceRoot(appDir);
const paths = {
  appDir,
  rootDir,
  workspaceYamlPath: path.join(rootDir, "pnpm-workspace.yaml"),
  packageJsonPath: path.join(appDir, "package.json"),
};

const passed = runCheck(paths, { dryRun: false });
await runSync(paths, { dryRun: false, yes: true });
```

## 🔑 Requirements

- A pnpm workspace (a `pnpm-workspace.yaml` somewhere above the Expo app)
- An Expo app whose `package.json` declares Expo-managed dependencies via `catalog:` references
  (e.g. `"expo-camera": "catalog:expo"`)

## 📚 Docs

- 🚀
  **[Tutorial](https://github.com/arnaud-zg/packages/blob/main/docs/expo-pnpm-catalog/tutorial.md)**:
  keep Expo SDK versions in sync across a pnpm catalog
- 🛠️ **[How-to](https://github.com/arnaud-zg/packages/blob/main/docs/expo-pnpm-catalog/how-to.md)**:
  check, sync, exclude a package, use it from code
- 📖
  **[Reference](https://github.com/arnaud-zg/packages/blob/main/docs/expo-pnpm-catalog/reference.md)**:
  CLI flags, exported functions, how workspace packages are discovered
- 💡
  **[Explanation](https://github.com/arnaud-zg/packages/blob/main/docs/expo-pnpm-catalog/explanation.md)**:
  why the whole workspace, why `expo install --fix`, why the manifest is always restored

## 📈 Downloads

<a href="https://npm-stat.com/charts.html?package=expo-pnpm-catalog">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/chart/npm/expo-pnpm-catalog.svg?days=90&logo=false&mode=dark" />
    <img alt="expo-pnpm-catalog npm downloads per week, last 90 days" src="https://shieldcn.dev/chart/npm/expo-pnpm-catalog.svg?days=90&logo=false&mode=light" />
  </picture>
</a>
