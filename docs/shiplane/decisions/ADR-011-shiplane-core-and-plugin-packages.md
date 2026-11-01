# ADR-011: Shiplane is a small core, every provider a plugin package

## Status

Accepted

## Context

Shiplane (the release CLI) held every provider in one package: git, GitHub and GitHub Actions,
changesets, Fly, Cloudflare Pages, EAS and npm, plus the release-comments feature. ADR-009 already
gave each provider an adapter behind a port, so the code was split, but the package was not: a
repository releasing only npm packages (`arnaud-zg/packages`) or only Claude Code plugins
(`arnaud-zg/skills`) still installed the EAS policy and the Fly adapter, and the core defaulted its
flow to git, GitHub and changesets by importing them.

Shiplane is meant to leave this repository and serve several, so what a repository installs should
be what it ships with.

## Decision

- `shiplane` is the CLI and the core: the use cases, the ports, the modules, the `define*` helpers,
  the built-in `shellServerHosting()` (the fallback for a host no plugin covers), and two more
  entries: `/plugin`, what a plugin builds on, and `/testing`, each port's Fake and contract suite.
- Each provider is a package, `shiplane-<provider>`: `-git`, `-github` (code host, Actions and
  release comments, one sign-in and one `gh`), `-changesets`, `-fly`, `-cloudflare-pages`, `-eas`,
  `-npm`. One package per provider, not per port: nobody installs GitHub's code host without its
  Actions.
- The core imports no provider. `flow` is required in `shiplane.config.ts`; `init` writes it.
- `init` and `add` offer the delivery adapters of the plugins the repository depends on, which a
  plugin names in its `package.json` (`"shiplane": { "adapters": [...] }`).
- Plugins take `z` from the core, so every schema shares one zod.
- Tests that need several real plugins at once live in a private `@shiplane/integration`, since the
  core cannot depend on its plugins (turbo refuses the cycle).

## Consequences

- A repository installs the core and the plugins it uses: 4 packages for skills, 5 for packages, 7
  here. A new provider is a new package, released on its own, with no new version of the core.
- Configs import each provider from its plugin, and must name a flow. A config written before this
  fails to load with the flow to add.
- The core's public surface is now deliberate: `/plugin` exports what the plugins in this repository
  use, nothing more; a third-party plugin needing more asks for it there.
- Outside this repository the scope changes (`@arnaud-zg/shiplane-<provider>`, or `@shiplane/…` if
  that npm org is claimed); `init` already writes the name the repository installs.
