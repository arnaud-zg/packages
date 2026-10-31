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
pnpm --filter context-budget test
```

## Release a new version

Uses [Changesets](https://github.com/changesets/changesets). Nobody pushes to `main` directly,
including for version bumps: everything lands through a merged PR.

**1. Add a changeset, in your feature/fix PR**

```sh
pnpm changeset
```

Each merged PR carries its own changeset; they pile up on `main` until step 2 cuts a release. Commit
the generated `.changeset/*.md` file and merge the PR as usual.

A package that has never been published needs no changeset for its first version: set the version
directly in its `package.json` (e.g. `0.1.0`) when you add the package, and `changeset publish`
picks it up automatically once merged, since the registry has nothing at that version yet.

**2. Cut the release PR, once changesets have piled up on `main`**

```sh
git checkout main
git checkout -b release/$(date +%Y-%m-%d)
pnpm changeset version && pnpm install
git commit -am "chore(release): version packages"
git push -u origin HEAD
gh pr create --title "chore(release): version packages" --fill
```

Copy this into the PR description, filling in the version column from the `package.json` diffs:

```markdown
## Releases

| Package          | Version |
| ---------------- | ------- |
| `context-budget` | 0.0.0   |
```

Review the diff (version bumps + `CHANGELOG.md`) and merge it like any other PR.

**3. Publish, from your machine, after that PR is merged**

```sh
git checkout main
npm login          # if you don't already have a session
pnpm release        # build, then changeset publish (also tags each bumped package)
git push --follow-tags
pnpm release:notes  # create a GitHub Release, per package, from that CHANGELOG.md entry
```

`pnpm release:notes` needs `gh` authenticated and is safe to re-run: it skips any tag that already
has a release.

One-time setup: **Settings → Branches** → require a PR before merging into `main`, so steps 1 and 2
are the only way in. (Needs the repo to be public, or GitHub Pro, for a private repo.)

Packages version independently, not in lockstep: a fix to one package doesn't force a version bump
on another. Each starts at `0.1.0`: usable, not yet stable, expect breaking changes signaled by a
`0.x` minor bump until `1.0.0`. See
[Explanation § Versioning policy](./explanation.md#versioning-policy) for why.
