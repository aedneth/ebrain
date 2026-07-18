# F8.2 Maker Report: Workspaces Cockpit

**Status:** maker complete; independent checker review pending. This report does not approve its
own change.

## Scope

F8.2 makes a multi-project workspace control surface available from the TUI without creating a
second directory store or an internal shell. It adds tab `4:workspaces`, moving Memory, Routing,
and Doctor to `5`, `6`, and `7`; it does not change session transport, agent launch argv, provider
routing, cost accounting, daemon state, or federation.

## User Contract

- At normal terminal widths, registered workspaces and live activity are the two upper panels;
  selected-workspace detail is full width beneath them. At the supported `80x24` minimum, those
  panels stack in the same priority order.
- The registry presents the validated current directory plus strictly registered directories.
  `Enter` selects a directory only for a future launch, and `g` hands the user to Launch. Direct
  and Guided Launch still consume that same selection and revalidate it immediately before launch.
- `a`, `e`, and `x` open explicit add, label-only rename, and remove-entry flows. Remove accepts
  only `y`; it never deletes a directory or an existing session.
- Live activity is a projection of current `sessions list --json` rows grouped by immutable tmux
  cwd. It contains active counts and, in selected detail, the most recent active-session creation
  timestamp. It does not create activity history. An unregistered cwd is visibly named as such;
  the valid caller directory is named `Current directory` without becoming a registered label.
- Sessions receive a workspace label only when their immutable cwd exactly equals a canonical
  registered directory. Renaming/removing a registry entry never changes stored session cwd.

## Boundary and Race Contract

- The sole persistent workspace source remains `ebrain workspaces`. The TUI invokes its
  `list`, `validate`, `add`, `rename`, and `remove` operations through structured argv and
  re-reads the strict store after every mutation. No optimistic registry is constructed in TUI
  state.
- An incrementing request generation prevents an older `list`/`validate` response from reopening
  a dismissed picker or overwriting a later workspace mutation.
- The cockpit stores no shell command, output, completion, environment, provider setting, token,
  prompt, or activity history. Shell integration remains the separate F8.3 discovery gate.

## Evidence

- `tui/test/workspaces.test.ts` covers live-only grouping, zero-count registered rows, latest
  creation time, compact/normal/wide exact-width geometry, split-versus-stack hierarchy,
  registry/activity handoff, y-only removal, responsive rename/remove dialogs, refresh, and
  immutable-cwd session labels.
- Contract tests cover the strict remove envelope and the TUI run layer uses only the existing
  workspace CLI boundary.
- A real temporary-registry tmux smoke launched bare `ebrain` in a safe temporary directory,
  added two temporary workspaces, opened tab `4`, and checked the `100x30` split plus `80x24`
  stack. It closed only its own tmux session; it did not alter the user registry.
- Final phase gates: CLI `229 pass / 0 fail`; TUI `433 pass / 0 fail`; `git diff --check` and
  dispatcher shell syntax clean; zero-hardcode scan clean for `tui/src` outside `theme.ts` and
  changed tests; secret-shaped diff scan clean. A broader test-directory ANSI scan correctly
  reports the pre-existing literal escape fixture in `tui/test/kit/draw.test.ts`; it is not a
  newly introduced UI color or a source hardcode.

## Checker Focus

- Reproduce stale `list`/`validate` responses around picker cancellation, add, rename, and remove.
- Verify every launch still revalidates the active directory and rejects literal/symlinked client
  directories before tmux creation.
- Confirm registry changes can relabel only live display rows, never mutate a session cwd or
  manufacture past activity.
- Inspect 80x24, 100x30, and 160x48 frames plus rename/remove dialogs for exact row widths,
  English text, and no clipped confirmation action.
- Confirm no shell runner, shell output capture, provider state, secret, or environment path was
  introduced under the workspace surface.
