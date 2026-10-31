[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `expo-native-guard`: **🚀 Tutorial** ·
[🛠️ How-to](./how-to.md) · [📖 Reference](./reference.md) · [💡 Explanation](./explanation.md)

# 🚀 `expo-native-guard`: Stop a native-only import from crashing Expo Go

Expo Go only bundles Expo's own native modules. Any package with its own native binding (a Nitro
module, a TurboModule, a custom Expo module) throws at import or resolution time when it isn't
there. This walks through swapping in a visible fallback instead.

## 1. Install

```sh
npm install expo-native-guard
```

## 2. Write a native implementation and an Expo Go fallback

Two files, same shape: here, a native camera view and a placeholder for Expo Go:

```tsx
// CameraView.tsx
import { requireNativeViewManager } from "expo-modules-core";

export const CameraView = requireNativeViewManager("MyCamera");
```

```tsx
// CameraView.expoGo.tsx
import { Text, View } from "react-native";

export const CameraView = () => (
  <View>
    <Text>Camera preview isn't available in Expo Go.</Text>
  </View>
);
```

## 3. Wire them together with `createExpoGoAwareComponent`

```tsx
// index.tsx
import { createExpoGoAwareComponent } from "expo-native-guard";

export const CameraView = createExpoGoAwareComponent("CameraView", {
  native: () => require("./CameraView").CameraView,
  expoGo: () => require("./CameraView.expoGo").CameraView,
});
```

Both loaders are `require()` calls, not static imports. That matters, see
[Explanation](./explanation.md#why-the-loaders-must-be-require-calls-not-static-imports).

## 4. Run it

```sh
npx expo start
```

Open the app in **Expo Go**: `CameraView` renders the fallback, wrapped in a dotted red border with
a `CameraView · Expo Go` badge, a visible reminder this is a stand-in, not the real thing. Open the
same code in a **dev client** or a production build: `CameraView` renders the native view instead,
no badge.

Done. `expo-native-guard` is wired up. For the lower-level primitives (`loadExpoGoAwareModule`,
`resolveUnlessExpoGo`, a `react`-free import) see
[How-to guides](./how-to.md#guard-a-native-only-component).
