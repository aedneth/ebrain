# First Workspace and Session

Workspaces are validated local directory identities. They let Launch and Sessions refer to the same
project without treating arbitrary shell input as configuration.

```bash
ebrain workspaces add --label "demo-app" --cwd "$PWD" --yes
ebrain workspaces list --json
ebrain
```

In the TUI, open Workspaces, select the registered directory, then open Launch. Manual agent launch
starts a persistent tmux session in the selected workspace. Guided launch additionally asks for a
declared target, an execution profile you control, a capability, and a workspace before previewing
the launch plan.

The TUI is a control plane. Closing it does not stop a launched session. Session prompt sends and
destructive actions require explicit confirmation. See [workspaces and sessions](../concepts/workspaces-sessions.md).
