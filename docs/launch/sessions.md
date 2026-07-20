# Sessions

An eBrain session is a persistent tmux process with an agent, generated session name, and validated workspace-derived working directory. The TUI controls it without becoming a general-purpose terminal emulator or a durable transcript store.

## Inspect and attach

```bash
ebrain sessions list --json
ebrain sessions peek <session-name> --lines 20 --json
```

The list reports active eBrain-managed sessions. `peek` returns a bounded, scrubbed pane capture so the control surface can show live progress without exposing raw secret-shaped terminal material. Attach uses tmux's native attach/switch behavior and does not nest a second multiplexer.

## Send a prompt deliberately

```bash
ebrain sessions send <session-name> "Review the current migration plan." --yes --json
```

Prompt delivery is literal and requires `--yes` outside the TUI. In the TUI, a multiline composer keeps the full draft visible, supports explicit review, and sends only after confirmation. Prompt text is not added to durable memory merely because it was sent.

## Stop a session deliberately

```bash
ebrain sessions kill <session-name> --yes --json
```

Stopping a session is a confirmed destructive action. It stops the tmux process; it does not delete the workspace, erase durable memory, or mutate a workflow record.

## Safety boundaries

- Workspace paths are revalidated before session creation.
- Denied local sources and unsafe path changes fail closed.
- The UI does not evaluate arbitrary shell input.
- Pane capture is throttled and scrubbed rather than stored as a memory transcript.

For workspace registration, read [first workspace and session](../getting-started/workspace-session.md).
