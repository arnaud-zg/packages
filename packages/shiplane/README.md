# 🚢 shiplane

Release a monorepo with several apps and hosts from one command: it finds what changed, versions it,
tags it and ships each app in order. It talks to no host itself. You inject one adapter per port in
`shiplane.config.ts`.

```mermaid
flowchart LR
    ADP["Adapters: a plugin or your own"] --> CFG["shiplane.config.ts"]
    CFG --> FLOW["releaseFlow: source control, code host, CI, versioning"]
    CFG --> MODS["Modules: server, static, mobile, package"]
    FLOW --> CORE["shiplane core: changes, versions, tags, order, undo"]
    MODS --> CORE
```

## ⚡ Three commands

```sh
pnpm shiplane init       # find what ships, write the config
pnpm shiplane            # release PR, merge, tags, ship to preview
pnpm shiplane promote    # what preview validated, to production
```

## 🔌 Ports

The core only knows these interfaces. Each one is filled by the adapter you give it.

| Port                | What it does                                   | Filled by                        |
| ------------------- | ---------------------------------------------- | -------------------------------- |
| Source control      | The history: tags, commits, branches, push     | `releaseFlow({ sourceControl })` |
| Code host           | Pull requests, release notes, deploy records   | `releaseFlow({ codeHost })`      |
| CI pipeline         | Dispatches the ship workflow, reads its runs   | `releaseFlow({ ciPipeline })`    |
| Versioning          | Pending changes, the next versions, changelogs | `releaseFlow({ versioning })`    |
| Server hosting      | Runs a service from a tag                      | `backendService(...)`            |
| Static hosting      | Serves a static build per environment          | `webApp(...)`                    |
| Mobile distribution | Ships a store build or an over-the-air update  | `mobileApp(...)`                 |
| Package registry    | Publishes a package, moves its dist-tag        | `publishedPackage(...)`          |

Source: `src/ports/*.port.ts`.

## 🧩 Modules

A module is a kind of app. Each app's `shiplane.unit.yml` names its module.

| Module                                  | `module:`           | Takes                                          |
| --------------------------------------- | ------------------- | ---------------------------------------------- |
| `backendService({ serverHosting })`     | `backend-service`   | Server hosting                                 |
| `webApp({ staticHosting })`             | `web-app`           | Static hosting                                 |
| `mobileApp({ mobileDistribution })`     | `mobile-app`        | Mobile distribution                            |
| `publishedPackage({ packageRegistry })` | `published-package` | Package registry                               |
| `agentPlugin()`                         | `agent-plugin`      | Nothing: tagged, its agent manifests versioned |
| `internalTool()`                        | `internal-tool`     | Nothing: tagged only                           |

Source: `src/modules/`.

## 💉 Inject the adapters

From [`examples/repository/shiplane.config.ts`](./examples/repository/shiplane.config.ts):

```ts
// Each port gets an adapter; a module per kind of app takes the adapter that ships it.
import { commitsVersioning } from "@shiplane/changesets";
import { cloudflarePagesStaticHosting } from "@shiplane/cloudflare-pages";
import { easMobileDistribution } from "@shiplane/eas";
import { flyServerHosting } from "@shiplane/fly";
import { gitSourceControl } from "@shiplane/git";
import { gitHubActionsCiPipeline, gitHubCodeHost } from "@shiplane/github";
import { npmPackageRegistry } from "@shiplane/npm";
import {
  backendService,
  defineRelease,
  internalTool,
  mobileApp,
  publishedPackage,
  releaseFlow,
  webApp,
} from "shiplane";

export default defineRelease({
  flow: releaseFlow({
    sourceControl: gitSourceControl(),
    codeHost: gitHubCodeHost(),
    ciPipeline: gitHubActionsCiPipeline(),
    versioning: commitsVersioning(),
  }),
  modules: [
    backendService({ serverHosting: flyServerHosting() }),
    webApp({ staticHosting: cloudflarePagesStaticHosting() }),
    mobileApp({ mobileDistribution: easMobileDistribution() }),
    publishedPackage({ packageRegistry: npmPackageRegistry() }),
    internalTool(),
  ],
});
```

Swap any piece:

| Want                                                    | Use                                                                                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| To write the changelog yourself                         | [`changesetsVersioning()`](https://github.com/arnaud-zg/packages/blob/main/docs/shiplane/how-to.md#choose-how-versions-are-bumped) |
| Any host with a deploy command                          | [`shellServerHosting()`](https://github.com/arnaud-zg/packages/blob/main/docs/shiplane/plugins.md#built-in-shellserverhosting)     |
| To release Claude Code, Codex, Cursor or Gemini plugins | [`agentPlugin()`](https://github.com/arnaud-zg/packages/blob/main/docs/shiplane/how-to.md#release-claude-code-plugins)             |
| To comment on each PR when it ships                     | [`releaseComments()`](https://github.com/arnaud-zg/packages/blob/main/docs/shiplane/how-to.md#comment-on-what-shipped)             |
| Your own host                                           | [Write a plugin](https://github.com/arnaud-zg/packages/blob/main/docs/shiplane/how-to.md#write-a-plugin)                           |
| To ship from this machine, not Actions                  | [`--via local`](https://github.com/arnaud-zg/packages/blob/main/docs/shiplane/how-to.md#choose-github-actions-or-this-machine)     |
| A quieter terminal                                      | [`display: { mascot: false }`](https://github.com/arnaud-zg/packages/blob/main/docs/shiplane/how-to.md#turn-the-mascot-off)        |

`pnpm shiplane plugins` in that repository shows what got injected where:

```text
Flow in shiplane.config.ts

  sourceControl      git
  codeHost           github
  ciPipeline         github-actions
  versioning         commits

Modules, in release order

  backend-service    fly  app, config, dockerfile, url, buildSecrets
                     used by api
  web-app            cloudflare-pages  project, dist, build, branch, wrangler
                     used by site
  mobile-app         eas  versionFile, update
                     used by mobile
  published-package  npm  publishAs, access, tag
                     used by toolkit
  internal-tool      release-only  no options
                     used by cli

Features, after the ship

  none
```

The adapters come from separate packages:
**[the adapters you can inject](https://github.com/arnaud-zg/packages/blob/main/docs/shiplane/plugins.md)**.

## 📚 Docs

- 🚀 **[Tutorial](https://github.com/arnaud-zg/packages/blob/main/docs/shiplane/tutorial.md)**:
  release your first package
- 🛠️ **[How-to](https://github.com/arnaud-zg/packages/blob/main/docs/shiplane/how-to.md)**: add an
  app, promote, ship from CI, write a plugin
- 📖 **[Reference](https://github.com/arnaud-zg/packages/blob/main/docs/shiplane/reference.md)**:
  commands, flags, the config and unit files
- 🔌 **[Plugins](https://github.com/arnaud-zg/packages/blob/main/docs/shiplane/plugins.md)**: the
  adapters you can inject, and how to write one
- 💡
  **[Explanation](https://github.com/arnaud-zg/packages/blob/main/docs/shiplane/explanation.md)**:
  why it works this way

## 📈 Downloads

<a href="https://npm-stat.com/charts.html?package=shiplane">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/chart/npm/shiplane.svg?days=90&logo=false&mode=dark" />
    <img alt="shiplane npm downloads per week, last 90 days" src="https://shieldcn.dev/chart/npm/shiplane.svg?days=90&logo=false&mode=light" />
  </picture>
</a>
