[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `vite-workspace-resolver`:
[🚀 Tutorial](./tutorial.md) · [🛠️ How-to](./how-to.md) · **📖 Reference** ·
[💡 Explanation](./explanation.md)

# 📖 Reference: `vite-workspace-resolver`

## Exports

| Package                   | Subpath | Resolves to     | Needs                                     |
| ------------------------- | ------- | --------------- | ----------------------------------------- |
| `vite-workspace-resolver` | `.`     | `dist/index.js` | nothing extra (bundles `resolve.exports`) |

## `workspaceExports(rootDir, options?)`

| Option   | Type       | Default        | Description                                                    |
| -------- | ---------- | -------------- | -------------------------------------------------------------- |
| `groups` | `string[]` | `["packages"]` | Directories under `rootDir` whose direct children are packages |

```ts
workspaceExports(root, { groups: ["packages", "tooling", "apps"] });
```

Every directory with a named `package.json` under one of the groups is a workspace package, whatever
its scope. Specifiers that don't name one (`react`, relative paths) return `null` and fall through
to Vite's default resolver.
