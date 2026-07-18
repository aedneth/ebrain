---
type: adr
id: ADR-007
title: Tmux-owned workspace shells without an embedded terminal emulator
status: proposed -- independent security review required before implementation
decided_by: Eduardo + Codex
proposed: 2026-07-18
program: F8.3 -- native shell discovery gate
related: [ADR-003-tui-stack.md, ADR-006-workspace-first-control-plane.md, ../ULTRAPLAN-WORKSPACES-MEMORY-OSS.md]
---

# ADR-007 -- Tmux-Owned Workspace Shells Without an Embedded Terminal Emulator

## Context

The workspace registry solves where a new agent starts, but a developer also needs a normal shell
for `cd`, completion, aliases, history, and commands that are not agent launches. Requiring a
separate eBrain process per directory would undermine the multi-project cockpit.

An in-process shell pane is not an acceptable shortcut. It would make eBrain responsible for a PTY
emulator, shell parsing, key ownership, completion, scrollback, process lifecycles, output
scrubbing, credential exposure, and memory retention. That reverses ADR-003's tmux data-plane
decision and violates ADR-006's deliberate separation between validated workspace selection and an
arbitrary command evaluator.

## Proposed Decision

If independently approved, eBrain will add a small CLI-first shell control plane over ordinary
tmux sessions. It does not implement a terminal emulator and it never accepts a command string.

### Identity and lifecycle

1. A shell is identified by the generated workspace ID, never by a user supplied path or shell
   command. Its tmux name is `ebsh-<workspace-id>`, a prefix distinct from agent sessions
   (`ebr-<agent>-<slug>`).
2. `ebrain shells open <workspace-id> --json` will re-read and validate the strict workspace
   store, resolve that ID, and create or reuse exactly one detached shell session at its canonical
   cwd. There is no `--cwd`, `--command`, or environment-override argument.
3. A shell is opened with an allow-listed, realpath-checked login shell executable. The initial
   allow-list is limited to the installed `bash`, `zsh`, `fish`, `sh`, and `dash` binaries; an
   unsupported or missing `$SHELL` fails visibly rather than falling back to a command evaluator.
4. `open` is idempotent. It returns a typed session identity and whether it was created or reused.
   It does not attach or write any shell output. A separate typed attach operation uses the existing
   `attachTarget()` handoff, choosing `switch-client` when eBrain itself is inside tmux.
5. Removing a workspace entry never kills a live shell. It only removes its eBrain identity; a
   user may still manage that shell directly in tmux. Explicit close, if added later, must require
   `--yes` and may only target an `ebsh-` identity resolved through the registry.

### Environment and data boundaries

1. The launched process is the user's normal login shell. eBrain supplies no prompt, task,
   provider selection, model, MCP token, token-store value, or arbitrary environment override.
2. Normal user shell startup may load the user's own aliases, completion, history, and environment.
   eBrain must not log, display, persist, copy, or inspect that environment. Its launch boundary
   explicitly strips eBrain control variables such as `EBRAIN_MCP_TOKEN`,
   `EBRAIN_CONFIG_DIR`, `EBRAIN_WORKSPACE_STORE`, and `EBRAIN_CALLER_CWD` rather than propagating
   them as shell configuration.
3. Shell sessions are not agent sessions: eBrain does not list them in the agent fleet, capture
   their panes, send keys to them, store their scrollback, index their output, or write it to
   learnings, episodes, workflows, cost data, or federation.
4. The workspace validator runs before every create or attach action. Literal and symlinked denied
   client paths fail before tmux is invoked. An already-open shell for a subsequently invalidated
   workspace is left running but becomes inaccessible through the eBrain control plane.

### TUI behavior

The future Workspaces action is an explicit `open shell` command on a selected registered
workspace. It has no editable command field and no output panel. It reports only safe lifecycle
state (`ready`, `opening`, `reused`, `attach failed`) and then hands off to tmux. Detaching returns
to the unchanged TUI. Shells do not add a seventh control to the compact hint bar; the action is
available through the contextual action reference when supported by the terminal and doctor state.

## Threat model and required controls

| Threat | Required control |
| --- | --- |
| Path traversal or client-repository access | generated ID only; strict store read; canonical revalidation before tmux |
| Command injection | no command argument, no text prompt, structured tmux argv only |
| Session collision with agents | distinct `ebsh-` prefix; agent list continues to accept only `ebr-` |
| Secret propagation or retention | no token-store read; strip eBrain controls; never capture/output/index shell data |
| Nested tmux failure | reuse `attachTarget()` and its attach-versus-switch-client behavior |
| Orphan or destructive cleanup | open is idempotent; no automatic killing; any future close requires explicit confirmation |
| RAM regression | no emulator or polling; shell count/status must not bypass the existing heavy-agent governor |
| Unsafe shell binary | exact allow-list plus realpath/executable validation; visible failure for unsupported `$SHELL` |

## Consequences

- Developers get native shell completion and history because their own shell and tmux provide them,
  not because eBrain attempts to imitate them.
- The control plane stays scriptable and testable through typed CLI JSON contracts.
- Shell output is intentionally outside eBrain memory. Durable learnings and workflows continue to
  require explicit, scrubbed primitives rather than implicit terminal observation.
- This creates a separate lifecycle category that needs its own UI language and tests; it must not
  be smuggled into Sessions as an agent adapter.

## Alternatives rejected

### Embed a terminal emulator in the TUI

Rejected by ADR-003 and ADR-006. It duplicates tmux/PTY responsibilities, raises the 4 GB RAM
budget, and loses durable sessions when the TUI fails.

### Accept a command or `cd` prompt in Workspaces

Rejected. A free-form evaluator makes the workspace registry an execution channel, defeats
structured argv guarantees, and creates an output/secret retention problem.

### Capture shell panes and feed them into memory

Rejected. Shell output can contain credentials, private code, prompts, or arbitrary data and is
not a trustworthy learning signal. Explicit scrubbed `remember`, episode, and workflow proposal
paths remain the only memory inputs.

### Reuse the `ebr-` agent-session prefix

Rejected. It would cause shell lifecycle and output assumptions to leak into the agent fleet and
make the current Sessions contract ambiguous.

## Acceptance gate before implementation

ADR-007 remains **proposed** until an independent checker reviews the implementation plan and the
following tests are designed or reproduced:

1. CLI JSON schemas for `shells list/open/attach` reject unknown fields and free-form path,
   command, environment, and provider inputs.
2. Literal and symlinked denied client paths cannot create or attach a shell; a removed or stale
   workspace cannot be reopened through eBrain.
3. Safe temporary workspace E2E proves idempotent create/reuse, canonical cwd, detached survival,
   outside-tmux attach, and inside-tmux switch-client behavior.
4. Tests prove agent fleet listing excludes `ebsh-` sessions and no shell operation calls
   `capture-pane`, `send-keys`, memory, workflow, provider, token-store, or cost code.
5. A fake environment proves eBrain control variables are absent from the shell launch boundary,
   while no actual secret value is ever logged by tests or implementation.
6. `80x24`, `100x30`, and `160x48` UI captures show a complete contextual action and clean return
   after detach, with exact frame widths and no terminal restoration regression.

No shell command, CLI, or TUI implementation is authorized by this ADR alone. The independent
checker must approve the implementation range before this proposed decision becomes accepted.
