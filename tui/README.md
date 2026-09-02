# ebrain TUI

Run `ebrain` from a terminal at least 80x24. `ebrain ui` remains a compatible explicit alias.
The TUI is a control plane: sessions live
in tmux and the data views consume the same contract-tested ebrain CLI commands.

## Navigation

- `1`-`7`: Home, Launch, Sessions, Workspaces, Memory, Routing, Doctor. On an 80-column
  terminal the tab bar tightens its spacing so every view label stays whole.
- `Tab` / `Shift+Tab`: move focus between boxes in the current view.
- Arrow keys: move the focused selection. `Enter`: open or act on it.
- `/` or `Ctrl+P`: command palette. `?`: actions for the current view. `q`, `Ctrl+D`, or `Ctrl+C` twice: exit.

## Daily flows

- **Launch (`2`):** Manual Agents is the default, primary decision. On wide terminals it occupies
  the large left region; on 80x24 it is the first complete panel. Arrow keys select a manual
  agent and Enter starts that local session in the selected workspace. `[g] workspace` opens a
  searchable picker for the validated caller directory and registered workspaces; `a` opens an
  explicit directory-and-label form. A workspace is only a local canonical directory, never a
  command, environment, or terminal pane. Guided Launch and Task Setup
  are separate focused panels, so configuration never starts an agent by accident. `Tab` follows
  Manual Agents, Guided Launch, then Task Setup.
- **Task Setup:** `t`, or Enter on Task Setup, opens a category guide for Coding, Agentic systems,
  Web design, Long-context research, Terminal automation, or General. Choose a type, then add an
  optional exact task prompt. This is a reversible capability preset: it never creates or changes
  an execution profile, provider, or model. `r` clears the transient type, prompt, workflow
  attribution, and any stale guided preview.
- **Guided Launch:** `w`, or Enter on Guided Launch, opens a centered target/profile/capability/
  workspace review. Fields report their available count; a singleton is explicitly locked, while
  arrows change only fields with alternatives. `c`, or Enter on the workspace field, reuses the
  validated workspace picker. Enter previews then reviews the exact launch, and only `y` confirms
  it. Existing sessions keep their original directory when a later workspace is selected.
- **Sessions (`3`):** `a`/Enter attaches, `k` asks before killing, and `p` opens a
  multiline prompt composer. `Alt+Enter` adds a line, Enter previews, and only `y` sends.
- **First OpenRouter use:** the wizard offers to initialize a local execution profile from the
  existing ebrain routing. Only `y` writes it; no provider call or credential is stored. Then
  select target, profile, capability, and workspace in a centered modal before previewing the
  exact launch plan. `Tab` cycles fields, arrows choose values, and `c` opens the picker.
- **Memory (`5`):** `s` searches shared memory through `ebrain q --json`; `a` attaches a materialized workflow to Launch; `r` stores a durable learning.
- **Routing (`6`):** `c` switches to the factual token/USD ledger. It never allocates subscription cost.
- **Doctor (`7`):** `r` refreshes health checks.

Execution profiles are user-owned local model orderings with provenance. Task Setup provides a
user-selected capability preset only; it does not recommend a provider, benchmark winner, or model.

The centered footer keeps at most six `[key] action` controls visible. Use `?` for the full
action reference when a view has more actions than fit comfortably.

See `docs/TUI-CLI-COVERAGE.md` for the boundary between daily TUI controls and explicit CLI
administration commands.
