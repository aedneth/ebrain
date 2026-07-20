---
type: adr
id: ADR-008
title: Governed local agent memory with bounded context, immutable episodes, and reviewed procedures
status: accepted -- implementation requires independent review before public release
decided_by: Eduardo + Codex
decided: 2026-07-18
program: F9 -- governed agent-memory consolidation
related: [ADR-001-brain-topology.md, ADR-002-unified-harness.md, ADR-003-tui-stack.md, ADR-006-workspace-first-control-plane.md, ../WORKFLOW-LEARNING-LOOP.md, ../ULTRAPLAN-WORKSPACES-MEMORY-OSS.md]
---

# ADR-008 -- Governed Local Agent Memory With Bounded Context, Immutable Episodes, and Reviewed Procedures

## Context

eBrain already has durable learnings written through `ebrain remember`, session summaries from the
harness, federated knowledge through the daemon, and local workflow/skill records. These are useful
but do not yet give a new user a single mental model for stable operating context, episodic recall,
and reusable procedures. Copying Hermes Agent's storage mechanically would be unsafe: it would mix
user preferences, raw terminal data, inferred behavior, external providers, and autonomous skills
inside a product that must work locally, survive daemon downtime, and remain understandable to an
OSS developer.

The goal is not infinite history. The goal is explicit, bounded, provenance-preserving memory that
helps many agents recover the right context without letting any one agent silently alter the
operator's operating instructions.

## Decision

eBrain has four complementary layers. Each has a separate source of truth, entry boundary,
retrieval contract, and lifecycle.

| Layer | Source of truth | Writes | Retrieval | Rule |
| --- | --- | --- | --- | --- |
| Operating context | private local context-pack Markdown | human edit or reviewed proposal | explicit bounded pack lookup | no autonomous active-pack mutation |
| Episodes | private local immutable scrubbed records | explicit learning/session-summary ingestion | search or bounded recall | never raw terminal output |
| Federated knowledge | existing approved Markdown/code sources and daemon index | existing source registration/sync | current semantic/keyword tools | existing default-deny isolation remains authoritative |
| Procedures | existing workflow records, local skills, and lifecycle metadata | ingest/capture proposal/explicit skillify | materialized checklist or skill lookup | no shell execution, no model selection, no auto-skill creation |

CKIS remains the authoring and infrastructure foundation: git, backup, vault, Dev Brain, graph
tooling, and approved sources. eBrain is the multi-agent runtime built on it: daemon/MCP adapters,
workspace selection, sessions, workflows, costs, and TUI. A clean eBrain install uses only private
local stores; CKIS federation is optional and explicit.

### Operating context packs

1. Packs are small, human-readable Markdown records stored under a private local eBrain config
   directory. The initial scopes are one `operator` pack and optional `workspace-<generated-id>`
   packs. A pack stores no provider credential, model policy, shell output, arbitrary command, or
   denied-client material.
2. Agents may create a scrubbed proposal containing scope, source session identity, bounded
   evidence, proposed replacement, base version/hash, and timestamp. A proposal is not active.
3. Accept/reject is an explicit reviewed operation. Acceptance fails if the base pack changed,
   preventing a stale proposal from overwriting an operator edit. The local `--yes` boundary is a
   deliberate review gesture, not a claim that a CLI can authenticate a human.
4. Launch and TUI previews expose pack identity/version/state, not full pack bodies. An agent can
   use a bounded, explicit local retrieval command; eBrain never globally injects every pack into a
   system prompt.

### Episodes

1. An episode is an immutable, scrubbed local record with opaque ID, kind, creation time, text,
   content hash, agent/session/workspace provenance where known, and source class. Workspace
   provenance uses a generated workspace ID, not a filesystem path in public summaries.
2. `remember` and harness summaries remain backward compatible sources. Migration is explicit and
   fixture-tested; no raw `.brain` file, terminal pane, or private repository history is bulk
   copied into the episode store.
3. Episode retrieval is bounded by count and characters, uses secret scrubbing at both ingestion
   and presentation, and degrades locally when the daemon is down. Daemon recovery may index an
   approved scrubbed record through existing paths but never becomes a requirement for local read.
4. A fixture-only legacy record carries private immutable fixture ID/hash provenance solely for
   recovery after a ledger interruption. That provenance is excluded from every public episode and
   TUI contract; a changed fixture fails closed rather than producing a duplicate after ledger loss.

### Procedures and skills

1. Existing workflow records stay the source of procedure content. A separate private metadata
   record may track `active`, `stale`, or `archived`, review timestamps, explicit use events, and
   skillified state. It does not mutate source Markdown or infer a success score.
2. State transitions are explicit review actions. No elapsed-time cron silently archives a
   workflow or skill; a stale procedure can be revived only by an explicit action.
3. `capture` remains proposal-only and `skillify` remains `--yes` only. A workflow materializes a
   prompt/checklist; it cannot run a shell, select a provider/model, or alter a context pack.
4. Generated skills remain compatible with the existing local skillpack and agentskills-style
   frontmatter, but are never created automatically.

### Privacy, isolation, and public contracts

1. Every new store is mode `0700`; records are mode `0600`; writes are atomic. Unknown fields,
   invalid IDs, oversize text, secret-shaped content, and denied-client references fail closed.
2. Public list/search JSON contains no local filesystem path. This corrects the historical
   `memory recent --json` contract, which exposed `path` even though the TUI discarded it. Internal
   functions may retain a path only long enough to read an approved local file; it is not an API
   field or episode provenance.
3. The client deny-list remains enforced on every ingest, proposal, context workspace lookup,
   workflow materialization, and launch boundary. No context, episode, workflow, skill, or shell
   becomes a back door around ADR-001/002/006 isolation.
4. There is no default external `MemoryProvider`, no LLM dialectic/validation pass, no background
   benchmark/model call, and no autonomous preference learning. Those require a separate product
   decision with cost, provenance, and consent.

## Private `agent-memory` metadata audit

On 2026-07-18, the only audited remote metadata for `aedneth/agent-memory` was its name,
visibility, default branch, empty description, absent declared license, update timestamp, and URL.
It is private with default branch `master`. No repository content, files, commits, issues, clone,
or local path was read or copied. It is therefore not an eBrain OSS dependency, migration source,
or documentation authority. Any future cleanup of that private repository is a separate reviewed
change. F9.3 completed only fixture-only migration proofs and did not change that boundary; F10
owns clean-install public import/export documentation.

## Consequences

- Memory becomes explainable: users can distinguish stable instructions, recalled episodes,
  federated knowledge, and reusable procedures.
- The product gains durable personalized context without silently rewriting user intent.
- Existing learnings/workflows remain useful and compatible rather than being replaced by an
  unreviewed database migration.
- The implementation adds several local schemas and CLI contracts; each must be tested for
  redaction, permissions, malformed data, client isolation, idempotency, stale-proposal conflict,
  and daemon-down behavior.

## Alternatives rejected

### Copy Hermes Agent's `MemoryManager` and external provider abstraction

Rejected. It imports an external-provider conflict model and implicit behavior not required for a
local, provider-neutral runtime. eBrain adopts the useful layering and bounded retrieval ideas, not
the dependency or its autonomous policy.

### Inject all memory into every agent prompt

Rejected. It creates prompt-injection and context-window pressure, hides provenance, increases
token cost, and cannot be reviewed by the user before an agent starts.

### Treat every terminal transcript as an episode

Rejected. Terminal data is high-volume, privacy-sensitive, often secret-bearing, and is not a
durable learning signal. The existing scrubbed summary and explicit learning paths are the floor.

### Automatically promote repeated capture candidates to skills

Rejected. Repetition does not prove correctness or user consent. Capture remains a proposal and
skillification remains an explicit reversible action.

## Acceptance criteria

1. A clean install can list empty context/episode/procedure stores without CKIS or a daemon.
2. A reviewed proposal cannot alter an active context pack without explicit accept and a matching
   base version; malformed, oversized, secret-shaped, and denied-client proposals are rejected.
3. Episodes are immutable, scrubbed, provenance-bearing, path-free in public output, and bounded
   on retrieval. Daemon downtime leaves local behavior truthful and usable.
4. Existing `remember`, session summaries, workflow ingest, capture, materialize, and `skillify`
   preserve their current safety boundaries while gaining explicit lifecycle metadata where needed.
5. No memory public contract returns raw terminal output, token/credential values, client content,
   private agent-memory content, or subscription spend.
6. CLI and TUI contracts, responsive UI states, secret scans, zero-hex (if TUI changes), and an
   independent checker review pass before F9 is presented as release-ready.
