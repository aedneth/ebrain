# Workspaces and Sessions

A workspace is a generated ID, display label, and canonical local directory. The registry validates
the directory on read and launch, rejects invalid records, and keeps selection separate from a shell
command or environment payload.

A session is a persistent tmux process named by eBrain's session convention. It has an agent,
workspace-derived working directory, and live state. The TUI can inspect a scrubbed view, attach,
compose a prompt, or request a confirmed stop.

## Safety model

- Directory validation resolves symlinks before a workspace is accepted.
- Session creation revalidates the selected directory.
- Prompt delivery is literal and confirmation-gated.
- The TUI never implements an arbitrary command evaluator or stores terminal output as memory.
- RAM governance can ask for confirmation before another heavy agent starts.

The proposed native workspace shell remains planned architecture, not an embedded terminal feature.
