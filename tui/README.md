# ebrain TUI

Run `ebrain ui` from a terminal at least 80x24. The TUI is a control plane: sessions live
in tmux and the data views consume the same contract-tested ebrain CLI commands.

## Navigation

- `1`-`6`: Home, Sessions, Launch, Memory, Routing, Doctor.
- `Tab` / `Shift+Tab`: move focus between boxes in the current view.
- Arrow keys: move the focused selection. `Enter`: open or act on it.
- `/` or `Ctrl+P`: command palette. `?`: help. `q`, `Ctrl+D`, or `Ctrl+C` twice: exit.

## Daily flows

- **Sessions (`2`):** `a`/Enter attaches, `k` asks before killing, and `p` opens a
  multiline prompt composer. `Alt+Enter` adds a line, Enter previews, and only `y` sends.
- **Launch (`3`):** `t` describes a task and shows explainable signals; it never chooses an
  agent or model. Arrow keys select a manual agent. `w` opens the OpenRouter wizard.
- **First OpenRouter use:** the wizard offers to initialize a local execution profile from the
  existing ebrain routing. Only `y` writes it; no provider call or credential is stored. Then
  select target, profile, capability, and cwd before previewing the exact launch plan.
- **Memory (`4`):** `a` attaches a materialized workflow to Launch; `r` stores a durable learning.
- **Routing (`5`):** `c` switches to the factual token/USD ledger. It never allocates subscription cost.
- **Doctor (`6`):** `r` refreshes health checks.

Execution profiles are user-owned local model orderings with provenance. Task signals classify
text into capabilities only; they do not recommend a provider, benchmark winner, or model.
