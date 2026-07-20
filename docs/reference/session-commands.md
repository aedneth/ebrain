# Workspace and Session Commands Reference

A workspace is a validated directory identity. A session is a persistent local process started for
one workspace. Registering a workspace does not inspect its code, and listing sessions does not
attach to or modify them.

## Validate before registering

```bash
ebrain workspaces validate --cwd ./my-project --json
ebrain workspaces add --label "My project" --cwd ./my-project --yes
ebrain workspaces list --json
```

Validation checks that the directory is usable before it becomes a workspace choice. Adding or
removing a workspace changes only eBrain's local registry; it does not move, initialize, or upload
the project directory.

## Observe a session first

```bash
ebrain sessions list --json
ebrain sessions peek <session-name> --lines 40 --json
```

`peek` is a bounded, scrubbed pane capture intended for situational awareness. Use the TUI session
view or an explicit attach action when interactive terminal control is necessary.

## Explicitly send or stop

```bash
ebrain sessions send <session-name> "Run the focused test." --yes
ebrain sessions kill <session-name> --yes
```

Sending transmits exactly the reviewed literal prompt. Stopping terminates one persistent session.
Both require `--yes`; inspect the session name and current workspace before confirming.

Next: [workspace model](../concepts/workspaces-sessions.md), [manual launch](../launch/manual-launch.md),
and [sessions](../launch/sessions.md).
