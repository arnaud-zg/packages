[🏠 Home](../../README.md) · [📚 Docs](../README.md) ·
[`shiplane`](../../packages/shiplane/README.md) · [🚀 Tutorial](./tutorial.md) ·
[🛠️ How-to](./how-to.md) · **📖 Reference** · [🔌 Plugins](./plugins.md) ·
[💡 Explanation](./explanation.md)

# 📖 Reference

[Commands](#commands) · [Flags](#flags) · [Exit codes](#exit-codes) ·
[`shiplane.config.ts`](#shiplaneconfigts) · [`shiplane.unit.yml`](#shiplaneunityml) ·
[Modules](#modules) · [Safety](#safety) · [`status --json`](#status---json)

## Commands

| Command                       | Does                                                                 |
| ----------------------------- | -------------------------------------------------------------------- |
| `shiplane`                    | The next step to preview: release PR, merge, tags, ship              |
| `shiplane promote`            | Production, from what preview runs                                   |
| `shiplane status`             | Where every unit stands, and what to run next. Reads only            |
| `shiplane plan`               | Every command a ship would run, run nothing                          |
| `shiplane version`            | Open the release PR for what is pending                              |
| `shiplane tag`                | Tag merged versions, publish their notes                             |
| `shiplane ship [unit...]`     | Trigger each tagged unit's deploy, then return                       |
| `shiplane init`               | Find what ships, write the config and unit files, run doctor         |
| `shiplane add <folder>`       | `init`'s questions for one folder                                    |
| `shiplane remove <unit>`      | Stop shipping a unit; it stays versioned                             |
| `shiplane doctor`             | Check the config, tools and sign-ins, offer each fix                 |
| `shiplane plugins`            | The flow, the modules in release order with their apps, the features |
| `shiplane docs <name>`        | Every key a module's or an adapter's unit files take                 |
| `shiplane adapter new <name>` | Scaffold a server hosting adapter, its contract test, its module     |

Source: `src/cli/main.ts`. Here, `pnpm shiplane` builds the CLI first when its sources changed.

## Flags

| Flag                            | Means                                                           |
| ------------------------------- | --------------------------------------------------------------- |
| `--channel preview\|production` | The environment worked on (preview by default)                  |
| `--via github\|local`           | Ship through GitHub Actions or this machine, without asking     |
| `--yes`, `-y`                   | Yes to every question. Refused on production                    |
| `--json`                        | `status` and `plugins` print JSON                               |
| `--blank`                       | `init` writes commented templates, not guesses                  |
| `--verbose`, `--mascot`         | On by default; `--no-` turns off. Defaults: `display` in config |

## Exit codes

| Code | Means                                                  |
| ---- | ------------------------------------------------------ |
| `0`  | Done, or nothing to do                                 |
| `1`  | A step failed or was refused; what to run next is said |
| `2`  | The config has problems, each with its file and line   |

## `shiplane.config.ts`

```ts
import { changesetsVersioning } from "@shiplane/changesets";
import { cloudflarePagesStaticHosting } from "@shiplane/cloudflare-pages";
import { flyServerHosting } from "@shiplane/fly";
import { gitSourceControl } from "@shiplane/git";
import { gitHubActionsCiPipeline, gitHubCodeHost } from "@shiplane/github";
import { backendService, defineRelease, releaseFlow, webApp } from "shiplane";

export default defineRelease({
  flow: releaseFlow({
    sourceControl: gitSourceControl(),
    codeHost: gitHubCodeHost(),
    ciPipeline: gitHubActionsCiPipeline(),
    versioning: changesetsVersioning(),
  }),
  modules: [
    backendService({ serverHosting: flyServerHosting() }),
    webApp({ staticHosting: cloudflarePagesStaticHosting() }),
  ],
});
```

| Key                       | Means                                                                           |
| ------------------------- | ------------------------------------------------------------------------------- |
| `flow`                    | **Required.** One adapter per port: source control, code host, CI, versioning   |
| `modules`                 | What ships, in release order. The first app is the GitHub Latest release        |
| `features`                | What runs after a ship, in order, such as `releaseComments()`                   |
| `units`                   | Folders to look in. Default: the pnpm workspace, then `package.json` workspaces |
| `tag`                     | Tag format. Default `{name}@{version}`; or `v{version}`, `{name}--v{version}`   |
| `commitsWithoutChangeset` | `"ignore"` (default): only changesets release. `"release"`: commits do too      |
| `display`                 | `{ verbose, mascot }` defaults for the flags                                    |

Source: `src/application/config/defineRelease.ts`. A `release.config.ts` still loads, with a line
saying to rename it.

**Release order:** by module in `modules` order, then by name. An app reading another's value
(`${units.api.url}`) must come after it, or loading fails and names the module to move.

## `shiplane.unit.yml`

One per app, next to its `package.json`, which gives its name and version.

```yaml
module: backend-service # a module of shiplane.config.ts
app: # every other key belongs to that module's plugin
  preview: acme-api-preview
  production: acme-api
url: ${units.other.url} # another unit's value, same environment
```

- A map keyed by `preview` and `production` is a value per environment.
- An unknown key or module is refused, with its line and the closest match.
- `shiplane docs <module>` lists every key and its default. Keys per plugin:
  [Plugins](./plugins.md).
- A `release.unit.yml` still loads, with a line saying to rename it.

## Modules

| Module                                  | `module:`           | Takes a plugin for   |
| --------------------------------------- | ------------------- | -------------------- |
| `backendService({ serverHosting })`     | `backend-service`   | Server hosting       |
| `webApp({ staticHosting })`             | `web-app`           | Static hosting       |
| `mobileApp({ mobileDistribution })`     | `mobile-app`        | Mobile distribution  |
| `publishedPackage({ packageRegistry })` | `published-package` | A package registry   |
| `internalTool()`                        | `internal-tool`     | Nothing: tagged only |

Each takes an optional `name`, for two modules of one kind:
`backendService({ name: "workers", ... })` then `module: workers`. Source: `src/modules/`.

## Safety

- **Sign-ins first.** `shiplane` checks the picked units' tools before writing anything, and offers
  each fix.
- **Undo on failure.** A failed step undoes what ran, newest first: PRs closed, branches deleted,
  tags removed, back on `main`. A tag already pushed stays on origin, said with `shiplane tag` to
  finish its notes. What it cannot undo is printed as commands.
- **Retries.** A dropped push or pull is tried twice more, after 2s then 10s.
- **Production asks.** You type `production` to start, and `--yes` is refused there.

Source: `src/application/steps.ts`, `src/application/requirements.ts`, `src/application/ship.ts`.

## `status --json`

From `pnpm -s shiplane:check --json` in this repository, trimmed to one unit:

```json
{
  "environment": "preview",
  "units": [
    {
      "unit": "api",
      "target": "fly",
      "version": "0.0.12",
      "tag": "api@0.0.12",
      "tagged": true,
      "changesets": 3,
      "commits": 0,
      "pending": true,
      "hint": "3 changesets"
    }
  ],
  "next": { "step": "release-pr" }
}
```

`next.step` is `release-pr`, `wait-merge` or `ship`. A unit whose plugin reads its platform (EAS)
adds `live`. Source: `src/application/readStatus.ts`.

## Example

[`examples/render-server-hosting.ts`](../../packages/shiplane/examples/render-server-hosting.ts)
defines a server hosting plugin with settings, requirements and jobs;
`packages/shiplane-integration/src/__tests__/writeAPlugin.test.ts` runs it against the contract.
