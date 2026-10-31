# expo-native-guard

<a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
<a href="https://www.npmjs.com/package/expo-native-guard"><img src="https://img.shields.io/npm/v/expo-native-guard.svg" alt="npm version"></a>
<img src="https://img.shields.io/badge/ESM-Ready-green" alt="ESM Ready">

Expo Go only bundles Expo's own native modules. Any package with its own native binding — Nitro
modules like `react-native-vision-camera`, TurboModules like `react-native-onesignal`, or a custom
Expo module like `expo-mascot` — throws at import or resolution time when it isn't there. This
package makes that a controlled, visible fallback instead of a crash.

📚 Full guides:
[tutorial, how-to, reference and explanation](https://github.com/arnaud-zg/packages/tree/main/docs/expo-native-guard).

## Install

```bash
npm install expo-native-guard
```

## `createExpoGoAwareComponent`

The main entry point — pick between a native and an Expo Go screen, mirroring
`createDatabaseBackedProvider(token, { postgres, sqlite })`: a name plus one loader per
implementation. Both loaders are lazy — pass a `require()` call, not a static `import` — since
bundlers evaluate top-level imports eagerly regardless of which branch runs, so a static import of
the native variant would crash Expo Go before the check ever ran:

```tsx
export const CameraView = createExpoGoAwareComponent("CameraView", {
  native: () => require("./CameraView").CameraView,
  expoGo: () => require("./CameraView.expoGo").CameraView,
});
```

The `expoGo` result is automatically wrapped with `withExpoGoIndicator` using the given name — see
below for what that does and why.

## `loadExpoGoAwareModule`

The lower-level primitive `createExpoGoAwareComponent` is built on — pick between two loaders for
any value, not just a component:

```ts
export const CameraView = loadExpoGoAwareModule({
  native: () => require("./CameraView").CameraView,
  expoGo: () => require("./CameraView.expoGo").CameraView,
});
```

## `resolveUnlessExpoGo`

For a single native lookup — `requireNativeModule`/`requireNativeView` — rather than two full
implementations. Returns `null` in Expo Go instead of throwing, so the caller can fall back to a
plain JS/RN implementation. It's `loadExpoGoAwareModule` with `expoGo: () => null` built in:

```ts
const NativeView = resolveUnlessExpoGo(() => requireNativeView<Props>("MyNativeView"));

export default function MyView(props: Props) {
  const View = NativeView ?? MyFallbackView;
  return <View {...props} />;
}
```

`loadExpoGoAwareModule` and `resolveUnlessExpoGo` are also available from `expo-native-guard/core` —
no React or `react-native` import, for consumers that only need the branching logic. The full
`expo-native-guard` barrel (used above) also pulls in `withExpoGoIndicator`, a real component.

## `withExpoGoIndicator`

Wraps an Expo Go fallback component with a visible reminder that it's a stand-in — a dotted red
border and a short `<name> · Expo Go` badge, rendered with plain `react-native` `View`/`Text`/
`StyleSheet`, no other dependency. `createExpoGoAwareComponent` applies this automatically; use it
directly only if composing `loadExpoGoAwareModule` by hand:

```tsx
expoGo: () => withExpoGoIndicator(require("./CameraView.expoGo").CameraView, "CameraView"),
```

**Why this exists.** A unit test that mocks `isRunningInExpoGo()` proves each branch's own logic in
isolation — it does not prove that what's currently on screen, in a real Expo Go session, still
matches the native branch a reviewer or QA pass exercised separately (or vice versa). The indicator
is a runtime nudge for exactly that gap: it only ever renders when the app is actually running in
Expo Go, never in a dev client or production build. Seeing the badge is the signal "you're looking
at the fallback path — the native path is separate code and still needs its own pass before
shipping." **It does not replace testing either path** — both loaders should have their own test
coverage; that stays the responsibility of whoever changes them.

## Keep the implementation layer thin

Everything native-vs-Expo-Go specific should live in the two loaders — the permission API shape, how
a photo gets captured, how a native module is resolved. Anything that doesn't depend on which
environment is running belongs outside this package, in whatever shared logic both loaders can call
into (a shared hook, a shared presentational component, a shared helper). If a native and an Expo Go
implementation of the same feature start looking like two large, mostly-duplicated files, that's a
sign shared logic hasn't been factored out yet, not a sign this package needs new options.

## Design notes

- No dependency on any UI/styling library beyond `react-native` — `withExpoGoIndicator` uses
  `StyleSheet.create` and nothing else.
- `expo`, `react`, and `react-native` are peer dependencies, not bundled — a consuming app always
  supplies its own, avoiding duplicate React instances. Ranges are floors, not pins: `expo >=50.0.0`
  because that's the first SDK exporting `isRunningInExpoGo`, `react-native >=0.73.0` as its paired
  minimum.
- Tests render real `react-native` primitives via `react-native-web` (dev-only, see
  `vitest.config.ts`), not a hand-rolled stub, so `withExpoGoIndicator`'s coverage exercises the
  same component tree shape a consumer would actually get.
- Published standalone (`pnpm build` via `tsdown` → `dist/`, `LICENSE`, `repository`) — the problem
  it solves isn't specific to any one app or monorepo.
