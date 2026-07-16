# GPT-5.6-sol Audit - F6 and Release Readiness

Date: 2026-07-15
Checker: GPT-5.6-sol
Maker under review: Codex
Commit: `dd55592`
Baseline: `d0fb6a5` (last independent daemon gate)
Verdict: **`[AUDIT_FAIL]`**

## Scope

The audit covered `d0fb6a5..dd55592`: daemon finding closure, orchestration, profiles,
targets, workflows, cost ledger, Launch/Memory TUI work, hardening and ship artifacts. The
previous independent Fase D gate was treated as the baseline, then rechecked with live,
non-paid daemon/bridge/doctor probes. No provider request, credential read or client-repository
access was performed.

## Blocking findings

### G56-F1 - HIGH - Workflow ingestion bypasses the client-repository deny-list through symlinks

`defaultSourceRoots()` resolves configured roots textually and `discoverMarkdown()` checks those
textual paths with `isClientPath()`, but neither resolves the root or each file with `realpath`.
An audit fixture whose innocent symlink resolved to a denied path returned
`{"real_target_denied":true,"files_ingested":1}`. This can copy denied markdown into the local
workflow store and later materialize it as a skill.

Evidence: `cli/workflows.ts:213`, `cli/workflows.ts:231`, `cli/workflows.ts:250`.
Required closure: resolve roots and files, reject denied realpaths fail-closed, prevent traversal
outside the accepted root, and add symlink regression tests for ingest plus skillify.

### G56-F2 - HIGH - Launch Wizard drops the task and workflow instead of launching the reviewed work

The wizard preview/confirmation contains only `TargetPlanData`. `launchTarget()` invokes
`ebrain targets launch` without task or workflow, and the target CLI has no prompt input. The
session starts with the selected model but does not receive the task shown in Launch; workflow
attribution is also omitted from the cost event. The preview required by ADR-005 does not display
the initial prompt. The manual path has a related race: it reads `launchOf(state).task` only after
`newSession()` resolves, while its effect's optional prompt snapshot is ignored.

Evidence: `tui/src/app.ts:1082`, `tui/src/app.ts:2388`, `tui/src/app.ts:2610`,
`tui/src/app.ts:2628`, `cli/targets.ts:154`, `docs/adr/ADR-005-user-governed-model-selection.md:95`.
Required closure: snapshot task/workflow before I/O, show the exact prompt in preview, deliver the
same bytes to the created target, attribute the workflow, surface send failure without losing the
session, and prove it with a fake-agent E2E.

### G56-F3 - MEDIUM - Memory search renders one collection but navigates and opens another

When search results are visible, rendering uses `m.search.results`; arrows and Enter still use
`m.data.learnings` and `m.selected`. The audit reproduction kept selection at zero and opened
`RECENT-NOT-SEARCH` while the visible row was `SEARCH-RESULT`.

Evidence: `tui/src/app.ts:577`, `tui/src/app.ts:637`, `tui/src/app.ts:1763`.
Required closure: give search results their own selection/detail behavior, reset/clamp selection
on each query, and test zero/one/many results plus switching back to recent memory.

### G56-F4 - MEDIUM - Federated search text reaches the terminal without secret scrubbing

`parseSearch()` accepts the snippet verbatim and `buildMemoryView()` renders it directly. A fake
token shape was retained by the parser even though the existing `scrubSecrets()` recognized it.
This contradicts F6 criterion 7's no-secret-rendering claim.

Evidence: `tui/src/knowledge/contracts.ts:38`, `tui/src/app.ts:1769`,
`docs/f6-success-criteria.md:14`.
Required closure: scrub at the trusted data boundary before any search row/detail is stored or
rendered, then add assignment, provider-token and PEM tests.

### G56-F5 - MEDIUM - `q --json` is not a stable or fully isolated contract

The wrapper converts human-formatted gbrain output into JSON with shell splitting, but the unified
contract suite has no `q` schema or executable wrapper test. Its runtime deny filter is
case-sensitive and checks only source ID; the authoritative guard is case-insensitive and checks
ID, name and local path. The audit probe showed an uppercase denied source survives the wrapper's
filter. Daemon preflight reduces exposure but does not make this runtime claim true.

Evidence: `scripts/ebrain-q:35`, `scripts/ebrain-q:52`, `scripts/ebrain-q:64`,
`cli/isolation.ts:24`, `cli/contract.test.ts:1`.
Required closure: consume a structured upstream result or put parsing behind a tested adapter,
reuse one isolation function/contract, and add positive, empty, malformed, partial-failure and
case/path/name deny tests.

### G56-F6 - MEDIUM - The visible TUI is not English-only

Task Profile returns a Spanish disclaimer that Launch renders. `knowledge/run.ts` produces Spanish
spawn/exit/JSON errors, and Spanish Profiles/Targets/Sessions errors can be surfaced by Launch and
Sessions. The live task-profile probe returned `disclaimer_is_english:false`.

Evidence: `cli/task-profile.ts:67`, `tui/src/knowledge/run.ts:60`, `cli/profiles.ts:53`,
`cli/targets.ts:92`, `cli/sessions.ts:202`, `cli/ebrain:98`.
Required closure: make every user-visible TUI success, empty and error path English; internal
comments may remain Spanish. Add a visible-string/error fixture scan.

### G56-F7 - MEDIUM - Profile provenance invariants are weaker than documented

The store parser accepts empty `evidence.source`, empty catalog source and duplicate catalog IDs.
An audit fixture combining all three was accepted. This undermines the user-governed evidence
contract and can make model provenance ambiguous.

Evidence: `cli/profiles.ts:53`, `cli/profiles.ts:92`, `cli/profiles.ts:104`.
Required closure: require trimmed non-empty provenance, strict ISO timestamps and unique catalog
IDs in the parser itself; cover malformed existing stores, not only mutation helpers.

### G56-F8 - MEDIUM - Routing still displays undated static pricing as verified pricing

The TUI presents hardcoded per-million prices and a typical cost estimate from
`model-pricing.ts`, but those values carry no source or `as_of`. The file itself says profiles
would replace this snapshot; that replacement is not implemented. This can look like current
billing despite the factual ledger being separate.

Evidence: `cli/model-pricing.ts:1`, `cli/routing.ts:53`, `tui/src/app.ts:2003`.
Required closure: either remove estimated pricing from the default view or source it from dated,
user-approved evidence and label source/date distinctly from actual token spend.

## Release blockers outside the F6 delta

### G56-R1 - HIGH - The repository is not yet an open-source plug-and-play release

The declared north star requires `curl | sh -> ebrain up`, but no installer exists. The repo also
has no `LICENSE`, no CI workflow, no version/bin/test scripts in the root package manifest, and no
repo `AGENTS.md`. `README.md` remains a personal Spanish CKIS description with stale architecture
and manual setup rather than a public installation/quick-start contract.

Evidence: `docs/HANDOFF.md:53`, `docs/HANDOFF.md:99`, `docs/HANDOFF-BACK.md:280`,
`README.md:1`, `package.json:1`.
Required closure: build and test the idempotent installer in an isolated HOME, add the chosen
license and CI gates, publish package/CLI metadata, add contributor agent norms, and rewrite the
public README around prerequisites, install, `ebrain up`, security and uninstall/rollback.

### G56-R2 - GATE - Human acceptance and source-of-truth reconciliation remain open

F6a-e are unchecked. F6.6.7 and F6.7.6 have no accepted gate, while sprint/handoff documents also
contain stale, contradictory completion claims. Automated evidence cannot substitute visual,
real-adapter write-back, first-use and daily-driver acceptance.

Evidence: `docs/human-checklist.md:48`, `docs/SPRINT-TUI.md:98`,
`docs/SPRINT-TUI.md:109`, `docs/SPRINT-ORCHESTRATION.md:96`.

## Independent verification

- `bun test ./cli/`: **177 pass, 0 fail**.
- `bun test ./tui/test/`: **381 pass, 0 fail**.
- Zero-hex scans outside `theme.ts`/theme tests: clean.
- `git diff --check d0fb6a5..HEAD`: clean.
- Daemon: UP/healthy; MCP bridge: **94 tools**.
- `ebrain doctor --json`: rc 0, **29 ok / 2 warn / 0 fail**. Existing warnings:
  `adapter:gemini`, `spend:gbrain-gap`.
- Private config/token/thin-client files checked by mode only: all **0600**.
- Live `ebrain q --json`, profiles, targets and task-profile schema probes completed without a
  paid model request.

## Gate decision

Fase D remains accepted at its prior independent gate. F6.6/F6.7 and the open-source release are
**not accepted** at `dd55592`. The maker must close G56-F1 through G56-F8 and reconcile G56-R1/R2;
GPT-5.6-sol must then re-run focused regressions, full suites and the final gate. Checker findings
must not be marked resolved by the checker without a distinct maker commit.
