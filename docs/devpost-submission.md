# eBrain — OpenAI Build Week (Devpost) Submission Package

> Category: **Developer Tools**. Copy-paste ready. Fields that need Eduardo's input are marked
> **⚠️ NEEDS INPUT**. Nothing here names a competitor; superiority is stated implicitly.

---

## 1. Project overview

**Project name:** `eBrain`

**Elevator pitch** (≤ 200 chars — paste one):

> One permanent memory for every AI coding agent. eBrain shares memory across Claude Code, Codex & Gemini, and routes tasks across providers by capability under a hard cost cap.

*(Alt, punchier):* `One brain for all your AI coding agents — permanent shared memory + capability-based multi-provider routing, local-first and cost-capped.`

**Thumbnail:** ⚠️ NEEDS INPUT — 3:2, ≤5 MB (JPG/PNG/GIF). Use the eBrain isotype on the dark
brand background (matches the current draft thumbnail).

---

## 2. Project Story (paste into "About the project", Markdown)

## Inspiration

Every AI coding agent starts from zero. We explain the same architecture to Claude Code, then
again to Codex, then again tomorrow. Run several agents in parallel and it gets worse: N cold
starts, N private silos, N ways to blow the API budget — and no shared understanding between any
of them. Context is the real bottleneck of agentic development, and today it's rebuilt from
scratch on every session. We wanted the opposite: a system where every agent shares one memory
that gets smarter over time.

## What it does

eBrain is a unified agentic harness. It gives any AI coding agent — Claude Code, Codex, Gemini,
Cursor, OpenCode — a single **permanent memory they all share** over the Model Context Protocol.
What Codex learns, Claude Code remembers. It also **routes work across providers by capability**
(coding, agentic, long-context…) using a model map you govern, with native fallback and a **hard
monthly spend cap**. It's **local-first**: the memory lives on your machine behind an
authenticated loopback channel, secrets are scrubbed at the boundary, and designated client
repositories are walled off entirely. One command — `ebrain up` — starts the shared brain and
connects every agent you have; you never touch a token, OAuth flow, or lock.

## How we built it

TypeScript on Bun. The core is a memory **daemon** that owns the database writer lock and exposes
it to agents over authenticated MCP on `127.0.0.1`; each agent CLI is registered automatically by
`ebrain up`. The knowledge engine is the open-source [gbrain](https://github.com/garrytan/gbrain)
(vendored, MIT) — eBrain is the harness, routing, isolation, onboarding, and terminal cockpit
(TUI over tmux) wrapped around it. Provider routing goes through OpenRouter behind a
capability→model map with hard spend caps. We built it spec-first with a **maker ≠ checker**
pipeline (see below).

## Challenges we ran into

The hardest bug was silent: MCP would connect but never finish loading. Root cause — the embedded
database is **single-writer**, and every agent's own MCP server was polling the held writer lock
forever. The fix reshaped the architecture: **one daemon owns the lock**, and all agents connect
to it over MCP-HTTP instead of each opening the database. We also engineered for constraint — the
whole thing was built and tested on a **4 GB laptop**, so "one heavy agent at a time" and hosted
embeddings became design principles, not afterthoughts. And making it plug-and-play meant hiding
every sharp edge (tokens, OAuth, locks) behind a single idempotent command.

## Accomplishments that we're proud of

- **N agents, one memory — proven concurrent.** Multiple agents load the shared MCP memory over
  HTTP at once, with a single writer and no hangs.
- **Zero-friction onboarding.** `ebrain up` → the whole fleet is connected; the user never sees a
  token or a lock.
- **Cost as an architectural constraint** — a hard spend cap and factual, never-inflated cost
  telemetry.
- **Security by construction** — loopback-only, boundary secret scrubbing, and a symlink-safe
  client-repo deny-list.
- The tool **dogfoods its own thesis**: it was built by agents that shared memory and audited each
  other.

## What we learned

Permanent, shared memory changes what agentic development *is* — the value isn't a smarter model,
it's continuity across agents and sessions. We learned to treat routing as a **governed** layer
(the user owns the model order; the tool never claims a universally "best" model), and that the
real moat of an agentic tool is the harness — memory, orchestration, and cost discipline — not any
single provider.

## What's next for eBrain

A one-command installer and CI release pipeline; pluggable embedding providers (hosted and local,
with a zero-config fallback); a richer review surface in the cockpit; and an optional always-on
autonomous runtime that keeps the same memory and routing running 24/7. Open-source launch to
follow.

---

## 3. Built with (tags — up to 25)

```
bun, typescript, model-context-protocol, mcp, tmux, pglite, postgres, pgvector,
openrouter, openai, codex, gpt-5.6, claude-code, gemini, cursor, opencode,
rag, embeddings, cli, tui, agentic-ai, multi-agent, developer-tools, git, zod
```

## 4. "Try it out" links

- **Code repo:** `https://github.com/aedneth/ebrain` — ⚠️ confirm the public slug before submit.
- **Demo video:** ⚠️ NEEDS INPUT (YouTube, < 3 min — see §7).

---

## 5. Additional info (for judges)

- **Submitter Type:** Individual.
- **Country of Residence:** ⚠️ NEEDS INPUT — El Salvador.
- **Category:** Developer Tools.
- **URL to code repo (REQUIRED — README highlights how Codex & GPT-5.6 were used):** the README's
  **"Built with Codex & GPT-5.6"** section covers this. If the repo is private, share access with
  `testing@devpost.com` and `build-week-event@openai.com`.
- **`/feedback` Codex Session ID (REQUIRED):** ⚠️ NEEDS INPUT — the Codex session where the
  majority of the work was done (Codex was the primary maker). Run `/feedback` in that Codex
  session to retrieve the ID.
- **Link + instructions for judges to test:** see §6 (installation for judges).
- **Upload a file:** optional — a short architecture PDF can go here.

## 6. Installation instructions for judges (plugin/dev-tool field)

```bash
# Prerequisites: Bun (https://bun.sh), tmux, gh, and at least one agent CLI
#   (claude, codex, gemini, cursor, or opencode).

# Install
curl -fsSL https://raw.githubusercontent.com/aedneth/ebrain/main/scripts/install.sh | sh
#   (or from source: git clone … ~/eBrain && cd ~/eBrain && bun install && ./scripts/install.sh --from-source)

# Bring the shared brain up and connect every detected agent (idempotent)
ebrain up

# Verify
ebrain doctor

# Prove the shared memory: write from one agent, read from another (or the CLI)
ebrain remember "Judges test: eBrain shares one memory across agents."
ebrain q "what did we note for judges?"

# Open the cockpit
ebrain ui
```

Expected: `ebrain doctor` is healthy; `ebrain q` returns the note just written; opening any
connected agent CLI exposes the `ebrain` memory tools. Semantic recall needs an embeddings key;
without one, eBrain falls back to zero-cost keyword search automatically.

## 7. Media checklist

- **Video demo (< 3 min, YouTube, required):** ⚠️ NEEDS INPUT. Script beats: (1) the problem —
  agents forget, silos multiply; (2) `ebrain up` connects the fleet in one command; (3) write a
  memory in Codex, recall it in Claude Code; (4) capability routing + the cost cap; (5) the cockpit;
  (6) one line on how **Codex & GPT-5.6** built it. Voiceover must explain what you built, how you
  used Codex, and how you used GPT-5.6.
- **Image gallery (≤ 15, 3:2):** ⚠️ NEEDS INPUT — TUI screenshots (memory, routing, doctor),
  the architecture diagram, a `ebrain q` cross-agent recall shot.

## 8. Final submission checklist (from Devpost)

- [ ] Demo video < 3 min, public on YouTube, link in the form.
- [ ] Voiceover explains what was built + how Codex and GPT-5.6 were used.
- [ ] `/feedback` Codex Session ID retrieved and entered.
- [ ] Private code repo shared with Devpost & OpenAI (if private).
- [ ] README has setup instructions and explains how Codex & GPT-5.6 were used. ✅ (done)
- [ ] Installation instructions for judges included. ✅ (§6)
- [ ] Team + category selected (Developer Tools).
- [ ] Terms accepted; submission not left as a draft.
