# Changelog

Notable changes to eBrain, newest first. Dates are the day the work landed on `main`.

Entries describe what changed for someone using eBrain: what became possible, what was wrong
before, and what boundary moved. Implementation detail lives in the commits.

━━━

## Unreleased (branch `integracion`) — `ebrain q` finds what `remember` saved on a clean install

- `ebrain q` searched every federated source except `default`, and a fresh install has only `default`: it answered
  "no eligible federated sources". Now `default` is searched when it is the only eligible source; next to named sources
  it is still left out (it duplicates them), and the client-isolation filter applies to it like any source. Verified from
  scratch in a throwaway `HOME`: `remember` then `q` returns the learning at once.
- Install-class commands (`ebrain`, the core and public installers, the hook wirers) now exit 2 when `HOME` is empty,
  unset or relative. Before, a wirer fell back to the passwd home and could write into the real one.

## Unreleased (branch `integracion`) — Ready to publish: README, site, installer and a clean tree

- README and `website/` describe what eBrain is now: memory that arrives with each prompt, the agents it is wired into and
  how each was verified, the measured numbers with their method, and what it does not do. The documentation navigation
  keeps only pages checked against the code; pages about frozen modules stay in the repository, out of the navigation.
- **Installer fix.** The pinned engine needs Bun 1.4.4 or newer, and `scripts/install.sh` used whatever Bun was on `PATH`,
  so a fresh machine stopped at "GBrain requires Bun 1.4.4". It now installs a private Bun for eBrain's own processes when
  needed (`EBRAIN_BUN_MIN` overrides the minimum, for tests).
- The repository carries no name of a private brain or a client: fixtures and default collection names are neutral
  (`nimbus`). Anything that relied on the old default collection names passes them explicitly.
- `THIRD_PARTY_NOTICES.md` now lists Bun, qmd and the hosted site's analytics packages, which it previously denied.

## Unreleased (branch `integracion`) — Agent adapters that are verified against what each agent reads

- **Security fix.** `ebrain harness doctor codex` reported ✓ while looking at `~/.codex/hooks/hooks.json`, a file Codex does
  not read, with snake_case keys it does not understand: Codex ran without the secret guard. The adapter now writes
  `~/.codex/hooks.json` in the documented envelope (`PreToolUse`, `SessionStart`, `UserPromptSubmit`, `Stop`), says the hooks
  must be approved in `/hooks`, warns about the old file, flags wired keys the agent never fires, and asks the agent itself
  (`codex features list`) whether hooks are enabled.
- New adapters: **Antigravity** (hooks group `ebrain` in `~/.gemini/config/hooks.json`) and **Hermes** (a `pre_tool_call`
  shell hook plus a memory-provider plugin; the verdict comes from `hermes hooks list`). Each ships guard and per-prompt
  context, and the doctor self-tests the guard with that agent's own payload shape.
- The guard now covers agents that read files without a shell (`view_file`, `read_file`, `grep_search`, `execute_code`) by
  translating each call into the shell read it performs and asking the one canon. The canon also knows `auth.json`,
  `oauth_creds*` and `.credentials.json`. Extra credential locations for read tools go in `~/.config/ebrain/guard-extra-paths`
  (one regex per line); shell is deliberately excluded, because loading a key at run time is the right use.
- The per-prompt context command is a documented contract (`docs/reference/prompt-context.md`), configured by
  `EBRAIN_CONTEXT_CMD` or `~/.config/ebrain/context-command`. The norms and the session-start text stop claiming the MCP is
  connected and describe what happens: memory arrives with each prompt, and `ebrain remember` enters the index at the next sync.

## Unreleased (branches `recorte` + `integracion`) — eBrain is a memory that arrives by itself, and nothing else

- Everything without measured use in October 2026 is frozen: the terminal cockpit, workspaces,
  sessions, targets, profiles and fleet; `providers`, `task-profile` and `advise`; `dream`; context packs, episodes, procedures, workflows
  and `memory recent`; and both federation sweeps. They are out of the README and `ebrain help`,
  and the dispatcher answers that they are frozen (exit 3). Nothing was deleted, and
  `EBRAIN_CONGELADOS=1` runs any of them. A bare `ebrain` prints help instead of opening the TUI.
- The norms stop claiming what does not happen: the MCP server is not assumed connected, and the
  session log is where each project's Stop hook writes it, not `.brain/sessions/`.
- Evidence for each decision: the "Frozen on 2026-11-02" section of the README.
- Merging with the v0.60 migration, what runs in production wins: `route`, `spend`, `routing` and `cost` are not frozen, because the
  engine launcher and the agent adapters call `ebrain route`.

## Unreleased (branch `migracion-gbrain-060`) — The engine moves to v0.60 with vectors, and spending has a ceiling

- The pinned engine is gbrain v0.60.556.0, which needs bun 1.4.4. A runtime installed at
  `~/.local/share/ebrain/bun` wins for eBrain's own processes and nothing else on the machine sees it.
- A one-line pointer, `~/.config/ebrain/engine-home`, lets the daemon run on a new store while the previous one stays
  intact as the way back. Doctor, spend and uninstall follow it, and no direct run of the new engine can reach and
  migrate the old store.
- `ebrain memoria` keeps the index fresh. The engine has no per-source exclusions, so each source is projected into a
  small local git repository (no remote) by rules in a private config: archives, retired documents, operational noise
  and denied material never reach it. A run does nothing when nothing changed. Embeddings have a per-run and a monthly
  cap, summed from the engine's own budget ledger; at the monthly cap keyword search keeps working.
- With a provider key in its environment the engine picks a chat model by itself and spends on it, uncapped. A pin in
  its config does not stop that; `GBRAIN_MODEL` naming a keyless provider does, and the daemon runs that way. `think`
  answers "no LLM available" and search is unaffected.
- With `ebrain memoria` configured, `ebrain remember` no longer writes to the daemon directly: in v0.60 a direct write
  claims the source for a managed writer and the engine then fences every sync of it. The learning stays on disk and
  enters with the next hourly sync, filtered and under the caps. Without that config the direct write stays, except
  for a learning that names a denied repo, which stays on disk only.
- `ebrain doctor` measures recall against the running daemon instead of inferring it from config and keys.
- The daemon advertises the memory verbs to agents (8 tools instead of 94); the CLI can still call every operation.
- A single dropped connection to the local daemon is retried once.
- `ebrain memoria` also keeps a qmd index of the same projected corpus, and writes `.rutas.json`: the allowlist that maps
  each indexed document to its real path. A prompt hook drops any result that is not there, so an archived, retired or
  denied document cannot be injected whatever an index returns.
- `cli/eval/hook.ts` runs the regression in hook mode: it measures the text a prompt really receives, not what an engine
  returns, and tells a result from a path merely cited inside a fragment.
- The daemon runs at normal priority: it now answers inside every prompt, under a deadline.

## Unreleased (branch `e1-regresion`) — A retrieval regression you can run before trusting a memory

- `cli/eval/validar.ts` checks a cases file (query, current path, retired paths) against the
  brain on disk: a retired path must really be retired (archive prefix, `status: superseded`,
  `superseded_by:` or a retirement banner), a current path must exist and be live, and no case may
  name a denied (client) repo. Live documents that still state retired doctrine are reported as
  unmarked drift.
- `cli/eval/runner.ts` runs those cases against `qmd`, the daemon's keyword `search` or its
  hybrid `query`, and reports recall@k of the current path, leakage of retired and of
  no-longer-existing paths, bytes returned, p95 latency and RAM. Paid engines get a spend ceiling
  computed before the first call; above `--max-usd` nothing is called.
- The cases themselves live in the private brain, never in this repo.
- Engines are a registry (`cli/eval/registro.ts`): `qmd search|query`, the daemon, and sandboxed
  servers driven over stdio MCP the way agents use them (GBrain upstream, Data Olympus through a
  driver that rebuilds its server's search stack, engram). Sandboxed servers never inherit provider
  keys, so no query leaves the machine.
- `cli/eval/tareas.ts` measures task cases: a real request needs several layers of context at once
  (canon, process, template, brand, voice, record, decisions), and the metric is how many of those
  layers reach the agent within a 10,000-character budget, plus retired-doctrine leakage.

## 2026-09-02 — Any provider, any agent CLI

The model provider stopped being a compile-time fact and became a value in `routing.yaml`, and
supporting another agent CLI stopped being a code change.

**Routing**

- `config/routing.default.yaml` ships, and `ebrain up` materializes it on a first run. A fresh
  clone previously could not route at all: the config had four readers and no writer, while
  `doctor` claimed `ebrain up` created it.
- The routing config is parsed against a schema instead of cast, on every read path, and a failure
  reports every problem at once with the YAML path of each. Before this, a typo in
  `budget.monthly_usd` produced a value that compares false against every number — a configured
  spend cap that silently enforced nothing.
- Fifteen providers ship as data, selectable by `provider.id`. An endpoint the registry has never
  heard of works too, given a base URL and the name of the environment variable holding its key.
- Failover means the same thing everywhere: eBrain uses a provider's own model-list failover where
  it exists, and walks the capability chain locally where it does not.
- Provider-specific request fields are omitted, with a note on stderr, when the selected provider is
  known not to understand them — rather than causing an opaque `400`, or being dropped in silence.
- Spend is recorded against the provider that served each call, so the monthly cap is measured
  against the right lane after a provider change.
- New: `ebrain providers list`, `ebrain providers show <id>`. Credentials are reported by presence,
  never by value.

**Adapters**

- An agent CLI is described by one manifest, and every surface that touches an agent reads it:
  onboarding, MCP registration, hook wiring, uninstall, and the fleet view.
- The manifest has a strict schema, so an unknown or misspelled key is refused rather than accepted
  into an adapter that then silently never launches. `ebrain adapters validate` also checks the
  cross-field cases a schema cannot: a directory name disagreeing with the declared agent, a
  command-registered adapter with no binary, an onboardable adapter with nowhere to write, and a
  hook wrapper bound to an event the agent does not expose.
- New: `ebrain adapters list`, `ebrain adapters show <agent>`, `ebrain adapters validate`.

**Security**

- The secret guard is wired into the agent's own runtime configuration at install time. It used to
  be written to disk with a message asking the user to add an entry by hand — a security control
  sitting inert, in a state indistinguishable from a working one after the first scroll.
- That write is additive (hooks that are not eBrain's are never touched), idempotent by path in
  every spelling a shell accepts (so repeat installs cannot accumulate duplicate invocations), keeps
  one pre-eBrain backup, writes *through* a symlink rather than replacing it, and reports an
  unparseable config instead of rewriting it.

## 2026-09-02 — Robustness at scale

The shared daemon had been down for forty days without anything noticing: an orphaned pidfile, five
registered agents pointed at a dead host, and a green `doctor`. One code path could start it, so
nothing else could observe it.

- `ebrain daemon` gained real supervision — process identity checked by name rather than a trusted
  PID, an atomic rename as the start lock, start-up validated against the daemon's own health
  endpoint, log rotation, `ensure`, and `install-service` for systemd and launchd.
- The MCP bridge retries, autostarts behind a cooldown, carries explicit deadlines, and distinguishes
  "the daemon is down" from "no results" — previously the same message.
- `ebrain uninstall` shows a removal plan before `--yes` applies it; the brain store is only touched
  with `--purge`.
- The MCP verdict read the adapter manifest rather than the agent's real configuration, so it was
  green on every machine, including ones where nothing was registered.
- Linux-first is stated in the README and by `doctor`. There is no macOS CI job, so there is no
  macOS support claim.

## 2026-08-10 — Onboarding and first-run experience

- First-run guidance in `ebrain up`, the installer, and the TUI: capture, recall, and the cockpit are
  taught rather than assumed.
- The animated demo is hosted at `/demo` on the documentation site, self-contained and
  persona-neutral, with a route-scoped content security policy.
- The build verifies its own output: expected pages exist, links resolve, and a set of patterns that
  must never reach a public page fails the build rather than shipping.

## 2026-08-09 — Memory out of the box

- An embedding-provider policy layer over the engine's existing recipes, with a keyword fallback when
  no embedding key is present, so a fresh install has working retrieval without configuration.
- Engine spend is folded into `ebrain spend` and `ebrain cost`.
- `doctor` claims semantic retrieval only once it is actually applied.

## 2026-08-09 — Runs on a machine that is not the author's

- Arbitrary checkout path, arbitrary `$HOME`, no `EBRAIN_HOME`, no prior state, the `C` locale, and a
  path containing a space — or it fails loudly instead of silently misbehaving.
- CI reproduces that environment, including a non-git tarball install, and plants a known offender to
  prove the hardcoded-path guard is not vacuous.

## 2026-07-20 — Public documentation site

- A static documentation site generated from an allowlisted public Markdown tree, with local search
  and no server adapter, served under hardened headers.

## Earlier

The pre-release history covers the shared memory daemon and its loopback authentication model, the
seven-view terminal cockpit, workspace-backed tmux sessions, governed memory layers, the deny-first
source isolation policy, and capability-based routing. See the roadmap for where those sit today.
