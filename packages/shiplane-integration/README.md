# 🧪 @shiplane/integration

Private, never published. Tests of
[shiplane](https://github.com/arnaud-zg/packages/blob/main/packages/shiplane/README.md) that need
several plugins at once. The core cannot depend on its plugins, so these tests live here.

## ⚡ Run

The tests import the **built** packages, so build first:

```sh
pnpm build
pnpm --filter @shiplane/integration test
```

## 📋 What each test proves

| File                                 | Proves                                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/__tests__/init.test.ts`         | `shiplane init` writes a config that imports every plugin, guesses each app's host from its folder, and keeps edits                                            |
| `src/__tests__/ship.test.ts`         | A ship across several hosts: one GitHub Actions run, a fallback to this machine, and the other units still go if one fails                                     |
| `src/__tests__/tagging.e2e.test.ts`  | The built CLI tags a version with real git against a local bare origin, never twice, and says how to finish on failure                                         |
| `src/__tests__/examples.e2e.test.ts` | Every example a package README quotes really runs, so the docs cannot drift from the code                                                                      |
| `src/__tests__/writeAPlugin.test.ts` | The plugin written on the [Plugins page](https://github.com/arnaud-zg/packages/blob/main/docs/shiplane/plugins.md) holds the same contract as the real plugins |

Helpers: `src/aliases.ts` resolves `shiplane` and each `@shiplane/*` plugin to its built package;
`src/examples.ts` turns a package's example folder into a test repository with every plugin
installed.

## ➕ When to add a test here

Add it here only when it needs **two or more plugins**, the **built CLI**, or a **README example**.
A test of one plugin lives in that plugin's package; a test of the core lives in `shiplane`.
