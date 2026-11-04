# 🔌 @shiplane/changesets

Versions from `.changeset` files, through the changesets CLI: fills
[shiplane](../shiplane/README.md)'s **versioning** port. A changeset is the intent to release;
shiplane turns the pending ones into versions and changelogs on the release PR.

```mermaid
flowchart LR
    CS[".changeset/*.md"] --> AD["changesetsVersioning()"]
    AD --> STATUS["changeset status: what moves"]
    AD --> VERSION["changeset version: on the release PR"]
    VERSION --> OUT["versions and CHANGELOG.md"]
```

## Install

```sh
pnpm add -D shiplane @shiplane/changesets @changesets/cli
```

## Configure

Give the adapter to `releaseFlow`. From
[`examples/shiplane.config.ts`](./examples/shiplane.config.ts):

```ts
import { changesetsVersioning } from "@shiplane/changesets";
import { gitSourceControl } from "@shiplane/git";
import { gitHubActionsCiPipeline, gitHubCodeHost } from "@shiplane/github";
import { defineRelease, internalTool, releaseFlow } from "shiplane";

export default defineRelease({
  flow: releaseFlow({
    sourceControl: gitSourceControl(),
    codeHost: gitHubCodeHost(),
    ciPipeline: gitHubActionsCiPipeline(),
    // The root script versions, then refreshes the lockfile.
    versioning: changesetsVersioning({ version: ["pnpm", "-s", "changeset:version"] }),
  }),
  modules: [internalTool()],
});
```

## Options

It fills a flow port, so unit files take no key from it. Its factory takes:

| Option    | Default                                    | Means                                 |
| --------- | ------------------------------------------ | ------------------------------------- |
| `version` | `["pnpm", "exec", "changeset", "version"]` | The command that versions the release |

Source: `ChangesetsOptions` in `src/changesets-versioning.adapter.ts`.

## Release from commits

`commitsVersioning()` takes the same options and needs no changeset written: the commits since each
package's version become the release's changesets, and the changesets CLI does the rest. `feat` is a
minor, a subject marked `!` a major (a minor below 1.0), and anything else a patch.
[How-to](../../docs/shiplane/how-to.md#release-from-commits). Source:
`src/commits-versioning.adapter.ts`.

## Force another version

When a person [picks another version](../../docs/shiplane/how-to.md#force-another-version), shiplane
adds a changeset at that level and hands both adapters a `ceiling`: no line ships above it. A plan
puts the files back when it ends; a release consumes them on its branch, and puts them back if
`changeset version` fails.

## Example

[`examples/`](./examples) holds one pending changeset,
[`.changeset/quiet-seeds-wait.md`](./examples/.changeset/quiet-seeds-wait.md):

```md
---
"@acme/scripts": patch
---

The seed script skips rows it already wrote.
```

`pnpm shiplane status` in that repository counts it:

```text
  Release status  ·  live

  Unit      Version     Target            Where it stands
  scripts   1.0.0       release-only      ↑ 1 changeset

→ Next: open the release PR: shiplane
```

What moves is read with `changeset status`, which writes nothing. Changesets held back for a later
release are set aside only while it versions. A GitHub changelog asks GitHub who wrote each change:
`GITHUB_TOKEN` when set, your `gh` sign-in otherwise.

## Tools and sign-ins

| Tool                               | Needed for                                       |
| ---------------------------------- | ------------------------------------------------ |
| `@changesets/cli` in the workspace | `changeset status` and `changeset version`       |
| `gh`, signed in                    | A GitHub changelog, when `GITHUB_TOKEN` is unset |

The adapter declares no `requirements`, so `doctor` checks neither. Source:
`src/changesets-versioning.adapter.ts`.
