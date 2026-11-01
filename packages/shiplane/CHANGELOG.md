# shiplane

## 0.8.1

### Patch Changes

- An over-the-air update published from GitHub Actions names its version.

## 0.8.0

### Minor Changes

- 74fd88d: - A mobile build forced by a version move now says which version the last finished build
  carries ("no binary carries this version yet: the last finished build is 0.3.1"), so builds that
  errored since no longer read as a missed update.
  - Pressing `m` while waiting for a release PR lists the merge methods the repository allows, named
    and ordered like GitHub's merge button, with the one the pull request page preselects offered
    first, plus "Not now".
  - Declining the ship to preview asks whether to ship to production instead (No preselected); a yes
    goes through production's typed name and its own checks.

## 0.7.0

### Minor Changes

- 8463f94: Once a release ships an app to preview or production, every pull request it holds, and
  every issue those pull requests relate to, gets a short comment naming the environment and the
  version, only once per version and environment. `release plan` lists the comments a ship would
  post.
- 14e8c60: `release.config.ts` composes a flow, modules and features instead of a list of plugins,
  and each app names its module instead of its vendor.
  - `flow: releaseFlow({ sourceControl, codeHost, ciPipeline, versioning })` replaces `git()`,
    `github()` and `changesets()`: `gitSourceControl()`, `gitHubCodeHost()`,
    `gitHubActionsCiPipeline()`, `changesetsVersioning()`.
  - `modules: [...]` lists what gets released, in release order, each given the adapter of the port
    it expects: `mobileApp({ mobileDistribution: easMobileDistribution() })`,
    `backendService({ serverHosting: flyServerHosting() })`,
    `webApp({ staticHosting: cloudflarePagesStaticHosting() })`, `internalTool()`. The first app is
    the Latest release, so `latest` is gone; an app reading another app's url comes after it.
  - `features: [releaseComments({ codeHost, sourceControl })]` run after the ship.
  - In each `release.unit.yml`, `target: <vendor>` becomes `module: <module>` (`module: web-app`);
    the rest of the file is unchanged.
  - `release plan` and `release doctor` print the numbered release order. `release plugin new` is
    now `release adapter new`, which writes an adapter, its contract test and its module.

  A config that still lists `plugins` or `latest`, or a unit file that still names a `target`, is
  refused with the keys that replace them.

## 0.6.1

### Patch Changes

- 6207985: Mobile builds and updates on GitHub Actions are named after the version they ship, like
  every other deploy: "Deploy expo@0.4.0 to preview" instead of "Deploy an expo build to preview".

## 0.6.0

### Minor Changes

- 3095ef4: The mobile app ships to preview from its tag on GitHub Actions, so a preview release goes
  out even after main moved on. Production still builds main, where its promotion moves its version.
  Editing an app's `release.unit.yml` no longer counts as code it ships.

### Patch Changes

- 2d706e9: An over-the-air update now reaches only phones whose installed app has the same native
  layer: the app checks it itself, whichever script published the update. Binaries built before this
  change take updates again from their next store build.
- 248b38e: Shipping the mobile app to preview no longer refuses when other apps released after it:
  only changes reaching the app or its packages since its tag count, as for production.

## 0.5.0

### Minor Changes

- 6f3364e: A push GitHub drops is tried again, and a release that still fails part way says why with
  the command's own output, then cancels what it did: its PRs, branches, changes and unpushed tags.
  Release pushes skip the pre-push checks, which took minutes on a change with no code.
- 17379c1: A production update held at a partial rollout is no longer reported as live:
  `status --json` shows its `rolloutPercentage`, and promoting again offers to send it to everyone.
- 016d058: Promoting the mobile app while its production update reaches part of the people now
  guides the rollout: it shows how far it went, how long it has been out and its launches and
  crashes, then asks how far it goes next (25%, 50%, everyone, stay or roll back) with a suggestion
  and why.
- 47e676d: Promotion shows how the mobile update did on preview (launches and crashes per platform,
  last 7 days) and asks before promoting one that crashed or that nobody launched yet. Plugins can
  report it through a new `health` hook.
- 96feef3: A release shows where it is: a bar for each stage, every read and step redrawn in place
  with its time, and Pr. Kipik beside it in the mood of the moment. `display: { verbose, mascot }`
  in release.config.ts sets both, `--no-verbose` and `--no-mascot` turn them off for one run.
- 6acbfd5: A release says which apps it takes along without being picked, and why: on preview, the
  package a picked app's change moves that they use; when promoting to production, the change they
  went to preview with, offered ticked so nothing reaches production untested together.

### Patch Changes

- 4923f4a: A Fly deploy shipped from this machine waits for Fly to roll it out before it is recorded
  in GitHub Deployments, so a failed rollout is never recorded as a success and never counts as on
  preview.
- d0e194e: Promoting the mobile app no longer refuses as soon as anything merges after its release:
  only changes that can reach the app count (its folder, the workspace packages it uses, the root's
  shared files). When the app's own code moved, the refusal names the files preview never ran.
- a390dfd: Release tags are signed whenever your commits are, so GitHub shows them Verified instead
  of Unverified. Where nothing signs commits, such as a CI runner with no key, tags stay annotated.

## 0.4.1

### Patch Changes

- a8e0be7: Shipping the mobile app over the air no longer stops on the last-update check, and an eas
  failure now reports its own error instead of the upgrade notice.

## 0.4.0

### Minor Changes

- 5f3d7e1: A ship asks GitHub Actions or this machine for each unit on its own, so one app can go
  through Actions while another ships from here. A unit only one way can ship is not asked and says
  why.

  A `release-only` target releases a unit nothing deploys: it is versioned, tagged and given release
  notes, and every environment counts it as shipped once tagged. The release CLI is now such a unit.

## 0.3.0

### Minor Changes

- dd6410d: An expo release asks build or update with the suggested one picked and why, so a build
  can be forced, and a build can start on GitHub Actions.
- 76ef502: Each app released together gets its own release PR, so each one squash merges on its own.

### Patch Changes

- 4702746: An expo release no longer versions, tags or ships the API: the app never read the version
  it announced.

## 0.2.2

### Patch Changes

- ce2e36a: `pnpm release` and `pnpm release:check` start at once: they build the CLI only when it
  was never built or its sources changed since the last build, and say so on one line when they do.
- 6c6c8aa: A release commit and its PR read like any other conventional commit:
  `chore(api): release v0.0.4` for one app, `chore(release): api v0.0.4 and admin v0.1.3` for
  several. Older release titles still count when tagging.
- cca13b0: A release PR holds one commit per app, `chore(api): release v0.0.4` then
  `chore(admin): release v0.1.3`, and merging it from the terminal rebases so each one lands on
  main.
- f4c08ab: On preview, "Release these to preview?", the tag question and "Ship … to preview through
  GitHub Actions?" start on Yes, so Enter goes ahead. Production still starts on No after its typed
  name.

## 0.2.1

### Patch Changes

- ef69742: `release plan` opens with the dispatch order and what each unit reads from another, such
  as `api → admin (reads api.url)`, so the flow is visible without opening the unit files.
- 4619b9d: `pnpm release` finishes a release a merged PR left untagged instead of saying nothing is
  new, and tags and ships the version its PR just merged rather than the one the run started with.
- 50d7554: The editor schema for `release.unit.yml` is generated in `node_modules/.cache/release`
  instead of `.release`, so the repository holds no generated release file.

## 0.2.0

### Minor Changes

- acc3bb7: A root `release.config.ts` composes plugins, and each app says how it ships in a
  `release.unit.yml` next to it. Mistakes come back with their file, line and the key that was
  meant, and `release plugins` lists what is composed and which apps use it.
- c9c9441: `release status` shows where every unit stands and what to run next, `release version`
  opens the release PR, `release tag` tags what it versioned, and `release` chains them, through
  `git`, `github` and `changesets` plugins that a config can swap. `pnpm release` behaves exactly as
  before.
- 13a768e: The mobile app ships through the `eas` plugin: the native fingerprint decides between a
  new binary and an over-the-air update, a native change gets its version and the API's announcement
  in the release PR, and `release promote` moves production's version or announces it by PR before
  it ships. `release status --json` gives each platform's verdict, the same as
  `release:check --json`.
- d7a6fc8: `release init` finds every workspace folder, guesses how each ships from what it holds
  (fly files, eas.json, a static site's build config), asks only what it cannot tell, shows every
  file before writing and then runs `release doctor`. Running it again offers new folders and keeps
  every edit. `release add`, `release remove`, `release plugin new` and `release docs` cover later
  changes, and unit files autocomplete in the editor.
- c455d1a: An `npm` plugin publishes a package's released version under `next` on preview, then
  moves `latest` to it on production without publishing twice. `publishAs` publishes under a name
  the registry accepts and puts the workspace name back after, even when the publish fails.
- 55ed0ed: A **Ship · preview** workflow runs `release ship --yes` on one runner, for a ship with no
  laptop at hand. Fly units can name build secrets: each one set in the environment reaches `flyctl`
  as a `--build-secret`, while plans only ever show its name, so the API uploads its Sentry
  sourcemaps from any machine that holds the token.
- 72f4b0c: `pnpm release` runs the release CLI; the old script is gone. `pnpm release:check` is
  `release status`, and its JSON carries the mobile verdict under the Expo unit's `live`, which the
  over-the-air workflow now reads. `release:build`, `release:update`, `release:submit` and
  `release:deploy` give way to `release ship <unit>`. The CLI has its own tutorial, how-to guides,
  reference and explanation.
- 11f4607: `release ship` triggers each tagged unit's deploy and returns without waiting: Fly with
  `flyctl deploy --detach`, Cloudflare Pages with wrangler, or each unit's workflow on GitHub
  Actions, asked every time with this month's Actions minutes shown. `release plan` prints every
  command without running any. The API, the admin and the landing page ship from a
  `release.unit.yml` each.

### Patch Changes

- c89b337: The release rules and their tests live in their own versioned app, `apps/release`, the
  start of the release CLI. `pnpm release` behaves exactly as before.
- c2c5aa4: The editor schema for `release.unit.yml` is no longer committed: every `release` command
  writes it again when the composed plugins changed, so it never goes stale and never shows up as a
  change.
