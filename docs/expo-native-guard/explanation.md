[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `expo-native-guard`:
[🚀 Tutorial](./tutorial.md) · [🛠️ How-to](./how-to.md) · [📖 Reference](./reference.md) · **💡
Explanation**

# 💡 Explanation: `expo-native-guard`

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
