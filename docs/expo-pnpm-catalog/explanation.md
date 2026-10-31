[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `expo-pnpm-catalog`:
[🚀 Tutorial](./tutorial.md) · [🛠️ How-to](./how-to.md) · [📖 Reference](./reference.md) · **💡
Explanation**

# 💡 Explanation: `expo-pnpm-catalog`

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
