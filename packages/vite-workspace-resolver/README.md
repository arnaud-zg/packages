# vite-workspace-resolver

Vite's test resolver won't follow a workspace package's `package.json` `exports` map for non-`"."`
subpaths, and can't reach into a package's `src/` for files that aren't exported at all.
`workspaceExports(rootDir)` scans every workspace package once and resolves both cases directly as a
Vite plugin — no more hand-rolled `resolve.alias` entries per package/subpath.

## Install

```sh
npm install --save-dev vite-workspace-resolver
```

## Usage

```ts
import path from "node:path";
import { workspaceExports } from "vite-workspace-resolver";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [workspaceExports(path.resolve(__dirname, "../.."))],
});
```

Then, from a test, any of these resolve to the right file in the workspace:

```ts
import { core } from "@acme/sse/core"; // exports["./core"]
import { config } from "@acme/theme/src/config"; // deep src/ import, probes .ts/.tsx
import { tokens } from "@acme/tokens"; // exports["."]
```

## API

### `workspaceExports(rootDir, options?)`

| Option   | Type       | Default        | Description                                                    |
| -------- | ---------- | -------------- | -------------------------------------------------------------- |
| `groups` | `string[]` | `["packages"]` | Directories under `rootDir` whose direct children are packages |

```ts
workspaceExports(root, { groups: ["packages", "tooling", "apps"] });
```

Every directory with a named `package.json` under one of the groups is a workspace package, whatever
its scope. Specifiers that don't name one (`react`, relative paths) return `null` and fall through
to Vite's default resolver.

## Design notes

- Exports-map resolution itself is delegated to
  [`resolve.exports`](https://github.com/lukeed/resolve.exports) — a tiny, spec-compliant
  implementation of the actual Node ESM resolution algorithm (conditional exports, wildcard
  subpaths). This package only owns the workspace scan and Vite plugin wiring, not exports-map
  parsing.
- Deep `src/` imports (`<pkg>/src/<rest>`) are a separate mechanism — for reaching a file that isn't
  declared in the package's `exports` map at all. Probes `.ts`/`.tsx` extensions, since Vite doesn't
  re-probe a `resolveId` return value.
- Ships as a built package (`tsdown` → `dist/`), not raw source — a package consumed inside a
  `vitest.config.ts` file needs plain JS. Node's synchronous config-loading path only transpiles the
  config file itself, not files reached transitively through an `import`.

## License

[MIT](./LICENSE) © Arnaud Zheng
