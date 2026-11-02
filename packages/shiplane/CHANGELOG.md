# shiplane

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
