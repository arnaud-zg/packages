[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `expo-native-guard`:
[🚀 Tutorial](./tutorial.md) · [🛠️ How-to](./how-to.md) · **📖 Reference** ·
[💡 Explanation](./explanation.md)

# 📖 Reference: `expo-native-guard`

## Exports

| Package             | Subpath  | Resolves to     | Needs                                       |
| ------------------- | -------- | --------------- | ------------------------------------------- |
| `expo-native-guard` | `.`      | `dist/index.js` | `expo`, `react`, `react-native` (peer deps) |
| `expo-native-guard` | `./core` | `dist/core.js`  | nothing (no `react`/`react-native` import)  |

`expo`, `react`, and `react-native` are peer dependencies of `expo-native-guard`, not bundled: a
consuming app always supplies its own, avoiding duplicate React instances. Ranges are floors, not
pins: `expo` requires `>=50.0.0`, the first SDK exporting `isRunningInExpoGo`; `react-native`
requires its paired minimum, `>=0.73.0`.

## API

### `createExpoGoAwareComponent`

```ts
function createExpoGoAwareComponent<P extends object>(
  name: string,
  loaders: { native: () => ComponentType<P>; expoGo: () => ComponentType<P> },
): ComponentType<P>;
```

Picks between a native and an Expo Go component. The `expoGo` result is wrapped with
`withExpoGoIndicator(name)` automatically. Both loaders must be `require()` calls, not static
imports, see
[Explanation § Why the loaders must be `require()` calls](./explanation.md#why-the-loaders-must-be-require-calls-not-static-imports).

## `loadExpoGoAwareModule`

```ts
function loadExpoGoAwareModule<T>(loaders: { native: () => T; expoGo: () => T }): T;
```

The lower-level primitive `createExpoGoAwareComponent` is built on: picks between two loaders for
any value, not just a component. Also exported from `expo-native-guard/core`.

## `resolveUnlessExpoGo`

```ts
function resolveUnlessExpoGo<T>(resolve: () => T): T | null;
```

For a single native lookup (`requireNativeModule`/`requireNativeView`) rather than two full
implementations. Returns `null` in Expo Go instead of throwing. Equivalent to
`loadExpoGoAwareModule({ native: resolve, expoGo: () => null })`. Also exported from
`expo-native-guard/core`.

## `withExpoGoIndicator`

```ts
function withExpoGoIndicator<P extends object>(
  Component: ComponentType<P>,
  name: string,
): ComponentType<P>;
```

Wraps a component with a visible reminder that it's a stand-in: a dotted red border and a
`<name> · Expo Go` badge, built from plain `react-native` `View`/`Text`/`StyleSheet`, no other
dependency. `createExpoGoAwareComponent` applies this automatically; only needed directly when
composing `loadExpoGoAwareModule` by hand. Not exported from `expo-native-guard/core`: it renders a
real component, so it needs `react-native`.
