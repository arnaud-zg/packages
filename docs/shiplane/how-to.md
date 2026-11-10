[🏠 Home](../../README.md) · [📚 Docs](../README.md) ·
[`shiplane`](../../packages/shiplane/README.md) · [🚀 Tutorial](./tutorial.md) · **🛠️ How-to** ·
[📖 Reference](./reference.md) · [🔌 Plugins](./plugins.md) · [💡 Explanation](./explanation.md)

# 🛠️ How-to

**Apps:** [Add an app](#add-an-app) · [Stop shipping an app](#stop-shipping-an-app) ·
[Set a value per environment](#set-a-value-per-environment) ·
[Read another app's value](#read-another-apps-value) ·
[Check env before deploy](#check-env-before-deploy) · [Hold an app back](#hold-an-app-back)

**Release:** [Force another version](#force-another-version) ·
[Preview every command](#preview-every-command) · [Promote to production](#promote-to-production) ·
[Widen a production rollout](#widen-a-production-rollout) ·
[Choose GitHub Actions or this machine](#choose-github-actions-or-this-machine) ·
[Ship with no laptop](#ship-with-no-laptop) · [Use it from a script](#use-it-from-a-script)

**Hosts:** [Publish a package to npm](#publish-a-package-to-npm) ·
[Release Claude Code plugins](#release-claude-code-plugins) ·
[Choose how versions are bumped](#choose-how-versions-are-bumped) ·
[Release from commits](#release-from-commits) ·
[Ship a host with no plugin](#ship-a-host-with-no-plugin) · [Swap a provider](#swap-a-provider) ·
[Write a plugin](#write-a-plugin) · [Comment on what shipped](#comment-on-what-shipped) ·
[Set up the sign-ins](#set-up-the-sign-ins)

**Terminal:** [Bring your own mascot](#bring-your-own-mascot) ·
[Turn the mascot off](#turn-the-mascot-off)

## Add an app

```sh
pnpm shiplane add apps/docs
```

Or write `apps/docs/shiplane.unit.yml` yourself; `shiplane docs web-app` lists its keys:

```yaml
module: web-app
project: acme-docs
```

## Stop shipping an app

```sh
pnpm shiplane remove docs
```

Its unit file goes. Changesets still version it.

## Set a value per environment

```yaml
app:
  preview: acme-api-preview
  production: acme-api
```

## Read another app's value

```yaml
build:
  env:
    VITE_API_URL: ${units.api.url}
```

The app read must ship first: list its module before the reader's in `modules`.

## Check env before deploy

List the env var names an app reads. Before each deploy, shiplane checks they are set on the
platform. You set the values; shiplane only reads names, never values.

```yaml
# apps/api/shiplane.unit.yml
checkEnvBeforeDeploy:
  - SENTRY_DSN
  - DATABASE_URL
```

Names that differ per environment: `all` holds the shared ones, and an environment adds its own. A
new environment inherits `all`.

```yaml
checkEnvBeforeDeploy:
  all:
    - SENTRY_DSN
  production:
    - REVENUECAT_PROJECT_ID
```

| When a name is unset               | What happens                                             |
| ---------------------------------- | -------------------------------------------------------- |
| In a terminal                      | It prints the command to set it, waits, then reads again |
| In CI, with `--yes` or no terminal | Nothing runs; it prints the command and exits 1          |
| The plugin cannot list names       | A warning, and the deploy goes on                        |

Fly reads its secrets and the fly.toml `[env]` keys, EAS its environment's variables, and Cloudflare
Pages its secrets plus the unit's `build.env`. `shiplane doctor` shows the same check for every
environment. `release`, `promote` and `ship` check before anything deploys; a release to preview
checks before it opens the release PR.

## Hold an app back

Untick it when `pnpm shiplane` asks what to release. Its changesets wait for the next release.

## Force another version

When everything a release moves lands on one version, `pnpm shiplane` asks for it, with the computed
version selected:

```text
◆  Release these to preview as (Esc cancels)
│  ○ 1.0.0  major
│  ● 0.5.0  minor, computed
│  ○ 0.4.1  patch
```

Enter releases the computed version. Pick another and it asks why, in one line:

```text
◆  Why 1.0.0? Tell users what changed, in one line.
│  Drops subjectsSince from SourceControlPort
```

Esc or an empty line goes back to the versions. The line reaches the changelog, the release PR and
the release notes, as
`Version forced to 1.0.0 instead of 0.5.0: Drops subjectsSince from SourceControlPort`. Everything
the release moves takes the forced version, a whole fixed group included, and a changeset's own bump
gives way when you go lower.

- **Units moving to different versions** get a plain yes: untick the others to force one.
- **`--yes` and a run without a terminal** keep the computed version.
- **An open release PR** has its version already: close it and run `pnpm shiplane` to change it.
- **A release PR replaced because main moved** starts again from the computed version, so force it
  again. `--yes` will not ask.
- **Versioning that cannot land there**, a peer dependency pulling a unit further, stops with
  `Can't force` and writes nothing.

## Preview every command

```sh
pnpm shiplane plan --channel production
```

Nothing runs. It prints the release order, then each command, both ways.

## Promote to production

```sh
pnpm shiplane promote
```

Type `production` when asked. Web apps redeploy the tag preview runs; the mobile app may first open
a PR moving its production version, then build after you merge it.

## Widen a production rollout

Run `pnpm shiplane promote` again and pick the mobile app. It shows the rollout, its launches and
crashes, and suggests the next step: 25%, 50%, everyone, stay, or roll back.

## Choose GitHub Actions or this machine

```sh
pnpm shiplane ship --via github     # or --via local
```

Without `--via`, it asks per app and shows this month's Actions minutes. An app only one way can
ship is not asked, and it says why.

## Ship with no laptop

Run the **Ship** workflow from the Actions tab, on a tag or `main`, with the units and the
environment. Production runs as soon as you start it.

## Use it from a script

```sh
pnpm -s shiplane status --json
```

Without a terminal every question answers no: pass `--yes` (refused on production) and `--via`.

## Publish a package to npm

```yaml
# packages/my-tool/shiplane.unit.yml
module: published-package
```

Needs `publishedPackage({ packageRegistry: npmPackageRegistry() })` in `modules`. A release
publishes under `latest`; to stage under `next` first, add
`tag: { preview: next, production: latest }`. A new package needs no changeset for its first
version: merge it, then run `pnpm shiplane`.

## Release Claude Code plugins

```ts
export default defineRelease({
  units: ["plugins/*"],
  tag: "plugin",
  flow: releaseFlow({
    sourceControl: gitSourceControl(),
    codeHost: gitHubCodeHost(),
    ciPipeline: gitHubActionsCiPipeline(),
    versioning: changesetsVersioning(),
  }),
  modules: [agentPlugin()],
});
```

```yaml
# plugins/reviewer/shiplane.unit.yml, next to a private package.json changesets versions
module: agent-plugin
```

The release PR writes each plugin's new version into every agent manifest it has
(`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`,
`gemini-extension.json`), one line each. After the merge, `reviewer--v0.8.0` is tagged with its
changelog as notes. Nothing deploys a plugin: agents install it from the repository, so the merge
ships it, and a run names no environment: it asks to release it live, as for a package on npm. A
manifest with no `version` is left alone.

Queue each release with `pnpm changeset`, as for any unit, or
[release from commits](#release-from-commits).

## Choose how versions are bumped

**Write the changelog yourself?** Use `changesetsVersioning()`. **Let PR titles be the changelog?**
Use `commitsVersioning()`.

Both run on [changesets](https://github.com/changesets/changesets) under the hood: commits mode only
writes the changesets for you, from the PR titles. Both bump the same way:

| PR title         | Bump                             |
| ---------------- | -------------------------------- |
| `feat`           | minor                            |
| `fix`, `perf`, … | patch                            |
| `!` (breaking)   | minor below `1.0.0`, major after |

With `changesetsVersioning()`, add one in the feature PR, bump taken from that table:

```sh
pnpm changeset --minor shiplane -m "What users can now do."
```

Changesets never picks the bump: it releases what the file says, so a `feat` written as `--patch`
ships as a patch. Before merging, `pnpm changeset status --verbose` lists the version each package
gets.

With `commitsVersioning()`, there's nothing to write: the PR title sets the bump, see
[Release from commits](#release-from-commits).

## Release from commits

`shiplane setup` offers this when the repository has no `.changeset/config.json`, and `--yes` takes
it: setup writes that file and adds `@changesets/cli`, and you run the install. A repository already
on changesets is not asked. To move one, swap the versioning adapter and no one writes a changeset:

```ts
import { commitsVersioning } from "@shiplane/changesets";

export default defineRelease({
  flow: releaseFlow({
    sourceControl: gitSourceControl(),
    codeHost: gitHubCodeHost(),
    ciPipeline: gitHubActionsCiPipeline(),
    versioning: commitsVersioning(),
  }),
  modules: [agentPlugin()],
});
```

Each package's commits since its version become its release, read as Conventional Commits:

| Subject               | Bump                   | Changelog                                     |
| --------------------- | ---------------------- | --------------------------------------------- |
| `feat: ...`           | minor                  | One line                                      |
| `fix:` or `perf: ...` | patch                  | One line                                      |
| `refactor!: ...`      | major, minor below 1.0 | One line, for any type marked `!`             |
| Anything else         | patch                  | Only the latest, when nothing else has a line |

Any commit touching a package releases it, so a change committed as `chore:` still ships. Only the
subject counts: a `BREAKING CHANGE:` footer is not read. A pending changeset naming a package takes
over from its commits. `.changeset/config.json` and `@changesets/cli` stay, as changesets still does
the versioning, and shiplane's own messages keep saying `changesets`.

## Ship a host with no plugin

```ts
modules: [backendService({ name: "custom", serverHosting: shellServerHosting() })],
```

```yaml
module: custom
deploy:
  preview: [npx, my-host, deploy, --env, preview]
  production: [npx, my-host, deploy, --env, production]
```

## Swap a provider

One argument changes; the apps keep their module and take the new provider's keys:

```ts
modules: [webApp({ staticHosting: netlifyStaticHosting() })],
```

## Write a plugin

```sh
pnpm shiplane adapter new render
```

It writes `release/adapters/render.ts`, its contract test, and its module in the config. To share
it, publish it as a package and name its adapters in its `package.json`, so `init` offers them:

```json
"shiplane": { "adapters": ["renderServerHosting"] }
```

The API is in [Plugins](./plugins.md#write-a-plugin); `@shiplane/fly` is a small example.

## Comment on what shipped

```ts
features: [releaseComments({ codeHost, sourceControl })],
```

Each PR in a shipped version, and each issue it relates to, gets one comment with the version and
the environment.

## Set up the sign-ins

| Plugin                    | On this machine                  | In CI                                |
| ------------------------- | -------------------------------- | ------------------------------------ |
| shiplane-github           | `gh auth login`                  | `GH_TOKEN`                           |
| shiplane-npm              | `npm login`                      | none: it publishes from this machine |
| shiplane-fly              | `flyctl auth login`              | `FLY_API_TOKEN`                      |
| shiplane-cloudflare-pages | `npx wrangler login`             | `CLOUDFLARE_API_TOKEN`               |
| shiplane-eas              | `pnpm exec eas login` in the app | `EXPO_TOKEN`                         |

`pnpm shiplane doctor` checks each one and offers its fix; `pnpm shiplane` checks them before it
writes anything.

## Bring your own mascot

A built-in mascot sits beside the live line by default. Give `display.mascot` frames for the moods
you want; any mood you leave out uses the built-in frames:

```ts
// shiplane.config.ts
export default defineRelease({
  display: {
    mascot: {
      working: ["(=^･ω･^=)/", "(=^･ω･^=)-"], // looped while something runs
      happy: ["(=^▽^=) ✦"],
      worried: ["(=;ω;=)"],
    },
  },
  // flow, modules…
});
```

To react to more than the mood, give a function. It gets the mood, the animation tick and what runs
right now:

```ts
import type { Mascot } from "shiplane";

const rocket: Mascot = ({ mood, tick, label }) =>
  mood === "worried" ? "💥" : label.includes("production") ? "🚀✨" : ["🛰", "🛸"][tick % 2];

export default defineRelease({ display: { mascot: rocket } /* flow, modules… */ });
```

Shiplane pads every frame to one width so lines stay aligned, colours it (green when happy, red when
worried), and holds it still in CI or under `NO_MOTION=1`. To share one, export it from a package
(`shiplane-mascot-<name>`) and import it in the config. The moods are in the
[reference](./reference.md#mascot).

## Turn the mascot off

For one run: `pnpm shiplane --no-mascot`. For good: `display: { mascot: false }` in
`shiplane.config.ts`. `--mascot` brings it back for one run, your own if the config has one.

## Example

[`examples/repository/shiplane.config.ts`](../../packages/shiplane/examples/repository/shiplane.config.ts)
wires one adapter per port and ships an API on Fly and a site on Cloudflare Pages;
`packages/shiplane-integration/src/__tests__/examples.e2e.test.ts` runs it.
