---
type: ultraplan
project: ebrain
program: F7 -- workspace-first launch experience
created: 2026-07-17
status: approved-for-implementation
owner: Codex (maker)
checker: independent auditor after maker gate
related: [SPRINT-TUI.md, UX-LAUNCH-POLISH.md, TUI-CLI-COVERAGE.md, adr/ADR-003-tui-stack.md, adr/ADR-005-user-governed-model-selection.md, adr/ADR-006-workspace-first-control-plane.md]
---

# ULTRAPLAN -- Workspace-First Launch Experience

## Goal

Make Launch immediately understandable for the common case: choose an agent, choose a
workspace, and start a persistent session. Guided OpenRouter launches and task setup remain
available, but never obscure manual agents or pretend to select a best model.

When this program ships, one ebrain TUI can launch and observe agents across several user-owned
directories. A user does not need one TUI per repository, nor an embedded shell to change the
working directory of a new agent session.

## Premise Check

| Request premise | Evidence | Corrected conclusion |
|---|---|---|
| Target/profile arrows in Guided Launch are broken. | `tui/src/app.ts` cycles both arrays; the reported screen contains exactly one declared target and one local profile. | The reducer is functional, but the UI incorrectly says "use arrows to choose" when no choice exists. It must state the count and disable the affordance for singleton lists. |
| `r` should reset the task. | Launch currently assigns `r` to re-run the Task Profile classifier, leaving `LaunchSlice.task` untouched. | The user expectation is correct for the daily flow. `r` becomes a transient task-setup reset; automated classification is no longer the primary path. |
| A task category should create a wizard profile. | ADR-005 makes execution profiles user-owned model orderings with provenance; `cli/profiles.ts` writes them only through explicit operations. | Task setup must set a reversible **capability preset**, not create or mutate an execution profile. The wizard applies that preset only when the selected profile supports it. |
| A general embedded shell is required to launch in many directories. | ADR-003 deliberately uses tmux as the durable data plane and rejects in-process terminal emulation. `newSession(..., { cwd })` already has the correct explicit cwd contract and deny-list enforcement. | The first product need is a multi-workspace registry and picker. A general command runner/terminal pane is a distinct, higher-risk product and remains deferred by ADR-006. |

## Product Decisions

1. **Manual agents are the primary Launch decision.** On normal terminals, Manual Agents is the
   large left panel; Guided Launch is upper-right; Task Setup is lower-right. The focus order is
   manual agents, guided launch, task setup. Launch lands with Manual Agents focused.
2. **Task Setup replaces automatic "task & signals" as the visible primary concept.** The user
   chooses one capability from a plain-language guide, then may add an optional task prompt.
   Categories explain the type of work; none names a provider, model, price, ranking, or winner.
   The existing `task-profile` CLI remains a compatible explicit analysis tool, but no longer owns
   the normal TUI decision.
3. **A capability preset is not an execution profile.** It is stored in transient Launch state,
   preselects a compatible wizard capability, and can always be changed in the wizard. Profiles
   remain user-authored local model orderings and are never written by Task Setup.
4. **Every dialog gets one responsive rendering path.** Dialog content is semantic plain text plus
   styled roles, word-wrapped to the available cells, and viewport-scrolled when longer than the
   terminal. No explanatory message is silently truncated. Inputs may horizontally follow the
   cursor, but their full value is available in the dialog's wrapped review row.
5. **Workspace, not process cwd, is the launch context.** A selected workspace is visible in
   Launch and the footer. Each new session snapshots its selected workspace cwd; switching later
   does not alter existing sessions. All paths are canonicalized and rejected if they resolve into
   a denied client repository.
6. **Bare `ebrain` is the interactive entry point only on a real TTY.** `ebrain ui` remains a
   compatible alias. No-argument non-interactive invocations retain help output so scripts and CI
   do not hang or receive ANSI TUI output.

## Explicit Non-Goals

- No claim that a task category identifies the best model, provider, benchmark winner, or price.
- No automatic profile creation, model catalog mutation, provider call, or credential handling.
- No shell evaluator, `sh -c`, command-history store, terminal emulator, or arbitrary command
  runner inside the TUI in this program.
- No change to the tmux persistence model, immutable reviewed `LaunchIntent`, stdin task delivery,
  RAM governor, cost ledger contract, or client-repository isolation policy.
- No examination of dotenv files, credentials, agent configuration contents, or token stores.

## Information Architecture

### Normal layout: at least 100 columns

```
┌──────────────────────── manual agents ────────────────────────┐  ┌─ guided launch ─┐
│ six-agent grid · active workspace · selected-agent summary     │  │ target/profile  │
│ direct launch is the default action                            │  │ review settings │
│                                                                 │  └────────────────┘
│                                                                 │  ┌─ task setup ───┐
│                                                                 │  │ category/prompt │
└────────────────────────────────────────────────────────────────┘  └────────────────┘
```

- Horizontal split: Manual Agents flex `2`, right column flex `1`, one-cell gap.
- Right column: Guided Launch and Task Setup split vertically with one-cell gap.
- The manual grid always reserves three rows for all six agents plus a stable action row.

### Compact layout: 80--99 columns or 24--25 rows

Panels stack in priority order: Manual Agents, Guided Launch, Task Setup. Manual Agents receives
the fixed height needed to show all six entries; the other panels reduce to their current state,
one sentence, and one action. No panel title or selected-agent row disappears.

### Focus and keys

| Context | Keys | Result |
|---|---|---|
| Manual Agents | arrows, Enter | Select and launch a direct local agent. |
| Guided Launch | Enter or `w` | Open the guided dialog; it never launches on open. |
| Task Setup | Enter or `t` | Open the category-and-prompt dialog. |
| Task Setup with saved state | `r` | Clear category preset, prompt, workflow attribution, and derived analysis. This is transient and needs no confirmation. |
| Any Launch state | `g` | Open workspace picker. |
| Guided dialog | Tab, arrows, Enter | Traverse fields; arrows change a field only when more than one choice exists. |

The post-launch transition to Sessions is preserved for both direct and guided launches.

## Dialog Foundation Contract

The current `panel()` correctly guarantees rectangular rows but intentionally truncates each body
line. It is appropriate for fixed dashboard cells, not user-facing dialog copy. F7 introduces a
separate dialog foundation rather than changing every panel's existing contract.

### Pure API

`tui/src/widgets/dialog/responsive.ts` will accept a `ResponsiveDialogSpec` containing title,
semantic body blocks, action hints, width bounds, and a scroll offset. It returns exact-width rows
and dialog metadata (content height, viewport height, whether scrolling is available).

Rules:

- Compute width from actual terminal columns with a two-cell outer margin and stable minimum.
- Wrap prose by display width before applying ANSI color roles.
- Keep paragraphs, key/value rows, lists, and action rows semantic until layout; do not parse ANSI
  strings to recover wrapping boundaries.
- If body height exceeds the viewport, render a visible `more`/position indicator and route Up/Down
  to dialog scrolling only where the current dialog does not own them for selection.
- Never call `truncate()` on explanatory copy. Use a dedicated wrapped value row for long paths,
  target IDs, profile labels, task previews, and confirmation messages.
- Preserve square dialog borders and the contour-only theme.

### Migration inventory

This foundation applies to command palette/help, confirmations, task editor, task setup,
guided launch, workspace picker/editor, cwd editor, memory search, remember, session prompt
preview, and read-only details. Each overlay is tested at 80x24, 100x30, and 160x48 with long
content. Existing non-dialog panels retain their dense, intentionally clipped table cells.

## Task Setup Contract

The guided modal has two deterministic steps, both explicitly editable:

1. **Choose task type:** Coding, Agentic systems, Web design, Long-context research, Terminal
   automation, or General. Each row provides one short description and example work kinds.
2. **Add task (optional):** a prompt delivered to the started session exactly as reviewed. It is
   not used to infer or overwrite the selected type.

The resulting state is `{ capability, prompt, workflowId? }`. An attached workflow supplies the
prompt and attribution but does not override the user's capability choice. The wizard selects the
preset if its chosen profile exposes it; otherwise it visibly asks the user to choose an available
capability. The existing `task-profile` result, if invoked deliberately later, is rendered only as
non-binding evidence and cannot change this state.

## Workspace Contract

### Data model and CLI-first boundary

Introduce a new contract-tested `ebrain workspaces --json` backend before rendering it in the TUI.
The persistent local registry contains only a schema version, a generated safe ID, a user label,
and a canonical absolute cwd. It lives outside the repository in the ebrain config directory with
mode `0700` for its directory and `0600` for its file. It contains no command, environment, agent
configuration, credential, prompt, or session output.

Operations are structured: `list`, `add`, `rename`, and `remove`, with `--yes` for mutation from
the CLI. A path must exist, resolve through symlinks, be a directory, and pass `isClientPath()` on
both submitted and canonical paths before it can be stored or selected. Duplicate canonical paths
are rejected. The current caller cwd is always available as a non-persistent "Current directory"
candidate if it passes the same validation.

### TUI behavior

- `g` opens a searchable workspace picker, not a shell prompt.
- The picker can select Current directory, a registered workspace, or open an explicit path editor
  that validates through the CLI contract before it becomes selectable.
- The active workspace label and collapsed path replace the ambiguous caller-cwd footer identity.
- Direct and guided launch use the active workspace cwd by default. Guided Launch can select a
  different workspace through the same picker, never a free-form unvalidated path.
- Sessions continue to list all active tmux sessions. Their existing cwd is rendered and can be
  grouped or filtered by workspace in a follow-up panel pass; existing session cwd is immutable.

### Terminal-pane follow-up, deliberately deferred

The later question is not "how do we put `cd` in a text field?" It is whether a tmux-owned command
window should be a first-class ebrain session type. That requires a separately approved threat
model, process lifetime semantics, output scrubbing policy, environment inheritance rules, RAM
budget, keybinding conflict plan, session naming, and visual QA. ADR-006 records this as a future
discovery gate. It is not silently smuggled into the workspace program.

## Atomic Delivery Plan

### F7.0 -- Specification and state (this commit)

- Add this plan and ADR-006; reconcile TUI coverage and handoff state.
- Verify premises against reducer, renderer, session API, ADR-003, ADR-005, and the current 403-test
  TUI baseline.
- Gate: plan checked into git; no runtime behavior changes.

### F7.1 -- Responsive dialog foundation

- Add the pure responsive dialog layout primitive and semantic content descriptors.
- Migrate read-only and confirmation modal renderers without changing their side effects or
  confirmation keys. Rebuilt interactive overlays adopt it in their owning F7.2/F7.3 phases so
  selection and editor keys are never accidentally hijacked by generic scrolling.
- Add render-matrix and keyboard-scroll tests. Verify every migrated row exact-width and no
  explanatory string is silently clipped at supported terminal sizes.
- Gate: full TUI suite, `git diff --check`, zero-hex scan, real 80x24 and wide tmux captures.

### F7.2 -- Launch hierarchy and task setup

- Re-layout Launch as Manual Agents left/primary, Guided Launch upper-right, Task Setup lower-right;
  add compact stacking layout with explicit geometry tests.
- Reorder Launch focus/default selection; bind `r` to transient reset; retain direct post-launch
  transition to Sessions.
- Replace automatic primary signal classification with explicit category guide + optional prompt;
  preserve immutable prompt/workflow delivery and profile non-mutation.
- Correct singleton target/profile affordances and make all UI strings English.
- Gate: reducer/invariant tests for focus, reset, singleton/multi-choice navigation, prompt review,
  small layout, no accidental launch, and target/profile preview.

### F7.3 -- Workspace registry and picker

- Build the pure validation/storage service and `ebrain workspaces --json` contract with temp-dir
  tests: canonicalization, duplicate rejection, missing/not-directory rejection, client literal and
  symlink rejection, atomic persistence modes, and no credentials in schema.
- Add Launch workspace picker/editor and wire both direct and guided paths to the active workspace.
- Display workspace identity in footer and session context. Never mutate already-launched sessions.
- Gate: CLI + TUI suites; fake-agent tmux E2E launches two sessions in separate temporary workspaces
  and verifies each recorded cwd.

### F7.4 -- Entry-point and docs reconciliation

- Make bare `ebrain` start the TUI only when stdin/stdout are TTYs and `TERM` is usable; keep
  `ebrain ui`, help flags, and non-TTY no-argument help behavior compatible.
- Update root README quickstart, TUI README, runbook, CLI coverage, changelog, and human checklist.
- Gate: dispatcher tests for each invocation class plus the full suites.

### F7.5 -- QA, review, and handoff

- Run CLI and TUI suites independently, zero-hex, `git diff --check`, and secret-safety diff scan.
- Capture real tmux panes at 80x24, 100x30, and 160x48 for Manual Agents, Task Setup, Guided Launch,
  long confirmation, workspace picker, and both session-launch paths.
- Request a fresh-context external audit; checker verifies UI input ownership, dialog overflow,
  workspace isolation, bare-command compatibility, prompt privacy, argv construction, and tmux cwd.
- Commit each accepted subphase, record changes, store durable learnings, and update HANDOFF-BACK.

## Test Matrix and Completion Criteria

| Risk | Automated proof | Human QA proof |
|---|---|---|
| Dialog clipping | render every overlay with long content at 80x24/100x30/160x48, exact-width rows, scroll visibility | inspect tmux captures in a condensed and maximized terminal |
| Wrong launch target | reducer only dispatches launch from Manual Agents; guided path previews then requires `y` | launch one direct and one guided session |
| Misleading arrows | singleton fields display count/locked state; multi-item fixtures wrap correctly | verify visible affordance on a one-profile install |
| Task reset/data leakage | `r` clears transient task setup; reviewed prompt remains exact through confirmation | set, reset, set again, then inspect destination agent receives only latest task |
| Workspace escape | CLI realpath/deny tests, TUI uses validated IDs/cwds only | select two harmless directories and verify session cwd in tmux |
| Bare command regression | non-TTY help and `ebrain ui` alias tests | start from a normal terminal with `ebrain` |
| User-owned model policy | no best/rank/cost/subscription strings; Task Setup never writes profiles | inspect wizard preview and profile files only through supported UI/CLI behavior |

The program is complete only when every automated gate is green, visual captures show no clipping or
overlap, the external checker has reviewed the final diff, and the human daily-driver checklist
confirms that launching from two workspaces is frictionless.

## Stop Conditions and Escalations

- Stop implementation and surface the decision if the workspace registry would need to store
  environment variables, credentials, arbitrary commands, or client paths.
- Stop and re-scope if preserving every existing overlay requires an ANSI parser; use semantic
  descriptors instead.
- Stop after three no-progress failures in the same subphase; write the reproduction into the
  handoff rather than retrying blindly.
- Do not merge, push, deploy, delete user data, or change real provider configuration without
  Eduardo's explicit confirmation.

## Audit Scope

The independent checker should begin with these adversarial cases: one target/one profile versus
two; 80x24 long strings; overlay scroll; task reset after workflow attach; direct and target
launches across two temporary workspaces; a symlink resolving to a denied client path; a bare
non-TTY `ebrain` invocation; and prompt/credential absence from rendered frames and diffs.
