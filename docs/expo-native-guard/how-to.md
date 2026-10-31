[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `expo-native-guard`:
[🚀 Tutorial](./tutorial.md) · **🛠️ How-to** · [📖 Reference](./reference.md) ·
[💡 Explanation](./explanation.md)

# 🛠️ How-to guides: `expo-native-guard`

## Guard a native-only component

Give `createExpoGoAwareComponent` a name plus one loader per implementation. Both loaders must be
`require()` calls, not static imports. See
[Explanation § Why the loaders must be `require()` calls](./explanation.md#why-the-loaders-must-be-require-calls-not-static-imports)
for why:

```tsx
import { createExpoGoAwareComponent } from "expo-native-guard";

export const CameraView = createExpoGoAwareComponent("CameraView", {
  native: () => require("./CameraView").CameraView,
  expoGo: () => require("./CameraView.expoGo").CameraView,
});
```

The `expoGo` result is wrapped with `withExpoGoIndicator` automatically, see
[Reference § `withExpoGoIndicator`](./reference.md#withexpogoindicator) for what that renders.

## Guard a single native lookup instead of two full implementations

For a single `requireNativeModule`/`requireNativeView` call rather than a native/Expo Go pair, use
`resolveUnlessExpoGo`. It returns `null` in Expo Go instead of throwing, so the caller falls back to
a plain JS/RN implementation:

```ts
import { resolveUnlessExpoGo } from "expo-native-guard";

const NativeView = resolveUnlessExpoGo(() => requireNativeView<Props>("MyNativeView"));

export default function MyView(props: Props) {
  const View = NativeView ?? MyFallbackView;
  return <View {...props} />;
}
```

## Use the branching logic without a React import

`loadExpoGoAwareModule` and `resolveUnlessExpoGo` are also available from `expo-native-guard/core`,
with no `react`/`react-native` import, for callers that only need the branching logic and would
otherwise pull in a React shim for nothing:

```ts
import { loadExpoGoAwareModule } from "expo-native-guard/core";

const CameraModule = loadExpoGoAwareModule({
  native: () => require("./CameraModule").CameraModule,
  expoGo: () => require("./CameraModule.expoGo").CameraModule,
});
```

The full `expo-native-guard` barrel (used in the two recipes above) also exports
`withExpoGoIndicator`, a real `react-native` component. Pull from `/core` instead whenever a file
doesn't render anything itself.
