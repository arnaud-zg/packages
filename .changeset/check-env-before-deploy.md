---
"shiplane": patch
---

A unit file can list `checkEnvBeforeDeploy`: the env var names its app reads. Before each deploy,
shiplane checks they are set on the platform, and waits for a person to set any that are missing, or
stops in CI. `shiplane doctor` shows the same check. Plugins opt in with an optional `env`, so
existing plugins and unit files work unchanged.
