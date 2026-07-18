---
type: adr
id: ADR-006
title: Workspace-first control plane before embedded terminal panes
status: accepted
decided_by: Eduardo + Codex
decided: 2026-07-17
program: F7 -- workspace-first launch experience
related: [ADR-003-tui-stack.md, ADR-005-user-governed-model-selection.md, ../ULTRAPLAN-LAUNCH-WORKSPACES.md, ../TUI-CLI-COVERAGE.md]
---

# ADR-006 -- Workspace-First Control Plane Before Embedded Terminal Panes

## Context

eBrain's TUI is launched from one caller directory today. Direct and guided sessions default to
that cwd, so operating more than one repository tempts a developer to start several eBrain
instances. That conflicts with eBrain's value as a single cockpit for a multi-agent day.

The request also suggests an internal shell comparable to a terminal workspace product. ADR-003
already establishes two relevant constraints: tmux is the session data plane because sessions
must outlive the TUI, and eBrain deliberately does not implement a terminal emulator. An arbitrary
shell evaluator would add command injection, environment exposure, prompt/output retention,
terminal-key ownership, child lifecycle, output scrubbing, and RAM-pressure responsibilities that
the current control plane does not own or test.

## Decision

1. eBrain will first implement a **workspace registry and picker**, not an arbitrary shell.
2. A workspace is a named, canonical, user-owned directory selected for new sessions. It is
   validated through the same realpath-based client-repository isolation policy used by
   `newSession()`.
3. The selected workspace becomes the default cwd for both Manual Agents and Guided Launch. A
   started tmux session snapshots that cwd permanently; switching workspace affects only future
   launches.
4. The registry is exposed through a contract-tested CLI JSON surface before TUI rendering.
   Persistent data contains only a schema version, safe ID, label, and canonical path. It stores no
   command, environment, credential, provider setting, prompt, or session output.
5. The bare `ebrain` command opens the cockpit only on an interactive terminal. `ebrain ui` stays
   an alias; no-argument non-TTY calls remain help-oriented and non-interactive.
6. A terminal-pane feature is deferred to a separate ADR and discovery gate. If later approved, it
   must use tmux-owned windows/panes rather than an in-process VT emulator and must define its
   own security, lifecycle, scrubbing, environment, RAM, accessibility, and visual test contract.

## Consequences

- One TUI can orchestrate launches across several directories without hiding a general shell inside
  a product designed around structured CLI contracts.
- The user gets the important `cd` outcome -- choosing where work starts -- while preserving
  client-path isolation and tmux durability.
- Existing tmux sessions remain interoperable because their cwd is already part of the session
  contract; no fragile migration or session-name encoding is required.
- A later terminal pane remains possible, but it cannot bypass the workspace validator, prompt
  scrubber, RAM governor, or tmux ownership model.

## Alternatives Rejected

### Execute arbitrary commands in a TUI prompt now

Rejected. A raw command string would require shell parsing and an output retention policy, would be
hard to distinguish from a credential-bearing command, and would make the TUI a second unsafe
terminal rather than a reliable control plane.

### Build an in-process terminal emulator

Rejected. It reverses ADR-003's tmux choice, duplicates a mature PTY/multiplexer, increases RAM,
and makes session survival dependent on the TUI process.

### Keep caller cwd as the only workspace model

Rejected. It makes a global `ebrain` entry point misleading and forces one cockpit per repository.

## Acceptance Criteria

1. A user can select two safe directories in one TUI and launch sessions that retain their respective
   tmux cwd values.
2. A literal or symlinked denied client path cannot be registered, selected, or launched.
3. Workspace persistence contains no secrets or arbitrary execution fields and is contract-tested.
4. Existing `ebrain ui` users and non-interactive scripts retain compatible behavior.
5. The implementation does not introduce a shell evaluator, PTY emulator, or bypass around tmux.
