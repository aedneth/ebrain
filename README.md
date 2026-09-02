<p align="center">
  <img src="assets/ebrain-wordmark.svg" alt="eBrain" width="255" height="50" />
</p>

<p align="center">A local-first control plane for persistent agent memory, workspaces, and coding sessions.</p>

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

[![The real eBrain cockpit — click to watch the animated demo](assets/ebrain-tui-demo.svg)](https://ebrain.vercel.app/demo/)

<p align="center"><a href="https://ebrain.vercel.app/demo/">Watch the animated demo</a> — the real cockpit and a cross-agent memory hand-off, rendered from the production renderer.</p>

**Coding agents start from zero every session, and each one keeps its own context. eBrain gives them a single governed memory that outlives the session and crosses agents — on your own machine.**

eBrain gives local coding agents a shared, governed memory layer and gives developers one terminal cockpit for the work around it. It starts a single authenticated MCP daemon on loopback, onboards supported local agent CLIs, launches persistent workspace-backed sessions, and records bounded memory and factual token telemetry without turning every transcript into context.

The result is a local control plane for work that otherwise gets scattered across agent terminals: decisions worth retaining, reusable procedures, validated project directories, active sessions, explicit routing choices, and the usage data that providers actually return.

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

# Open the terminal cockpit from any real interactive terminal.
ebrain
```

The installer ends by running `ebrain up`, which owns local MCP credential creation before the daemon binds, starts the shared daemon, and attempts adapter onboarding. You do not paste a token, hand-manage a writer lock, or configure an OAuth flow to take this path. A missing local CLI remains visible as unavailable instead of being reported as connected.

## What you can do

| Outcome | eBrain behavior | Boundary that stays explicit |
| --- | --- | --- |
| Keep agents on one memory plane | One authenticated loopback MCP daemon owns the knowledge-engine writer path and bridges supported local CLIs. | Federation is opt-in; a clean install works with local memory alone. |
| Retain useful decisions without transcript dumping | Durable learnings, context packs, scrubbed episodes, and procedures each have a separate lifecycle. | A terminal pane or prompt is not automatically memory. |
| Run work in the right project | Register validated directories and launch persistent tmux sessions from the selected workspace. | Existing sessions keep their original canonical working directory. |
| Start an agent with low friction | Manual launch starts the local agent you selected; a guided path previews a target, profile, capability, task, and workspace. | eBrain does not choose a universally best model or agent. |
| Reuse a process deliberately | Materialize a workflow as a prompt or checklist and track procedure use and human review. | Materialization never executes an arbitrary command or declares a run successful. |
| Understand provider usage | Group supplied token and usage data by provider, agent, model, session, or workflow when available. | eBrain does not report subscription charges as token usage or invent missing provider telemetry. |
| Keep a local safety posture | Loopback-only MCP, secret-shaped input handling, source isolation, confirmation gates, and scrubbed session peeks. | These controls complement, not replace, a review of installed agent CLIs and local configuration. |

## Why a shared local control plane

Coding agents are useful in isolated terminals, but the surrounding developer workflow is usually fragmented:

- one CLI has a useful decision that another CLI cannot retrieve;
- several processes can contend for an embedded knowledge writer;
- a session starts in whichever directory happened to be open;
- a useful workflow becomes an unsearchable chat message;
- provider dashboards expose incomplete or incomparable cost signals; and
- a routing suggestion can quietly become a claim that one model is always best.

eBrain is designed around the durable parts of that workflow. It makes the local daemon, memory boundaries, workspace identity, session lifecycle, model choice, and usage provenance visible to the developer. It does not replace the developer's judgment with an opaque recommendation engine.

## One command, one daemon, many local agents

```text
supported local CLIs                eBrain control plane

Claude Code / Codex / Gemini  -->   command-only MCP bridge
Cursor / OpenCode / generic    -->   authenticated loopback daemon
                                        |
                                        +--> approved local knowledge sources
                                        +--> bounded memory and procedure metadata
                                        +--> workspace-backed tmux sessions
                                        +--> terminal UI and structured CLI
```

The daemon is the single local owner of the shared writer path. `ebrain up` is idempotent: it creates or reuses the private local credential before binding, starts the daemon, detects supported adapters, and runs bounded local checks. `ebrain onboard --all` can repeat adapter registration without exposing credential material.

```bash
ebrain up
ebrain onboard --all
ebrain daemon status
ebrain daemon install-service    # so it comes back after a reboot
ebrain fleet --json
```

A daemon started only by hand is a daemon that will eventually be down with every registered agent still pointed at it. `daemon status` identifies the running process rather than trusting a recorded PID, start-up is confirmed against the daemon's own health endpoint, and `install-service` hands supervision to systemd or launchd.

Each supported agent is described by a single adapter manifest, and every surface that touches an agent — onboarding, MCP registration, hook wiring, uninstall, the fleet view — reads that one file. Supporting another agent CLI is adding a manifest, which is validated against a strict schema:

```bash
ebrain adapters list
ebrain adapters validate
```

Read the [boot and onboarding guide](docs/getting-started/onboarding.md), [supported-agent guide](docs/guides/agents.md), and [MCP reference](docs/reference/mcp.md) for the operational contract.

## Compound personal context

eBrain is not a claim that every past message should be injected into every future prompt. It is a way to compound context intentionally. Each layer has a source of truth, an explicit write path, and a retrieval boundary.

| Layer | What it keeps | How it becomes available |
| --- | --- | --- |
| Durable learning | A concise decision, preference, or operational fact worth reusing. | A developer or an approved agent action records it through the governed path. |
| Context pack | Stable operating guidance for an operator or workspace. | Human updates are versioned; proposals require explicit review before activation. |
| Episode | A scrubbed, immutable local summary for bounded recall. | It is intentionally recorded or mirrored after an approved durable learning. |
| Workflow and procedure | Reusable process content plus explicit-use and review metadata. | A workflow materializes a prompt or checklist; review controls lifecycle state. |
| Federated knowledge | Compatible sources the developer deliberately approves. | The daemon searches configured sources subject to local isolation policy. |

This gives agents a shared place to retrieve governed knowledge while preserving a developer's ability to inspect what was retained and why. It does not scrape conversations, train a model, mutate preferences, or turn raw terminal output into durable memory.

Explore the [memory model](docs/concepts/memory.md), [context packs](docs/memory/context-packs.md), [episodes](docs/memory/episodes.md), and [procedures and workflows](docs/memory/procedures-and-workflows.md).

## From CKIS to eBrain

eBrain grew out of [CKIS](https://github.com/aedneth/ckis), which organizes knowledge sources, authoring and graph tooling. eBrain is the runtime built on the next question: once that knowledge exists, how do several local coding agents retrieve it, retain new decisions, and work across projects without fighting over a lock?

The relationship is deliberate rather than mandatory. A new developer needs no pre-existing vault and no one else's procedures: start with local eBrain stores, add compatible sources once their boundaries are understood. See the [CKIS relationship](docs/architecture/ckis.md) and [daemon and federation architecture](docs/architecture/daemon-federation.md).

## Launch work where it belongs

eBrain treats a workspace as a validated directory identity, not an arbitrary shell payload. The workspace registry gives a developer a repeatable place to launch agents and inspect the sessions already working there.

```bash
ebrain workspaces list --json
ebrain sessions list --json
ebrain
```

Inside the TUI, the daily flow is intentionally direct:

1. Choose a registered workspace or register a validated local directory.
2. Open **Launch** and select a manual agent when you already know what to run.
3. Press Enter and eBrain creates a persistent tmux session in that workspace.
4. The cockpit switches to **Sessions** automatically so the new process is immediately visible.
5. Attach, inspect a scrubbed peek, compose a multiline prompt, or stop the session through the confirmed control path.

Manual and guided launch stay separate on purpose: manual starts the agent you already chose, guided previews a target, profile, capability, workspace and task before it creates anything. Neither recommends a provider or ranks models. See the [launch guide](docs/launch/manual-launch.md).

## Token and provider telemetry

eBrain makes a careful distinction between a provider choice, a routing budget, and observed usage.

- **Profiles and targets are user-owned.** A profile is a local provider/model map organized by capability. A target is an adapter declaration able to represent an explicit selection safely.
- **Task signals are orientation.** They explain a task's capability; they do not determine which model a developer should use.
- **The provider is configuration, not a compiled-in fact.** The routing lane makes one kind of outbound call, in OpenAI-compatible shape, and which endpoint receives it is a value in `routing.yaml`. Selecting a provider is setting an id; an endpoint the built-in registry has never heard of works as well, given a base URL and the **name** of the environment variable holding its key. `ebrain providers list` reports whether a key is present — never its value.
- **Fallback means the same thing everywhere.** Where a provider runs failover itself, eBrain uses it; where one does not, eBrain walks the capability chain locally, so a configured fallback is not an empty promise on most endpoints.
- **Spend follows the provider that served it.** Each routed call is attributed to its own provider and the monthly cap is measured against that lane, so changing providers does not measure new spend against an old total. The budget is validated on read: a malformed cap is an error naming the line, not a cap that silently stops applying.
- **All providers are optional.** A developer can configure one with models they chose, mix compatible providers, or launch a local CLI manually and use none of this.
- **Costs are factual when supplied.** The cost view groups known token and usage records by provider, agent, model, session, and workflow. It leaves unavailable data unavailable.
- **Subscription prices are out of scope.** A monthly plan or a price snapshot is not the same as tokens consumed by a model, so eBrain does not merge them into usage telemetry.

```bash
ebrain task-profile "Refactor a typed API client" --json
ebrain profiles list --json
ebrain targets list --json
ebrain routing --json
ebrain providers list
ebrain cost --json
ebrain spend --json
```

This design avoids stale benchmark theater. Model behavior, availability, and pricing change; the developer owns the profile, sees the declared route, and can inspect the usage returned for the work that actually ran. See [routing](docs/guides/routing.md), [model providers](docs/reference/providers.md), [profiles and targets](docs/routing/profiles-and-targets.md), and [token and provider telemetry](docs/concepts/costs.md).

## CLI and TUI at the same boundary

The terminal UI is a daily control surface, not a second product with different semantics. The same structured CLI operations back its state.

| Area | Daily CLI | TUI surface |
| --- | --- | --- |
| Health | `ebrain status --json`, `ebrain doctor` | Home and Doctor |
| Agent adapters | `ebrain onboard --all`, `ebrain fleet --json` | Home and Doctor |
| Memory | `ebrain remember`, `ebrain q`, `ebrain memory recent --json` | Memory |
| Context and procedures | `ebrain context`, `ebrain episodes`, `ebrain procedures`, `ebrain workflows` | Memory and Launch |
| Projects | `ebrain workspaces`, `ebrain sessions` | Workspaces and Sessions |
| Routing and usage | `ebrain task-profile`, `ebrain profiles`, `ebrain targets`, `ebrain providers`, `ebrain cost` | Launch and Routing |

The [CLI reference](docs/reference/cli.md) is the command index. JSON output is intended for local automation and the TUI; it is not a promise to expose raw private data, file paths, prompt bodies, or credential material.

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

The current product focuses on reliable local foundations: a shared daemon, supported-agent onboarding, governed memory layers, workspace-backed sessions, user-owned routing choices, and factual token telemetry. Near-term work continues to improve distribution, embedding-provider choice, and reviewed workflow reuse without weakening explicit approval and isolation boundaries.

Exploratory work such as an autonomous runtime, team memory, or native shell capability remains separate from the shipped control plane until its security and lifecycle contracts are proven.

## Acknowledgements

eBrain integrates the separately installed [gbrain](https://github.com/garrytan/gbrain) knowledge engine and extends lessons from [CKIS](https://github.com/aedneth/ckis). It also benefits from the open MCP ecosystem and the local coding-agent tools it can bridge. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency and licensing boundaries.

## License

eBrain-authored source is licensed under the [GNU AGPL v3.0 only](LICENSE).
