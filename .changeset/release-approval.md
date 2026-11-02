---
"shiplane": minor
"@shiplane/github": minor
---

A team whose release PRs need someone else's approval sets `approval: "required"` in `releaseFlow`:
shiplane waits without offering to merge, says it is safe to leave, and any later run picks the
release up. A release PR main moved past is replaced by a fresh one, and the stale one closes with a
comment saying why. A release PR closed on GitHub is a cancel, not a failure.
