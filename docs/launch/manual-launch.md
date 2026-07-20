# Manual Launch

Manual launch is the shortest path when you already know which local agent CLI should work in a
project. It creates a persistent eBrain-managed tmux session in a selected validated workspace.

## Before launch

1. Register or select a workspace in the Workspaces view.
2. Open Launch in the TUI.
3. Select one visible manual agent.
4. Review the selected workspace and press Enter to create the session.

If a task was entered, it is delivered only through the reviewed prompt path. The launch does not
silently change a guided profile, invent a model choice, or turn a terminal pane into memory.

## Workspace is part of launch

A workspace is a validated local directory identity, not a free-form shell field. The selected
workspace becomes the session's working directory. Existing sessions keep their own canonical
working directory even if the later UI selection changes.

```bash
ebrain workspaces list --json
ebrain sessions list --json
```

Use the CLI to inspect the same structured state that backs the cockpit. Do not pass arbitrary
commands or environment payloads as workspace configuration.

## RAM confirmation

Agents are classified as light or heavy for local launch governance. Starting another heavy agent
can require confirmation when the laptop is already busy or available memory is low. This is a
transparent safeguard, not a scheduler that declares one provider best.

## After launch

Launch switches the TUI to Sessions so the new process is immediately observable. Closing the TUI
does not stop it. Use [sessions](sessions.md) to inspect, attach, send a confirmed prompt, or stop
the process.

## What manual launch does not do

- It does not choose a provider/model for you.
- It does not accept an arbitrary shell command.
- It does not persist prompt text as memory.
- It does not change a selected guided-launch profile.

Use [guided launch](guided-launch.md) when you need a declared target and user-owned execution
profile.
