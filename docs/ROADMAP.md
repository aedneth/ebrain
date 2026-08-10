# eBrain Roadmap

A living plan. Dates are intentionally omitted — this reflects direction and sequencing, not
commitments.

## Shipped

- **Shared memory daemon** — one local host owns the database writer lock; every agent connects
  over authenticated loopback MCP. Solves the "MCP never loads" contention that killed per-agent
  memory.
- **Plug-and-play onboarding** — `ebrain up` starts the daemon, mints/stores the token for you,
  and registers the MCP endpoint into every detected agent CLI. `ebrain onboard --all`.
- **Capability-based routing** — a user-governed capability→model map with native fallback and a
  hard monthly spend cap. Factual token/provider cost telemetry.
- **Terminal cockpit (TUI)** — launch agents into persistent tmux workspaces, review before run,
  watch spend, and query memory from one window.
- **Isolation & secret hygiene** — per-repo trust policy, symlink-safe client-repo deny-list,
  boundary secret scrubbing, tokens never surfaced.

## Next

- **One-command installer + CI release pipeline** — `curl | sh` that installs Bun, pins the
  engine, links `ebrain`, and runs `ebrain up`; GitHub Actions gating every PR.
- **Pluggable embedding providers** — a policy layer over the engine's existing provider recipes
  (hosted and local), with a zero-config keyword fallback when no embedding key is present.
- **Richer review surface in the cockpit** — diff/preview of exactly what an agent will run,
  with workflow attribution in the cost ledger.

## Exploring

- **Optional always-on autonomous runtime** — a headless orchestrator that keeps the same memory
  and routing running 24/7.
- **Workflow → skill loop** — capture repeated agent workflows from memory and materialize them as
  reusable, shareable skills.
- **Team memory** — an opt-in shared brain across a small team, with the same trust policy and
  isolation guarantees.

Have a request? Open an issue or start a discussion.
