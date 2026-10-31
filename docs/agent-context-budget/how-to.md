[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `agent-context-budget`:
[🚀 Tutorial](./tutorial.md) · **🛠️ How-to** · [📖 Reference](./reference.md) ·
[💡 Explanation](./explanation.md)

# 🛠️ How-to guides: `agent-context-budget`

## Block a commit when CLAUDE.md goes over budget

With [Lefthook](https://github.com/evilmartians/lefthook), run the check only when a context file
changes, and let advisory findings (exit `2`) through:

```yaml
pre-commit:
  commands:
    agent-context-budget:
      glob: ["CLAUDE.md", "AGENTS.md"]
      run: npx agent-context-budget check || [ $? -eq 2 ]
```

## Explain one file

```sh
npx agent-context-budget check --explain CLAUDE.md
```

## Read the result in CI

```sh
npx agent-context-budget check --json > agent-context-budget.json
```

The JSON run exits with the same code as the human report.
