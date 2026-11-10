---
"@shiplane/fly": patch
"@shiplane/eas": patch
"@shiplane/cloudflare-pages": patch
---

Fly, EAS and Cloudflare Pages list the env var names they hold, so `checkEnvBeforeDeploy` and
`shiplane doctor` can check them. Fly reads its secrets and the fly.toml `[env]` keys, EAS its
environment's variables, Pages its secrets and the unit's build variables. Values are never read.
