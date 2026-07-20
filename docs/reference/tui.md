# TUI Reference

Run `ebrain` in a real interactive terminal to open the eBrain cockpit. `ebrain ui` remains a compatible explicit alias. In non-interactive pipelines, bare `ebrain` prints help instead of starting alternate-screen UI state.

## Views

| View | Purpose |
| --- | --- |
| Home | Compact daemon, fleet, memory, and factual cost summary. |
| Launch | Manual agent launch and guided target/profile/capability/workspace preview. |
| Sessions | Live eBrain tmux sessions, scrubbed peek, attach, reviewed multiline prompt, and confirmed stop. |
| Workspaces | Registered validated directories, selected workspace, and derived live activity. |
| Memory | Learnings, bounded episode recall, context/procedure summaries, and workflow access. |
| Routing | Task signals, local profiles, declared targets, and token/provider telemetry context. |
| Doctor | Local health, onboarding, daemon, and isolation diagnostics. |

## Keyboard interaction

The global view bar exposes numbered view selection. Each panel renders its currently valid keys in the hint bar; unavailable actions remain disabled rather than accepting a key silently. `Tab` moves between visible boxes, arrows select within the focused control, `Enter` opens or confirms the focused action, and `Escape` cancels a modal or composer.

## Launch and session safeguards

Manual launch and guided launch remain separate. A session launch moves to Sessions automatically; the user does not need to hunt for the new process. Prompt composition is multiline and viewport-aware so every reachable draft row can be reviewed before send. Destructive stop and literal prompt send actions retain explicit confirmation.

## Layout behavior

At normal terminal widths, related panels share the screen with stable tracks. Compact layouts stack or simplify secondary context rather than overlapping text or changing the meaning of a control. The TUI is a control plane, not an arbitrary embedded shell. See [workspaces and sessions](../concepts/workspaces-sessions.md) for the boundary.
