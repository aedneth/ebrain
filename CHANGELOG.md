# Changelog

Notable changes to eBrain, newest first. Dates are the day the work landed on `main`.

Entries describe what changed for someone using eBrain: what became possible, what was wrong
before, and what boundary moved. Implementation detail lives in the commits.

━━━

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
