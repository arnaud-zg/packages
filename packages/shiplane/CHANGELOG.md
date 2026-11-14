# shiplane

## 0.5.1

### Patch Changes

- [#61](https://github.com/arnaud-zg/packages/pull/61) [`0afa067`](https://github.com/arnaud-zg/packages/commit/0afa067ce4d46dad2c9abf6690119367c83f2374) - README: same layout as every package, links to each guide page.

🙏 Thanks to [@arnaud-zg](https://github.com/arnaud-zg) for this release!

## 0.5.0

### Patch Changes

- [#59](https://github.com/arnaud-zg/packages/pull/59) [`956673f`](https://github.com/arnaud-zg/packages/commit/956673f131cda3b7e1b25fe01c0dfb9124657147) - Update runtime dependencies to their latest stable versions.

- [#56](https://github.com/arnaud-zg/packages/pull/56) [`8517d57`](https://github.com/arnaud-zg/packages/commit/8517d57bf1ff7ed13561d9686529a4718cf581da) - Clearer npm description and keywords, so the package shows up in npm and web search.

- [#59](https://github.com/arnaud-zg/packages/pull/59) [`956673f`](https://github.com/arnaud-zg/packages/commit/956673f131cda3b7e1b25fe01c0dfb9124657147) - A pull request that has to merge first, such as moving production's version, now stops when it's
  closed without a merge, and leaves it for later when it waits for approval, instead of shipping as
  if it had merged.

🙏 Thanks to [@arnaud-zg](https://github.com/arnaud-zg) for this release!

## 0.4.2

### Patch Changes

- [#51](https://github.com/arnaud-zg/packages/pull/51) [`4fd368d`](https://github.com/arnaud-zg/packages/commit/4fd368d0314695a5bcfd77eaa81f599451b178a9) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - A unit file can list `checkEnvBeforeDeploy`: the env var names its app reads. Before each deploy,
  shiplane checks they are set on the platform, and waits for a person to set any that are missing, or
  stops in CI. `shiplane doctor` shows the same check. Plugins opt in with an optional `env`, so
  existing plugins and unit files work unchanged.

## 0.4.1

### Patch Changes

- [#41](https://github.com/arnaud-zg/packages/pull/41) [`ad23280`](https://github.com/arnaud-zg/packages/commit/ad23280c143888d4398a020751e69910b9dfc568) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - Only changesets release now: `commitsWithoutChangeset` is removed, so queue each release with
  `pnpm changeset`. A config that still sets it loads as before and the key does nothing.
  `status --json` drops the `commits` field, and `SourceControlPort` drops `subjectsSince`.
  
  An agent plugin or internal tool has no environment, like a package on npm, so a run stops offering
  preview: it asks `Release these live?`, and the scope question, the release PR, `status` and the
  "Nothing to ship" lines say `live` too. So do a package's hints, which said `on preview`.

- [#42](https://github.com/arnaud-zg/packages/pull/42) [`f8dd4e8`](https://github.com/arnaud-zg/packages/commit/f8dd4e8edaec8cd9b75da7f3cb5f969263e98fe9) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - Release with no changeset to write: `commitsVersioning()` turns the Conventional Commits since each
  package's version into the release's changesets. `feat` is a minor, a subject marked `!` a major (a
  minor below 1.0), and anything else a patch, so a change committed as `chore:` still ships. A
  pending changeset still takes over for the package it names.
  
  `VersioningPort` gains a required `nextChange`: what a person does to queue a release, so shiplane
  stops telling a repository on commits to run `pnpm changeset`.

- [#46](https://github.com/arnaud-zg/packages/pull/46) [`7ec8604`](https://github.com/arnaud-zg/packages/commit/7ec8604fa0aeafa226dc4e85f2e5ff6c79e35ea5) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - Pick the version a release ships. When everything it moves lands on one version, `shiplane` asks
  `Release these to preview as`, with the computed version selected: Enter releases it, Esc cancels,
  and any other version asks why in one line. That line reaches the changelog, the release PR and the
  release notes, as `Version forced to 1.0.0 instead of 0.5.0: …`. Units moving to different versions
  keep the plain yes, and `--yes` keeps the computed version.
  
  `VersioningPort`'s `plan` and `apply` take an optional `ceiling`, the level nothing moves past. An
  adapter that ignores it stops the run with `Can't force`, rather than shipping another version.

- Version forced to 0.4.1 instead of 0.5.0: Adds setup versioning and a version picker to the same release flow

- [#43](https://github.com/arnaud-zg/packages/pull/43) [`8315f35`](https://github.com/arnaud-zg/packages/commit/8315f3531b272c5d97f8429b6b9e39911489fa93) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - `shiplane setup` now sets up versioning. With no `.changeset/config.json` it asks how you want to
  release, commits or changesets, with commits as the default and under `--yes`. It writes that file
  with private packages versioned and adds `@changesets/cli`, then says to run the install. A
  repository already on changesets sees no new question.

## 0.4.0

### Minor Changes

- [#38](https://github.com/arnaud-zg/packages/pull/38) [`503ca62`](https://github.com/arnaud-zg/packages/commit/503ca62b69995ca00ab033aa8530c79dac68450b) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - Release Claude Code, Codex, Cursor and Gemini CLI plugins with no script of your own:
  `agentPlugin()` writes each plugin's new version into every agent manifest it has, in the release
  PR, then tags it.

### Patch Changes

- [#37](https://github.com/arnaud-zg/packages/pull/37) [`0c3b562`](https://github.com/arnaud-zg/packages/commit/0c3b56299fa348ee7912c6438593432ae2b77a73) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - `ship` no longer says a published package is checked "on preview": its check names the registry
  instead ("Checking what shiplane@0.3.0 needs on npm").

## 0.3.0

### Minor Changes

- [#34](https://github.com/arnaud-zg/packages/pull/34) [`05c2051`](https://github.com/arnaud-zg/packages/commit/05c2051489560eeae03cbd70b00d962ee7048a25) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - `tag` takes a format's name: `"package"` (`{name}@{version}`, still the default), `"plugin"`
  (`{name}--v{version}`, the tag Claude Code resolves plugin versions from, which Gemini CLI and Codex
  install from too), `"single"` (`v{version}`) or `"module"` (`{name}/v{version}`, as Go tags a module
  in a folder). A format without `{name}` used for more than one unit is now a config problem, since
  their tags would collide.

### Patch Changes

- [#33](https://github.com/arnaud-zg/packages/pull/33) [`e8ca313`](https://github.com/arnaud-zg/packages/commit/e8ca313e3127073b3cbbb9c5ed54f23f69d15887) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - shiplane and every `@shiplane/*` adapter now share one version, so the adapter that goes with a
  given shiplane is the one with the same number.

- [#32](https://github.com/arnaud-zg/packages/pull/32) [`3e5e052`](https://github.com/arnaud-zg/packages/commit/3e5e0520b223dd4d97958872e6648dca2575b09e) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - Ship no longer suggests `shiplane status --channel` after shipping only npm packages: a package has
  no channel to read.

## 0.2.0

### Minor Changes

- [#30](https://github.com/arnaud-zg/packages/pull/30) [`7c47219`](https://github.com/arnaud-zg/packages/commit/7c472198163b96f1981d1e1537dd4bde20d315bb) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - A team whose release PRs need someone else's approval sets `approval: "required"` in `releaseFlow`:
  shiplane waits without offering to merge, says it is safe to leave, and any later run picks the
  release up. A release PR main moved past is replaced by a fresh one, and the stale one closes with a
  comment saying why. A release PR closed on GitHub is a cancel, not a failure.

- [#29](https://github.com/arnaud-zg/packages/pull/29) [`7b81764`](https://github.com/arnaud-zg/packages/commit/7b817646e4f61c18a920e85f14076f5eedc59c69) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - Bring your own mascot: `display.mascot` takes frames per mood (any you leave out use the built-in
  frames) or a function of `{ mood, tick, label }`. `--no-mascot` and `mascot: false` turn it off; a
  built-in mascot is shown by default.

- [#28](https://github.com/arnaud-zg/packages/pull/28) [`34d9e31`](https://github.com/arnaud-zg/packages/commit/34d9e31e92aaf359230339a1baa899ff705080cd) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - `shiplane setup` sets releases up in one command and keeps them right: it takes only what the
  repository proves, asks the rest, rehearses a release (builds, plan, sign-ins) and writes files only
  when it passes. Custom adapters start from the new `shiplane/memory` in-memory adapters, apps take a
  `buildCommand:`, and progress spins with ora.

## 0.1.0

### Minor Changes

- [#16](https://github.com/arnaud-zg/packages/pull/16) [`08a4279`](https://github.com/arnaud-zg/packages/commit/08a42797cdf5294ca302b84fb228cc6631cb70f0) Thanks [@arnaud-zg](https://github.com/arnaud-zg)! - shiplane joins the repo: a release CLI that finds what changed, versions it and deploys each app
  through plugins (git, GitHub, changesets, Fly, Cloudflare Pages, EAS, npm).
