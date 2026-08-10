---
type: plan
project: ebrain
status: active
created: 2026-08-09
supersedes: nothing — this is the acceptance contract for the portable-memory wave
---

# Plan — memory that works out-of-the-box (portable-memory wave)

> Labeled "portable-memory wave" to avoid collision with the historical F1–F12 sprint numbering.

## Why this exists

A developer who clones eBrain and runs `ebrain up` must get **good memory — record and semantic
recall — without owning an OpenAI key**. Today the store embeds through `openai:text-embedding-3-large`
(1536d); with those credits gone, embeds fail and recall silently degrades to the engine's keyword arm.
A fresh clone therefore has no semantic memory. This wave closes that.

## The premise correction that shapes the whole plan

The embedding **provider interface already exists in the pinned engine** (`vendor/gbrain`), verified:

- Recipe registry with hosted **and local** backends — `ai/recipes/{openai,openrouter,ollama,llama-server,google,voyage,…}.ts`.
- Provider identity + dimensions — `currentEmbeddingSignature()` (`core/embedding.ts:178`) = `provider:model:dims`.
- Provider-switch re-embed — `core/embed-stale.ts` nulls foreign-signature embeddings and re-embeds through a resumable cursor.
- Native keyword fallback — `core/search/hybrid.ts` fuses keyword + relational arms when embedding is unavailable, and fails over to keyword mid-query on an embed error.
- Dimension safety, disable path, provider preflight — `embedding-dim-check.ts`, `--no-embedding`, `embed-preflight.ts`.
- **OpenRouter exposes `/v1/embeddings`** proxying `text-embedding-3-small` at **1536 dims** (`ai/recipes/openrouter.ts:13,66`) — same dimension as the current store.

**Therefore this wave does NOT build an embedding interface. It builds the eBrain policy / governance /
UX layer on top of the engine's execution:** which embedder to run given what exists on the machine,
how to surface that honestly, and how to migrate an existing store.

## Locked decisions

1. **Fresh-clone default embedder:** `openrouter:openai/text-embedding-3-small @1536`. It reuses the
   `OPENROUTER_API_KEY` eBrain already requests for routing (so "no OpenAI key" holds), and its 1536
   dims match the existing store — migration is a signature-only re-embed with **no column ALTER**.
2. **Fallback ladder** for a fresh clone: sticky-existing-provider (if still env-ready) → hosted-by-env
   (the default above) → local-by-probe (Ollama `nomic-embed-text@768`, $0, if a server answers) →
   **keyword-only**, loudly surfaced. `remember` (record) always works — it is embedding-free.
3. **Local model stance:** recommend and document Ollama `nomic-embed-text` as the $0 path (with an
   honest "semantic recommended at 8 GB+ RAM" note); eBrain never auto-installs a model and no weights
   live in git.
4. **Migrate the live store now** (owner decision): re-embed the existing brain to the chosen provider,
   daemon-mediated and resumable, after showing a cost preview.
5. **Nightly consolidation timer** stays a manual, explicit enable (recurring autonomous spend is a
   human decision); `ebrain up` may *offer* it when a hosted embedder + a budget exist.
6. **Re-embed UX** is always an explicit `ebrain embedder migrate` with a cost preview.
7. **Budget:** one unified monthly cap covers both the routing lane and the engine (`think`/`dream`)
   lane; the engine lane is *observed* from its audit ledgers, never fabricated.

## The pure core, proven first (empirical-first, per the dev-pipeline SOP)

The one thing eBrain lacks is a **decision function**, pure and I/O-free — `cli/embedder.ts`:

```ts
selectEmbedder(input: EmbedderInput): EmbedderDecision
// input: env presence (booleans only, never values), local-server probe results,
//        the engine's current embedding signature + column dims, an optional explicit override
// output: mode ("semantic" | "keyword-only"), selected candidate, signature, and the actions
//         implied for the existing store ("configure" | "reembed" | "alter-column"), with
//         stable machine-readable reason codes
```

Invariants to prove with unit tests **before any wiring** (keyless, offline, no vendor import):
1. Total, deterministic, pure — never throws; no fs/env/network reads (input is injected).
2. Secrets-by-name — the type carries only booleans for env; a test asserts zero `process.env` in the fn.
3. Explicit override wins; an unknown/invalid override → `keyword-only` + a reason code, never a silent guess.
4. **Stickiness** — if the store's current provider is still env-ready, it is kept over any "better" candidate; a working store is never auto-switched.
5. Precedence when unconfigured — sticky-existing > hosted-by-env > local-by-probe > keyword-only.
6. **Re-embed trigger** — selected signature ≠ store signature ⇒ `reembed`; dims ≠ column dims ⇒ also `alter-column`; equal ⇒ no embed actions.
7. `keyword-only` ⇒ no selected candidate, no signature, no actions — keyword mode can never imply spend.
8. Dimension legality — candidate dims must be recipe-legal; > engine HNSW cap flags a reason code.

**Empirical gate (throwaway, scratchpad, never committed):** a scratch `GBRAIN_HOME` proves (a) keyword
mode with no keys, (b) semantic mode with `OPENROUTER_API_KEY` present, (c) a provider switch invalidates
foreign-signature embeddings and re-embeds. This also resolves the **single blocking unknown**: what
`gbrain serve` does on a keyless, non-TTY fresh HOME (the init picker is TTY-only). Wiring does not begin
until this is answered.

## Workstreams (core-first; each ends with an objective gate)

| # | Workstream | New / shared | Gate |
|---|---|---|---|
| W1 | Pure `selectEmbedder` + invariants 1–8 | **new**: `cli/embedder.ts`, `cli/embedder.test.ts` | `bun test cli/embedder.test.ts` green, keyless |
| W2 | Empirical proof of keyword / hosted / switch + the keyless-boot answer | scratchpad only | transcript of 3 scenarios; boot behavior documented |
| W3 | Engine-spend read lane (parse `~/.gbrain/audit/{budget,dream-budget}-*.jsonl`) | **new**: `cli/engine-spend.ts`, `cli/engine-spend.test.ts` | fixture tests incl. absent/corrupt + `partially_observed` |
| W4 | Wiring: embedder decision → `up.ts` + daemon env + dispatch + doctor/status | **shared**: `cli/up.ts`, `scripts/ebrain-brain`, `cli/ebrain`, `harness/core/{doctor,status}.sh` | `ebrain up` keyless → keyword mode, honest output; doctor exit 0 fresh |
| W5 | Fold engine lane into spend/cost + contract fixtures | **shared**: `cli/spend.ts`, `cli/cost.ts`, `cli/contract.test.ts` | contract suite green (additive schema only) |
| W6 | Daemon-mediated dream cycle (curated phases; keep `--direct` fallback) | `cli/dream.ts`(+test), `scripts/dream-cycle`, `scripts/systemd/*` | supervised submit runs embedding-free subset; at-cap/keyless degrades, never fails |
| W7 | `ebrain embedder migrate` — cost preview, resumable re-embed; then migrate the live store | `cli/embedder.ts` (extend) | e2e switch on scratch brain; preview matches; refuses when daemon down / dims invalid |
| W8 | Docs sync — correct the OpenRouter-embeddings claim, provider doc, runbook, checklist, roadmap | `docs/*` | public-safe: no competitor names, no internal-process references |
| W9 | Final audit — client isolation intact, secrets-by-name, CI portability green, contract ↔ real output, at-cap contract holds | read-only | independent pass |

Order: W1→W2 are the proof gate; W3 parallels W1; W4 strictly after W2; W5 after W3+W4; W6/W7 after W4; W8 after the locked decisions; W9 last.

## At-cap contract (the invariant that must never break)

At cap: routing aborts (already does), engine chat 429s and `think` degrades, hybrid search falls back
to keyword (engine-native), the dream cycle skips its LLM phases — and **`remember` is entirely
unaffected**. Recording never blocks. Doctor/status say it in one line: *"at cap: memory keeps
recording; recall degrades to keyword; consolidation pauses."*

## Constraints on every new module

- Vendor (`vendor/gbrain`) imports are **lazy/dynamic only** — CI runs with no `vendor/` present.
- Tests are keyless, offline, and fixture-based (the `cli/contract.test.ts` convention).
- Secrets referred to by NAME only; `.env*` never read. Client repos (`brisas-del-golfo`, `dekko`)
  never crossed. Cost is telemetry — never a user-facing token count; never a "best model" claim.
