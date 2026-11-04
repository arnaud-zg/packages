---
"shiplane": minor
---

`shiplane setup` now sets up versioning. With no `.changeset/config.json` it asks how you want to
release, commits or changesets, with commits as the default and under `--yes`. It writes that file
with private packages versioned and adds `@changesets/cli`, then says to run the install. A
repository already on changesets sees no new question.
