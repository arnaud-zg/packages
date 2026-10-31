[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `vite-workspace-resolver`: **🚀 Tutorial** ·
[🛠️ How-to](./how-to.md) · [📖 Reference](./reference.md) · [💡 Explanation](./explanation.md)

# 🚀 `vite-workspace-resolver`: Resolve workspace imports in Vitest

Vite's test resolver won't follow a workspace package's `package.json` `exports` map for non-`"."`
subpaths, and can't reach into a package's `src/` for files that aren't exported at all.
`workspaceExports(rootDir)` scans every workspace package once and resolves both cases directly as a
Vite plugin — no more hand-rolled `resolve.alias` entries per package/subpath.

## 1. Install

```sh
npm install --save-dev vite-workspace-resolver
```

## 2. Add the plugin

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
