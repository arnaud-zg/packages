[🏠 Home](../../README.md) · [📚 Docs](../README.md) · Contributing: [🛠️ How-to](./how-to.md) ·
[📖 Reference](./reference.md) · **💡 Explanation**

# 💡 Explanation: Contributing

## Why independent packages share one repo

Every package here is a small, focused tool with no shared runtime between them: installing one
never pulls in another, and each publishes and versions independently. A monorepo buys one set of
dev tooling (lint, format, release process, CI) instead of duplicating it per package; nothing about
any package's own code depends on the others existing.

## Versioning policy

Each package versions independently through [Changesets](https://github.com/changesets/changesets),
not in lockstep: a fix to one package never forces a version bump on another. Each starts at
`0.1.0`: usable, not yet stable, expect breaking changes signaled by a `0.x` minor bump until
`1.0.0`.

A new feature is a minor bump too, even when it breaks nothing: below `1.0.0` a minor means "new" or
"breaking", and the changelog says which; a patch only ever means "fixed". Changesets never picks
the bump, so the one who writes the changeset applies this rule.

## Why every package is written to be found

Nobody promotes these packages. People find them in two ways only: npm search, and a web search for
the error or the task they are stuck on. Both read the same few fields, so those fields are written
for that reader, not for the author:

- **npm search** ranks on the package name, `description` and `keywords`, then the README. A package
  with no keywords is close to invisible there, which is why every published package must have some.
- **Web search** matches the words people type: the exact error message, or "how to X with Y". A
  README that only names the solution ("fallback", "resolver") misses them; one that quotes the
  error string matches it.
- **npm shows the published `package.json`, not `main`.** A keyword or description change does
  nothing until the package is released again. That is why such a change gets its own changeset.

The rules themselves are in [Reference § Findability rules](./reference.md#findability-rules), and
the steps in [How-to § Keep a package findable](./how-to.md#keep-a-package-findable).
