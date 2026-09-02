# Contributor Workflow

eBrain uses a spec-driven workflow for changes with meaningful user, security, or distribution
impact:

```text
context -> plan -> implementation -> focused verification -> independent review -> release approval
```

## Expectations

1. Scope a change and update focused tests before broad suites.
2. Keep public output English and do not introduce personal paths, secrets, or customer identities.
3. Use explicit file staging. Do not stage runtime state, dotenv files, local memory, or credentials.
4. Record structural changes in `CHANGELOG.md`.
5. Run both CLI and TUI suites for shared behavioral changes. TUI work also checks responsive
   terminal geometry and the design-system color boundary.

## Independent review

High-risk changes, including architecture, persistence, migration, license/distribution, and release
work, are reviewed by someone other than their author. The author's own write-up is evidence for
that review, never a substitute for it.

See [CONTRIBUTING.md](../../CONTRIBUTING.md) and [open-source readiness](open-source-readiness.md).
