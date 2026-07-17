# ebrain TUI

Run `ebrain ui` from a terminal at least 80x24. The TUI is a control plane: sessions live
in tmux and the data views consume the same contract-tested ebrain CLI commands.

## Navigation

- `1`-`6`: Home, Sessions, Launch, Memory, Routing, Doctor.
- `Tab` / `Shift+Tab`: move focus between boxes in the current view.
- Arrow keys: move the focused selection. `Enter`: open or act on it.
- `/` or `Ctrl+P`: command palette. `?`: actions for the current view. `q`, `Ctrl+D`, or `Ctrl+C` twice: exit.

## Daily flows

- **Sessions (`2`):** `a`/Enter attaches, `k` asks before killing, and `p` opens a
  multiline prompt composer. `Alt+Enter` adds a line, Enter previews, and only `y` sends.
- **Launch (`3`):** three focused panels keep decisions separate: **task & signals**,
  **guided launch**, and **manual agents**. `Tab` moves between them. `t` describes a task
  and shows explainable signals; it never chooses an agent or model. Arrow keys select an
  agent only when **manual agents** is focused. `Enter` edits the task, opens the wizard, or
  launches the selected manual agent according to the focused panel.
- **First OpenRouter use:** the wizard offers to initialize a local execution profile from the
  existing ebrain routing. Only `y` writes it; no provider call or credential is stored. Then
  select target, profile, capability, and cwd in a centered modal before previewing the exact
  launch plan. `Tab` cycles fields, arrows choose values, and `c` edits the directory.
- **Memory (`4`):** `s` searches shared memory through `ebrain q --json`; `a` attaches a materialized workflow to Launch; `r` stores a durable learning.
- **Routing (`5`):** `c` switches to the factual token/USD ledger. It never allocates subscription cost.
- **Doctor (`6`):** `r` refreshes health checks.

Execution profiles are user-owned local model orderings with provenance. Task signals classify
text into capabilities only; they do not recommend a provider, benchmark winner, or model.

The centered footer keeps at most six `[key] action` controls visible. Use `?` for the full
action reference when a view has more actions than fit comfortably.

See `docs/TUI-CLI-COVERAGE.md` for the boundary between daily TUI controls and explicit CLI
administration commands.
