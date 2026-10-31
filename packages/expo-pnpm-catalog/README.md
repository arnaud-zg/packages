# expo-pnpm-catalog

<a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
<a href="https://www.npmjs.com/package/expo-pnpm-catalog"><img src="https://img.shields.io/npm/v/expo-pnpm-catalog.svg" alt="npm version"></a>
<img src="https://img.shields.io/badge/CLI-ready-brightgreen" alt="CLI ready">

Deterministic Expo SDK checks and sync for [pnpm catalogs](https://pnpm.io/catalogs), like
`expo-doctor` for a whole workspace.

If you manage Expo SDK dependency versions through a pnpm catalog (`catalog:` or `catalog:expo`),
`expo-doctor` and `expo install --fix` can't read those references directly: they expect concrete
version strings. `expo-pnpm-catalog` temporarily resolves the catalog references across your
**entire** pnpm workspace, runs the real Expo tooling against the resolved manifest, and restores
the original `package.json` afterwards.

📚 Full guides:
[tutorial, how-to, reference and explanation](https://github.com/arnaud-zg/packages/tree/main/docs/expo-pnpm-catalog).

## Install

```bash
npm install --save-dev expo-pnpm-catalog
```

## Usage

Run directly with `npx`, or add scripts to your workspace root `package.json`:

```sh
npx expo-pnpm-catalog check --app-dir apps/expo
npx expo-pnpm-catalog sync --app-dir apps/expo
```

```json
{
  "scripts": {
    "catalog:check": "expo-pnpm-catalog check --app-dir apps/expo",
    "catalog:sync": "expo-pnpm-catalog sync --app-dir apps/expo"
  }
}
```

## Requirements

- A pnpm workspace (a `pnpm-workspace.yaml` somewhere above the Expo app)
- An Expo app whose `package.json` declares Expo-managed dependencies via `catalog:` references
  (e.g. `"expo-camera": "catalog:expo"`)

### `expo-pnpm-catalog check`

Mirrors what `expo-doctor` would see in CI: resolves every `catalog:*` reference, in the Expo app
and in every other workspace package that shares an Expo-managed dependency, to its concrete
version, runs `expo-doctor` against that resolved manifest, then restores the original file
regardless of outcome (including on `Ctrl-C`).

```
Usage: expo-pnpm-catalog check [options]

Options:
  --dry-run         show resolved versions per package without running expo-doctor
  --app-dir <path>  path to the Expo app (defaults to the current working directory)
```

### `expo-pnpm-catalog sync`

Runs `expo install --fix` against the resolved manifest to compute the versions the current Expo SDK
actually wants, then writes those versions back into the matching `catalogs.*` section of
`pnpm-workspace.yaml` (preserving comments and formatting), and runs `pnpm install`.

```
Usage: expo-pnpm-catalog sync [options]

Options:
  --dry-run         show what would change without applying it
  -y, --yes         skip the confirmation prompt
  --app-dir <path>  path to the Expo app (defaults to the current working directory)
```

Packages listed under `expo.install.exclude` in the Expo app's `package.json` are skipped by `sync`,
matching `expo install --fix`'s own exclusion behavior.

## Programmatic use

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

## How workspace packages are discovered

By default, `expo-pnpm-catalog` derives the top-level workspace directories to scan (e.g. `apps`,
`packages`) from the `packages:` globs declared in `pnpm-workspace.yaml`. If none are declared, it
falls back to `apps`, `packages`, `tooling`.
