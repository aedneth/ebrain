# CLI Reference

Run `ebrain help` for the installed command surface. JSON output is available for many inspection
commands and is intended for the TUI and local automation, not as a promise of raw private data.

## Daily control plane

| Command | Purpose |
| --- | --- |
| `ebrain` | Open the TUI in a real interactive terminal |
| `ebrain up` | Start daemon, prepare local MCP access, and onboard detected agents |
| `ebrain doctor` | Check daemon, adapters, source isolation, and local contracts |
| `ebrain status --json` | Read a compact health snapshot |
| `ebrain fleet --json` | Inspect adapter health and RAM class |

## Memory and context

| Command | Boundary |
| --- | --- |
| `ebrain remember` | Write one durable learning through the approved local path |
| `ebrain q` | Search configured federated sources |
| `ebrain context` | List/get/update/propose/review explicit context packs |
| `ebrain episodes` | List, bounded recall, explicit bounded get, or approved record |
| `ebrain memory recent --json` | Read recent summaries without filesystem paths |

## Workspaces and sessions

| Command | Boundary |
| --- | --- |
| `ebrain workspaces` | List/add/rename/remove validated local directories |
| `ebrain sessions list` | Inspect active eBrain tmux sessions |
| `ebrain sessions peek` | Read a scrubbed bounded pane capture |
| `ebrain sessions send ... --yes` | Send a reviewed literal prompt after confirmation |
| `ebrain sessions kill ... --yes` | Stop one session after confirmation |

## Routing and costs

| Command | Boundary |
| --- | --- |
| `ebrain task-profile` | Explain task signals; never pick a model or agent |
| `ebrain profiles` | Manage user-selected execution profiles |
| `ebrain targets` | Inspect/preview/launch declared adapter targets |
| `ebrain routing --json` | Inspect configured capability chains |
| `ebrain cost --json` | Inspect factual token/provider attribution |
| `ebrain spend --json` | Inspect routed spend against the local cap |

## Workflows and procedures

`ebrain workflows` manages normalized local workflow records. `ebrain procedures` records explicit
use and reviewed lifecycle state. Neither command executes an arbitrary shell command or claims a
workflow was successful.

Mutating commands document a `--yes` confirmation boundary. Read `--help` before scripting one.
