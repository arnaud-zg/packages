[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `vite-workspace-resolver`:
[🚀 Tutorial](./tutorial.md) · [🛠️ How-to](./how-to.md) · [📖 Reference](./reference.md) · **💡
Explanation**

# 💡 Explanation: `vite-workspace-resolver`

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
