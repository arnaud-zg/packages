# 📦 packages

<p align="center">
  <img src="assets/icon.png" width="128" height="128" alt="arnaud-zg packages logo" />
</p>

<div align="center">
  <b>Small, focused, well-tested npm packages for Expo, React Native and TypeScript projects.</b>
  <br/>
  Each one is standalone: install only what you need, nothing else comes along.
</div>

---

<div align="center">

<!-- Badges -->

<a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
<a href="https://pnpm.io/"><img src="https://img.shields.io/badge/Powered%20by-pnpm%20workspaces-F69220?logo=pnpm&logoColor=white" alt="Powered by pnpm workspaces"></a>
<a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white" alt="TypeScript"></a>
<a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white" alt="Node >=22"></a>
<br/>
<a href="https://www.npmjs.com/package/expo-pnpm-catalog"><img src="https://img.shields.io/npm/v/expo-pnpm-catalog.svg?label=expo-pnpm-catalog" alt="expo-pnpm-catalog npm version"></a>
<a href="https://www.npmjs.com/package/expo-native-guard"><img src="https://img.shields.io/npm/v/expo-native-guard.svg?label=expo-native-guard" alt="expo-native-guard npm version"></a>
<br/>
<a href="https://npm-stat.com/charts.html?package=expo-pnpm-catalog"><img src="https://img.shields.io/npm/dm/expo-pnpm-catalog.svg?label=expo-pnpm-catalog" alt="expo-pnpm-catalog npm downloads"></a>
<a href="https://npm-stat.com/charts.html?package=expo-native-guard"><img src="https://img.shields.io/npm/dm/expo-native-guard.svg?label=expo-native-guard" alt="expo-native-guard npm downloads"></a>

</div>

---

## 👋 What is this?

This repository is the home of every npm package I publish. Each package solves one specific
problem, ships its own README, and is versioned and released independently. They share a single
toolchain (TypeScript, ESLint, Prettier, Vitest, Changesets) so every package gets the same quality
bar.

## 📦 Packages

| Package                                                         | What it does                                                                                                                       | Install                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [`expo-native-guard`](./packages/expo-native-guard)             | Load native-only modules (Nitro, TurboModules, custom Expo modules) without crashing in **Expo Go**, with a visible fallback badge | `npm install expo-native-guard`                  |
| [`expo-pnpm-catalog`](./packages/expo-pnpm-catalog)             | Check and sync **Expo SDK** versions in **pnpm catalogs**, like `expo-doctor` and `expo install --fix` for a whole workspace       | `npm install --save-dev expo-pnpm-catalog`       |
| [`vite-workspace-resolver`](./packages/vite-workspace-resolver) | Resolve workspace packages' **exports-map subpaths** and deep `src/` imports in **Vite/Vitest**, without per-package aliases       | `npm install --save-dev vite-workspace-resolver` |

More packages will land here over time. ⭐ Star or watch the repo to hear about them.

### 🤔 Which one do I need?

- **"My app crashes in Expo Go because a library needs native code."** →
  [`expo-native-guard`](./packages/expo-native-guard#readme)
- **"`expo-doctor` can't read my `catalog:` versions in a pnpm monorepo."** →
  [`expo-pnpm-catalog`](./packages/expo-pnpm-catalog#readme)
- **"Vitest can't resolve `@my/pkg/subpath` from another workspace package."** →
  [`vite-workspace-resolver`](./packages/vite-workspace-resolver#readme)

## 📚 Documentation

- 🚀 **[Tutorial](./docs/tutorial.md)**: install and wire up each package, step by step.
- 🛠️ **[How-to guides](./docs/how-to.md)**: short recipes for common tasks.
- 📖 **[Reference](./docs/reference.md)**: full API and package layout.
- 💡 **[Explanation](./docs/explanation.md)**: why things work the way they do.

## ❓ FAQ

**Does installing one package pull in the others?** No. Packages have no shared runtime and no
dependencies on each other.

**Are they production ready?** Yes. Every package is written in TypeScript, fully typed, tested with
Vitest, and released with semantic versioning and a changelog.

**Found a bug or have an idea?** [Open an issue](https://github.com/arnaud-zg/packages/issues).
Feedback is very welcome.

## 🤝 Contributing

```sh
pnpm install
pnpm verify
```

Each package is released independently with [Changesets](https://github.com/changesets/changesets);
see [How-to § Release a new version](./docs/how-to.md#release-a-new-version).

## 📄 License

[MIT](./LICENSE) © Arnaud Zheng
