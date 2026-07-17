---
type: ux-spec
project: ebrain
area: tui-launch
created: 2026-07-17
status: implemented
related: [SPRINT-TUI.md, ../tui/README.md, adr/ADR-005-user-governed-model-selection.md]
---

# Launch Experience Polish

## Purpose

Launch is the daily entry point for starting work. It must expose three separate user
decisions without requiring prior knowledge of ebrain internals:

1. Describe the work and inspect non-binding task signals.
2. Configure a user-owned guided launch when the user wants a declared OpenRouter target.
3. Start a direct local session with a manually selected agent.

The interface does not rank models, infer a best provider, convert subscriptions to cost,
or launch work merely because a task was classified.

## Interaction Model

The Launch view has three focusable panels, in order: **task & signals**, **guided launch**,
and **manual agents**. `Tab` and `Shift+Tab` move the focus ring between them. `Enter` has
one meaning per focused panel:

| Focused panel | Enter action | Safety property |
|---|---|---|
| Task & signals | Open the task editor | Cannot start a session |
| Guided launch | Open the wizard | Cannot start a session |
| Manual agents | Launch the selected local agent | Continues through the RAM governor |

Task signals only classify explicit task text. They do not alter the manual selection and do
not choose a target, profile, provider, or model.

## Guided Launch Wizard

`w`, or Enter on **guided launch**, fetches declared targets and local execution profiles,
then opens a centered modal. The modal owns its input; no wizard key is active on the base
Launch screen.

- `Tab` / `Shift+Tab` cycles target, profile, capability, and directory.
- Arrow keys change the focused selectable field; candidate lists use a short window around
  the selected item so a compact terminal is not flooded.
- `c`, or Enter on the directory field, opens the directory editor. Save and cancel return
  to the wizard rather than silently discarding it.
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

At the supported minimum terminal size of 80x24, task and guided panels compress before the
manual-agent panel does. All six manual agents remain visible and selectable.

## Verification

The regression suite covers:

- Panel separation, focus, and no accidental agent launch from task/guided focus.
- Modal field navigation, capability changes, directory round-trip, choice rendering, and
  preview-before-launch semantics.
- Preserved immutable task/workflow delivery through the confirmed target path.
- Centered bracketed key hints, maximum footer density, contextual action reference, and
  80x24 manual-agent visibility.

Run `bun test ./tui/test/` for the complete TUI suite. The only remaining validation outside
the automated suite is the existing human daily-driver checklist, including a real adapter
write-back and visual acceptance on Eduardo's terminal.
