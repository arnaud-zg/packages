[🏠 Home](../../README.md) · [📚 Docs](../README.md) · Contributing: **🛠️ How-to** ·
[📖 Reference](./reference.md) · [💡 Explanation](./explanation.md)

# 🛠️ How-to guides: Contributing

## Run this repo's own tests

```sh
pnpm install
pnpm verify
```

Or scope to one package:

```sh
pnpm --filter agent-context-budget test
```

## Release a new version

Uses [shiplane](../../packages/shiplane/README.md), with
[Changesets](https://github.com/changesets/changesets) for the versions. Nobody pushes to `main`
directly, including for version bumps: everything lands through a merged PR.

**1. Add a changeset, in your feature/fix PR**

```sh
pnpm changeset
```

Each merged PR carries its own changeset; they pile up on `main` until step 2 cuts a release. Commit
the generated `.changeset/*.md` file and merge the PR as usual.

**2. Open the release PR, once changesets have piled up on `main`**

```sh
git checkout main && git pull
pnpm release
```

`pnpm release` builds, then runs shiplane. With changesets pending, it opens the release PR:
versions bumped and `CHANGELOG.md` written by `changeset version`. Review the diff and merge it like
any other PR. `pnpm shiplane status` shows what is pending at any time.

**3. Publish, after that PR is merged**

```sh
git checkout main && git pull
npm login           # if you don't already have a session
pnpm release
```

The same command now tags each bumped package, publishes it to npm and writes its GitHub Release
from the `CHANGELOG.md` entry. It needs `gh` and `npm` signed in.

One-time setup: **Settings → Branches** → require a PR before merging into `main`, so steps 1 and 2
are the only way in. (Needs the repo to be public, or GitHub Pro, for a private repo.)

Packages version independently, not in lockstep: a fix to one package doesn't force a version bump
on another. Each starts at `0.1.0`: usable, not yet stable, expect breaking changes signaled by a
`0.x` minor bump until `1.0.0`. See
[Explanation § Versioning policy](./explanation.md#versioning-policy) for why.
