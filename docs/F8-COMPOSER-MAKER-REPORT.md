# F8.0/F8.1 Maker Report: Sessions Multiline Composer

**Status:** maker complete; independent checker review pending. This report does not approve its own
change.

## Scope

F8.0 recorded the pre-change baseline. F8.1 replaces Sessions' clipped four-line prompt rendering
with an in-memory multiline editor. It does not alter session creation, tmux transport, memory
storage, telemetry, workspaces, routing, or cost data.

## Baseline

Before the edit, the following local gates passed:

- CLI suite: `229 pass / 0 fail`.
- TUI suite: passing before F8.1; it is `425 pass / 0 fail` after the new coverage.
- `bash -n cli/ebrain`, zero-hex scan outside `tui/src/theme.ts`, and `git diff --check` passed.
- The shared daemon was down. No daemon call, provider call, credential read, or external write was
  needed for this phase.

The prior F7 review packet is preserved. No uncommitted Fable report was found in `docs/`, so this
report does not relabel its independent-review status.

## F8.1 Contract

- Draft text, cursor, preferred visual column, and viewport anchor stay only in the modal state.
- Printable keys and bracketed pastes insert at the cursor. Carriage-return variants normalize to
  LF; non-printing control bytes are excluded.
- `Alt+Enter` inserts LF. Plain `Enter` opens the existing exact-payload review. Only `y` reaches
  the existing literal tmux send effect.
- Left/right/backspace/delete are Unicode surrogate-safe. Home/end stay on the current logical
  line. Up/down travel wrapped visual rows, retain a display-cell preferred column, and keep the
  cursor visible after every move.
- The dialog grows from one visual editor row to the available safe cap. Above that cap it presents
  a truthful visual-row range and follows the cursor. It never discards earlier draft text.
- Review, cancellation, empty-draft behavior, and the no-persistence boundary are unchanged.

## Evidence

- `tui/test/kit/composer.test.ts` covers exact row offsets, visual up/down navigation, logical
  Home/End, cursor-visible scroll, pasted LF content, and surrogate-safe deletion.
- `tui/test/sessions/panel.test.ts` covers the unmodified `y`-only exact send boundary plus frames
  at `80x24`, `100x30`, and `160x48`; each row remains exact terminal width and both ends of a long
  draft are reachable.
- A real `tmux` smoke used a temporary fake agent at `80x24`. It opened `p`, entered two lines via
  `Alt+Enter`, showed both lines and the caret, cancelled, exited the TUI, and removed both
  temporary tmux sessions.

## Checker Focus

- Reproduce cursor behavior across wrapped rows and logical newlines, including resize while the
  dialog is open.
- Confirm no draft reaches session state, logs, telemetry, workspace storage, or tmux before the
  `y` confirmation.
- Confirm every dialog row remains terminal-width exact at the three supported viewports and that
  terminal restoration still works after a raw-input exception/cancel path.
- Verify F8.2 begins from the existing strict workspace registry rather than adding a parallel
  directory or shell state store.
