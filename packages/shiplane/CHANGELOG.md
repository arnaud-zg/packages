# shiplane

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
