# Contributing to eBrain

Thanks for your interest in eBrain! Contributions — from bug reports to features — are welcome.

## Development setup

```bash
git clone https://github.com/aedneth/ebrain.git ~/eBrain
cd ~/eBrain
bun install
bun test ./cli/        # CLI suite
bun test ./tui/test/   # TUI suite
ebrain doctor          # environment + daemon health
```

**Prerequisites:** [Bun](https://bun.sh), [tmux](https://github.com/tmux/tmux), and [`gh`](https://cli.github.com).

## How we work

eBrain is built spec-first, and it enforces the same discipline on its contributors that it gives
its users:

1. **Small, scoped changes.** One concern per PR. Describe the problem before the fix.
2. **Tests are not optional.** Add or update focused tests; both suites must stay green. Keep the
   `#hex`-free rule for the TUI (colors come from the design system, not hardcoded values).
3. **maker ≠ checker.** High-risk changes (architecture, migrations, releases) are not
   self-approved — they get an independent review before merge.
4. **Leave a trace.** Update `CHANGELOG.md` for anything structural.

## Hard rules

- **Never** read, print, or commit secrets. Refer to a variable by **name** (`EBRAIN_MCP_TOKEN`),
  never its value. Use specific `git add <paths>`, never `git add -A` near env files.
- **Never** add a dependency without a clear need and a lockfile update.
- Respect source isolation: the client-repository deny-list is a security boundary, not a
  suggestion.
- Agent contributors additionally follow [`AGENTS.md`](AGENTS.md).

## Commit & PR

- Conventional-ish commit subjects (`feat:`, `fix:`, `docs:`) with a short body explaining *why*.
- Link the issue you're closing. Include test output for behavior changes.

By contributing, you agree your work is licensed under the [MIT License](LICENSE).
