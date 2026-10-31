[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `expo-pnpm-catalog`:
[🚀 Tutorial](./tutorial.md) · **🛠️ How-to** · [📖 Reference](./reference.md) ·
[💡 Explanation](./explanation.md)

# 🛠️ How-to guides: `expo-pnpm-catalog`

## Check Expo SDK versions against a pnpm catalog

Mirrors what `expo-doctor` would see in CI, against every `catalog:*` reference in the Expo app and
in every other workspace package that shares an Expo-managed dependency:

```sh
npx expo-pnpm-catalog check --app-dir apps/expo
```

Add `--dry-run` to print the resolved version table without running `expo-doctor`:

```sh
npx expo-pnpm-catalog check --app-dir apps/expo --dry-run
```

## Sync a pnpm catalog with the current Expo SDK

Runs `expo install --fix` against the resolved manifest, then writes whatever it changes back into
the matching `catalogs.*` section of `pnpm-workspace.yaml` (comments and formatting preserved) and
runs `pnpm install`:

```sh
npx expo-pnpm-catalog sync --app-dir apps/expo
```

`--dry-run` shows the pending version changes without writing them; `-y`/`--yes` skips the
confirmation prompt, useful in CI:

```sh
npx expo-pnpm-catalog sync --app-dir apps/expo --dry-run
npx expo-pnpm-catalog sync --app-dir apps/expo --yes
```

## Exclude a package from sync

Add it to `expo.install.exclude` in the Expo app's `package.json`: `sync` skips any package listed
there, matching `expo install --fix`'s own exclusion behavior:

```json
{
  "expo": {
    "install": {
      "exclude": ["react-native-reanimated"]
    }
  }
}
```

## Use `expo-pnpm-catalog` programmatically

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

See [Reference § Programmatic](./reference.md#programmatic) for `CatalogPaths`, `CheckOptions`, and
`SyncOptions`.
