---
"@shiplane/changesets": minor
"shiplane": minor
---

Pick the version a release ships. When everything it moves lands on one version, `shiplane` asks
`Release these to preview as`, with the computed version selected: Enter releases it, Esc cancels,
and any other version asks why in one line. That line reaches the changelog, the release PR and the
release notes, as `Version forced to 1.0.0 instead of 0.5.0: …`. Units moving to different versions
keep the plain yes, and `--yes` keeps the computed version.

`VersioningPort`'s `plan` and `apply` take an optional `ceiling`, the level nothing moves past. An
adapter that ignores it stops the run with `Can't force`, rather than shipping another version.
