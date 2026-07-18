# TUI and CLI Coverage

The TUI is the daily control plane, not a second parser or an unrestricted shell. A capability
belongs in the TUI when it has a stable structured contract and benefits from repeated interactive
use. Administrative operations remain explicit CLI actions until they have an equally safe UI flow.

| CLI capability | TUI surface | Status |
|---|---|---|
| `status`, `fleet`, `doctor` | Home and Doctor | integrated |
| `sessions` | Sessions: list, peek, attach, prompt, kill | integrated |
| `q --json` | Memory: `s` search shared memory | integrated |
| `memory recent`, `remember` | Memory: browse and `r` | integrated |
| `workflows` | Memory: browse, materialize, attach | integrated |
| `routing`, `spend`, `cost` | Routing and Cost views | integrated |
| `task-profile`, `profiles`, `targets` | Launch: signals and user-governed wizard | integrated |
| `workspaces` | Launch workspace picker and validated cwd selection | planned F7; ADR-006 |
| `route` one-shot | Routing command and Launch workflow path | integrated where target declares it |
| `up`, `onboard`, `daemon` | installation and host lifecycle | CLI administration; not a daily TUI action |
| `harness`, `norms`, `federate` | installation, policy rendering and maintenance | CLI administration; future guarded palette actions |

`q` uses the daemon-backed cross-source fan-out and returns JSON only for the TUI boundary. The
TUI does not inspect sources, PGLite files, routing YAML, tokens, or credentials directly.

F7 keeps this boundary: its workspace registry will be a structured `--json` CLI contract before
the picker renders it. It is not an unrestricted internal shell; a terminal-pane product remains a
separate ADR and security/lifecycle decision.
