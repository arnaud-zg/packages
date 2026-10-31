[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `context-budget`:
[🚀 Tutorial](./tutorial.md) · **🛠️ How-to** · [📖 Reference](./reference.md) ·
[💡 Explanation](./explanation.md)

# 🛠️ How-to guides: `context-budget`

## Block a commit when CLAUDE.md goes over budget

With [Lefthook](https://github.com/evilmartians/lefthook), run the check only when a context file
changes, and let advisory findings (exit `2`) through:

```yaml
pre-commit:
  commands:
    context-budget:
      glob: ["CLAUDE.md", "AGENTS.md"]
      run: npx context-budget check || [ $? -eq 2 ]
```

## Explain one file

```sh
npx context-budget check --explain CLAUDE.md
```

## Read the result in CI

```sh
npx context-budget check --json > context-budget.json
```

The JSON run exits with the same code as the human report.
