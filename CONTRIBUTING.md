# Contributing

## Report an issue

[Open an issue](https://github.com/arnaud-zg/packages/issues/new/choose) and pick the package. One
sentence is enough to start; a reproduction helps but is optional.

## Send a change

```sh
pnpm install
pnpm verify   # typecheck, lint, format, test, build
```

- One pull request per change, with a [conventional commit](https://www.conventionalcommits.org)
  title such as `fix(shiplane): ...`.
- A change users will see needs a changeset: `pnpm changeset`.

## Triage (maintainer)

The form a reporter picks sets `pkg: <name>`. Triage is adding one priority:

| Label              | Means                                       |
| ------------------ | ------------------------------------------- |
| `priority: high`   | Do next: unblocks users or several packages |
| `priority: medium` | Worth doing, no rush                        |
| `priority: low`    | Low value: a pull request is welcome        |

- [Inbox](https://github.com/arnaud-zg/packages/issues?q=is%3Aopen+is%3Aissue+-label%3A%22priority%3A+high%22+-label%3A%22priority%3A+medium%22+-label%3A%22priority%3A+low%22):
  open issues with no priority yet
- [Next up](https://github.com/arnaud-zg/packages/issues?q=is%3Aopen+label%3A%22priority%3A+high%22)
- Per package: filter by `label:"pkg: shiplane"`

After adding, renaming or removing a package, run `pnpm sync-issues` to regenerate the forms, then
`pnpm sync-issues --labels --apply` to sync the labels. It runs locally; no GitHub Action is
involved.
