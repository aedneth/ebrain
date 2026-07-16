---
type: implementation-handoff
project: ebrain
from: Codex (maker, interrupted)
to: Claude Code (next maker)
created: 2026-07-16
status: active
baseline_commit: 6fac279
required_checker: Fable 5 or another independent checker
---

# Handoff - F6 audit correction and OSS release closure

## Mission

Take over as the **maker** for ebrain and close every implementation and release
gap recorded by the independent GPT-5.6-sol F6 audit. The objective is an
open-source, plug-and-play developer tool: a user can install ebrain, run
`ebrain up`, use the TUI/CLI safely, and share a single daemon-backed memory bus
without being exposed to OAuth, bearer tokens, locks, client code, or subscription
assumptions.

Do not declare the gate passed yourself. Once your maker commits and verification
are complete, spawn one **independent Fable 5 audit agent**. Fable must inspect the
final tree and run its own tests/probes; it must not rely solely on this document or
your claimed results. GPT-5.6-sol can then perform the final independent re-audit.

## Exact workspace state

- Repository: `/home/eduardo.borjas/eBrain`
- Branch: `main`, currently ahead of `origin/main` by 21 commits. Do not push.
- Last committed baseline: `6fac279 Audit F6 and block unresolved release gate`.
- Prior maker bundle: `dd55592`; prior independent daemon gate: `d0fb6a5`.
- Shared daemon is live and healthy on loopback `127.0.0.1:8541` (PID may change).
- Do not read `.env*`, credential files, `.npmrc`, tokens, or environment dumps.
- Do not use or inspect the denied client repositories `brisas-del-golfo` and
  `dekko`. Fixture directories named for deny-list regression tests are acceptable
  only under a temporary test directory and must never point at a real client repo.
- One heavy interactive agent at a time on the 4 GB machine. No provider request or
  paid model call is required for this work.

### Context loading order

Before editing, read in this order:

```bash
cd /home/eduardo.borjas/eBrain
cat docs/HANDOFF.md
cat docs/HANDOFF-CLAUDE-F6-CORRECTIONS.md
cat docs/AUDIT-GPT-5.6-SOL-F6.md
cat docs/SPRINT-TUI.md
cat docs/SPRINT-ORCHESTRATION.md
cat docs/adr/ADR-005-user-governed-model-selection.md
sed -n '1,100p' CHANGELOG.md
ebrain daemon status
git status --short --branch
```

`AGENTS.md` was not tracked in the repository at audit time. The governing norms
are in `harness/core/NORMS.md`; create a rendered repo `AGENTS.md` as part of the
OSS release work, but do not edit the managed norms block manually.

## What is already built and must be preserved

1. **Phase D daemon is accepted at its earlier independent gate.** One daemon owns
   the PGLite writer lock; agents connect through authenticated MCP-HTTP on loopback.
   `ebrain up`/`onboard` mint and store the agent token internally and configure
   detected agents. Do not regress the daemon or expose token values.
2. **F6 control plane exists.** The Bun TUI has Home, Sessions, Launch, Memory,
   Routing and Doctor panels, tmux session control, a prompt composer, workflow
   materialization, profile/target contracts and a factual cost ledger.
3. **ADR-005 governs routing UX.** Task Profile reports explainable signals and a
   capability. It must never claim a universally best agent/model, show personal
   credits/subscriptions, auto-route, or treat changing benchmarks as routing truth.
   Users choose their model ordering in local execution profiles.
4. **Cost accounting is token/provider telemetry only.** Do not add subscription
   allocation. Unreported usage remains `untracked`; token-only data must not be
   converted to invented USD.
5. **Latest checker baseline was green before findings:** CLI `177 pass / 0 fail`,
   TUI `381 pass / 0 fail`, zero-hex scan clean, daemon healthy, bridge 94 tools,
   doctor `29 ok / 2 warn / 0 fail`. Those counts will legitimately change when
   regressions are added.

## Current uncommitted WIP from Codex - inspect, finish or replace deliberately

The worktree is intentionally dirty. These changes are **not tested as a feature,
not documented, and not committed**. They are a partial start on G56-F5 only:

- `cli/isolation.ts`: adds `SourceIdentity` and `isClientSourceRecord()` so source
  filtering considers `id`, display `name` and local `path`, case-insensitively.
- `cli/remote-tools.ts`: exports the existing `callTool()` helper for reuse.
- `cli/query.ts` (new): proposed typed adapter calling MCP `sources_list` then
  structured MCP `query` with `source_id`, rather than parsing human gbrain CLI
  lines. It returns `{schema_version:1,query,results,partial,failures}` and scrubs
  returned snippets.
- `scripts/ebrain-q`: reduced to a thin `exec bun run cli/query.ts` entrypoint.

Only these parse checks have run:

```bash
bun -e 'await import("./cli/query.ts")'
bash -n scripts/ebrain-q
```

They passed. No test, live daemon smoke, schema update, or commit has been done.
Verify the upstream MCP response shape against the pinned gbrain code and a
non-paid live query before retaining this design. In particular, prove that
`source_id` works for remote MCP callers on the current pin. If it does not, keep
the textual parser behind a tested TypeScript adapter; never restore the shell/
`awk`/`jq` parser as an untested contract.

## This handoff's close trace

- `git diff --check` passed after creating the handoff and kickoff artifacts.
- Codex stored a durable handoff-learning with `ebrain remember`. Local persistence
  succeeded, but its MCP write-through warned that the learning is not yet
  searchable while the daemon is up. Do not treat that warning as an audit pass;
  diagnose it separately if it persists after the correction work. No secret value
  was printed or recorded.
- No full test suite was run after the uncommitted query WIP, by design. The next
  maker owns validation before it can be committed.

## Audit findings and required implementation

### G56-F1 - HIGH - workflow symlink isolation

Files: `cli/workflows.ts`, `cli/workflows.test.ts`, `cli/isolation.ts`.

`ingestWorkflows()` currently checks paths textually. A safe-looking symlink can
resolve into a denied client path and be copied into the local workflow store.

Implement:

1. Canonicalize each configured source root with `realpath` before traversal.
2. Fail closed if the textual or canonical root is denied.
3. Canonicalize every discovered file. Reject it if it is denied or outside the
   canonical accepted root. Do not recurse through symlink directories.
4. Persist canonical `source_path` values. When loading a record for `skillify`,
   reject an existing source path that resolves into a denied repo so a manually
   crafted store cannot materialize it as a skill.
5. Preserve normal local workflows and missing-source/offline behavior where it is
   safe to do so. Do not delete user workflow records.

Add regressions for: denied root through symlink, denied file through symlink,
symlink outside an otherwise safe root, normal in-root file, and skillify refusal
with no `SKILL.md` produced. Use harmless temporary fixture directories only.

### G56-F2 - HIGH - Launch Wizard drops reviewed task/workflow

Files: `tui/src/app.ts`, `tui/src/knowledge/run.ts`,
`tui/src/knowledge/contracts.ts`, `cli/targets.ts`, relevant TUI/CLI tests.

The wizard currently plans/launches only target data. It never delivers the task
shown to the user, drops `workflowId` from the cost event, and its preview does not
show the initial prompt. Manual Launch also reads mutable state after an async
operation and ignores its `AppEffect.prompt` snapshot.

Implement a single immutable `LaunchIntent` or equivalent with:

```ts
{ prompt: string; workflowId?: string }
```

Requirements:

1. Capture task/workflow at the reducer boundary before any governor, profile,
   target-plan, tmux, or subprocess await.
2. Carry the same snapshot through manual launch, RAM confirmation, target preview,
   target governor confirmation and actual target launch.
3. Target preview must show the prompt being delivered and workflow attribution,
   along with target/profile/model/RAM/MCP/memory context. For multiline workflow
   prompts, make the preview scrollable or otherwise reviewable without silently
   substituting/truncating the payload.
4. Extend `ebrain targets launch` to accept a prompt through stdin (for example
   `--prompt-stdin`), not an argv flag or log. Accept a separately validated
   `--workflow` identifier for ledger attribution.
5. After tmux session creation, deliver the exact stdin bytes by `sendToSession`.
   If delivery fails, retain the session, return structured `prompt-send` failure
   without echoing the prompt, refresh Sessions and surface a recoverable UI error.
6. Write the existing `untracked` launch event with workflow attribution. Never
   invent USD/tokens.
7. Avoid a blind fixed race if practical; an explicit short readiness strategy
   should be tested with the fake agent. Do not leak prompt text into logs.

Required tests: pure reducer snapshot tests; preview carries exact intended value;
manual governor path; target governor path; fake-agent tmux E2E proving task bytes
arrive exactly and the cost sidecar records workflow ID. Keep test data secret-free
and clean tmux sessions in `finally`.

### G56-F3 - MEDIUM - Memory search selection mismatch

Files: `tui/src/app.ts`, `tui/test/knowledge/panels.test.ts`, `tui/test/app.test.ts`.

When search exists, rendering uses `m.search.results`, but arrows and Enter still
select/open `m.data.learnings`.

Add `searchSelected` (or an equivalent explicit result-mode selection) to
`MemorySlice`. While a search is active:

- arrows select only the displayed result collection;
- Enter opens the selected search result's scrubbed detail;
- selection resets/clamps on every query result set;
- submitting an empty search or an explicit clear returns to recent learnings with
  normal `selected` behavior; document the key in the hint bar.

Cover zero, one, many, refresh and switch-back cases.

### G56-F4 - MEDIUM - scrub federated search at the trusted boundary

Files: `tui/src/knowledge/contracts.ts`, tests.

`parseSearch()` currently accepts raw snippets. Scrub both slug and snippet when
normalizing search JSON, before state storage or rendering. Reuse the canonical
`scrubSecrets()` implementation rather than maintaining a second regex list.
Test assignment style, provider-token style and PEM-like content. Test both list and
detail paths. CLI query output should also avoid displaying token-shaped output.

### G56-F5 - MEDIUM - stable q contract and isolation

Files: WIP above, `cli/contract.test.ts`, new `cli/query.test.ts`, possibly
`cli/isolation.test.ts`, TUI contracts.

The old shell wrapper parsed human text and applied a case-sensitive ID-only deny
filter. Finish or replace the WIP so the public contract is stable and every source
is filtered by authoritative `id`/`name`/`path` deny logic.

Required contract cases:

- positive structured merge, score order and slug deduplication;
- empty eligible-source results;
- malformed `sources_list` payload;
- malformed source result rows;
- one source failure plus successful rows (`partial:true`, failure metadata);
- all source failures (loud nonzero error, no silent empty result);
- case/path/name denied sources excluded;
- executable `scripts/ebrain-q` wrapper smoke using a safe fake Bun executable or
  another hermetic technique.

Update `cli/contract.test.ts` to validate `schema_version`, `query`, `results`,
`partial`, and `failures`. Keep the TUI on `ebrain q --json` only; it must not read
brain files or invoke gbrain directly.

### G56-F6 - MEDIUM - English-only visible surface

Files include `cli/task-profile.ts`, `cli/profiles.ts`, `cli/targets.ts`,
`cli/sessions.ts`, `cli/ebrain`, `tui/src/knowledge/run.ts`, and TUI tests.

All visible strings that can reach the TUI must be English: task-profile disclaimer,
spawn/exit/invalid-JSON errors, profile/target/session errors and Launch help/error
paths. Internal comments may remain Spanish. Prefer a global targeted scan plus
fixtures for CLI stderr propagated through `runEbrainJson`; do not claim English-only
solely because the common happy path is translated.

### G56-F7 - MEDIUM - profile provenance invariants

Files: `cli/profiles.ts`, `cli/profiles.test.ts`.

Enforce in `parseProfileStore()`, not just mutation helpers:

- trimmed non-empty `evidence.source` and catalog `source`;
- strict ISO-8601 UTC timestamp accepted consistently for `as_of`;
- unique catalog IDs;
- existing profile/model checks remain.

The parser must reject malformed existing stores. Add a single fixture that combines
empty profile provenance, empty catalog provenance and duplicate catalog ID, plus
strict timestamp boundary cases.

### G56-F8 - MEDIUM - static undated pricing appears factual

Files: `cli/routing.ts`, `cli/model-pricing.ts`, `tui/src/knowledge/contracts.ts`,
`tui/src/app.ts`, routing/contract/panel tests and docs.

Recommended closure: remove undated model pricing and the "typical" cost estimate
from the default Routing contract/view. Preserve actual token and provider/model
ledger metrics in Cost. Continue showing selected model chains as user configuration,
not as a recommendation or current billing assertion. Do not add subscription cost.

Alternative only if fully implemented: user-approved catalog pricing with source and
`as_of` per model, clearly distinct from actual spend. Do not use a stale hardcoded
snapshot. Update ADR-005 and sprint claims accordingly.

## OSS release blockers

### G56-R1 - HIGH - plug-and-play release artifacts missing

Implement and test:

1. **MIT `LICENSE`.** The existing README says ebrain inherits MIT unless Eduardo
   decides otherwise, so use MIT unless the user changes that decision.
2. **Root `package.json`.** Add public `name`, `version`, `description`, `license`,
   `type`, `bin` mapping to `cli/ebrain`, engine/prerequisite metadata and focused
   test scripts. Preserve the `zod` dependency and lockfile consistency.
3. **`scripts/install.sh`.** Public `curl -fsSL ... | sh` entrypoint that installs
   Bun if missing, clones/updates ebrain into a user-owned directory, pins/clones
   the documented gbrain commit, installs dependencies, links `ebrain` into a user
   bin directory, and runs `ebrain up`. It must be idempotent, avoid printing secret
   values, never source foreign dotenv files, and offer documented safe overrides
   for isolated tests (`EBRAIN_HOME`, local source/repository/ref, skip-up only for
   test). Do not auto-install agent CLIs or invoke providers.
4. **Installer test.** Exercise it twice under an isolated temporary `HOME` using
   local repositories/fake Bun as needed. Assert idempotence, launcher path and that
   no secret-bearing config is committed. The production default must still call
   `ebrain up`; test bypasses must be opt-in env flags.
5. **CI.** Add `.github/workflows/ci.yml` with checkout, Bun setup, pinned gbrain
   checkout before tests, dependency install, CLI/TUI suites, shell syntax checks,
   zero-hex rule and a secret scan. CI must not call providers or need credentials.
6. **Repo agent norms.** Add `AGENTS.md` using the canonical
   `harness/core/NORMS.md` rendered block. Use `ebrain norms render AGENTS.md`; do
   not manually edit the managed block.
7. **Public README.** Replace the personal Spanish CKIS narrative with an English
   OSS README: what it is, prerequisites, install, `ebrain up`, TUI/CLI quickstart,
   OpenRouter profiles are user governed, actual token telemetry semantics, privacy/
   security, supported adapters, troubleshooting, uninstall/rollback, contribution
   and license. Do not state that subscriptions are measured or models are best.

### G56-R2 - gate and source-of-truth reconciliation

No maker can complete the human acceptance or audit pass alone. You must:

1. Update `docs/SPRINT-TUI.md`, `docs/f6-success-criteria.md`,
   `docs/human-checklist.md`, `docs/SPRINT-ORCHESTRATION.md`, README and handoff
   claims so they match the actual final implementation. Remove stale statements
   such as static pricing being verified or F6 being complete before a gate.
2. Keep F6.6.7 and F6.7.6 at pending/re-audit until Fable reports independently.
3. Leave the human checklist unchecked until Eduardo performs visual acceptance,
   real-adapter write-back, first-use wizard and daily-driver checks. Record exact
   commands and expected observations, not invented passes.

## Execution sequence and commits

Use one maker at a time. After each structural phase: focused tests, `CHANGELOG.md`,
specific `git add <paths>`, descriptive commit, and an `ebrain remember` learning if
reusable. Never use `git add -A` or add `.brain/`, `.claude/`, `graphify-out`,
backups or secrets.

1. `Harden workflow and query contracts`
   - F1, F5, F7 and F6's CLI-visible English paths.
2. `Deliver reviewed launch intents and secure memory search`
   - F2, F3, F4 and the TUI-visible English paths.
3. `Prepare open-source plug-and-play release`
   - F8, R1 and document reconciliation allowed before final gate.
4. `Document maker correction for independent audit`
   - Final docs/HANDOFF-BACK and checklist state after verification.

Suggested focused verification after each cut:

```bash
bun test ./cli/workflows.test.ts ./cli/query.test.ts ./cli/isolation.test.ts ./cli/profiles.test.ts
bun test ./cli/targets.test.ts ./tui/test/app.test.ts ./tui/test/launch.test.ts ./tui/test/knowledge
bash -n scripts/ebrain-q scripts/install.sh
git diff --check
```

Final maker verification, all local/no paid provider call:

```bash
bun test ./cli/
bun test ./tui/test/
rg -n '#[0-9A-Fa-f]{3,8}' tui/src --glob '!theme.ts'
rg -n '#[0-9A-Fa-f]{3,8}' tui/test --glob '!theme.test.ts'
ebrain daemon status
scripts/ebrain-mcp-bridge --probe
ebrain doctor --json
```

Run the installer only in isolated temporary state with explicit test-only overrides;
never point it at a client repo, real credentials or the active production HOME.

## Mandatory independent audit handoff

After all maker commits and final suite results are recorded:

1. Stop maker work; ensure no uncommitted unrelated changes remain.
2. Spawn **one Fable 5 agent as an independent checker** with the final maker commit,
   this audit report and the acceptance criteria. Tell it to reproduce F1 through F8
   independently, inspect the installer/CI/README, run full suites, perform daemon/
   bridge/doctor non-paid probes and attempt the symlink, prompt-delivery, search
   selection/scrub, source-isolation and provenance regressions.
3. Fable must state `[FABLE_AUDIT_PASS]` or enumerate evidence-backed failures in
   `docs/AUDIT-FABLE-F6-CORRECTIONS.md`. It must not edit product code while acting
   as checker.
4. Hand Fable's report and the final maker commits to GPT-5.6-sol for the last
   independent audit. Only a fresh `[AUDIT_PASS]` can mark F6.6/F6.7/release ready.

## Closing trace required from Claude

Before returning the work, update `docs/HANDOFF-BACK.md` with: implementation
summary, decisions and rationale, test commands/results, all remaining human or
checker gates, new gotchas, final commit IDs, and the exact Fable prompt/result.
Add a newest-first `CHANGELOG.md` entry. Store one durable, secret-free learning per
material lesson using `ebrain remember "..."`.
