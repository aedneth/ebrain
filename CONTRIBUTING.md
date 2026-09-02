# Contributing to eBrain

Thanks for your interest in eBrain! Contributions — from bug reports to features — are welcome.

## Development setup

```bash
git clone https://github.com/aedneth/ebrain.git ebrain
cd ebrain
bun install
bun test ./cli/        # CLI suite
bun test ./tui/test/   # TUI suite
bun cli/ebrain doctor  # environment + daemon health (no install needed)
```

**Prerequisites:** [Bun](https://bun.sh), git, and [tmux](https://github.com/tmux/tmux) for session tests.

## How we work

eBrain is built spec-first, and it enforces the same discipline on its contributors that it gives
its users:

1. **Small, scoped changes.** One concern per PR. Describe the problem before the fix.
2. **Tests are not optional.** Add or update focused tests; both suites must stay green. Keep the
   `#hex`-free rule for the TUI (colors come from the design system, not hardcoded values).
3. **Authorship and approval are separate.** High-risk changes (architecture, migrations, releases) are not
   self-approved — they get an independent review before merge.
4. **Leave a trace.** Update `CHANGELOG.md` for anything structural.

## Hard rules

- **Never** read, print, or commit secrets. Refer to a variable by **name** (`EBRAIN_MCP_TOKEN`),
  never its value. Use specific `git add <paths>`, never `git add -A` near env files.
- **Never** add a dependency without a clear need and a lockfile update.
- Respect source isolation: local exclusions and deny-first source policy are security boundaries,
  not suggestions.
- Follow the public [contributor workflow](docs/release/contributor-workflow.md).

## Commit & PR

- Conventional-ish commit subjects (`feat:`, `fix:`, `docs:`) with a short body explaining *why*.
- Link the issue you're closing. Include test output for behavior changes.

By contributing, you agree your contribution is licensed under the
[GNU Affero General Public License v3.0 only](LICENSE).
