---
title: gstack ↔ gbrain — Connection Contract
scope: Reverse-engineering, read-only. Pin SHA 7c9df1c568a9ea745508f679a329332b2c338063 (v1.60.1.0), ~/eBrain/vendor/gstack
generated-for: ebrain trust-triad config (brisas-del-golfo=deny, korvex-*=read-only)
---

All paths below are relative to `vendor/gstack/`. Line numbers cited against the pinned SHA.

## §using-gbrain-overview

Primary source: `USING_GBRAIN_WITH_GSTACK.md` (385 lines, read in full).

**What the contract establishes.** gbrain (https://github.com/garrytan/gbrain, a separate upstream project) is a persistent knowledge base with its own release cadence; gstack is the integration layer that gives a coding agent (Claude Code specifically, v1) a one-command path to install it, connect it, and use it as both a CLI and an MCP tool (`USING_GBRAIN_WITH_GSTACK.md:3-5,371`). The contract is deliberately "separate-but-integrated" — gstack never bundles or gates gbrain's own updates (`USING_GBRAIN_WITH_GSTACK.md:371`).

**End-to-end flow of connecting a repo to a brain:**
1. `/setup-gbrain` — one-time onboarding: detect state → pick a brain location ("path", §setup-paths below) → install CLI → init the engine → register MCP with Claude Code → capture the per-repo trust policy → optionally wire cross-machine artifact sync (`USING_GBRAIN_WITH_GSTACK.md:11-26,93-121`).
2. `/sync-gbrain` — the recurring verb: re-index this repo's code into gbrain, ingest curated gstack memory, push artifacts, and refresh the CLAUDE.md guidance block (`USING_GBRAIN_WITH_GSTACK.md:122-149`).
3. Retrieval surfaces gained: semantic code search (`gbrain search`, `code-def/code-refs/code-callers/code-callees`) and cross-session memory (plans/retros/decisions/learnings under `~/.gstack/`) (`USING_GBRAIN_WITH_GSTACK.md:21-26`).
4. If Path 4 (remote MCP) was chosen, the machine runs in **split-engine mode**: brain/context queries route to the remote MCP server while code queries stay on a local PGLite pinned per worktree (`USING_GBRAIN_WITH_GSTACK.md:66-77`) — this is the config shape most relevant to a consultant machine touching multiple client repos.

Design rationale explicitly stated in the doc, worth carrying into ebrain's own docs: the trust triad exists because a freelance dev working Client A in the morning and Client B in the afternoon "can't let A's code insights leak into a brain Client B can search" (`USING_GBRAIN_WITH_GSTACK.md:369`), and gstack does **not** auto-import every repo it touches — ingestion is an explicit per-repo decision, forward-compatible for an opt-in auto-import hook that does not exist yet (`USING_GBRAIN_WITH_GSTACK.md:377`).

---

## §setup-paths

Source: `USING_GBRAIN_WITH_GSTACK.md:28-77` (user-facing) and `setup-gbrain/SKILL.md:914-1239` (Step 2 picker + Step 4 path-specific execution — the operative spec).

The skill asks **"Where should your brain live?"** (`setup-gbrain/SKILL.md:922`) only if Step 1 detection found no working config and no shortcut flag was passed (`setup-gbrain/SKILL.md:916-917`). Four brain-location paths, plus a "Switch" option surfaced only when an existing engine was detected:

1. **Path 1 — Supabase, existing connection string.** For a teammate's/cloud agent's already-provisioned brain. User pastes the Session Pooler URL (port 6543); read via `read -s` + redacted echo, handed to `gbrain init --non-interactive` through the `GBRAIN_DATABASE_URL` env var, never argv (`USING_GBRAIN_WITH_GSTACK.md:32-38`; `setup-gbrain/SKILL.md:976-1002`). Explicit trust warning: this URL gives local Claude Code full read/write on every page in the shared brain (`setup-gbrain/SKILL.md:926-932`).

2. **Path 2a — Supabase, auto-provision new project.** User pastes a Supabase Personal Access Token after a mandatory scope disclosure ("grants full access to every project in your account, not just the one we're about to create") (`setup-gbrain/SKILL.md:1006-1015`). Skill lists orgs, asks region + tier (Free vs Pro, org-level) (`setup-gbrain/SKILL.md:1024-1042`), generates a DB password (`openssl rand -base64 24`, `setup-gbrain/SKILL.md:1047`), calls the Supabase Management API create → wait (180s timeout) → pooler-url → `gbrain init` (`setup-gbrain/SKILL.md:1059-1073`), then reminds the user to revoke the PAT (`setup-gbrain/SKILL.md:1075-1080`). A SIGINT trap prints the in-flight project ref + a `--resume-provision <ref>` command (`setup-gbrain/SKILL.md:1050-1057`).

3. **Path 2b — Supabase, manual creation.** Walks the four manual steps (signup → new project → wait ~2min → copy Session Pooler URL) then reuses Path 1's paste/verify/init flow (`setup-gbrain/SKILL.md:1082-1093`).

4. **Path 3 — PGLite local.** `gbrain init --pglite`; brain at `~/.gbrain/brain.pglite`; zero network calls, ~30s, no accounts (`USING_GBRAIN_WITH_GSTACK.md:56-64`; `setup-gbrain/SKILL.md:1095-1109`). This is gstack's recommended "try it first" and the natural fit for a fully isolated, no-sharing brain.

5. **Path 4 — Remote gbrain MCP (split-engine).** User pastes an MCP URL + bearer token; the skill validates over the wire via `gstack-gbrain-mcp-verify` (classifies failures as NETWORK / AUTH / MALFORMED, `setup-gbrain/SKILL.md:1136-1150`), registers the MCP at **user scope** via `claude mcp add --scope user --transport http gbrain "$MCP_URL" --header "Authorization: Bearer $TOKEN"` (`setup-gbrain/SKILL.md:1274-1281`), then offers ("D# — Want symbol-aware code search on this machine?") to also stand up a small local PGLite (~30s, ~120MB) purely for code search (`setup-gbrain/SKILL.md:1157-1219`). If accepted, this becomes split-engine mode: brain/context queries (`mcp__gbrain__search/query/get_page`) go to the remote server; code queries (`code-def/code-refs/code-callers/code-callees`, `gbrain search` for code) go to the local PGLite pinned via `.gbrain-source` (`USING_GBRAIN_WITH_GSTACK.md:72-77`). Path 4 **skips entirely**: local CLI install (Step 3), local doctor (Step 5), federated source wireup (Step 7 local branch), and transcript ingest (Step 7.5) unless local PGLite was accepted (`setup-gbrain/SKILL.md:954-956,1244-1247,1387-1391,1428-1433`).

6. **Switch** (only offered if Step 1 detected an existing engine): migrates PGLite ↔ Supabase via `gbrain migrate --to <other> --url ... ` wrapped in `timeout 180s`, lossless, preserves the source brain as backup (`USING_GBRAIN_WITH_GSTACK.md:151-161`; `setup-gbrain/SKILL.md:1226-1238`).

Entry-mode shortcuts documented at `USING_GBRAIN_WITH_GSTACK.md:195-204` and `setup-gbrain/SKILL.md:798-809`: `/setup-gbrain --repo` (re-prompt trust policy only), `--switch`, `--resume-provision <ref>`, `--cleanup-orphans`.

---

## §trust-triad

Primary spec: `USING_GBRAIN_WITH_GSTACK.md:93-120` (concept) + `setup-gbrain/SKILL.md:1319-1348` (Step 6, the operative gate) + `bin/gstack-gbrain-repo-policy` (the actual storage/enforcement mechanism, full file read).

**The three tiers**, per `USING_GBRAIN_WITH_GSTACK.md:97-99` and mirrored verbatim in the skill's AskUserQuestion at `setup-gbrain/SKILL.md:1333-1338`:

- **`read-write`** — agent may `gbrain search` from this repo's context AND write new pages back to the brain. Default for the user's own projects.
- **`read-only`** — agent may search the brain but **never writes** new pages from this repo's sessions. Explicitly the multi-client-consultant tier: "search the shared brain, don't contaminate it with Client A's code while you're in Client B's repo" (`USING_GBRAIN_WITH_GSTACK.md:98,369`).
- **`deny`** — no gbrain interaction at all; the repo is invisible to gbrain tooling.

**Where enforcement actually lives — this is the critical nuance for ebrain.** `bin/gstack-gbrain-repo-policy` is purely a **storage/lookup** binary; its own header says the read-only semantic is "enforced at the caller level; this binary just stores the decision" (`bin/gstack-gbrain-repo-policy:35-36`). The concrete enforcement points found in this repo:
- `setup-gbrain/SKILL.md:1328-1332` (Step 6): on `read-write`, the skill runs `gbrain import "$(pwd)" --no-embed` then backgrounds `gbrain embed --stale`; on `read-only`, it explicitly "skip[s] import entirely"; on `deny`, it does nothing.
- `sync-gbrain/SKILL.md:878-883` (Step 1): before syncing, `/sync-gbrain` checks the repo's policy and **STOPs** if `deny`: `"This repo's gbrain trust policy is deny. Run /setup-gbrain --repo to change it before syncing."`
- `setup-gbrain/memory.md:35-36`: "Repos under a `deny` trust policy... are skipped — neither code nor transcripts from those repos ingest."

No enforcement point in this codebase currently blocks a *write* specifically for `read-only` beyond "the import step is skipped" at setup/sync time — there is no independent runtime guard rail inside `gbrain put`/`gbrain sources add` that checks the policy file per call. The comment at `bin/gstack-gbrain-repo-policy:35-36` and the skill-level "future auto-import hook" note (`setup-gbrain/SKILL.md:1330-1331`: "this tier is enforced by the future auto-import hook + by gbrain resolver injection, not here") **explicitly flag this as not-yet-built** for anything beyond the setup/sync skills themselves.

**Per-remote, not per-repo-path.** The key is the git remote URL, normalized (`bin/gstack-gbrain-repo-policy:62-96`, `normalize()`): strips protocol, userinfo, converts SSH shorthand (`git@host:path`) to the same key as HTTPS (`host/path`), strips `.git` and trailing `/`, lowercases. So `https://github.com/foo/bar.git` and `git@github.com:foo/bar.git` collapse to one key `github.com/foo/bar` (`USING_GBRAIN_WITH_GSTACK.md:103`; `bin/gstack-gbrain-repo-policy:65-96`).

**Stickiness.** `cmd_get` (`bin/gstack-gbrain-repo-policy:164-181`) resolves `git remote get-url origin` when no URL arg is passed, normalizes it, and looks the key up in the policy file — meaning every worktree and branch of the same remote shares one entry, "you set it once and it follows you" (`USING_GBRAIN_WITH_GSTACK.md:101`). If outside a git repo or no `origin` remote exists, Step 6 skips with a note (`setup-gbrain/SKILL.md:1346`) — the triad has no effect there.

**Storage.** `~/.gstack/gbrain-repo-policy.json`, mode `0600`, schema-versioned (`bin/gstack-gbrain-repo-policy:22-30`). File shape:
```json
{
  "_schema_version": 2,
  "github.com/foo/bar": "read-write",
  "github.com/baz/qux": "deny"
}
```
Legacy migration: any file missing `_schema_version` or below 2 has its legacy `allow` values atomically rewritten to `read-write`, one stderr log line, idempotent (`bin/gstack-gbrain-repo-policy:39-43,143-161`; also documented in the troubleshooting section `USING_GBRAIN_WITH_GSTACK.md:335-337`). Corrupt JSON is quarantined to `<file>.corrupt-<timestamp>` and a fresh file started (`bin/gstack-gbrain-repo-policy:121-134`). Writes are atomic (`mktemp` + `mv`, `bin/gstack-gbrain-repo-policy:108-110,129-132,154-157,196-199`).

**How the decision is captured (unset case).** `setup-gbrain/SKILL.md:1319-1348` fires an AskUserQuestion with a 4th escape option `skip-for-now` (don't persist, ask again next time) in addition to the three tiers. Direct CLI equivalents documented at `USING_GBRAIN_WITH_GSTACK.md:105-118`:
```bash
/setup-gbrain --repo      # re-prompt for this repo only
~/.claude/skills/gstack/bin/gstack-gbrain-repo-policy set "github.com/foo/bar" read-only
~/.claude/skills/gstack/bin/gstack-gbrain-repo-policy list
```

**A second, separate trust concept — do not conflate.** `sync-gbrain/SKILL.md:840-861` and `setup-gbrain/SKILL.md:1627-1694` (Step 9.5) define `brain_trust_policy@<endpoint-hash>` — **`personal`** vs **`shared`** — which governs whether gstack auto-pushes `~/.gstack/` artifacts and calibration takes back to the *brain endpoint itself* (not per-repo). This is orthogonal to the read-write/read-only/deny repo triad: local PGLite auto-sets `personal` silently (`sync-gbrain/SKILL.md:857-861`); a remote MCP endpoint with `unset` policy fires its own AskUserQuestion (`sync-gbrain/SKILL.md:852-855`; wording at `setup-gbrain/SKILL.md:1656-1674`). The endpoint hash is `sha8(mcp URL)` or the literal `"local"` when no MCP is registered (`bin/gstack-config:162-172`), with a sha16 escalation on hash collision (`bin/gstack-config:174-201`). **For ebrain: the repo-level triad (per §trust-triad above) is what maps to brisas-del-golfo=deny / korvex-*=read-only. The personal/shared endpoint policy is a different axis (does this *brain* get auto-fed) and should not be set per-repo.**

---

## §sync-gbrain

Source: `sync-gbrain/SKILL.md` (full read, 1238 lines) + `USING_GBRAIN_WITH_GSTACK.md:122-149`.

**Purpose statement** (`sync-gbrain/SKILL.md:785-789`): `/setup-gbrain` is one-time onboarding; `/sync-gbrain` is the recurring verb that keeps gbrain current with the repo's code AND refreshes the agent-facing CLAUDE.md guidance. Architecture note post-codex-review (`sync-gbrain/SKILL.md:791-796`): uses gbrain's **native code surfaces** (`gbrain sources add`, `gbrain sync --strategy code`, `gbrain reindex-code`, `code-def/code-refs/code-callers/code-callees`) — explicitly NOT `gbrain import` (markdown-only path), and explicitly does not touch `~/.gstack/` indexing (owned by `gstack-gbrain-source-wireup`, "never double-store").

**Invocation modes** (`sync-gbrain/SKILL.md:803-812`): default incremental (mtime fast-path), `--full` (full reindex, auto-builds call graph if never built), `--dream` (force call-graph build), `--no-dream`, `--code-only`, `--dry-run`, `--no-memory`/`--no-brain-sync`, `--quiet`, `--refresh-cache`, `--audit` (read-only page/salience audit).

**Flow:**
1. **State probe** (Step 1, `sync-gbrain/SKILL.md:832-861`): runs `gstack-gbrain-detect`; gates on the repo trust policy `deny` (STOP, see §trust-triad); gates on the endpoint's `brain_trust_policy` if remote-http and unset.
2. **Local engine pre-flight** (Step 1.5, `sync-gbrain/SKILL.md:886-927`): branches on `gbrain_local_status` (`ok`/`timeout` proceed; `no-cli`/`missing-config` STOP with remediation unless in remote-http mode, where code+memory stages just SKIP; `broken-config`/`broken-db` STOP with repair instructions).
3. **Run the orchestrator** (Step 2, `sync-gbrain/SKILL.md:931-944`): `bun run ~/.claude/skills/gstack/bin/gstack-gbrain-sync.ts <args>` — three independent stages (code → memory → brain-sync); a failure in one doesn't block the others (`USING_GBRAIN_WITH_GSTACK.md:133`). State persisted to `~/.gstack/.gbrain-sync-state.json` (atomic tmp+rename); concurrent runs blocked by `~/.gstack/.sync-gbrain.lock` (5-min stale takeover, `sync-gbrain/SKILL.md:941-944,1212-1217`).
4. **Code stage internals** (`bin/gstack-gbrain-sync.ts:931-970` read directly): registers the cwd as a federated source, then `spawnGbrain(["sources", "attach", sourceId])` **pins the worktree** by writing `.gbrain-source` in the repo root (kubectl-style context, `bin/gstack-gbrain-sync.ts:931-944`); attach failure is treated as a hard stage failure (`ok=false`) specifically because an unqualified `gbrain code-def` from this worktree would silently hit the wrong source otherwise (`bin/gstack-gbrain-sync.ts:935-939`). The pin file is added to the repo's `.gitignore` if not already present (`bin/gstack-gbrain-sync.ts:1010-1037`) — **it is local, per-worktree, never committed**, which matters for ebrain since a client repo's `.gitignore` shouldn't need to carry this if ebrain manages it out-of-band.
5. **Code-index health check** (Step 3, `sync-gbrain/SKILL.md:948-979`): if the repo has 0 indexed pages and mode wasn't already `--full`, asks whether to run a full reindex now (~25-35 min).
6. **Call-graph health check** (Step 3.5, `sync-gbrain/SKILL.md:983-1049`): `code-callers`/`code-callees` need a `gbrain dream` cycle (`resolve_symbol_edges` phase) that the code import does NOT run; only meaningful on a "code-aware" schema pack — on other packs `--dream` completes but the graph stays empty (reported as WARN, not silently claimed OK).
7. **CLAUDE.md guidance refresh** (Step 4 — see §search-guidance-block).
8. **Verdict block** (Step 5, `sync-gbrain/SKILL.md:1165-1208`): GREEN/YELLOW/RED status table (CLI, Engine, Capability round-trip, CWD source page_count, Call graph, `~/.gstack` source, Memory sync, CLAUDE.md, Last sync).

**Idempotence:** explicitly re-runnable — orchestrator lock + atomic state writes (`sync-gbrain/SKILL.md:1212-1217`); safe to run from multiple terminals on the same machine per `USING_GBRAIN_WITH_GSTACK.md:149`.

**Watermark / large-file handling:** sync state advances by commit hash; a file over gbrain's 5MB hard limit (`MAX_FILE_SIZE` in gbrain's own `gbrain/src/core/import-file.ts`, per `USING_GBRAIN_WITH_GSTACK.md:353-355` — that file lives in the separate gbrain repo, not this one) or a file that vanished mid-sync holds the watermark; acknowledge via `gbrain sync --source <id> --skip-failed` (`USING_GBRAIN_WITH_GSTACK.md:143-149,353-361`).

**Cross-machine note** (`sync-gbrain/SKILL.md:1219-1226`): the CLAUDE.md guidance block travels via normal `git push`/`git pull` on the repo (NOT via `~/.gstack/.brain-allowlist`, which is for `~/.gstack/` brain-sync only). On a different machine with a synced CLAUDE.md but no local gbrain, the capability check fails and the block is **removed** rather than left stale-and-wrong.

---

## §search-guidance-block

Two write sites for the same HTML-comment-delimited block, **not textually identical** — see hallazgo below.

**Delimiters (both sites, identical):** `<!-- gstack-gbrain-search-guidance:start -->` / `<!-- gstack-gbrain-search-guidance:end -->`, under an `## GBrain Search Guidance (configured by /sync-gbrain)` heading (`setup-gbrain/SKILL.md:1553`, `sync-gbrain/SKILL.md:1094`).

**Insertion/update rule** (`sync-gbrain/SKILL.md:1145-1161`): find the marker-delimited region and replace its body if present; if markers are missing but the `## GBrain Search Guidance` heading exists, replace from there to the next `## ` heading or EOF; if neither exists, append the whole block at the end of CLAUDE.md. Write is atomic — write to `CLAUDE.md.sync-gbrain.tmp` then `mv` (`sync-gbrain/SKILL.md:1152-1154`) so a crash mid-write never leaves the file half-modified. Missing/unwritable CLAUDE.md logs a warning and continues rather than crashing (`sync-gbrain/SKILL.md:1160-1161`).

**Gated on a capability round-trip, not just presence of config.** Both skills run the same check: write a throwaway page (`gbrain put "$SLUG"`), then retry `gbrain search "ping"` up to 3 times with 1s delay (accounts for transaction-mode-pooler visibility lag), delete the page regardless of outcome (`sync-gbrain/SKILL.md:1057-1081`; equivalent smoke test at `setup-gbrain/SKILL.md:1616-1623`). **If capability fails, the block is REMOVED entirely** — "the agent should never be told to use a tool that isn't installed" (`USING_GBRAIN_WITH_GSTACK.md:141`; `sync-gbrain/SKILL.md:1156-1161`; `setup-gbrain/SKILL.md:1540-1545,1580-1582`).

**Verbatim template as maintained by `/sync-gbrain` (Step 4 — the canonical/current version, since sync-gbrain runs repeatedly and setup-gbrain's write is immediately superseded on first sync):**

```markdown
## GBrain Search Guidance (configured by /sync-gbrain)
<!-- gstack-gbrain-search-guidance:start -->

GBrain is set up and synced on this machine. The agent should prefer gbrain
over Grep when the question is semantic or when you don't know the exact
identifier yet.

**This worktree is pinned to a worktree-scoped code source** via the
`.gbrain-source` file in the repo root (kubectl-style context).
`gbrain code-def`, `code-refs`, `code-callers`, `code-callees`, `search`, and
`query` from anywhere under this worktree route to that source by default —
no `--source` flag needed (gbrain >= 0.41.38.0; on older gbrain the call-graph
commands need `--source "$(cat .gbrain-source)"`). Conductor sibling worktrees
of the same repo each have their own pin and their own indexed pages, so
semantic results match the code on disk here.

Call-graph queries (`code-callers`/`code-callees`) also need the graph to be
built first — run `/sync-gbrain --dream` (or `--full`) if they return
`count: 0`. This only works if this source's gbrain schema pack extracts code
symbols; on a non-code-aware pack `--dream` completes but the graph stays empty
and reports a WARN. `code-def`/`code-refs` need the same extraction.

Two indexed corpora available via the `gbrain` CLI:
- This worktree's code (auto-pinned via `.gbrain-source`).
- `~/.gstack/` curated memory (registered as `gstack-brain-<user>` source via
  the existing federation pipeline).

Prefer gbrain when:
- "Where is X handled?" / semantic intent, no exact string yet:
    `gbrain search "<terms>"` or `gbrain query "<question>"`
- "Where is symbol Y defined?" / symbol-based code questions:
    `gbrain code-def <symbol>` or `gbrain code-refs <symbol>`
- "What calls Y?" / "What does Y depend on?":
    `gbrain code-callers <symbol>` / `gbrain code-callees <symbol>`
- "What did we decide last time?" / past plans, retros, learnings:
    `gbrain search "<terms>" --source gstack-brain-<user>`

Grep is still right for known exact strings, regex, multiline patterns, and
file globs. Run `/sync-gbrain` after meaningful code changes; for ongoing
auto-sync across all worktrees, run `gbrain autopilot --install` once per
machine — gbrain's daemon handles incremental refresh on a schedule.

Safety: don't run `/sync-gbrain` while `gbrain autopilot` is active — the
orchestrator refuses destructive source ops when it detects a running autopilot
to avoid racing it (#1734). Prefer registering user repos with `gbrain sources
add --path <dir>` (no `--url`): URL-managed sources can auto-reclone, and the
sync code walk for them requires an explicit `--allow-reclone` opt-in.

<!-- gstack-gbrain-search-guidance:end -->
```
(`sync-gbrain/SKILL.md:1091-1143`, marked "copy exactly" at line 1091.)

The block is deliberately **machine-agnostic**: no engine type, no page counts, no last-sync timestamp — that state lives in the separate `## GBrain Configuration` block instead (`setup-gbrain/SKILL.md:1547-1551`).

**Distinct sibling block — `## GBrain Configuration`** (written by `/setup-gbrain` Step 8, not delimited by the search-guidance markers, holds machine state): mode (local-stdio/remote-http), engine, config file path, setup date, MCP-registered yes/no, artifacts sync mode, **current repo policy** (`setup-gbrain/SKILL.md:1504-1538`). For Path 4 it additionally records the MCP URL and server version and explicitly states the bearer token is never written there (`setup-gbrain/SKILL.md:1510-1525`; also `setup-gbrain/memory.md:255-273` with a worked example).

---

## §env-vars

All variables below verified against actual source (not just prose docs) — file:line given for both the doc mention and the real usage site where found.

| Var | Where read | What it does |
|---|---|---|
| `GBRAIN_DATABASE_URL` | `gbrain init`/`gbrain doctor` (upstream); `bin/gstack-gbrain-source-wireup:84-85` (precedence: flag > env > config) | Postgres connection string handoff, env-only, never argv (`USING_GBRAIN_WITH_GSTACK.md:251,373`) |
| `DATABASE_URL` | fallback, checked second; `bin/gstack-gbrain-sync.ts:807,1095,1255`, `lib/gbrain-sources.ts:259` (seeded from gbrain's own config for child processes) | Same semantics as `GBRAIN_DATABASE_URL` (`USING_GBRAIN_WITH_GSTACK.md:252`) |
| `SUPABASE_ACCESS_TOKEN` | `bin/gstack-gbrain-supabase-provision:90-91,133` | PAT for Supabase Management API calls (create/list-orgs/etc); discarded after each setup run, never persisted (`USING_GBRAIN_WITH_GSTACK.md:249,283`) |
| `DB_PASS` | `bin/gstack-gbrain-supabase-provision:96-97` | Generated DB password for Supabase project creation; env-only, never argv (`USING_GBRAIN_WITH_GSTACK.md:250`) |
| `SUPABASE_API_BASE` | `bin/gstack-gbrain-supabase-provision:70,113` | Overrides Management API host (`https://api.supabase.com` default); used by tests to point at a mock server (`USING_GBRAIN_WITH_GSTACK.md:253`) |
| `GBRAIN_MCP_TOKEN` | `bin/gstack-gbrain-mcp-verify:41,82,159` | Bearer token for Path 4 remote-MCP verify + registration; env-only (`setup-gbrain/SKILL.md:1128-1134`) |
| `GBRAIN_INSTALL_DIR` | `bin/gstack-gbrain-install:50,206` | Overrides default gbrain install path (`~/gbrain`) (`USING_GBRAIN_WITH_GSTACK.md:210,254`) |
| `GSTACK_HOME` | ubiquitous, e.g. `bin/gstack-gbrain-repo-policy:50`, `bin/gstack-distill-apply:27` | Overrides `~/.gstack` state dir; heavy test use (`USING_GBRAIN_WITH_GSTACK.md:255`) |
| `VOYAGE_API_KEY` | `bin/gstack-gbrain-install:273,279` | When set, gstack inits PGLite with `voyage-code-3` (1024-dim), code-specialized embeddings (`USING_GBRAIN_WITH_GSTACK.md:62,256`) |
| `OPENAI_API_KEY` | `lib/conductor-env-shim.ts:10` (promoted key); `bin/gstack-codex-probe:27` | Fallback embedding provider for `gbrain embed` when `VOYAGE_API_KEY` unset (`USING_GBRAIN_WITH_GSTACK.md:257`) |
| `ANTHROPIC_API_KEY` | `lib/conductor-env-shim.ts:10`; `bin/gstack-distill-free-text:169-186` | Required for `claude-agent-sdk` calls / paid evals (`USING_GBRAIN_WITH_GSTACK.md:258`) |
| `GSTACK_OPENAI_API_KEY` | `lib/conductor-env-shim.ts:20-27,29-34` (promotion logic) | Conductor-injected fallback; promoted to `OPENAI_API_KEY` when canonical is empty (`USING_GBRAIN_WITH_GSTACK.md:259,264-266`) |
| `GSTACK_ANTHROPIC_API_KEY` | same promotion mechanism, `lib/conductor-env-shim.ts:10,20-27` | Same pattern for Anthropic (`USING_GBRAIN_WITH_GSTACK.md:260`) |
| `GSTACK_GBRAIN_PROBE_TIMEOUT_MS` | `lib/gbrain-local-status.ts:86-91` | Overrides the 15s default local-engine health-probe timeout that classifies `gbrain_local_status` (not in the doc's table but load-bearing for §trust-triad's Step 1.5 gate) |
| `GSTACK_INGEST_TIMEOUT_MS` | `bin/gstack-memory-ingest.ts:1389,1396,1402,1713,1715` | Memory/transcript ingest timeout, default 30min, accepts 1min-24h (`USING_GBRAIN_WITH_GSTACK.md:139`) |
| `GSTACK_MEMORY_INGEST_SCAN_SECRETS` | `bin/gstack-memory-ingest.ts:217` | Opt-in per-file gitleaks scan during memory ingest (off by default) (`setup-gbrain/memory.md:45-53`) |
| `GSTACK_DETECT_NO_CACHE` | `bin/gstack-gbrain-detect` main() (read directly) | Busts the 60s local-engine-status cache, used by the retry path in Step 1.5 remediation (`setup-gbrain/SKILL.md:875-877`) |

**Conductor promotion mechanism** — the one piece of actual code read in full: `lib/conductor-env-shim.ts:1-36`. `PROMOTED_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]` (line 10); `promotedEnv()` copies `base` and, for each key, sets it from `GSTACK_<KEY>` only if the canonical key is empty (lines 19-27); `promoteConductorEnv()` mutates `process.env` as a side effect on import (lines 29-36), invoked ambiently at module load (line 36). Wired into `bin/gstack-gbrain-sync.ts`, `bin/gstack-model-benchmark`, `scripts/preflight-agent-sdk.ts`, `test/helpers/e2e-helpers.ts` per the doc (`USING_GBRAIN_WITH_GSTACK.md:268-271`) — not independently re-verified per file in this pass, but the shim itself and its promotion list were.

---

## §hallazgos-que-cambian-el-plan

1. **The `read-only` tier is a storage flag, not an enforced runtime guard, in this codebase.** `bin/gstack-gbrain-repo-policy:35-36` says so in its own comment: read-only is "enforced at the caller level; this binary just stores the decision," and `setup-gbrain/SKILL.md:1330-1331` explicitly defers real enforcement to "the future auto-import hook + by gbrain resolver injection, not here." The only concrete effects observed in this repo are: (a) `/setup-gbrain` Step 6 skips the initial `gbrain import` for `read-only`/`deny` (`setup-gbrain/SKILL.md:1328-1332`), and (b) `/sync-gbrain` Step 1 STOPs outright for `deny` (`sync-gbrain/SKILL.md:878-883`) but has **no distinct branch for `read-only`** in the code I read — a `read-only` repo running `/sync-gbrain` is not blocked by that check, only by whatever gbrain's own resolver does downstream, which is out of scope for this repo. **For ebrain: setting korvex-* to `read-only` in `gbrain-repo-policy.json` stops the *setup skill* from importing and is the documented intent, but do not assume it hard-blocks a `gbrain put`/write call made through some other path (e.g., a raw `gbrain` CLI invocation or MCP tool call not gated by these two skills) — that gate lives in gbrain itself or in code not present in this vendor tree.** Worth an explicit test before trusting it for brisas/korvex isolation.

2. **`deny` is enforced pre-flight for sync, at the git-remote level, and skips both code AND transcripts.** Confirmed at three independent sites: `sync-gbrain/SKILL.md:878-883` (STOP before orchestrator runs), `setup-gbrain/memory.md:35-36` ("Repos under a deny trust policy...are skipped — neither code nor transcripts...ingest"), and the policy is keyed on the **normalized git remote**, not the local path (`bin/gstack-gbrain-repo-policy:62-96`). This means ebrain's brisas-del-golfo=deny setting is robust to the repo being cloned to a different path or a different worktree, as long as the `origin` remote URL matches. If brisas-del-golfo has no `origin` remote configured (rare but possible for a solo project pushed only via a deploy hook), the triad silently no-ops (`setup-gbrain/SKILL.md:1346`) — worth verifying brisas-del-golfo has a real origin remote if ebrain relies on this gate.

3. **Push is never in scope for anything in this contract.** Nothing in `USING_GBRAIN_WITH_GSTACK.md`, `setup-gbrain/SKILL.md`, or `sync-gbrain/SKILL.md` performs a `git push` to the *user's own repo* (korvex-web, brisas-del-golfo, etc.) as part of the gbrain connection. The only git-push behavior touching a real repo is the generic gstack CLAUDE.md-routing commit (`git commit -m "chore: add gstack skill routing rules to CLAUDE.md"`, `setup-gbrain/SKILL.md:294` — not gbrain-specific, shared skill boilerplate) and pushes are local commits, no `git push` invoked anywhere in these three files. The gbrain-related pushes are all to gstack's own `~/.gstack/` artifacts repo or a Supabase/PGLite brain, never the working repo. This is consistent with ebrain's "commits local, push prohibited" rule for korvex — there is nothing in the gbrain wiring itself that would push on your behalf; the risk surface (if any) is the generic routing-injection commit, which is local-only by default (no `git push` call found).

4. **MCP registration is always user-scope, machine-wide — not per-repo.** `claude mcp add --scope user ...` (`setup-gbrain/SKILL.md:1277,1302`) registers gbrain once per machine in `~/.claude.json`, available in every Claude Code session regardless of which repo is open. The **repo-level triad** is the only thing that scopes gbrain interaction per-project; the MCP tool surface itself (`mcp__gbrain__search`, `mcp__gbrain__query`, `mcp__gbrain__get_page`) is available everywhere once registered. **Implication for ebrain:** if korvex-* is read-only and brisas-del-golfo is deny, the `mcp__gbrain__*` tools are still technically *callable* from inside a brisas-del-golfo session — the triad governs whether the *skill* (`/setup-gbrain`, `/sync-gbrain`) imports/syncs that repo's code, not whether an agent sitting in that repo could manually invoke `mcp__gbrain__search` or `mcp__gbrain__put` against the shared brain. That's the same "enforced at caller level" gap as finding #1 — the actual write-time gate for a manual MCP call is not visible in this vendor tree.

5. **Two non-identical versions of the same CLAUDE.md guidance block exist across the two skills**, both under the same delimiters. `setup-gbrain/SKILL.md:1552-1578` writes a simpler version (no `.gbrain-source` pin explanation, no autopilot/call-graph notes) the first time setup's own smoke test (Step 9) passes. `sync-gbrain/SKILL.md:1091-1143` — explicitly labeled "verbatim block content (copy exactly)" — writes a fuller version with the worktree-pin explanation, call-graph caveats, and `gbrain autopilot` guidance. Since `/sync-gbrain` runs on every skill start's incremental path and any explicit re-sync, the sync-gbrain version is what actually persists after the first real sync; the setup-gbrain version is a transient initial state. Not a bug, but if ebrain snapshots or diffs korvex/brisas CLAUDE.md files against an expected template, use the **sync-gbrain** version as canonical, not the setup-gbrain one.

6. **The `.gbrain-source` pin file is local-only and gitignored, never the trust boundary.** `bin/gstack-gbrain-sync.ts:1010-1037` auto-appends `.gbrain-source` to the repo's `.gitignore` and the file records which local gbrain *source id* a worktree routes to — it carries no read-write/read-only/deny semantics itself and isn't a security control. Do not confuse it with the repo-policy triad when auditing korvex repos; two different files serve two different purposes (`.gbrain-source` = routing pin, `~/.gstack/gbrain-repo-policy.json` = trust decision, global to the user's machine, not per-repo file).

7. **A second, separate personal/shared "brain trust policy" exists per MCP endpoint** (`brain_trust_policy@<endpoint-hash>`, `sync-gbrain/SKILL.md:840-861`, `setup-gbrain/SKILL.md:1627-1694`, `bin/gstack-config:162-201`) and governs auto-push of `~/.gstack/` artifacts to the brain, not per-repo code access. If ebrain ever points korvex machines at a shared/remote gbrain MCP (Path 4) rather than local PGLite, this second axis needs its own explicit decision (`shared`, not `personal`) independent of the read-write/read-only/deny repo settings — conflating the two would either over-share Eduardo's personal artifacts to a team brain or under-restrict a brain that should stay read-only for consulting-style isolation.

8. **No auto-import hook ships in this version.** `USING_GBRAIN_WITH_GSTACK.md:377` states plainly gstack does not install any auto-import hook today, but the policy store ("read-write/read-only/deny") is "forward-compatible for one later." If ebrain's design assumes a background daemon enforces the triad continuously, that assumption is wrong for v1.60.1.0 — enforcement is skill-invocation-time only (when `/setup-gbrain` or `/sync-gbrain` actually runs), not continuous.
