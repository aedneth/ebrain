<p align="center">
  <img src="assets/ebrain-wordmark.svg" alt="eBrain" width="255" height="50" />
</p>

<p align="center">Persistent, governed memory for local coding agents: the context reaches every agent through its own hooks, without leaking secrets.</p>

<p align="center">
  <a href="https://github.com/aedneth/ebrain/actions/workflows/ci.yml"><img src="https://github.com/aedneth/ebrain/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg" alt="License: AGPL-3.0-only" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun-black.svg" alt="Runtime: Bun" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/protocol-MCP-2dd4bf.svg" alt="Protocol: MCP" /></a>
</p>

<p align="center">
  <a href="https://ebrain.vercel.app/demo/">Live demo</a>
  &middot;
  <a href="https://github.com/aedneth/ebrain">GitHub</a>
  &middot;
  <a href="docs/PUBLIC-DOCUMENTATION.md">Documentation</a>
  &middot;
  <a href="CONTRIBUTING.md">Contributing</a>
  &middot;
  <a href="https://x.com/aedneth">X</a>
  &middot;
  <a href="https://www.linkedin.com/in/eduardo-borjas/">LinkedIn</a>
</p>

**Coding agents start from zero every session, and each one keeps its own context. eBrain gives them a single governed memory that outlives the session and crosses agents — on your own machine.**

eBrain gives local coding agents one shared, governed memory. It runs a single authenticated MCP daemon on loopback, onboards the supported agent CLIs, wires each agent's hooks so that context arrives without the model having to decide to look for it, and guards every agent against reading secrets into the conversation.

The scope is deliberately narrow. On 2026-11-02 the parts of eBrain with no measured use (the terminal cockpit, workspaces and sessions, the routing lane and its telemetry, dream, episodes, procedures and workflows, skill federation) were frozen: out of this README and out of the command flow, with their code and history intact. See [Frozen on 2026-11-02](#frozen-on-2026-11-02).

## Five-minute proof

Platform: **Linux**. That is where eBrain is developed, tested and run in CI, and it is the only platform claimed. It is written to degrade honestly elsewhere rather than pretend — the shell layer avoids GNU-only spellings and the daemon supervision has a launchd path — but macOS and WSL are untested, so treat them as unsupported until a CI job says otherwise. `ebrain doctor` reports the platform it is running on.

Requirements: git, tmux for persistent sessions, and at least one supported local agent CLI. [Bun](https://bun.sh) and the pinned upstream knowledge engine are installed for you; see [third-party notices](THIRD_PARTY_NOTICES.md) for the attribution boundary.

```bash
curl -fsSL https://raw.githubusercontent.com/aedneth/ebrain/main/scripts/install.sh | sh
```

That installs Bun if it is missing, pins the upstream engine, links `ebrain` onto your PATH, and boots the daemon. It is idempotent, so re-running it is how you update. It never reads a dotenv, never prints a secret, and never installs an agent CLI or calls a provider on your behalf. Prefer to see what you are running first — a reasonable thing to want from a `curl | sh` — then clone and run the same script with `--from-source`.

```bash
# Verify what the installer just did.
ebrain doctor

# Retain one reviewable decision, then retrieve it through approved sources.
ebrain remember "Review a database migration before merge."
ebrain q "what must happen before a database migration merges?"
```

The installer ends by running `ebrain up`, which owns local MCP credential creation before the daemon binds, starts the shared daemon, and attempts adapter onboarding. You do not paste a token, hand-manage a writer lock, or configure an OAuth flow to take this path. A missing local CLI remains visible as unavailable instead of being reported as connected.

## What you can do

| Outcome | eBrain behavior | Boundary that stays explicit |
| --- | --- | --- |
| Keep agents on one memory plane | One authenticated loopback MCP daemon owns the knowledge-engine writer path and bridges supported local CLIs. | Federation is opt-in; a clean install works with local memory alone. |
| Retain useful decisions without transcript dumping | A durable learning is one concise, scrubbed decision or fact with its provenance; the hook of each agent delivers what is relevant. | A terminal pane or prompt is not automatically memory. |
| Keep a local safety posture | Loopback-only MCP, secret-shaped input handling, source isolation, a secret guard in every agent, and confirmation gates. | These controls complement, not replace, a review of installed agent CLIs and local configuration. |

## Why one memory that arrives by itself

Coding agents rarely consult a memory on their own: registering a tool makes it available, it does not make the model use it. In October 2026, across 31 sessions, the eBrain MCP tools were called 0 times, while the context injected by a session hook reached 20 of those sessions. eBrain is built around that observation: one source of durable knowledge, delivered by the hook each agent already has, measured by a regression and a canary rather than assumed.

## One command, one daemon, many local agents

```text
supported local CLIs                eBrain control plane

Claude Code / Codex / Gemini  -->   command-only MCP bridge
Cursor / OpenCode / generic    -->   authenticated loopback daemon
                                        |
                                        +--> approved local knowledge sources
                                        +--> bounded memory and procedure metadata
                                        +--> per-agent hooks and secret guard
```

The daemon is the single local owner of the shared writer path. `ebrain up` is idempotent: it creates or reuses the private local credential before binding, starts the daemon, detects supported adapters, and runs bounded local checks. `ebrain onboard --all` can repeat adapter registration without exposing credential material.

```bash
ebrain up
ebrain onboard --all
ebrain daemon status
ebrain daemon install-service    # so it comes back after a reboot
```

A daemon started only by hand is a daemon that will eventually be down with every registered agent still pointed at it. `daemon status` identifies the running process rather than trusting a recorded PID, start-up is confirmed against the daemon's own health endpoint, and `install-service` hands supervision to systemd or launchd.

Each supported agent is described by a single adapter manifest, and every surface that touches an agent — onboarding, MCP registration, hook wiring, uninstall, the fleet view — reads that one file. Supporting another agent CLI is adding a manifest, which is validated against a strict schema:

```bash
ebrain adapters list
ebrain adapters validate
```

Read the [boot and onboarding guide](docs/getting-started/onboarding.md), [supported-agent guide](docs/guides/agents.md), and [MCP reference](docs/reference/mcp.md) for the operational contract.

## From CKIS to eBrain

eBrain grew out of [CKIS](https://github.com/aedneth/ckis), which organizes knowledge sources, authoring and graph tooling. eBrain is the runtime built on the next question: once that knowledge exists, how do several local coding agents retrieve it, retain new decisions, and work across projects without fighting over a lock?

The relationship is deliberate rather than mandatory. A new developer needs no pre-existing vault and no one else's procedures: start with local eBrain stores, add compatible sources once their boundaries are understood. See the [CKIS relationship](docs/architecture/ckis.md) and [daemon and federation architecture](docs/architecture/daemon-federation.md).

## Frozen on 2026-11-02

These modules had no measured use in October 2026 and their role is covered elsewhere, so they were taken out of this README and out of the command flow. Nothing was deleted: the code and its history stay in the repository, and `EBRAIN_CONGELADOS=1` still runs any of them.

| Frozen | Evidence |
| --- | --- |
| Terminal cockpit (`ebrain`, `ebrain ui`), workspaces, sessions, targets, profiles, fleet | No measurable use; last change 2026-09-02. Session command centres are evaluated separately. |
| Routing lane (`route`, `spend`, `routing`, `cost`, `providers`, `task-profile`, `advise`) | 1 call and 1 spend record in October. It is not memory. |
| `dream` | Never ran; it would spend on a model provider. |
| Context packs, episodes, procedures, workflows, `memory recent` | 64 episodes written and 0 read in October; no reads of the rest. They duplicated durable learnings. |
| `federate sessions` / `federate skills` | No sweep since 2026-07/09; the session sweep looked in the wrong place. Agents load native skills. |

The table above is the evidence; reverting is removing a command from the `CONGELADOS` list in `cli/ebrain`.

## Security and privacy boundaries

eBrain is local-first, but local is not permission to index every local file or emit every local string into an agent prompt. The product boundary includes:

- an authenticated daemon bound to loopback rather than a public network listener;
- private local credential storage that is never printed into prompts or adapter configuration;
- command-only adapter bridges instead of copied bearer material;
- explicit source registration and deny-first isolation checks;
- secret-shaped content handling at relevant memory, workflow, and display boundaries;
- a secret guard **wired into** the agent's own runtime configuration during installation rather than written to disk and left for a hand edit — added without disturbing hooks that are not eBrain's, recognised on repeat installs so it is never duplicated, backed up once before the first write, and reported rather than replaced when a config cannot be parsed;
- scrubbed, bounded session peek rather than raw terminal export; and
- confirmation gates for destructive session actions and reviewed prompt delivery.

Developers should still keep credentials out of prompts and source documents intended for indexing, review installed third-party tools, and follow their own incident process. Read [SECURITY.md](SECURITY.md) and the [privacy and isolation guide](docs/guides/privacy.md) before connecting additional sources.

## Documentation

The canonical public documentation is Markdown in this repository and powers a static documentation site. It is written for a clean installation first and separates available behavior, optional configuration, and planned work.

Start at the [documentation root](docs/PUBLIC-DOCUMENTATION.md) — [install](docs/getting-started/install.md) and [quick start](docs/getting-started/quickstart.md) to get running, [memory layers](docs/concepts/memory.md) and [daemon and federation](docs/architecture/daemon-federation.md) for the model, [privacy and isolation](docs/guides/privacy.md) and [troubleshooting](docs/guides/troubleshooting.md) to operate it.

The same documentation is published at **https://ebrain.vercel.app**. Build it locally with:

```bash
bun run website:build
```

The build reads only the allowlisted public Markdown tree, and the site is static output with no server adapter, no provider calls, and no runtime credential requirement. The hosted copy adds first-party page-traffic and Core Web Vitals measurement, served same-origin under a `default-src 'self'` content security policy; a local build has neither.

## Contributing

eBrain is built spec-first:

```text
context -> plan -> implementation -> focused verification -> independent review -> release approval
```

Small, testable changes are easier to review and safer for a tool that manages local agent context. High-risk work involving persistence, migrations, architecture, licensing, distribution, or release is reviewed by someone other than its author. Public output stays in English and must not include credentials, private paths, runtime memory, or customer material.

Before opening a pull request:

```bash
bun test ./cli/
bun test ./tui/test/
bun run website:build
```

Read [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), the [contributor workflow](docs/release/contributor-workflow.md), and the [open-source readiness guide](docs/release/open-source-readiness.md). Use the repository issue forms for reproducible bugs and outcome-oriented feature proposals; report vulnerabilities through the private path in [SECURITY.md](SECURITY.md).

## Roadmap direction

The current product focuses on one thing: durable context that reaches every supported agent by its own hooks, with a secret guard, verified by a retrieval regression and a per-agent canary. Earlier scope (workspace-backed sessions, user-owned routing choices, and factual token telemetry) is frozen, not deleted. Near-term work: per-prompt retrieval for each supported agent, and a doctor that measures delivery instead of presence.

Exploratory work such as an autonomous runtime, team memory, or native shell capability remains separate from the shipped control plane until its security and lifecycle contracts are proven.

## Acknowledgements

eBrain integrates the separately installed [gbrain](https://github.com/garrytan/gbrain) knowledge engine and extends lessons from [CKIS](https://github.com/aedneth/ckis). It also benefits from the open MCP ecosystem and the local coding-agent tools it can bridge. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency and licensing boundaries.

## License

eBrain-authored source is licensed under the [GNU AGPL v3.0 only](LICENSE).
