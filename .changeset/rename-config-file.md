---
"agent-context-budget": minor
---

Rename the config file to `agent-context-budget.config.json`. `context-budget.config.json` is still
read, with a deprecation warning, and will be removed in the next release. If both files exist, the
new one wins and the old one is ignored.
