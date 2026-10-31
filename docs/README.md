[🏠 Home](../README.md) · **📚 Docs**

# 📚 Documentation

Every package has the same four pages, following [Diátaxis](https://diataxis.fr/). Find your package
in the first table, then pick the page that matches what you need right now.

| You want to...                          | Open           |
| --------------------------------------- | -------------- |
| Get it working for the first time       | 🚀 Tutorial    |
| Solve one specific task                 | 🛠️ How-to      |
| Look up an option, export or flag       | 📖 Reference   |
| Understand why it works the way it does | 💡 Explanation |

## 📦 By package

| Package                                                            | For                | 🚀                                                | 🛠️                                            | 📖                                                  | 💡                                                      |
| ------------------------------------------------------------------ | ------------------ | ------------------------------------------------- | --------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| [`expo-native-guard`](./expo-native-guard/tutorial.md)             | Expo, React Native | [Tutorial](./expo-native-guard/tutorial.md)       | [How-to](./expo-native-guard/how-to.md)       | [Reference](./expo-native-guard/reference.md)       | [Explanation](./expo-native-guard/explanation.md)       |
| [`expo-pnpm-catalog`](./expo-pnpm-catalog/tutorial.md)             | Expo, pnpm         | [Tutorial](./expo-pnpm-catalog/tutorial.md)       | [How-to](./expo-pnpm-catalog/how-to.md)       | [Reference](./expo-pnpm-catalog/reference.md)       | [Explanation](./expo-pnpm-catalog/explanation.md)       |
| [`vite-workspace-resolver`](./vite-workspace-resolver/tutorial.md) | Vite, Vitest       | [Tutorial](./vite-workspace-resolver/tutorial.md) | [How-to](./vite-workspace-resolver/how-to.md) | [Reference](./vite-workspace-resolver/reference.md) | [Explanation](./vite-workspace-resolver/explanation.md) |
| [`agent-context-budget`](./agent-context-budget/tutorial.md)       | AI coding agents   | [Tutorial](./agent-context-budget/tutorial.md)    | [How-to](./agent-context-budget/how-to.md)    | [Reference](./agent-context-budget/reference.md)    | [Explanation](./agent-context-budget/explanation.md)    |

## 🤔 Which package do I need?

| You're hitting                                                                           | Install                   | What it does                                                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| Expo Go crashing on a native-only import (Nitro module, TurboModule, custom Expo module) | `expo-native-guard`       | Swaps in a visible fallback component instead of crashing                                     |
| Expo SDK dependency versions drifting out of sync across a pnpm catalog                  | `expo-pnpm-catalog`       | Runs `expo-doctor` / `expo install --fix` against resolved catalog versions, syncs drift back |
| Vitest failing to resolve another workspace package's subpath export or `src/` file      | `vite-workspace-resolver` | Vite plugin that resolves workspace exports maps and deep `src/` imports                      |
| CLAUDE.md or AGENTS.md growing past what an agent session should load                    | `agent-context-budget`    | Scores context files against token budgets, shows which sections to cut                       |

Each is a dependency of your project, not of the others: installing one never pulls in another.

## 🤝 Contributing to this repo

[How-to](./contributing/how-to.md) (run the tests, release a version) ·
[Reference](./contributing/reference.md) (package layout, scripts) ·
[Explanation](./contributing/explanation.md) (why one repo, versioning policy)
