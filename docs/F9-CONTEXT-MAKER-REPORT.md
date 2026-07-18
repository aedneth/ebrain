---
type: maker-report
project: ebrain
phase: F9.1 -- governed operating context packs
status: implementation-complete -- independent checker review required
created: 2026-07-18
maker: Codex
related: [adr/ADR-008-governed-agent-memory.md, ULTRAPLAN-WORKSPACES-MEMORY-OSS.md]
---

# F9.1 Maker Report -- Governed Operating Context

## Scope delivered

`ebrain context` introduces a private local operating-context store without adding any prompt
injection, daemon dependency, provider selection, shell control, or automatic memory mutation.
It supports one operator pack and optional packs tied to an already-registered generated workspace
identity:

```text
ebrain context list --json
ebrain context init --scope operator --yes --json
ebrain context init --scope workspace --workspace-id <generated-id> --yes --json
ebrain context get <pack-id> --max-chars <bounded-count> --json
ebrain context update <pack-id> --content <replacement> --yes --json
ebrain context propose <pack-id> --agent <safe-id> --session <safe-id> \
  --evidence <text> --content <replacement> --yes --json
ebrain context proposals --json
ebrain context review <proposal-id> --action accept|reject --yes --json
```

`list` is summary-only: ID, scope, generated workspace ID, version, timestamp, and character
count. It has no pack body or local path. `get` is the sole explicit, bounded body retrieval.
`update` is the explicit human editing path: it validates replacement content, increments the
version, computes the new hash, and atomically replaces the pack. Pending proposals retain their
old base and become stale rather than overwriting the human edit.
Launch requests only `context list --json` and renders the eligible reviewed pack identities and
versions for the selected workspace. No context body enters TUI state or is copied to a launch
prompt.

Context packs and proposal records use private directories (`0700`), private files (`0600`), and
atomic per-file replacement. Unknown fields, malformed metadata, invalid identities, oversized
text, secret-shaped text, and denied-client references fail closed. A proposal captures its base
version/hash and cannot activate until an explicit `review --action accept --yes`; a changed base
causes a stale-proposal failure rather than an overwrite.

The historical `memory recent --json` public fields were also corrected: local internal readers
may use a path only to read a record, but `LearningEntry` and `SessionEntry` no longer return it.
Both the CLI schema and TUI parser reject a path if a future regression tries to reintroduce one.

## Verification performed by maker

- Focused contract tests: `bun test ./cli/context.test.ts ./cli/memory.test.ts
  ./cli/contract.test.ts ./tui/test/knowledge/contracts.test.ts ./tui/test/launch.test.ts
  ./tui/test/app.test.ts` -> `164 pass, 0 fail` before the final permissions hardening; the
  final focused run for context/contract/TUI boundaries is `138 pass, 0 fail`.
- Post-hardening full suites: CLI `242 pass, 0 fail`; TUI `436 pass, 0 fail`.
- Real dispatcher/TUI smoke in an isolated temporary config/context directory:
  `context init -> bounded get -> explicit update -> list`, then bare `ebrain` in tmux at
  `100x30` and `80x24`. Both captured Launch with `manual agents` and `context  operator v2`.
- The smoke did not use a daemon, a real context store, a private repository, an agent session,
  or any provider credential.

Shell syntax, whitespace, source/diff zero-hex, and diff secret-safety are recorded beside the
phase commit.

## Checker focus

An independent checker must reproduce the CLI and TUI contracts and inspect these boundaries:

1. Verify `context list` never returns a pack body, path, command, environment, provider, model,
   or daemon data; verify `get` is bounded and explicit.
2. Verify a proposal cannot change an active pack before `review accept --yes`, and two proposals
   against the same base produce a stale conflict rather than a silent overwrite.
3. Verify private permissions, atomic write behavior, strict unknown-field rejection, secret
   rejection, generated workspace identity validation, and denied-client isolation.
4. Verify `memory recent --json` and the TUI both reject reintroduced local-path fields.
5. Reproduce the `80x24`, `100x30`, and normal interactive Launch geometry with summary-only
   context status; confirm no body reaches terminal state or launch arguments.
6. Confirm no changes weaken the existing workspace pre-launch revalidation, RAM governor,
   session prompt confirmation, daemon ownership, or public clean-install behavior.

This is maker evidence, not an approval or release gate.
