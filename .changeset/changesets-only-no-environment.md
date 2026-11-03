---
"shiplane": minor
"@shiplane/git": minor
---

Only changesets release now. `commitsWithoutChangeset` is deprecated: a config that still sets it
loads, warns on every run and in `doctor`, and releases from changesets alone, so queue each release
with `pnpm changeset`. `status --json` drops the `commits` field, and `SourceControlPort` drops
`subjectsSince`.

An agent plugin or internal tool has no environment, like a package on npm, so a run stops offering
preview: it asks `Release these live?`, and the scope question, the release PR, `status` and the
"Nothing to ship" lines say `live` too. So do a package's hints, which said `on preview`.
