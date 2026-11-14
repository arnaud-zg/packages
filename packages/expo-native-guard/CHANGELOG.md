# expo-native-guard

## 0.1.2

### Patch Changes

- [#58](https://github.com/arnaud-zg/packages/pull/58) [`2b11fcf`](https://github.com/arnaud-zg/packages/commit/2b11fcf651ff2f47946199c0db726fc6938f8110) - The README links each guide page directly (tutorial, how-to, reference, explanation, or the example
  config) instead of a folder listing.

- [#56](https://github.com/arnaud-zg/packages/pull/56) [`8517d57`](https://github.com/arnaud-zg/packages/commit/8517d57bf1ff7ed13561d9686529a4718cf581da) - Clearer npm description and keywords, so the package shows up in npm and web search.

🙏 Thanks to [@arnaud-zg](https://github.com/arnaud-zg) for this release!

## 0.1.1

### Patch Changes

- Two independent tools for Expo monorepos on pnpm.
  
  - **expo-native-guard**: stop Expo Go crashes on native-only modules. Swap in a visible fallback
    instead, so the team stays unblocked in Expo Go without losing sight of what still needs a real
    native test pass.
  - **expo-pnpm-catalog**: run `expo-doctor` and `expo install --fix` correctly against pnpm catalog
    versions, and keep catalogs in sync with what Expo actually wants — no more version drift across
    the workspace.
