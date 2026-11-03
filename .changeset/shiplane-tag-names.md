---
"shiplane": minor
---

`tag` takes a format's name: `"package"` (`{name}@{version}`, still the default), `"plugin"`
(`{name}--v{version}`, the tag Claude Code resolves plugin versions from, which Gemini CLI and Codex
install from too), `"single"` (`v{version}`) or `"module"` (`{name}/v{version}`, as Go tags a module
in a folder). A format without `{name}` used for more than one unit is now a config problem, since
their tags would collide.
