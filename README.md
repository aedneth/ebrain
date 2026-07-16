<div align="center">

# eBrain

### One permanent memory for every AI agent you run.

**eBrain is a unified agentic harness: it gives any AI coding agent — Claude Code, Codex, Gemini, Cursor, OpenCode — a single permanent memory they all share, and routes work across providers by capability under a hard cost cap. One brain. Every agent. Local-first.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Built with Bun](https://img.shields.io/badge/runtime-Bun-black.svg)](https://bun.sh)
[![Protocol: MCP](https://img.shields.io/badge/protocol-MCP-6E56CF.svg)](https://modelcontextprotocol.io)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

<!-- Post-publish: add CI + release + stars badges once the public repo slug is fixed. -->

</div>

> **Multi-agent terminals let you run several agents at once. eBrain adds the layer they leave out** — a single permanent memory every agent reads and writes over MCP, capability-based routing across providers, and built-in cost governance. Your agents don't just run in parallel; their context **compounds**.

<!-- DEMO: drop a 15-second terminal GIF or the TUI screenshot here — it should show `ebrain up`, two agents writing to one memory, and `ebrain q`. -->
<!-- ![eBrain in action](docs/media/demo.gif) -->

---

## The problem

Every AI coding agent starts from zero. You explain the same architecture to Claude Code, then again to Codex, then again tomorrow. Each terminal re-reads the same files, re-derives the same context, and forgets everything the moment it closes. Run several agents in parallel and the problem multiplies: N agents, N cold starts, N private silos, N ways to blow your API budget — and no shared understanding between any of them.

Context is the bottleneck of agentic development. Today it's rebuilt from scratch on every session.

## What eBrain does

eBrain turns that from N disconnected sessions into **one compounding system**:

- **🧠 Permanent, shared memory** — a single knowledge bus every agent reads and writes over the Model Context Protocol. What Codex learns, Claude Code remembers. What you captured last month, tonight's session recalls — with semantic search across all your sources.
- **🔀 Capability-based multi-provider routing** — describe the task; eBrain routes it to the provider/model *you* configured for that capability (coding, agentic, long-context, …), with native fallback and a **hard monthly spend cap**. You govern the model order; eBrain never invents a "best model" for you.
- **🔒 Local-first & isolated by design** — the memory lives on your machine. Agents connect over an authenticated loopback channel; secrets are scrubbed at the boundary; per-repo trust policy keeps client code walled off. No cloud account required to start.
- **🖥️ A cockpit, not a config file** — a terminal UI to launch agents into persistent workspaces, review what they're about to run, watch spend, and query memory — without babysitting six windows.

The result: a harness where permanent memory, multi-provider orchestration, and cost discipline are built in — the capabilities most multi-agent setups leave to you to wire together by hand.

---

## Quickstart (under 5 minutes)

**Prerequisites:** [Bun](https://bun.sh) · [tmux](https://github.com/tmux/tmux) · [`gh`](https://cli.github.com) · at least one agent CLI (`claude`, `codex`, `gemini`, `cursor`, or `opencode`).

```bash
# 1. Install (installs Bun if missing, pins the engine, links `ebrain` into your PATH)
curl -fsSL https://raw.githubusercontent.com/aedneth/ebrain/main/scripts/install.sh | sh

# 2. Bring the shared brain up and connect every agent you have — one command, idempotent
ebrain up
```

That's it. `ebrain up` starts the local memory daemon, mints and stores the connection token **for you** (you never see or paste a token), and registers the MCP endpoint into every agent CLI it detects. Now:

```bash
# Any agent can write to the shared memory…
ebrain remember "We route coding tasks to DeepSeek V4; agentic tasks to Kimi K2."

# …and any agent — or you — can recall it, semantically, across all sources:
ebrain q "how do we route coding tasks?"

# Open the cockpit:
ebrain ui

# Check everything is healthy:
ebrain doctor
```

Open Claude Code (or Codex, or Gemini) and the `ebrain` memory tools are already there. Two agents, one brain.

<details>
<summary><b>Install from source</b></summary>

```bash
git clone https://github.com/aedneth/ebrain.git ~/eBrain
cd ~/eBrain && bun install
./scripts/install.sh --from-source   # or add ~/eBrain/cli to your PATH
ebrain up
```
</details>

> **On embeddings:** semantic recall uses hosted embeddings (set an embeddings API key once). No key? eBrain falls back to a **zero-cost keyword search** automatically — capture and recall still work, you just trade semantic ranking for lexical until a key is present.

---

## How it works

```
  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
  │ Claude Code│   │   Codex    │   │   Gemini   │   │  Cursor …  │
  └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘
        │  MCP over authenticated loopback (127.0.0.1)     │
        └───────────────┬────────────────┬────────────────┘
                        ▼                 ▼
                ┌───────────────────────────────┐
                │        eBrain daemon           │  one owner of the
                │  permanent memory · knowledge  │  local writer lock
                │  federation · secret scrubbing │
                └───────────────┬───────────────┘
                                ▼
         ┌──────────────┬───────────────┬──────────────┐
         │ your notes   │ project docs  │ agent memory  │  federated
         │ (read-write) │ (read-only)   │ (shared)      │  sources, per-repo
         └──────────────┴───────────────┴──────────────┘  trust policy
```

- **One daemon owns the memory.** A single local host holds the database writer lock; every agent connects to it over MCP on loopback with a bearer token that eBrain mints and stores for you. No more cold, siloed, per-agent memory hacks.
- **Federation with trust policy.** Your sources (personal notes, company docs, per-project brains) are registered with a per-repo policy — read-write, read-only, or **deny**. Client code stays isolated: it is never federated, never crosses into memory, symlink-resolution included.
- **Routing as a governed layer.** A capability→model map you own (execution profiles) picks the provider for a task, with native fallback and a hard spend cap. Cost accounting is factual token/provider telemetry — eBrain reports what was actually spent, never an invented number and never a subscription estimate.
- **Sessions survive the UI.** Agents run in persistent tmux workspaces; the TUI is the control plane, not the process. Close the cockpit, the work keeps running.

The engine underneath is the open-source [gbrain](https://github.com/garrytan/gbrain) knowledge engine (vendored, MIT). eBrain is the harness, routing, isolation, onboarding, and cockpit that wrap it into a plug-and-play developer tool.

---

## Security & privacy

- **Local by default** — memory and daemon run on your machine, bound to `127.0.0.1`. Nothing leaves unless you configure a source that does.
- **You never handle the token** — the MCP bearer is minted, stored `600`, and injected for you; it is never printed to a log, prompt, or commit.
- **Secrets are scrubbed at the boundary** — dotenv/credential shapes are redacted before any snippet is stored or rendered.
- **Client code is walled off** — a deny-list keeps designated repositories out of memory and federation entirely, resolved through symlinks so an innocent-looking path can't smuggle them in.

See [`docs/GUARDRAILS.md`](docs/GUARDRAILS.md) and [`SECURITY.md`](SECURITY.md).

---

## Built with Codex & GPT-5.6

eBrain wasn't just built *for* agents — it was built *by* them, under a discipline it now enforces for its users: **maker ≠ checker**.

- **OpenAI Codex** was the primary maker/constructor — implementing the daemon, the CLI surface, the TUI, adapters, and routing across a spec-driven pipeline.
- **GPT-5.6** served as an independent auditor, re-running the full suites and live probes against each maker bundle and blocking the gate on evidence-backed findings, never on claims.
- A second checker (Claude) orchestrated the pipeline and audited high-risk changes before merge.

No agent self-approves its own high-risk work. Every phase leaves a trace — tests, a changelog entry, and a durable learning written back into eBrain's own memory. The tool dogfoods its own thesis: agents that share memory and hold each other accountable ship better software.

---

## Supported agents

| Agent | Onboarding | Notes |
|---|---|---|
| Claude Code | `ebrain onboard claude` | MCP over HTTP |
| Codex | `ebrain onboard codex` | env-indirected token |
| Gemini CLI | `ebrain onboard gemini` | MCP over HTTP |
| Cursor | `ebrain onboard cursor` | config merge |
| OpenCode | `ebrain onboard opencode` | MCP over HTTP |

`ebrain onboard --all` detects and connects everything installed.

---

## Roadmap

- [x] Shared memory daemon over authenticated loopback MCP
- [x] Multi-agent onboarding (`ebrain up` / `onboard`)
- [x] Capability-based routing with a hard spend cap
- [x] Terminal cockpit (sessions, memory, routing, doctor)
- [ ] One-command installer + CI release pipeline
- [ ] Pluggable embedding providers (hosted + local, zero-config fallback)
- [ ] Optional always-on autonomous runtime

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the living plan.

---

## Contributing

eBrain is open source and PRs are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Agent contributors follow the same norms the tool enforces: no secrets, isolated client repos, and a trace on every change ([`AGENTS.md`](AGENTS.md)).

## Acknowledgements

Built on the [gbrain](https://github.com/garrytan/gbrain) knowledge engine by Garry Tan (MIT). eBrain is the evolution of [CKIS](https://github.com/aedneth/ckis), an open-source knowledge operating system.

## License

[MIT](LICENSE) © Eduardo Borjas
