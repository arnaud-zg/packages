[🏠 Home](../../README.md) · [📚 Docs](../README.md) · `context-budget`: **🚀 Tutorial** ·
[🛠️ How-to](./how-to.md) · [📖 Reference](./reference.md) · [💡 Explanation](./explanation.md)

# 🚀 `context-budget`: Keep agent context files under a token budget

CLAUDE.md, AGENTS.md and the docs they link load on every agent session, so every extra token is
paid again and again. `context-budget` estimates each file's tokens, compares it to a budget, and
points at the sections worth cutting.

1. Install it next to your context files:

   ```sh
   npm install --save-dev context-budget
   ```

2. Run the check from the directory holding `CLAUDE.md`:

   ```sh
   npx context-budget check
   ```

   Each file gets a health bar. A file near its budget also gets a breakdown of which headings hold
   most of its tokens.

3. Dig into one file:

   ```sh
   npx context-budget check --explain CLAUDE.md
   ```

4. Adjust the budgets in `context-budget.config.json` (only the fields you change):

   ```json
   { "root": { "threshold": 4000 } }
   ```

Exit code `1` means a file is over a hard budget, `2` means advisory findings only. Every option is
in the [package README](../../packages/context-budget#readme).
