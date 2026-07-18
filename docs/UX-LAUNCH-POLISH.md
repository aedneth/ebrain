---
type: ux-spec
project: ebrain
area: tui-launch
created: 2026-07-17
status: current-f7-3
related: [SPRINT-TUI.md, ../tui/README.md, adr/ADR-005-user-governed-model-selection.md, adr/ADR-006-workspace-first-control-plane.md]
---

# Launch Experience Polish

## Purpose

Launch is the daily entry point for starting work. It must expose three separate user
decisions without requiring prior knowledge of ebrain internals:

1. Select a safe workspace, then start a direct local session with a manually selected agent.
2. Configure a user-owned guided launch when the user wants a declared OpenRouter target.
3. Choose a task category and optional exact prompt when that context is useful.

The interface does not rank models, infer a best provider, convert subscriptions to cost,
or launch work merely because a task was classified.

## Interaction Model

The Launch view has three focusable panels, in order: **manual agents**, **guided launch**,
and **task setup**. On normal-width terminals Manual Agents occupies the primary left region;
on compact terminals it is the first complete panel. `Tab` and `Shift+Tab` move the focus ring
between them. `Enter` has
one meaning per focused panel:

| Focused panel | Enter action | Safety property |
|---|---|---|
| Manual agents | Launch the selected local agent | Continues through the RAM governor |
| Guided launch | Open the wizard | Cannot start a session |
| Task setup | Open the category and optional-prompt flow | Cannot start a session |

Task Setup is deterministic: the user chooses Coding, Agentic systems, Web design, Long-context
research, Terminal automation, or General, then may add an optional prompt. It does not alter the
manual selection, create a profile, or choose a target, provider, or model. `r` clears the
transient category, prompt, workflow attribution, and stale guided preview.

## Workspace Selection

`g` opens a searchable workspace picker from any Launch focus. It lists the caller directory only
after the same CLI validator has canonicalized it, followed by registered directories. `s` filters
by label or directory, `a` opens an explicit directory-and-label form, and `r` refreshes the local
registry. The form passes structured argv to `ebrain workspaces add`; it never evaluates a command
string. Both the literal input and its resolved realpath must be existing directories outside the
client-repository deny list before persistence or selection.

The active workspace appears in the Manual Agents panel and footer. Direct launch validates it
again immediately before the RAM gate. Guided Launch validates it before opening and its
workspace field invokes this same picker; it no longer has a free-form cwd editor. A started tmux
session retains its own cwd forever, so a later selection only affects future sessions.

## Guided Launch Wizard

`w`, or Enter on **guided launch**, fetches declared targets and local execution profiles,
then opens a centered modal. The modal owns its input; no wizard key is active on the base
Launch screen.

- `Tab` / `Shift+Tab` cycles target, profile, capability, and workspace.
- Each field shows its active value and available count. Arrow keys change only a field with more
  than one alternative; singleton fields are visibly locked rather than pretending a choice exists.
- `c`, or Enter on the workspace field, opens the validated workspace picker. Selecting an item
  returns to the wizard with a fresh workspace snapshot; cancel returns without discarding it.
- Enter creates a plan, then a second Enter opens the existing review confirmation. `y` is
  still the only confirmation path; the RAM governor can require a further confirmation.
- On first use, profile initialization remains explicit. It does not call a provider or
  store a credential, and after success it returns directly to the wizard.

The immutable reviewed `LaunchIntent`, stdin prompt delivery, deny-client checks, and target
argv construction remain unchanged from the audited launch path.

## Compact Controls

The footer is a centered control row. Each control has the form `[key] action`: keys are
muted and action labels are primary text. The visible row is capped at six controls. `?`
opens a small action reference for the active view; this preserves discoverability for
Memory and other dense panels without a permanently crowded footer. `/` retains the global
command palette.

At the supported minimum terminal size of 80x24, Guided Launch and Task Setup compact before the
Manual Agents panel does. All six manual agents remain visible and selectable.

## Verification

The regression suite covers:

- Manual-primary layout and exact 80x24, 100x30, and 160x48 geometry.
- Panel focus and no accidental agent launch from guided/task focus.
- Deterministic category/prompt state, reset behavior, singleton/multi-choice navigation,
  workspace-picker round-trip, and preview-before-launch semantics.
- Strict registry schema, canonicalization, private persistence, duplicate rejection, client-path
  denial, and a real tmux E2E showing two selected workspaces retain distinct cwd values.
- Preserved immutable task/workflow delivery through the confirmed target path.
- Centered bracketed key hints, maximum footer density, contextual action reference, and
  80x24 manual-agent visibility.

Run `bun test ./tui/test/` for the complete TUI suite. The only remaining validation outside
the automated suite is the existing human daily-driver checklist, including a real adapter
write-back and visual acceptance on Eduardo's terminal.
