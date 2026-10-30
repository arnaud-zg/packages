[🏠 Home](../README.md) · [🚀 Tutorial](./tutorial.md) · [🛠️ How-to](./how-to.md) ·
[📖 Reference](./reference.md) · **💡 Explanation**

# 💡 Explanation

## Why independent packages share one repo

Every package here is a small, focused tool with no shared runtime between them: installing one
never pulls in another, and each publishes and versions independently. A monorepo buys one set of
dev tooling (lint, format, release process, CI) instead of duplicating it per package; nothing about
any package's own code depends on the others existing.

## Why the loaders must be `require()` calls, not static imports

Bundlers (Metro included) evaluate top-level static imports eagerly, regardless of which branch of
code actually runs. A native-only module doesn't resolve inside Expo Go, so a static
`import { CameraView } from "./CameraView"` would throw at bundle-evaluation time, before
`isRunningInExpoGo()` is ever checked: the crash `expo-native-guard` exists to prevent. A
`require()` call inside a function body only executes, and only resolves its module, once that
branch actually runs.

## Why `expo-native-guard/core` has no React import

`loadExpoGoAwareModule` and `resolveUnlessExpoGo` are pure branching logic: they don't touch `react`
or `react-native`. Splitting them into their own subpath lets a caller that only needs the branching
primitive (a native module lookup, not a component) use it without pulling in a React shim for
nothing. The main `expo-native-guard` barrel re-exports both, plus `createExpoGoAwareComponent` and
`withExpoGoIndicator`, which do render real components and so do need `react`/`react-native`.

## Why the Expo Go fallback gets a visible indicator, not just a passing test

A unit test that mocks `isRunningInExpoGo()` proves each branch's own logic in isolation. It doesn't
prove that what's currently on screen, in a real Expo Go session, still matches the native branch a
reviewer or QA pass exercised separately (or vice versa). `withExpoGoIndicator` is a runtime nudge
for exactly that gap: it only ever renders when the app is actually running in Expo Go, never in a
dev client or a production build. Seeing the badge is the signal "you're looking at the fallback
path: the native path is separate code and still needs its own pass before shipping." It doesn't
replace testing either path; both loaders still need their own coverage, same as any other branch.

## Why the implementation layer stays thin

Everything native-vs-Expo-Go specific belongs in the two loaders: the permission API shape, how a
photo gets captured, how a native module is resolved. Anything that doesn't depend on which
environment is running belongs outside `expo-native-guard`, in whatever shared logic both loaders
can call into. If a native and an Expo Go implementation of the same feature start looking like two
large, mostly-duplicated files, that's a sign shared logic hasn't been factored out of the caller
yet, not a sign this package needs new options.

## Why `expo-pnpm-catalog check` resolves the whole workspace, not just the Expo app

`expo-doctor` reads a single `package.json`'s dependency versions; a pnpm catalog reference
(`catalog:expo`) isn't a version it understands. Resolving only the Expo app's own manifest would
miss drift in a shared package elsewhere in the workspace (a UI kit, a shared hooks package) that
also depends on the same Expo-managed package through the same catalog: `expo-doctor` would pass
locally while that sibling package quietly drifts. `WorkspaceCatalogExpoScanner` scans every
top-level workspace directory for other `package.json` files referencing the same catalog entries,
so `check`'s pass/fail reflects the whole workspace's dependency surface, not just one app's.

## Why `sync` runs `expo install --fix` instead of hand-computing versions

`expo install --fix` is the same engine `expo-doctor` itself uses to decide what a given Expo SDK
version wants. Reimplementing that logic against the SDK's own compatibility table would mean
tracking every SDK release by hand and inevitably drifting from what Expo's own tooling decides;
running the real command against the resolved manifest and reading back what it changed can't drift,
by construction.

## Why the Expo app's `package.json` is always restored, even on `Ctrl-C`

Both `check` and `sync` temporarily rewrite the Expo app's `package.json`, replacing every
`catalog:*` reference with its resolved concrete version, because `expo-doctor` and
`expo install --fix` can't read a catalog reference directly. Leaving that rewritten file in place
would silently convert catalog references into hardcoded pins, defeating the point of using a
catalog. `SIGINT`/`SIGTERM` handlers plus a `finally` block around the mutation guarantee the
original file comes back even if the process is interrupted mid-run, not just on a clean exit.

## Why `pnpm-workspace.yaml` updates are a targeted string replace, not a full YAML round-trip

`sync` only ever changes a handful of version values inside `catalogs.*`. Parsing the file with
`js-yaml`, mutating the object, and re-serializing it would re-flow the whole document through the
library's own formatting rules, dropping comments and reordering keys in the process.
`updateVersionInYaml` instead matches each changed package's line by regex and replaces only the
version portion, leaving everything else in the file, comments included, byte-for-byte unchanged.
`js-yaml` is still used to _read_ the file (parsing structure needs a real parser); only the write
path avoids it.

## Versioning policy

Each package versions independently through [Changesets](https://github.com/changesets/changesets),
not in lockstep: a fix to `expo-native-guard` doesn't force a version bump on `expo-pnpm-catalog`,
or vice versa. Both start at `0.1.0`: usable, not yet stable, expect breaking changes signaled by a
`0.x` minor bump until `1.0.0`.
