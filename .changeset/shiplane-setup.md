---
"shiplane": minor
---

`shiplane setup` sets releases up in one command and keeps them right: it takes only what the
repository proves, asks the rest, rehearses a release (builds, plan, sign-ins) and writes files only
when it passes. Custom adapters start from the new `shiplane/memory` in-memory adapters, apps take a
`buildCommand:`, and progress spins with ora.
