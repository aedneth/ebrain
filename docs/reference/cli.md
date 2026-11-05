# CLI Reference

Run `ebrain help` for the installed command surface. Commands frozen on 2026-11-02 answer that they are frozen and exit 3;
`EBRAIN_CONGELADOS=1` runs them (see the README).

| Command | Purpose |
| --- | --- |
| `ebrain up` | Start the daemon, prepare local MCP access, onboard detected agents |
| `ebrain doctor [--json]` | Check daemon, adapters, source isolation, the guard contract, spend |
| `ebrain status [--json]` | Compact health snapshot |
| `ebrain daemon <start\|stop\|status\|restart\|ensure>` | Control the shared local daemon |
| `ebrain daemon install-service` | Keep it running across reboots (systemd/launchd) |
| `ebrain remember "<learning>"` | Write one durable learning |
| `ebrain q "<question>"` | Search federated sources |
| `ebrain memoria <project\|sync\|status\|install-timer>` | Keep the memory index fresh under spend caps |
| `ebrain harness install <agent>` | Wire an agent's hooks into the file it reads; `--all` for every adapter |
| `ebrain harness doctor [agent]` | Verify one agent, or the whole fleet |
| `ebrain harness status` | Harness fleet status |
| `ebrain adapters <list\|show\|validate>` | Inspect and validate agent manifests |
| `ebrain norms render <file>` | Render the managed norms block into an instructions file |
| `ebrain onboard [--all\|agent]` | Register the MCP bridge with detected agents |
| `ebrain embedder status\|migrate` | Show or switch the embedder (migrate previews its cost first) |
| `ebrain route --cap <cap> "<prompt>"` | One routed, capped one-shot; `spend`, `routing` and `cost` report it |
| `ebrain uninstall [--yes] [--purge]` | Print the removal plan; `--yes` applies it |

Mutating commands document a `--yes` confirmation boundary. Read `--help` before scripting one.
