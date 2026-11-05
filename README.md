<p align="center">
  <img src="assets/ebrain-wordmark.svg" alt="eBrain" width="255" height="50" />
</p>

<p align="center">Persistent memory for coding agents: the relevant context arrives with every prompt, in the agents you already use, and secrets stay out of the conversation.</p>

<p align="center">
  <a href="https://github.com/aedneth/ebrain/actions/workflows/ci.yml"><img src="https://github.com/aedneth/ebrain/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg" alt="License: AGPL-3.0-only" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun-black.svg" alt="Runtime: Bun" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/protocol-MCP-2dd4bf.svg" alt="Protocol: MCP" /></a>
</p>

<p align="center">
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

**Coding agents start from zero every session, and almost none of them ever asks a memory tool for anything. eBrain puts the relevant, current documents into each prompt through the hook every agent already has, and denies the reads that would send a credential to the model provider.**

In one month of real use (October 2026, 31 sessions), the memory tools registered in the agents were called 0 times, while context injected by a hook reached 20 of those sessions. Registering a tool makes it available; it does not make a model use it. eBrain is built around that observation, and measured by a retrieval regression and a canary instead of assumed.

## What you can do

| Outcome | How | Boundary that stays explicit |
| --- | --- | --- |
| Get the relevant memory into every prompt | The agent's prompt hook runs a *context command* you configure and hands its text to the agent as reference data with source paths. | eBrain ships the hooks, the guard, the index maintenance and the regression. It does not ship a retrieval command for your brain: [the contract](docs/reference/prompt-context.md) says what yours must do. |
| Keep secrets out of the conversation | One canonical guard denies reads of dotenv files, keys, credentials and agent login files, and dumps of the environment. A translator covers agents that read files with their own tools. | The guard fails open on an error of its own, so a broken guard never stops work; it says so when its canon or Bun is missing. |
| Know the wiring is real | `ebrain harness doctor <agent>` checks the file **the agent reads**, flags keys it never fires, flags stale files, self-tests the guard with that agent's own payload, and asks the agent where it can. | It cannot approve a hook for you: Codex runs a hook only after you approve it in `/hooks`. |
| Remember a decision | `ebrain remember "<learning>"` writes one scrubbed, self-contained learning. With the index configured it is searchable after the next sync (hourly). | A learning that names a denied repository stays on disk only. |

## Agents

| Agent | Per-prompt context | Guard | Verified how |
| --- | --- | --- | --- |
| Codex | `UserPromptSubmit` hook | `PreToolUse` on shell | Wiring and guard self-test in a throwaway `HOME`; `codex features list` shows hooks enabled. Not run live: needs approval in `/hooks`. |
| Antigravity | `PreInvocation` hook, first call of each request | `PreToolUse` on every tool, file tools translated | Wiring and guard self-test (shell, file tool, login file) in a throwaway `HOME`. |
| Hermes | memory provider, `prefetch()` each turn | `pre_tool_call` hook, file tools translated | Wiring in a throwaway `HOME`; `hermes hooks list` shows the guard; the provider returns a stub command's text. |
| Claude Code | owned by the project's own hooks | `PreToolUse` on shell | Guard self-test. |
| Gemini CLI, Cursor, OpenCode | declared | see manifest | **Not verified in this release.** |

Details and the rules for writing into a config eBrain does not own: [supported agents](docs/guides/agents.md).

## Five-minute proof

Platform: **Linux**. It is where eBrain is developed and tested, and the only platform claimed; macOS and WSL are untested. Requirements: git and curl. At least one supported agent CLI is needed to wire anything.

```bash
curl -fsSL https://raw.githubusercontent.com/aedneth/ebrain/main/scripts/install.sh | sh
ebrain doctor
```

The installer installs [Bun](https://bun.sh) if it is missing (and a private Bun 1.4.4 for eBrain's own processes if the one on your `PATH` is older than the pinned engine needs), pins the knowledge engine, links `ebrain` into `~/.local/bin`, and runs `ebrain up`. It never reads a dotenv, never prints a secret and never installs an agent for you. To read it first, clone the repository and run `./scripts/install.sh --from-source`.

This was run from scratch in a throwaway `HOME`, on another port, from a clone of the branch: about two and a half minutes, and `ebrain doctor` ended `OK` with 12 warnings (no provider key, adapters not wired, keyword-only recall). Then:

```bash
ebrain harness install codex
ebrain harness doctor codex      # ends with what is left for you to do, such as approving the hooks in /hooks
```

Two things from that run that you should know. `ebrain remember` wrote its learning and the write-through to the daemon succeeded, but `ebrain q` then answered `no eligible federated sources are available`: a clean install has no federated source yet, and the engine's `default` source is excluded on purpose. Register a source first ([memory](docs/concepts/memory.md)). And the hooks do nothing until you configure a context command ([quick start](docs/getting-started/quickstart.md)).

## Turn it off

- Memory in every agent, nothing else: `touch "${XDG_CONFIG_HOME:-$HOME/.config}/ebrain/sin-memoria-en-prompt"`.
- One agent: remove the `ebrain` entries from the hook file `ebrain harness install` wrote, or restore the `.ebrain-backup` kept next to it the first time.
- eBrain: `ebrain uninstall` prints the plan (MCP entries, launcher, service, config), `ebrain uninstall --yes` applies it, `--purge` also deletes the brain store. It does not edit agents' hook files.

## What was measured

Both measurements used one private brain and one retrieval command (hybrid vector and keyword search through the daemon, plus an exact-term index of the same corpus), so they show that the approach works, not that your brain will score the same. The cases and that command are not in this repository; the code that runs them is: `cli/eval/hook.ts` runs each case the way a hook runs it and measures the text a prompt really receives, not what an engine returns.

- **Regression, 44 cases** (a question, the current document, the retired documents that must not appear), run against the live daemon on 2026-11-04 with 5 s between queries and the machine loaded by other work. The current document was in the injected text in **72.7 %** of the cases, was a result of its own in **68.2 %**, and was injected with a fragment of itself in **52.3 %**. An earlier run the same day, with the daemon answering fewer of them in time, gave 65.9 %, 56.8 % and 47.7 %. **Zero** archived, retired, client or personal-vault documents were injected, in these runs and in 15 adversarial queries aimed at them. 13 of 409 injected fragments mention a client's name inside their text; the documents themselves were never from a client source.
- **Latency and size:** p50 2.2 s, p95 2.9 s, maximum 3.3 s; at most 9,458 characters per prompt. With the daemon stopped, qmd alone answers in about 0.3 s at p50 and recall drops to 45.5 %.
- **Canary** (a random word placed where only the hook can deliver it; Sonnet, no tools, one session at a time): with the hook **3 of 3**, without it **0 of 3**. Measured on 2026-11-04 and not re-run in this pass; three runs per variant is a smoke test, not a rate.
- **Spend:** about US$0.002 in embeddings for a full regression, against a US$0.10 ceiling.

## What it does not do

- It does not ship the retrieval command for your brain; without one configured, the prompt hooks do nothing.
- A clean install has nothing to search until you register a source.
- `think` and `synthesize` do not answer: the engine runs with no chat model on purpose, because with a provider key in its environment it picks one and spends uncapped. Search is unaffected.
- It does not approve hooks for you, and it does not verify Gemini CLI, Cursor or OpenCode in this release.
- It does not run on macOS or Windows as far as anyone has tested.
- It is not a hosted service: everything stays on your machine, and the daemon listens on loopback only.

## From CKIS to eBrain

eBrain grew out of [CKIS](https://github.com/aedneth/ckis), which organizes knowledge sources, authoring and graph tooling. eBrain is the runtime built on the next question: once that knowledge exists, how do several local coding agents retrieve it and retain new decisions? The relationship is deliberate rather than mandatory: a new developer needs no pre-existing vault. See the [CKIS relationship](docs/architecture/ckis.md) and [daemon and federation](docs/architecture/daemon-federation.md).

## Frozen on 2026-11-02

These modules had no measured use in October 2026 and their role is covered elsewhere, so they are out of this README and out of the command flow. Nothing was deleted: the code and its history stay, and `EBRAIN_CONGELADOS=1` still runs any of them. `route`, `spend`, `routing` and `cost` (the capped one-shot) are not frozen: the agent adapters in production call them.

| Frozen | Evidence |
| --- | --- |
| Terminal cockpit (`ebrain`, `ebrain ui`), workspaces, sessions, targets, profiles, fleet | No measurable use; last change 2026-09-02. |
| `providers`, `task-profile`, `advise` | No measured use. |
| `dream` | Never ran; it would spend on a model provider. |
| Context packs, episodes, procedures, workflows, `memory recent` | 64 episodes written and 0 read in October; they duplicated durable learnings. |
| `federate sessions` / `federate skills` | No sweep since 2026-07/09; agents load native skills. |

Reverting is removing a command from the `CONGELADOS` list in `cli/ebrain`.

## Security and privacy boundaries

eBrain is local-first, but local is not permission to index every local file or emit every local string into an agent prompt. The product boundary includes:

- an authenticated daemon bound to loopback, with a private local credential that is never printed into prompts or adapter configuration;
- explicit source registration and deny-first isolation: what names a denied repository does not reach the embedding provider, and a session inside such a repository receives no memory;
- a projected corpus and an allowlist, so an archived, retired or denied document cannot be injected whatever an index returns;
- a secret guard wired into each agent's own runtime configuration, added without disturbing hooks that are not eBrain's, recognised on repeat installs, backed up once before the first write, and reported rather than replaced when a config cannot be parsed;
- spend ceilings on embeddings, per run and per month; at the cap, keyword search keeps working.

Keep credentials out of prompts and source documents intended for indexing, review installed third-party tools, and follow your own incident process. Read [SECURITY.md](SECURITY.md) and the [privacy and isolation guide](docs/guides/privacy.md) before connecting additional sources.

## Documentation

Start at the [documentation root](docs/PUBLIC-DOCUMENTATION.md): [quick start](docs/getting-started/quickstart.md), [memory](docs/concepts/memory.md), [supported agents](docs/guides/agents.md), [the context command](docs/reference/prompt-context.md). The same pages build into a static site, locally with:

```bash
bun run website:build
```

The same documentation is published at **https://ebrain.vercel.app**. The build reads only the allowlisted public Markdown tree, and the site is static output with no server adapter, no provider calls, and no runtime credential requirement. The hosted copy adds first-party page-traffic and Core Web Vitals measurement, served same-origin under a `default-src 'self'` content security policy; a local build has neither.

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

Next: move the memory half of the context command into eBrain, so a clean install has a retrieval to run (it needs the 44-case regression and the canary re-run against the moved code); make a clean install able to find what it remembers; verify Gemini CLI, Cursor and OpenCode the way Codex, Antigravity and Hermes were.

## Acknowledgements

eBrain integrates the separately installed [gbrain](https://github.com/garrytan/gbrain) knowledge engine and extends lessons from [CKIS](https://github.com/aedneth/ckis). It also benefits from the open MCP ecosystem and the local coding-agent tools it can bridge. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency and licensing boundaries.

## License

eBrain-authored source is licensed under the [GNU AGPL v3.0 only](LICENSE).
