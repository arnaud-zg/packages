---
"shiplane": minor
---

With `commitsWithoutChangeset: "release"`, a commit's type now sets its release: `feat` moves a
minor, a subject marked `!` a major, anything else a patch. Before, every commit-driven release was
a patch, and a breaking `refactor!:` could be left out of the changelog.
