[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `vite-workspace-resolver`:
[🚀 Tutorial](./tutorial.md) · **🛠️ How-to** · [📖 Reference](./reference.md) ·
[💡 Explanation](./explanation.md)

# 🛠️ How-to guides: `vite-workspace-resolver`

## Resolve packages outside `packages/`

List every directory whose direct children are workspace packages:

```ts
workspaceExports(root, { groups: ["packages", "tooling", "apps"] });
```
