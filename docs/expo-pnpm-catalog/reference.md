[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `expo-pnpm-catalog`:
[🚀 Tutorial](./tutorial.md) · [🛠️ How-to](./how-to.md) · **📖 Reference** ·
[💡 Explanation](./explanation.md)

# 📖 Reference: `expo-pnpm-catalog`

## Exports

| Package             | Subpath                 | Resolves to     | Needs                                                          |
| ------------------- | ----------------------- | --------------- | -------------------------------------------------------------- |
| `expo-pnpm-catalog` | `.`                     | `dist/index.js` | nothing extra (bundles `chalk`, `commander`, `js-yaml`, `ora`) |
| `expo-pnpm-catalog` | bin `expo-pnpm-catalog` | `dist/cli.js`   | same                                                           |

## API

### CLI

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

## Programmatic

```ts
type CatalogPaths = {
  rootDir: string; // root of the pnpm workspace (directory containing pnpm-workspace.yaml)
  appDir: string; // directory of the Expo app being checked/synced
  workspaceYamlPath: string; // absolute path to pnpm-workspace.yaml
  packageJsonPath: string; // absolute path to the Expo app's package.json
};

type CheckOptions = { dryRun: boolean };
type SyncOptions = { dryRun: boolean; yes: boolean };

function findWorkspaceRoot(startDir: string): string;
function runCheck(paths: CatalogPaths, options: CheckOptions): boolean;
function runSync(paths: CatalogPaths, options: SyncOptions): Promise<void>;
```

- `findWorkspaceRoot`: walks up from `startDir` until it finds a `pnpm-workspace.yaml`; throws if it
  reaches the filesystem root without finding one.
- `runCheck`: returns `true` if `expo-doctor` passed against the resolved manifest (`dryRun: true`
  always returns `true` without running it).
- `runSync`: writes to `pnpm-workspace.yaml` and runs `pnpm install` unless `dryRun: true`.
- Packages under `expo.install.exclude` in the Expo app's `package.json` are skipped by `runSync`,
  matching `expo install --fix`'s own exclusion behavior. See
  [How-to § Exclude a package from sync](./how-to.md#exclude-a-package-from-sync).

## How workspace packages are discovered

Top-level workspace directories to scan (e.g. `apps`, `packages`) come from the `packages:` globs
declared in `pnpm-workspace.yaml`. If none are declared, it falls back to `apps`, `packages`,
`tooling`.
