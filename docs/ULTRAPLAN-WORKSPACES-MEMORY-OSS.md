---
type: product-program
project: ebrain
program: F8-F11 -- Workspace cockpit, agentic memory consolidation, and OSS readiness
status: proposed
created: 2026-07-18
owners: [Eduardo, Codex-maker, Opus-checker]
related: [SPRINT-TUI.md, ULTRAPLAN-LAUNCH-WORKSPACES.md, adr/ADR-006-workspace-first-control-plane.md, WORKFLOW-LEARNING-LOOP.md, COST-LEDGER.md]
---

# ULTRAPLAN -- Workspace Cockpit, Memory Consolidation, and OSS Readiness

## Product outcome

eBrain must feel like one local developer cockpit, not a collection of CLI commands. A developer
opens `ebrain`, sees the projects they work in, chooses a safe workspace, launches or attaches to
agents, writes a complete prompt without losing sight of it, and understands what shared memory
retained and what procedure can be reused.

The system remains a control plane: tmux owns durable agent and shell processes; the daemon owns
the shared-memory writer lock; the TUI renders structured CLI contracts and explicit effects; a
workspace is a validated directory identity, never a command, environment, credential, or hidden
agent configuration; the user owns provider, model, profile, and memory-promotion choices.

This program ships, in order: a complete prompt editor, a workspace cockpit, a governed
agent-memory layer, and public documentation/release readiness. It does not alter federated source
policy without a separate ADR and audit.

## Premise corrections and non-goals

### Verified current state

1. Sessions preserves multiline pasted text and exact send bytes, but its overlay renders only the
   last four logical lines. This is a visibility defect, not a transport defect.
2. F7 validates workspace paths with `realpath`, rejects literal and symlinked client paths,
   snapshots cwd before launch, and keeps existing session cwd immutable. It is the base, not a
   second directory model to replace.
3. `agent-memory` is a private personal data repository with Markdown learnings and sessions, not
   an installable product dependency. Its README describes the pre-daemon flow; current `remember`
   also uses daemon MCP write-through for searchable learnings.
4. eBrain already retains explicit durable learnings, session summaries, federated recall, workflow
   records, and approved skills. It intentionally does not ingest every raw agent turn.
5. Hermes is a reference, not an architecture to copy. Its upstream provider manager, bounded
   asynchronous sync/prefetch, episodic recall, and procedural skills are useful ideas; eBrain
   retains its daemon, isolation, tmux data plane, and approval gates.

### Explicit non-goals

- No in-process terminal emulator, shell evaluator, arbitrary command text box, or command-output
  archive in the TUI.
- No automatic best-model/provider selection or autonomous overwrite of preferences, workflows,
  or skills.
- No raw terminal transcript ingestion by default.
- No inclusion of Eduardo's private `agent-memory`, CKIS vault data, or client names in public
  distribution.
- No push, public visibility change, tag, Vercel deployment, or release without explicit approval.

## Information architecture decision

The cockpit navigation becomes:

```text
1:home  2:launch  3:sessions  4:workspaces  5:memory  6:routing  7:doctor
```

Launch remains tab 2 and keeps its automatic post-launch transition to Sessions. Workspaces follows
Sessions because it manages the project identity both views consume. Numeric documentation,
snapshots, help, and command-palette labels change together; stale numeric hints are a regression.

The Workspaces view has three non-nested panels at normal widths:

```text
registered workspaces                 active session activity
selected workspace detail and actions (full width)
```

- **Registered workspaces:** primary left list for current and validated registered directories,
  selection, add, rename, remove, and use-for-next-launch.
- **Active session activity:** real `sessions list --json` data grouped by canonical cwd. It shows
  active counts and the selected detail shows latest creation time; it never invents historic
  activity after tmux exit.
- **Selected workspace detail:** safe label, canonical directory, selection state, and matching
  immutable sessions. It hands off visibly to Launch and later to a native shell attach action.

At 80x24 panels stack in that priority order. The footer keeps no more than six centered
`[key] action` hints and `?` reveals the complete action reference. All visible text is English.

## F8 -- Complete Composer and Workspace Cockpit

### F8.0 -- Baseline and gate reconciliation

**Goal:** record a clean, auditable baseline without relabeling previous work incorrectly.

- Preserve F7 and its review packet. If the later Fable result referenced by Eduardo has a report,
  commit/reference it before changing F7 status; otherwise the historic pending status stays honest.
- Capture current suite counts, shell syntax, zero-hex, and real 80x24/100x30/160x48 frames.
- Define F8's test matrix before editing shared layout code: keyboard behavior, dynamic geometry,
  workspace isolation, async-dismissal races, non-TTY behavior, and prompt privacy.

**Verify:** baseline evidence in the handoff; no runtime behavior changes.

### F8.1 -- Sessions full multiline editor

**Goal:** a prompt editor legible and controllable like a terminal coding-agent editor, retaining
exact-byte confirmation and privacy.

**Engine first:** replace the alias-to-single-line composer state with a pure multiline model. It
keeps only draft text, cursor position, derived wrapped rows, and a scroll anchor in memory. It
never writes a draft to session logs, telemetry, workspace state, cost records, or history.

**Interaction contract:**

- Printable input and bracketed paste insert at the cursor and preserve newlines.
- `alt+enter` inserts a newline; `enter` opens exact-prompt review; only `y` sends.
- Left/right cross code points and logical boundaries. Up/down traverse visual rows while keeping a
  preferred column. Home/end operate on the current logical line.
- Standard terminal editing shortcuts are added only when parser support is portable and tested; UI
  never advertises a key it cannot observe.
- The dialog grows with wrapped content to a viewport-safe cap, then scrolls while keeping the
  cursor visible. Earlier text is never silently hidden.
- Review renders complete exact payload with responsive scrolling. Cancel returns to the unchanged
  editor; empty text closes without sending.

Reserve chrome rows before deriving editor height. Long unbroken values must wrap or viewport-scroll
without ANSI-width errors. Minimum terminal support remains 80x24.

**Verify:** pure editor and cursor invariants, paste, short-to-tall growth, auto-scroll,
80x24/100x30/160x48 frames, exact payload send, cancel, `y`-only confirmation, no-persistence
search, and a real tmux capture of a long prompt before and after scrolling.

### F8.2 -- Workspaces tab and universal workspace handoff

**Goal:** one cockpit organizes several projects without multiple eBrain instances.

**Status (2026-07-18):** maker complete; independent checker review pending. Implementation and
evidence are in `docs/F8-WORKSPACES-MAKER-REPORT.md`.

- Add the tab and layout above using only contract-tested `workspaces` and `sessions` CLI data.
- Reuse the existing validated registry. Add/rename/remove use structured argv, re-read the strict
  store, and require removal confirmation.
- Let Workspaces select the directory for the next launch; Manual Agents and Guided Launch render
  exactly the same canonical selection.
- Keep launch-time revalidation. A changed, missing, or newly-denied path fails before governor and
  tmux creation.
- Sessions show a workspace label only when their immutable cwd matches a registered canonical
  directory. Registry changes never alter recorded session cwd.
- Do not persist shell state, output, commands, provider settings, or environment data. Activity is
  derived from tmux state.

**Verify:** strict-store tests, add/rename/remove confirmation, direct/guided handoff, two safe temp
directories, literal/symlink client denial, stale async picker dismissal, cwd grouping, compact and
wide visual captures.

### F8.3 -- Native shell integration discovery gate

**Goal:** deliver normal `cd`, completion, and multi-project terminals without an unsafe emulator.

**Status (2026-07-18):** discovery complete as a proposed decision in
`adr/ADR-007-tmux-owned-workspace-shells.md`; implementation is intentionally blocked on its
independent security review.

ADR-007 is required before implementation. The proposed design is a tmux-owned shell per validated
workspace:

- `ebrain shells open <workspace-id>` resolves the registry identity, creates/reuses a named tmux
  shell session at the canonical cwd, then uses the existing attach handoff.
- The user's login shell supplies completion, aliases, and history. eBrain does not implement or
  inspect completion.
- Shells are distinct from agent sessions. eBrain captures no shell output into memory and exposes
  no `send-keys` or arbitrary command runner from the TUI.
- Invocation uses structured tmux argv, an allow-listed shell executable, cwd revalidation, explicit
  lifecycle rules, and no injected eBrain secrets beyond normal user shell setup.

ADR-007 must specify identity, reuse, environment inheritance, attach/detach, client isolation,
output retention, RAM, and threat model. Opus independently reviews this execution boundary.

## F9 -- Governed Agentic Memory Consolidation

### Product mental model

| Layer | Contains | Entry | Retrieval | Governance |
| --- | --- | --- | --- | --- |
| Operating context | Stable user/workspace instructions and preferences | Human edit or reviewed proposal | Explicit bounded context retrieval | Versioned, size-limited, no silent writes |
| Episodes | Scrubbed summaries and durable learnings | Hooks plus `remember` | Search on demand | Provenance, isolation, retention |
| Federated knowledge | Approved Markdown/code sources | Explicit registration | Daemon semantic/keyword retrieval | Existing default-deny policy |
| Procedures | Workflows and skills | Ingest, capture proposal, approval | Prompt/checklist or MCP skill lookup | `--yes`, lifecycle review |

CKIS is authoring and infrastructure: git, backup, vault, Dev Brain, and graph tooling. eBrain
productizes the multi-agent runtime above it: daemon, MCP adapters, workspaces, sessions, workflows,
routing, cost telemetry, and TUI. A clean install works with local agent memory only; CKIS federation
is optional and explicit.

### F9.0 -- Memory contracts and ADR

Write ADR-008 before engine work. It defines schemas, source-of-truth locations, retention,
provenance, redaction, MCP exposure, migration, and daemon-down behavior. It answers:

**Status (2026-07-18):** complete in `adr/ADR-008-governed-agent-memory.md`. The metadata-only
private `agent-memory` audit is recorded there; it did not read or import repository content.

- Which context packs are human-owned and which writes are proposals only?
- What event creates an episode, and why raw terminal output is excluded?
- How does retrieval avoid prompt injection and unbounded system-prompt growth?
- How do procedures move `active -> stale -> archived`, revive, and measure use without retaining
  prompts or inventing a success signal?
- What legacy data can migrate as scrubbed local records without importing Eduardo's private repo?

Baseline: no automatic preference mutation, no default LLM dialectic cost, no external provider, and
no autonomous skill creation. Hermes' bounded async and provider-conflict lessons are references,
not dependencies.

### F9.1 -- Context packs and reviewed learning proposals

**Status (2026-07-18):** implementation complete; independent checker review pending. The maker
evidence is in `F9-CONTEXT-MAKER-REPORT.md`.

- Add an explicit local operator pack and optional workspace pack, human-approved scrubbed Markdown
  under private local permissions.
- Give the operator an explicit versioned update command, so manual edits do not require hand
  recalculating hashes and automatically make older proposals stale.
- Launch preview identifies available packs without dumping all content into the base TUI. Agents use
  bounded MCP/CLI retrieval instead of global unbounded prompt injection.
- A proposal carries source session, scrubbed evidence, scope, and diff. Accept/reject is explicit;
  an agent cannot alter active context directly.
- Reject malformed, oversized, secret-shaped, denied-client, or partial proposals safely.
- Correct `memory recent --json` so its public learning/session entries cannot expose local record
  paths; TUI parsing must reject a path rather than silently discard it.

### F9.2 -- Episode, recall, procedure, and skill lifecycle

**Status (2026-07-18):** implementation complete; independent checker review pending. The maker
evidence is in `F9.2-EPISODES-PROCEDURES-MAKER-REPORT.md`. F9.3 remains the only migration and
audit-closure phase; no private data migration was performed here.

- Formalize summaries and explicit learnings as immutable scrubbed episode records with agent,
  session, and workspace provenance. Keep the daemon as semantic retrieval engine.
- Redesign Memory around **Recall**, **Context**, and **Procedures**, following contour-only layout
  and the six-control rule.
- Keep capture proposal-only; add transparent use/review metadata and reversible lifecycle state.
  Defaults never silently archive a useful skill; automation is opt-in.
- A workflow remains a prompt/checklist. It cannot execute a shell or select a provider/model;
  `skillify` remains explicit with `--yes`.

### F9.3 -- Agent-memory migration and audit closure

**Status (2026-07-18):** implementation complete; independent checker review pending. Evidence is
in `F9.3-MIGRATION-AUDIT-MAKER-REPORT.md`. No private repository content was read or migrated.

- Record a metadata-only audit of private `agent-memory` here. Do not copy its content, clone it into
  the public tree, or disclose private paths.
- Correct its stale private README only in a separately reviewed change. Product docs describe a
  clean-install local store plus import/export contract.
- Use fixture-only legacy migrations. Verify secret rejection, client isolation, idempotency,
  provenance, ledger-loss recovery, changed-input refusal, and daemon-down degradation.

## F10 -- Documentation, brand, license, and website

### F10.0 -- Public claim and privacy audit

Build a claim matrix before copy changes: every README/site claim maps to implementation, test, or a
documented limitation. Reconcile stale pre-daemon architecture and workflow pages. Generalize the
personal client deny-list from open-source distribution; examples/tests use neutral fixtures and a
user configures their own exclusions locally.

### F10.1 -- License and distribution metadata

- Convert MIT to the exact GNU AGPL v3 text and metadata `AGPL-3.0-only`.
- Audit vendored/bundled components, retain their notices, and never claim to relicense them.
- Update badges, package metadata, CONTRIBUTING, SECURITY, CI/release guidance, and license refs.
  Opus independently reviews this legal/distribution boundary before release.

### F10.2 -- Documentation architecture and README

Public docs are English, task-oriented, and free of personal paths, private SOP contents,
credentials, and client identifiers. Historical Spanish notes can stay only as clearly separated
internal history.

```text
README.md                         product landing and five-minute proof
docs/getting-started/             install, first memory, first workspace
docs/concepts/                    memory, workspaces/sessions, procedures, costs
docs/architecture/                daemon, federation, CKIS relationship, ADR index
docs/guides/                      agents, routing, privacy, migration, troubleshooting
docs/reference/                   CLI, MCP, configuration, JSON contracts
docs/release/                     contributor, security, license, Devpost evidence
```

README requirements: native logo asset derived from the existing pixel wordmark; a real scrubbed TUI
or terminal capture in its first viewport; outcome-first quickstart; accurate architecture, optional
CKIS integration, memory boundaries, workspace workflow, factual cost telemetry, supported agents,
security, roadmap, contribution, and AGPL terms; and a clear implemented-versus-planned boundary.

### F10.3 -- Documentation website

After content stabilizes, create an isolated static `website/` package using Astro. It builds local
without a server runtime, works on Vercel, uses real eBrain visual assets, and begins with the
documentation/product experience instead of a generic marketing screen. Add local build, links,
accessibility, responsive screenshot, and asset-rendering gates. Define a docs synchronization
contract so README, GitHub, and website claims cannot drift. Vercel deployment remains a later,
explicitly confirmed operation.

## F11 -- Gates and release discipline

**Current local state (2026-07-18):** F8-F10.3 maker work is complete locally. F11 preparation is
implemented, but independent review and owner approval remain pending. No public release action is
authorized by this state.

Each phase has a descriptive commit, CHANGELOG entry, durable learning where appropriate, tests, and
handoff. Shared `app.ts` integration remains sequential.

1. Run `bun test ./cli/` and `bun test ./tui/test/` after each behavioral phase.
2. For every TUI phase, run zero-hex, English visible-text sweep, terminal restore smoke, and real
   80x24, 100x30, and 160x48 captures.
3. Every new CLI/MCP contract gets malformed-store, denied-client, secret-shaped input, and
   daemon-down tests.
4. Use harmless temporary directories and fake agents/shells. No paid call is a test prerequisite.
5. Docs checks cover links, snippets, claims, assets, metadata, licenses, and private identifiers.
6. Opus independently reviews F8.3, F9 persistence/migration, F10 licensing, and public-release
   diff. A second Fable/GPT checker is optional, not a substitute for maker/checker separation.

Only after local gates and independent review pass will eBrain ask Eduardo for one explicit approval
covering the exact push, public visibility, tag/release, and Vercel deployment. Until then GitHub
inspection is read-only and website work is local.

## Sequencing and stop conditions

```text
F8.0 -> F8.1 -> F8.2 -> ADR-007/F8.3 -> ADR-008/F9.1 -> F9.2 -> F9.3
     -> F10.0 -> F10.1 -> F10.2 -> F10.3 -> F11 independent review -> external approval
```

Stop and return to design if a shell needs arbitrary command text in eBrain, memory would mutate
active user knowledge without approval, migration cannot prove isolation/redaction, a public claim
lacks evidence, the license scan finds an unaccounted dependency, or compact terminal controls
cannot stay readable without overflow.

## Later checker questions

- Does the editor preserve exact bytes while displaying every reachable draft row, with no persistence
  before explicit send?
- Can a workspace, shell, or session bypass canonical client isolation after a symlink change?
- Is shell execution truly tmux/native-shell based, with no TUI evaluator, output ingestion, or
  eBrain secret channel?
- Are context packs bounded, provenance-bearing, human-approved, and retrieval-based rather than a
  hidden global prompt-injection mechanism?
- Are episodes/procedures scrubbed, reversible where needed, and non-autonomous?
- Does clean install work without CKIS or the private `agent-memory` repo?
- Do public docs and AGPL metadata make only evidenced, private-data-free claims?
