---
"@shiplane/changesets": minor
"shiplane": minor
---

Release with no changeset to write: `commitsVersioning()` turns the Conventional Commits since each
package's version into the release's changesets. `feat` is a minor, a subject marked `!` a major (a
minor below 1.0), and anything else a patch, so a change committed as `chore:` still ships. A
pending changeset still takes over for the package it names.

`VersioningPort` gains a required `nextChange`: what a person does to queue a release, so shiplane
stops telling a repository on commits to run `pnpm changeset`.
