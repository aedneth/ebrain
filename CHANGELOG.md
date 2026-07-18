# CHANGELOG — ebrain

Una línea por cambio estructural (disciplina Company Brain). El más reciente arriba.

---

## 2026-07-18 -- F10.1 AGPL-3.0-only distribution metadata

- **Root licensing aligned:** replaced the root MIT text with the exact GNU AGPL v3 text and set
  package, README, and contributor metadata to `AGPL-3.0-only`. A regression test fixes the exact
  official license digest so the root declaration cannot silently drift.
- **Upstream terms preserved:** added `THIRD_PARTY_NOTICES.md` and corrected the distribution
  description: the installer/CI obtain the pinned gbrain engine separately in ignored local vendor
  state, under its upstream MIT terms. Root AGPL terms do not relicense it or other dependencies.
- **Verification status:** focused license/install/onboarding/English checks passed `23/0`; full
  suites and static checks are recorded in the maker report. Independent licensing review remains
  required before release.

## 2026-07-18 -- F10.0 Public claim and privacy audit

- **Evidence before public copy:** added a claim matrix that distinguishes verified local behavior,
  user-configured dependencies, and planned work. It maps daemon onboarding, MCP boundaries,
  governed memory, workspaces, routing/cost telemetry, source install, and future website/shell
  claims to implementation and tests.
- **Release blockers made explicit:** the audit records historical operator material and
  operator-specific isolation identities as public-release blockers. It requires a neutral
  configurable policy, a public-document allowlist, and an owner-approved history strategy before
  any public visibility change. No private data was read, copied, or exposed by this audit.
- **Verification status:** focused implementation evidence passed `138/0`; independent review is
  still required before licensing or public-copy changes are treated as release-ready.

## 2026-07-18 -- F9.3 Fixture-only migration recovery and audit closure

- **No private-data migration:** F9.3 adds an internal synthetic-fixture proof only. It neither
  reads nor imports `agent-memory` content, exposes a public import command, adds a TUI action, or
  makes the private repository a dependency. The metadata-only audit boundary remains explicit in
  ADR-008.
- **Recoverable immutable records:** fixture migration now derives deterministic episode IDs, keeps
  a private path-free/text-free migration ledger, and binds a safe fixture ID/hash privately to an
  immutable `legacy-import` episode. Reruns and lost-ledger recovery skip/rebuild exact records;
  changed input fails closed instead of creating a duplicate or overwriting history.
- **Passive contract preserved:** public CLI/TUI episode summaries may label fixture provenance but
  still reject bodies, paths, content hashes, and private migration metadata. Public `episodes
  record` rejects the internal source.
- **Verification status:** focused migration/episode/contract/TUI suites passed `143/0`; final full
  suite and static verification are recorded in the maker report. Independent approval remains
  required by design.

## 2026-07-18 -- F9.2 Governed episodes and reviewed procedures

- **Bounded local recall:** added immutable, scrubbed episode records with opaque identifiers,
  safe provenance, private atomic storage, explicit bounded retrieval, and local lexical recall.
  Passive list output is summary-only. A successful `ebrain remember` mirrors to an episode on a
  best-effort basis, so a mirror failure cannot invalidate the original durable learning.
- **Human-reviewed procedure lifecycle:** added path-free procedure summaries and a private
  metadata sidecar for explicit use evidence and `active`/`stale`/`archived` review state. Existing
  workflow records remain the content source of truth; procedure actions never execute commands,
  infer success, choose providers, or create skills automatically.
- **Memory cockpit consolidation:** Memory now presents episode-first Recall, metadata-only Context,
  reviewed Procedures, and clearly-labelled legacy session logs. The TUI stores no episode/context
  body, path, event history, command, model, or provider value; an episode detail shows provenance
  only, while existing procedure materialization/attach behavior is preserved.
- **Verification status:** focused CLI/TUI contracts and engines passed `154/0`; final full suites
  passed CLI `264/0` and TUI `441/0`. Independent approval is still required by design.

## 2026-07-18 -- F9.1 Governed operating context packs

- **Human-governed context:** added private local operator and registered-workspace Markdown packs
  with bounded explicit retrieval, strict metadata, atomic private writes, explicit versioned human
  updates, and reviewable proposals. A proposal carries safe agent/session provenance and a base
  version/hash; it never alters active context until `review accept --yes`, and a stale base fails
  rather than overwriting a human update.
- **Summary-only Launch:** Launch reads only context identity/version metadata and shows eligible
  operator/workspace packs. Pack bodies are neither loaded into TUI state nor injected into prompts.
- **Path-free public memory:** `memory recent --json` no longer returns local learning/session paths.
  The CLI contract and TUI parser reject any future path field rather than silently accepting it.
- **Verification status:** focused contracts passed `164/0`; an isolated dispatcher/TUI smoke passed
  at `100x30` and `80x24`; final post-hardening suites passed CLI `242/0` and TUI `436/0`.
  `docs/F9-CONTEXT-MAKER-REPORT.md` records the independent-checker reproduction focus.

## 2026-07-18 -- F9.0 Governed agent-memory contract

- **Four explicit layers:** ADR-008 separates human-governed operating context, immutable scrubbed
  episodes, existing federated knowledge, and reviewed workflow/skill procedures. It preserves
  clean-install local operation and makes CKIS federation optional.
- **Boundaries before engine work:** proposals never activate context directly; terminal output is
  not an episode; procedure lifecycle is review-only; no autonomous provider, dialectic pass,
  skill creation, model selection, or preference mutation is introduced.
- **Privacy correction planned:** the ADR identifies historical filesystem paths in `memory recent`
  CLI JSON as a contract leak to remove in F9, while retaining only bounded local internal reads.
  It also records a metadata-only audit of the private `agent-memory` repository without reading
  or copying any content.

## 2026-07-18 -- F8.3 Native shell discovery gate

- **Proposed boundary:** ADR-007 specifies a tmux-owned login shell per generated workspace ID,
  with a distinct `ebsh-` prefix, strict registry revalidation, idempotent create/reuse, and the
  existing attach-versus-switch-client handoff.
- **No embedded evaluator:** the proposed surface accepts neither paths, commands, nor environment
  overrides. It captures no shell output, does not feed memory, and must not inject eBrain control
  variables or token-store data into the shell.
- **Independent gate required:** ADR-007 remains proposed and lists the contract, isolation,
  lifecycle, environment, tmux, responsive-UI, and no-capture checks required before code is
  authorized. No runtime behavior changed in F8.3.

## 2026-07-18 -- F8.2 Workspace cockpit

- **Multi-project control surface:** added `4:workspaces`, with registered directories and live
  tmux-derived activity side by side at normal widths, plus full-width selected detail. The
  compact `80x24` view stacks those panels without hiding the primary registration path.
- **One strict registry:** add, rename, and remove use only structured `ebrain workspaces` calls;
  mutations re-read the validated store, removal is y-only and affects neither directories nor
  sessions. The current directory remains a clearly marked temporary launch candidate.
- **Immutable session context:** existing sessions retain their canonical cwd. Their display gets
  a workspace label only for an exact registered-cwd match; live activity contains no history and
  shows active count plus latest live-session creation in selected detail.
- **Verification:** `docs/F8-WORKSPACES-MAKER-REPORT.md` records focused contracts, a real tmux
  `100x30`/`80x24` smoke, CLI `229/0`, TUI `433/0`, source/diff zero-hex, diff safety, and the
  independent-checker focus. Maker review remains pending by design.

## 2026-07-18 -- F8.1 Sessions multiline prompt editor

- **Complete editor model:** Sessions `p` now opens a cursor-aware multiline editor instead of
  showing only the last four lines. It preserves exact in-memory draft bytes, supports bracketed
  paste and `Alt+Enter`, uses logical Home/End and visual-row arrows, grows until its safe terminal
  cap, then follows the cursor through a truthful viewport.
- **Safety unchanged:** plain Enter still opens exact-payload review; only `y` sends literally to
  tmux. Drafts remain outside session logs, memory, telemetry, workspaces, cost records, and
  history.
- **Verification:** pure editor edge cases, compact/normal/wide frames, real tmux fake-agent smoke,
  TUI suite `425/0`, and the F8.0 baseline are recorded in `docs/F8-COMPOSER-MAKER-REPORT.md`.
  Independent checker review remains pending.

## 2026-07-18 -- Workspace, memory, and OSS program planned

- **Product program:** added `docs/ULTRAPLAN-WORKSPACES-MEMORY-OSS.md`, the implementation
  contract for a complete Sessions composer, a dedicated Workspaces cockpit, a tmux-native shell
  discovery gate, governed Hermes-informed agent-memory consolidation, and OSS documentation/site
  readiness.
- **Boundaries fixed before code:** tmux remains the terminal data plane; the TUI does not evaluate
  arbitrary commands; private `agent-memory` is not an OSS dependency; CKIS federation is optional
  on clean installs; context and skills remain human-governed; push, release, and Vercel deployment
  require explicit authorization.

## 2026-07-17 -- F7 review package prepared

- **Independent-checker handoff:** added `docs/F7-REVIEW-PACKET.md` with the final F7 review
  range, reproduction commands, security/UI invariants, visual matrix, fake-agent cwd evidence,
  and the explicit remaining human acceptance. It intentionally contains no maker audit verdict.
- **Maker QA evidence:** final CLI/TUI suites, harness contract, shell syntax, whitespace,
  zero-hex, secret-safety, and bare-command visual smokes are recorded in the packet and handoff.

---

## 2026-07-17 -- Frictionless TUI entry point

- **Bare command:** `ebrain` now opens the interactive cockpit when stdin and stdout are TTYs and
  `TERM` is usable. `ebrain ui` remains a compatible explicit alias.
- **Script safety:** no-argument non-interactive invocation continues to print ordinary help rather
  than hanging or emitting an alternate-screen UI. Explicit `ebrain ui` in a pipe/CI context fails
  before starting Bun with a clear terminal requirement.
- **Verification:** dispatcher tests cover non-TTY help, non-TTY alias rejection, and a pseudo-TTY
  fixture proving both invocation forms dispatch to the same TUI entrypoint; live bare-command
  tmux smoke opened the Launch workspace picker successfully.

---

## 2026-07-17 -- Validated multi-workspace Launch

- **Workspace registry:** added `ebrain workspaces list|validate|add|rename|remove`, a strict
  local schema that persists only generated IDs, labels, and canonical directories. Each read and
  write revalidates `realpath`, rejects duplicates, missing/non-directory paths, and literal or
  symlinked client repositories; the directory and store file use private modes.
- **Low-friction picker:** Launch now has `[g] workspace`. Its searchable picker exposes the
  validated caller directory plus registered workspaces, can register a directory through an
  explicit two-field dialog, and shows the active workspace in both Launch and the footer. It is
  a structured control-plane surface, not an internal shell or command runner.
- **Launch integrity:** direct sessions validate the active workspace immediately before the RAM
  gate, and Guided Launch validates it before opening then reuses the same picker for its workspace
  field. Existing sessions retain their original cwd; selecting another workspace only affects a
  later launch. The previous free-form wizard directory path is removed.
- **Verification:** registry contracts cover strict schema, canonicalization, duplicate rejection,
  private atomic persistence, and literal/symlink client denial. A real tmux fake-agent E2E starts
  two sessions from separate registered directories and verifies each recorded cwd; responsive
  picker/add-dialog render tests cover 80x24, 100x30, and 160x48.

---

## 2026-07-17 -- Manual-first Launch and deterministic Task Setup

- **Visual hierarchy:** Launch is now tab `2` and Sessions tab `3`. Manual Agents is the primary
  large left panel at normal widths and the first complete panel at 80x24; Guided Launch and Task
  Setup are secondary, focusable decisions. Both direct and guided launches retain the automatic
  transition to Sessions.
- **Deterministic onboarding:** Task Setup replaces visible automatic signals with six explained,
  user-selected capability presets and an optional exact task prompt. It neither creates nor
  mutates an execution profile, selects a provider/model, or starts a session. `r` clears only
  transient task/category/workflow/preview state.
- **Truthful wizard:** Guided Launch now presents active target/profile/capability/directory values
  in the responsive dialog. Singleton fields show `locked` and do not advertise working arrows;
  multi-choice fields continue to cycle. Directory and task editors wrap complete values with a
  visible viewport rather than clipping them.
- **Verification:** TUI `414 pass / 0 fail`; CLI `218 pass / 0 fail`; compact real-tmux captures
  inspected for Launch, category guide, and singleton wizard; zero-hex and diff checks clean.

---

## 2026-07-17 -- Responsive dialog foundation for compact terminals

- **No clipped explanatory dialogs:** added `ResponsiveDialog`, a semantic dialog renderer that wraps plain prose before styling it, preserves preformatted prompt payloads, exposes an honest scroll position, and keeps every resulting row at the terminal width.
- **Safe migration:** read-only details, contextual help, confirmations, target review, profile initialization, and session prompt review now use the responsive path. Arrow scrolling is available only to read-only/confirmation dialogs; input and selection overlays retain their existing key ownership until their F7.2/F7.3 rebuilds.
- **Privacy and confirmation invariants:** a long prompt review now shows the full exact payload through its scroll viewport, and only `y` can still send it. No prompt is persisted or rendered outside the review dialog.
- **Verification:** TUI `409 pass / 0 fail`; CLI `218 pass / 0 fail`; focused dialog integration `33 pass / 0 fail`; zero-hex scan and `git diff --check` clean.

---

## 2026-07-17 -- Workspace-first Launch UX plan

- **Planned F7 delivery:** documented the next Launch program in `docs/ULTRAPLAN-LAUNCH-WORKSPACES.md`: Manual Agents becomes the primary panel; Guided Launch and explicit Task Setup become secondary, deterministic decisions; all dialogs receive a responsive, scrollable rendering foundation; and the cockpit gains a validated multi-workspace model.
- **Architecture decision:** ADR-006 chooses a workspace registry and picker before any embedded general shell. tmux remains the durable data plane; arbitrary command execution and a terminal emulator are explicitly deferred behind their own security and lifecycle design.
- **Premises verified:** Guided Launch arrows already cycle target/profile state. The apparent failure with one target/profile is a misleading singleton affordance, not a reducer failure. The plan changes `r` from signal refresh to transient task-setup reset and preserves user-owned execution profiles.
- **No runtime behavior changed in this documentation phase.**

---

## 2026-07-17 — Launch experience polish

- **Decision-oriented Launch:** the TUI now separates **task & signals**, **guided launch**, and **manual agents** into focusable panels. `Enter` acts only on the focused panel, eliminating invisible wizard state and accidental agent launches while preserving the manual-agent path.
- **Modal wizard:** `w` opens a centered guided-launch dialog with visible target, profile, capability, and directory fields. Tab/arrows operate only in that dialog; directory editing returns to it; preview, immutable `LaunchIntent`, stdin task delivery, deny-client enforcement, and RAM confirmation remain unchanged.
- **Compact controls:** all hint rows use centered `[key] action` controls with muted keys and primary labels. The visible row is capped at six actions; `?` now presents a view-specific action reference. Launch retains all six manual agents at 80x24.
- **Documentation:** added `docs/UX-LAUNCH-POLISH.md` and updated `tui/README.md` plus the TUI sprint record. This is UX implementation/test evidence; the completed independent F6 audit remains recorded separately.

---

## 2026-07-16 — F6 maker correction (Claude): ALL 8 findings + R1/R2 closed (pending re-audit)

Maker session on the GPT-5.6-sol F6 findings. Every finding G56-F1..F8 + blockers R1/R2 closed, each with focused tests (CLI suite 177 → **217 pass / 0 fail**, TUI **397 pass / 0 fail**, zero-hex clean):

- **G56-F1 (HIGH) workflow symlink isolation** (`c15c637`) — `ingestWorkflows`/`discoverMarkdown`/`skillify` now realpath-canonicalize roots and files, fail closed on denied realpaths, never traverse symlink dirs, persist canonical `source_path`, and refuse skillify on records resolving into a client repo. +4 symlink regressions.
- **G56-F5 (MEDIUM) stable `q` contract + isolation** (`37dbdcc`) — retained + finished the typed `cli/query.ts` adapter (structured MCP `sources_list`/`query(source_id)`, merge/dedup/scrub, `{schema_version,query,results,partial,failures}`). Verified against gbrain v0.42.58; fixed the real defect: `sources_list` exposes `local_path` (not `path`) — the WIP read the wrong field, disabling path-based deny. Full `cli/query.test.ts` + contract q schema + isolation record test + hermetic wrapper smoke.
- **G56-F7 (MEDIUM) profile provenance** (`5f49c76`) — parser now rejects malformed existing stores: trimmed non-empty provenance, strict ISO-8601 UTC `as_of`, unique catalog ids.
- **G56-F6 (MEDIUM) English-only visible surface** (`c84cf1f`; `run.ts` via sweep `168d1c0`) — translated every user-visible success/empty/error path in `task-profile.ts`, `sessions.ts`, `tui/src/knowledge/run.ts` and the `cli/ebrain` dispatcher (usage + all echoes); `workflows.ts`/`profiles.ts`/`targets.ts` were done earlier. New `cli/surface-i18n.test.ts` scan-guard flags Spanish on output-sink lines across all surfaces (caught 2 misses during authoring); disclaimer avoids "rank" to keep the no-ranking invariant.
- **G56-R1 (docs)** (`e90b6b0`) — public landing-page `README.md` (English, outcome-first, implicit differentiation, "Built with Codex & GPT-5.6"), `LICENSE` (MIT), `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `docs/ROADMAP.md`, `AGENTS.md` (rendered from NORMS.md), and `docs/devpost-submission.md` + `docs/devpost-polish-plan.md` for the OpenAI Build Week (Developer Tools) submission.
- **G56-R1 (installer/CI)** (`ee84bf4`) — `scripts/install.sh` (POSIX `curl|sh` → `ebrain up`, idempotent, gbrain pin `a25209b`, test overrides) + hermetic `cli/install.test.ts`, `.github/workflows/ci.yml`, and public `package.json` metadata (zod preserved, lockfile consistent).
- **G56-F2 (HIGH) Launch delivers the reviewed task** — CLI half (`0e72808`): `ebrain targets launch --prompt-stdin --workflow` delivers the task over stdin via `sendToSession`, retains the session on a `prompt-send` failure (never echoes the prompt), and attributes the workflow on the untracked event. TUI half (`9b53700` + `a51b6d7` sweep): an immutable `LaunchIntent {prompt, workflowId}` is snapshotted at the reducer boundary and threaded through both confirm overlays + effects; the preview now shows the exact task + workflow; the manual path uses the snapshot (no post-await re-read).
- **G56-F4 (MEDIUM) federated search scrubbed at the TUI boundary** (`d4a4680`) — extracted the secret scrubber into a single pure source of truth (`cli/scrub.ts`, re-exported from `sessions.ts` so every existing consumer is unchanged); `parseSearch` now scrubs slug + snippet at the trusted data boundary before any row is stored or rendered (defense in depth over the source-level scrub in `q`). +3 tests (assignment, provider-token in snippet/slug, PEM block).
- **G56-F3 (MEDIUM) memory search results get their own selection** (`8058d54`) — `MemorySlice.searchSelected` gives the results box its own cursor; `moveSelection`/`drillIn` navigate + open the SELECTED search row (never the learning underneath), `buildMemoryView` renders search rows through `scrolllist` with the cursor, `doSearchMemory` resets the cursor per query, and `esc` switches back to recent memory. +7 tests (zero/one/many, cursor-follow, audit repro, switch-back, render clamp).
- **G56-F8 (MEDIUM) undated pricing removed from Routing** (`73f6df7`) — deleted `cli/model-pricing.ts` (undated `PRICING_USD_PER_M` + `estimateRouteCost`); `routing.ts`/parseRouting/app drop per-token `pricing` + `est_typical_usd`; `free` is now slug-derived only. Routing shows factual MTD spend, not estimates. Regression guard: routing contract schema is `.strict()` (a reintroduced pricing/est breaks it), parser drops stale fields, panel asserts no est column/price line.
- **G56-R2 (GATE) doc reconciliation** (`c95ad30`) — reconciled the contradictory F6 completion claims: authoritative "F6 GATE STATUS" banner in `SPRINT-TUI.md` (per-line `[x]` = maker evidence, not an accepted gate), fixed the "pricing verificado" claims (superseded by F8), reconciled 6.6.5 ([ ] vs [x]), and confirmed the human F6a-e items stay unchecked. Gate NOT accepted.

**Interim independent audit:** Fable 5 returned **`[FABLE_AUDIT_PASS]`** for the first slice (F1/F5/F7/F6-CLI/R1) with its own reproductions — `docs/AUDIT-FABLE-F6-CORRECTIONS.md`. Found F-CF-1 (installer test cold-run timeout) and F-CF-2 (README roadmap + changelog count stale), both fixed. F2/F3/F4/F8/F6-TUI/R2 landed after that pass and still await the final re-audit.

**Maker gate COMPLETE + independent re-audit PASSED (`33710a9`):** all 8 findings (G56-F1..F8) + both blockers (R1/R2) are closed with per-finding commits + regression tests, and an **independent gate re-audit reproduced every finding with its own fixtures and returned `[AUDIT_PASS]`** (CLI 217/0, TUI 397/0, zero-hex clean, diff clean) — not self-declared by the maker. It surfaced one LOW follow-up **F-CF-3** (`q` failure messages ran only the weak `redactSecrets`; a bare assignment could survive) + 3 doc/schema nits; all closed by the maker in `0c887c4` (compose `scrubSecrets(redactSecrets(...))` + test; routing header/`.strict()`/SPRINT-TUI nits). **Final acceptance still PENDING** and NOT substituted by automated evidence: **human acceptance F6a-e** (`docs/human-checklist.md`) — visual, real-adapter write-back, first-use, daily-driver.

---

## 2026-07-16 - F6 correction handoff prepared for independent maker and checker

- **Authoritative continuation:** added `docs/HANDOFF-CLAUDE-F6-CORRECTIONS.md`, which maps every GPT-5.6-sol finding to implementation, regression, release and final-gate work without declaring the audit passed.
- **Claude kickoff:** replaced the obsolete bootstrap-era prompt with the current maker brief in `docs/KICKOFF-PROMPT.md`; it explicitly requires spawning an independent Fable 5 agent after maker verification.
- **WIP disclosure:** the handoff records the uncommitted structured `ebrain q` adapter start as untested work, so the next maker validates or replaces it before commit.

---

## 2026-07-15 — GPT-5.6-sol F6 audit: gate failed

- **Independent verdict:** F6.6/F6.7 are not accepted at `dd55592`; `docs/AUDIT-GPT-5.6-SOL-F6.md` records eight implementation findings and two release/gate blockers with reproductions.
- **Green baseline:** CLI 177/0, TUI 381/0, daemon healthy, bridge 94 tools, doctor 29 ok / 2 warn / 0 fail and zero-hex clean.
- **Maker handoff:** client-path symlink isolation, Launch task delivery, Memory search correctness/scrubbing, q contract isolation, English UI, profile provenance and dated pricing require a separate maker correction before re-audit.

---

## 2026-07-15 — F6 ship artifacts prepared

- **Retro and checklist:** added the OSS F6 retro and human acceptance steps for visual review, real write-back, first-use wizard, daily-driver use and the independent audit package.
- **Gate discipline:** F6.7 remains pending GPT-5.6-sol; no maker self-approval is recorded.

---

## 2026-07-15 — Cross-source memory search in the TUI

- **`ebrain q --json`:** cross-source fan-out now has a stable result contract with query, source, score, slug and snippet.
- **Memory:** `s` opens an in-TUI search composer and renders the structured results without reading brain files directly.
- **Coverage boundary:** `docs/TUI-CLI-COVERAGE.md` distinguishes daily control-plane actions from explicit host/installation administration.

---

## 2026-07-15 — F6.7.4: matriz de criterios de éxito completa

- **Evidencia trazable:** los ocho criterios TUI enlazan contratos, E2E, guardrails, privacidad, diseño y métricas.
- **ADR-005 aplicado:** las tareas canónicas prueban señales y compatibilidad, no una afirmación de mejor modelo; write-back real y memoria cross-agent quedan identificados como checks humanos del gate final.

---

## 2026-07-15 — Launch first-use setup and English TUI docs

- **No terminal detour:** Launch now offers explicit in-TUI initialization of the local execution profile; only `y` migrates existing routing, then the wizard reloads.
- **English surface:** Launch errors, setup modal, user documentation, runbook entry and keybinding guide use English as the default UI language.

---

## 2026-07-15 — F6.7.2: perf TUI medida y distribución decidida

- **Celeron:** boot previo 0.08-0.10 s, RSS activo observado 47 MiB, CPU idle ~0.6% y peek 1 Hz ~1.8% de un core.
- **D8:** se mantiene `bun run`; no se agrega `bun build --compile` porque no hay ganancia medible frente al costo de distribución/release.

---

## 2026-07-15 — F6.7.1: hardening de edge cases TUI

- **Carrera tmux cerrada:** si el servidor desaparece después de listar sesiones y antes de `peek`, la UI limpia output stale y muestra un error recuperable en lugar de presentarlo como live.
- **Matriz de degradación:** `docs/TUI-EDGE-CASES.md` enlaza guards para lock, timeouts, terminal pequeño, fallback 256/ASCII y restauración del terminal, incluyendo el residual acotado de PEM parcial.

---

## 2026-07-15 — F6.6.6: fixtures canónicos de Task Profile

- **Cobertura sin recomendador:** diez tareas versionadas ejercen las seis capacidades y comprueban exclusivamente señales explicables, capability y modos compatibles.
- **Sin ranking implícito:** los fixtures no contienen providers, modelos, precios, agentes ni ganadores; el test rechaza que esos campos entren al contrato Task Profile.
- **Reglas literales visibles:** queda cubierto que `script` también hace match dentro de `TypeScript` y que `tool` no equivale a `tool-call`.

---

## 2026-07-15 — F6.6.5: composer exacto + evidencia de benchmarks descriptiva

- **Prompt seguro y deliberado:** `p` en Sessions abre un composer multilinea; paste y Alt+Enter conservan saltos de linea. Enter abre preview y solo `y` manda los bytes exactos. Los drafts no se persisten ni se incorporan al ledger/historial.
- **Launch estabilizado y guiado:** se elimina la referencia indefinida `initialPrompt`; un task de Launch se toma del estado actual antes de enviarse. Cuando faltan perfiles OpenRouter, `w` explica la inicializacion local requerida; Tab alterna target/perfil como indica la vista.
- **Benchmark evidence sin autoridad:** `cli/benchmark-evidence.ts` valida procedencia (`source`, `as_of`, `version`, `task_scope`) y metricas opcionales sin aceptar winner, secretos ni politica de routing. `docs/BENCHMARK-EVIDENCE-SCHEMA.md` publica el contrato.

---

## 2026-07-15 — F6.6.4: Launch Wizard gobernado por usuario

- **Wizard en Launch:** carga targets/perfiles por CLI JSON, permite seleccionar target/perfil/capability/cwd y materializa `targets plan` antes de cualquier sesion.
- **Preview y guardrails:** muestra contexto harness/MCP/memoria/workflow, modelo efectivo, RAM y estado `untracked`; confirmacion explicita y segundo gate del gobernador cuando aplica.
- **Fix de estabilidad:** la navegacion del grid preserva el slice completo Launch; `r` ya no puede perder `task` y sacar la TUI.

---

## 2026-07-15 — F6.6.3: target OpenCode/OpenRouter con argv declarado

- **`ebrain targets`:** descubre targets declarados en manifests y construye `plan`/`launch` desde un perfil de usuario, sin inferir soporte para otros adapters.
- **OpenCode primero:** `opencode-openrouter` usa el selector comprobado `--model provider/model`; su argv se mantiene estructurado hasta la serializacion segura requerida por tmux.
- **Telemetria honesta:** crear una sesion registra solo un evento `untracked` atribuido. Tokens/USD se agregan despues y solo si un adapter los reporta.

---

## 2026-07-15 — F6.6.2: perfiles OpenRouter locales, verificables y sin secretos

- **`ebrain profiles`:** contratos `list`, `show`, `validate`, `init`, `catalog-add` y `create` para perfiles de ejecucion elegidos por el usuario.
- **Migracion explicita:** `profiles init --yes` convierte el routing local existente en `legacy-openrouter`; no se cambia la configuracion de nadie ni se instala un default universal.
- **Integridad y permisos:** el catalogo exige `source` + `as_of` antes de permitir un modelo; el store estricto rechaza campos desconocidos, modelos no catalogados y duplicados. Directorio `700`, archivo `600`, escrituras atomicas.
- **Guia OSS:** `docs/EXECUTION-PROFILES.md` documenta el setup, alta de catalogo y creacion de perfiles sin credenciales ni cuotas.

---

## 2026-07-15 — F6.6.1: Task Profile explicable, sin advisor de modelos

- **Nuevo `ebrain task-profile --json`:** expone tarea, senales keyword, capability seleccionada y modos de ejecucion compatibles. No devuelve agente, modelo, ranking, benchmark, credito, suscripcion ni costo de sesion.
- **Compatibilidad controlada:** `ebrain advise` ahora es alias del mismo contrato. El pricing de Routing se separa en `cli/model-pricing.ts`; conserva su condicion de estimacion y nunca se usa para facturar una sesion.
- **TUI Launch:** `t`/`r` cargan Task Profile; Enter mantiene el agente elegido por el usuario. Se eliminan los caminos que lanzaban o ruteaban segun advice.
- **Benchmark evidence diferido:** `docs/BENCHMARK-EVIDENCE-PLAN.md` define la futura integracion opt-in, fechada y sin auto-routing para OpenCompass, LiveBench, LMArena, SWE-bench y Terminal-Bench.

---

## 2026-07-15 — ADR-005: pivot a seleccion de modelos gobernada por usuario

- **Se retira la premisa del advisor:** `ebrain advise` no se extendera como autoridad sobre el “mejor modelo”. Las reglas y benchmarks cambian, y los creditos/suscripciones personales no son datos OSS ni costos por tokens.
- **Arquitectura aprobada:** Task Profile explicable, perfiles de ejecucion elegidos por usuario, targets declarados por adapter y telemetria factual. Los benchmarks son evidencia con fuente/fecha/version, nunca auto-routing.
- **Ruta F6.6 replanificada:** OpenCode/OpenRouter sera el primer target agencial con selector de modelo real; el wizard mostrara cwd, contexto, modelo/perfil y estado de costo antes de confirmar. Ver `docs/adr/ADR-005-user-governed-model-selection.md` y `docs/SPRINT-ORCHESTRATION.md`.

---

## 2026-07-15 — F6.6E: ledger de tokens/costo verificable multi-provider

- **`ebrain cost --json`:** normaliza el spend ledger de OpenRouter y eventos locales de adapters en cortes por provider, agente, modelo, sesión y workflow. Expone tokens de entrada/salida, USD real, USD estimado y estado `metered`/`token-only`/`untracked`.
- **Sin costo de suscripción:** Claude, Cursor, OpenCode y cualquier adapter sin telemetría quedan `untracked`; cuando hay tokens sin precio, quedan `token-only`. ebrain nunca convierte una cuota mensual en gasto ficticio por ejecución.
- **Atribución end-to-end:** `ebrain route` acepta `--agent`, `--session` y `--workflow`; adjuntar un workflow a Launch conserva su ID si termina en una ruta OpenRouter.
- **TUI:** Routing (`5`) alterna a Cost Ledger con `c`, mostrando provider, tokens, USD conocido y atribución por workflow/sesión.
- **Documentación:** nuevo `docs/COST-LEDGER.md` fija fuentes, permisos, sidecar y límites.

---

## 2026-07-15 — F6.6C/D: workflow memory versionada + learning loop con aprobacion

- **`ebrain workflows`:** nuevo contrato JSON para `ingest`, `list`, `search`, `show`, `run`, `capture` y `skillify`. Descubre SOPs/workflows privados en runtime, guarda solo una representacion redactada y versionada en `~/.config/ebrain/workflows` (`700`/`600`), y nunca agrega ese contenido al repo.
- **Ejecucion deliberada:** `run` materializa prompt/checklist sin ejecutar nada. `skillify` escribe un `SKILL.md` local solo tras `--yes`; candidatos de `capture` requieren repeticion y son propuestas, no automatizaciones.
- **Memory UI:** nuevo panel workflows junto a learnings/session logs. Tab enfoca paneles; Enter previsualiza el prompt y `a` lo adjunta a Launch para que routing/lanzamiento sigan siendo explicitos.
- **Loop documentado:** `docs/WORKFLOW-LEARNING-LOOP.md` fija la adaptacion Hermes: sesion -> learning -> workflow -> skill, el puente hacia `list_skills`/`get_skill` y los guardrails de secretos, aislamiento y maker != checker.
- **Verify:** contratos CLI + parsers/reducer/render TUI cubiertos; las suites completas y el gate externo quedan requeridos antes de merge.

---

## 2026-07-15 — F6.6A/B: OpenRouter stack operable en Routing + Launch task router

- **Nuevo `ebrain routing --json`:** contrato read-only para el stack chino OpenRouter: capacidades, chains winner/fallback/floor, pricing verificado cuando existe, gasto MTD, remaining cap y comando operable. La TUI ya no necesita leer `routing.yaml`/`spend.jsonl` directo.
- **Routing tab actualizado:** muestra las cadenas reales por capability (`deepseek`, `kimi`, `minimax`, `qwen`, `z-ai/glm`) con spend/estimates y comando; se elimina la nota “pending routing --json contract”.
- **Launch task router:** la vista Launch conserva el grid manual de agentes y suma `t` para describir tarea → `ebrain advise --json`. Enter con `one_shot_route` confirma costo/modelo y ejecuta `ebrain route --json --cap`; Enter con carril de sesión lanza el agente recomendado y envía el prompt inicial. Frontier sigue confirm-only.
- **Plan estructurado:** nuevo `docs/SPRINT-ORCHESTRATION.md` separa F6.6A/B cerradas de workflows/skills (F6.6C/D) y cost ledger v2 (F6.6E).
- **Verify:** `bun test ./cli/` = **151 pass / 0 fail**; `bun test ./tui/test/` = **366 pass / 0 fail**; `git diff --check` limpio; cero-hex TUI limpio (`rg` sin matches fuera de `theme.ts`); smoke vivo `ebrain routing --json` muestra 7 capabilities y `ebrain advise` distingue one-shot OpenRouter vs sesión Codex. No se ejecutó un route pago adicional en este cierre; el path `routeTask` quedó cubierto por contrato/reducer y los smokes OpenRouter live venían del corte F-D2.

---

## 2026-07-15 — F-D2 cerrado: bridge stdio→daemon sin bearer en configs + smoke OpenRouter chino

- **F-D2 hardening universal cerrado:** `ebrain onboard` ya no persiste bearer/header en configs de agentes. Claude/Codex/Gemini/Cursor/OpenCode quedan registrados contra `scripts/ebrain-mcp-bridge`, un MCP stdio local que lee `EBRAIN_MCP_TOKEN` desde `~/.config/ebrain/mcp-token.env` chmod 600 en runtime y proxya al daemon HTTP-MCP `127.0.0.1:8541`. Las configs quedan command-only; el token store sigue fuera del repo.
- **OpenCode corregido:** su schema válido es `mcp.ebrain={type:"local", command:[bridge]}` y `instructions` debe ser array o ausente. `opencode mcp list` ahora conecta por el bridge.
- **Stack chino OpenRouter revalidado en vivo:** dry-run confirmó las cadenas `deepseek`, `moonshotai/kimi`, `minimax`, `qwen` y `z-ai/glm`; el endpoint `/models` tenía presentes los slugs primarios/floors revisados. Smokes reales por `ebrain-route --json` pasaron para `coding`, `agentic`, `long_context`, `terminal`, `general`, `web_design`, `reasoning`; `terminal` usó fallback server-side a `qwen/qwen3.7-plus`, validando la cadena de failover. Gasto mensual quedó muy por debajo del cap de USD 10.
- **Verify:** `bun test ./cli/` = **147 pass / 0 fail**; `bun test ./tui/test/` = **360 pass / 0 fail**; `ebrain onboard --all` = 5 OK; `bun run cli/mcp-bridge.ts --probe` = 94 tools; `ebrain daemon status` UP healthy; configs conocidas + token store = chmod 600; subconfigs `ebrain` de Claude/Gemini sin patrón bearer/header/token; Cursor/OpenCode command-only y sin headers.

---

## 2026-07-15 — Cierre findings FASE D: D.5.4 + F-F1 + F-D2 permisos

- **D.5.4 cerrado:** `scripts/ebrain-brain` corre `cli/daemon-preflight.ts` antes de `serve --http`; lista sources con el engine local cuando el lock aún está libre y aplica `assertNoClientSources()` sobre id/name/path. Si aparece `brisas`/`dekko`, el daemon hard-falla antes de bindear HTTP. Test nuevo: `cli/daemon-preflight.test.ts`.
- **F-F1 cerrado para CLI/write-back:** `ebrain-run` usa un `GBRAIN_HOME` thin-client separado (`~/.config/ebrain/gbrain-thin/.gbrain/config.json`) con `remote_mcp`; el secret OAuth vive en `~/.config/ebrain/remote-client.env` chmod 600 y NO se persiste en el config thin-client. `ebrain-q` lista sources vía MCP, usa `--source-id`, falla ruidoso si el daemon no responde y ya no devuelve vacío silencioso. `remember` y `sessions-federate` hacen write-through por MCP `put_page` al source `agent-memory`; `dream-cycle` ya no promete un sweep local mientras el daemon posee el lock.
- **Doctor daemon-aware:** `ebrain doctor --json` verifica `sources:isolation` vía MCP cuando el host está UP, en vez de diferir para siempre por lock. Verificado: `sources:isolation ok sources vía daemon MCP = propios/federados; cero cliente`.
- **F-D2 permisos:** `ebrain onboard` fuerza chmod 600 en configs conocidos de claude/codex/gemini/cursor/opencode sin leerlos; fix vivo aplicado a `~/.gemini/settings.json` y configs asociados. Queda pendiente hardening pre-release de indirection universal: las CLIs instaladas solo exponen bearer-env HTTP en Codex; Claude/Gemini/OpenCode aceptan headers literales para HTTP.
- **Verify:** `bun test ./cli/` = **142 pass / 0 fail**; `bun test ./tui/test/` = **360 pass / 0 fail**; `ebrain daemon restart` healthy; `ebrain up` = smoke 94 tools + onboard 5/5; `ebrain q "korvex" 2` y query al learning nuevo devuelven resultados bajo daemon; `remote-client.env`, thin config y configs de agents = chmod 600.

---

## 2026-07-15 — FASE D doble-gate: `[FABLE_AUDIT_PASS]` (segundo checker independiente) — 2 findings nuevos

- **Fable 5 = segundo checker (maker≠checker), veredicto `[FABLE_AUDIT_PASS]`** — confirma el `[AUDIT_PASS]` de Opus con evidencia PROPIA: swarm de **8 clientes MCP concurrentes** (más agresivo que los 6 de Opus) → 8/8 HTTP 200 en **0.163s**, 94 tools exactos, serve=1 sostenido, loopback (`ss`), auth negativa 401 sin/con-bearer-inválido; idempotencia `up`×2/`onboard --all`×2 limpia; suites cli 135/0 + tui 360/0; secret-safety limpio. Reporte: `docs/AUDIT-FABLE-FASE-D.md`.
- **F-F1 (media, NUEVO · confirmado por Opus) — superficie CLI/write-back rota bajo el daemon:** `ebrain q`/`sync`/`dream-cycle`/`sessions-federate` abren PGLite directo y contienden con el lock → `ebrain q "korvex"` = **rc=124 (cuelga 40s)**; los learnings escritos por CLI no se embeben ni son buscables con el daemon UP. Root cause: falta `remote_mcp` en `~/.gbrain/config.json` (rewire thin-client de ops CLI no hecho). **NO bloquea los gates** (el canal MCP de agentes funciona; inject-context usa MCP). Cierre obligatorio (maker): rutear ops CLI por el daemon + `dream-cycle`/`doctor` daemon-aware + `ebrain-q` fail-loud.
- **F-F2 (baja, NUEVO) — evidencia vacua:** el probe `ebrain q "brisas dekko cliente"` que maker y Opus citaron como aislamiento-vivo no probaba nada (vacío para todo, por F-F1). Retirado; el aislamiento se sostiene por federación default-deny + CI test.
- **Ajustes:** F-D1 sube a severidad **media** (2 de 3 capas compensatorias dormidas bajo el daemon → D.5.4 prioridad ALTA). F-D2: `~/.gemini/settings.json` en **664 world-readable** con bearer → fix `chmod 600` (las demás configs = 600).
- **Sin cambio de código de producto**; solo docs de auditoría (`docs/AUDIT-FABLE-FASE-D.md`, `docs/SPRINT-DAEMON.md`, `docs/HANDOFF-BACK.md`) + este CHANGELOG. Backlog de cierre para Codex: **D.5.4** (prioridad alta) + **F-F1 (a/b/c)** + chmod gemini.

---

## 2026-07-14 — FASE D CERRADA: `[AUDIT_PASS]` Opus (D.6 concurrencia PASS + D.7 gate) — daemon HTTP-MCP compartido

- **D.6 = PASS (auditoría Opus, checker).** Desde estado frío (daemon DOWN, cero `cli.ts serve`), `ebrain up` levantó el host loopback, leyó el token sin imprimirlo, smoke `tools/list`=94, onboard 5/5. **Prueba de concurrencia (criterio 1 del ADR-004):** 6 clientes MCP `tools/list` simultáneos → los 6 = 94 tools en **0.24s** con **UN solo** `cli.ts serve --http`; `claude mcp list`=`✔ Connected` + `codex mcp list`=registrado (env-var bearer) **en paralelo**, serve count=1 durante/después. `ss` = bind `127.0.0.1:8541` loopback-only. Resuelve de raíz el "MCP nunca carga" (lock single-writer): N clientes MCP servidos por UN dueño del lock, sin colgarse.
- **D.7 = `[AUDIT_PASS]` (Opus).** Los 4 gates GO satisfechos: (1) ≥2 agentes concurrentes ✔ · (2) serve HTTP auth+loopback auditado ✔ · (3) RAM viable ✔ (host idle ~9MB, 1428MB avail, governor un-heavy intacto) · (4) aislamiento cliente con test ✔ (con caveat). Suites: `bun test ./cli/` 135/0, `./tui/test/` 360/0. Idempotencia `ebrain up`×2 + `onboard --all`×2 limpia. Secret-safety: cero token en tracked/`daemon.log`; store fuera del repo chmod 600. **Fable 5 = segundo checker PENDIENTE (lo dispara Eduardo).**
- **Findings de auditoría:** **F-D1 (media/baja):** `assertNoClientSources()` no está cableada al boot del host — solo la ejerce el CI test; los docs lo sobre-afirmaban como "enforced en runtime". Corregidos D.5.3 + docstring de `cli/isolation.ts`; abierta **D.5.4** (maker/Codex) para cablearla al preflight de `ebrain-brain`. No es leak activo (probe vivo = cero cliente). **F-D2 (baja):** claude/gemini/opencode/cursor guardan el bearer en reposo en sus configs; solo codex usa indirección env-var → item de hardening antes del release público.
- **Verify:** ver `docs/SPRINT-DAEMON.md` D.6/D.7 + findings; `docs/HANDOFF-BACK.md` §Audit result (Opus).

---

## 2026-07-14 — P2 FASE D: doctor/harness ve el daemon + rename superficial de launchers

- **D.2.4 / D.4.3:** `ebrain doctor --json` ahora reporta `daemon:status`, launchers del daemon y modo MCP por adapter (`adapter:<agent>:mcp = http-daemon`). `ebrain harness status` muestra el modo MCP declarado por los manifests. Verificado: daemon OK, claude/codex/gemini/cursor/opencode con `MCP=http-daemon`.
- **D.4.4 rename superficial:** nuevos launchers `ebrain-run` y `ebrain-mcp`; `gbrain-run`/`gbrain-mcp` quedan como wrappers/symlinks compat para configs viejas y rollback stdio. Refs internos (`status`, `doctor`, `remember`, `mcp-wire`, `dream-cycle`, `ebrain-q`) prefieren `ebrain-run`/`ebrain-mcp` y caen a los nombres viejos si hace falta.
- **Verify:** `bash -n` de launchers/core OK; `ebrain doctor --json` rc=0 con `daemon:status ok`; `ls -l ~/.config/ebrain/{ebrain-run,ebrain-mcp,gbrain-run,gbrain-mcp}` muestra ejecutables nuevos + symlinks compat. Queda pendiente D.6/D.7: prueba ≥2 agentes reales concurrentes + auditoría Opus/Fable.

---

## 2026-07-14 — P1 plug-and-play: `ebrain up` + `ebrain onboard --all` (HTTP-MCP idempotente)

- **Nuevo `ebrain up`:** un comando asegura el daemon HTTP-MCP, recupera/acuña `EBRAIN_MCP_TOKEN` sin imprimirlo, corre smoke `tools/list`, y auto-registra agentes detectados. El token se guarda en `~/.config/ebrain/mcp-token.env` con chmod 600. El launcher `scripts/ebrain-brain` acuña el token **durante el boot, antes de bindear HTTP**, eliminando el baile manual stop/mint/start.
- **Nuevo `ebrain onboard [--all|agent]`:** registra claude/codex/gemini/cursor/opencode en `http://127.0.0.1:8541/mcp`. Codex usa `--bearer-token-env-var EBRAIN_MCP_TOKEN`; Claude/Gemini/OpenCode usan header bearer; Cursor se mergea en `~/.cursor/mcp.json`. Los manifests `mcp.register` ahora delegan a `ebrain onboard <agent>`, así `ebrain harness install --mcp` no revierte al stdio.
- **Fallback conservado:** `scripts/gbrain-mcp` sigue versionado como rollback stdio; no se borra el camino anterior. Las sesiones tmux (`ebrain sessions new`) inyectan `EBRAIN_MCP_TOKEN` desde el store para que agentes lanzados por TUI lean el brain sin shell-profile manual.
- **Daemon hardening:** `ebrain-daemon start` ahora usa `setsid` cuando existe; `nohup` ignoraba SIGHUP pero dejaba el host en el process group del runner, que podía limpiar con SIGTERM al cerrar la llamada. Verificado healthy >55s post-start con SID/PGID propios.
- **Verify:** `bun test ./cli/` = **135 pass / 0 fail**; `bun test ./tui/test/` = **360 pass / 0 fail**; `ebrain up` ejecutado 2× idempotente; smoke `tools/list` = **94 tools**; `ebrain onboard --all` = 5 OK. Queda pendiente para D.6/D.7: prueba exacta ≥2 agentes reales concurrentes + auditoría Opus/Fable.

---

## 2026-07-14 — FASE D: daemon HTTP-MCP compartido LIVE + handoff a Codex (D.2/D.5 hechos, cutover en curso)

- **Host daemon LIVE:** `gbrain serve --http --port 8541 --bind 127.0.0.1` (loopback) corriendo como dueño único del lock PGLite, vía `scripts/ebrain-brain` + `ebrain daemon {start|stop|status|restart}`. Verificado en vivo: `/health` 200, `/mcp` sin bearer 401, bearer válido (`gbrain auth create`) → **200**, escuchando solo en loopback, RSS 317MB / 561MB libres. Resuelve de raíz el "MCP nunca carga" (lock single-writer; cada `serve` stdio de agente hacía polling infinito).
- **D.2** (host launcher + control + auditoría auth crit.2=PASS) y **D.5** (isolation gate crit.4: `cli/isolation.ts` + 6 tests — plano-sesión `isClientPath` con cierre del gap symlink + plano-source `isClientSource`/`federatedSources`/`assertNoClientSources`) cerrados. **D.1** RAM gate=PASS. Falta D.4 (rewire completo)/D.6 (registrar agentes)/D.7 (gate+Fable).
- **Corrección de arquitectura:** `gbrain serve` es host-only → los agentes conectan por **MCP-HTTP directo** (no thin-client-serve). claude `--transport http --header`, codex `--url --bearer-token-env-var`.
- **Insight open-source (memoria `project_ebrain_open_source_plug_and_play`):** el cutover manual = la SPEC de un `ebrain up` plug-and-play. La fricción mata la adopción; el usuario nunca debe ver OAuth/tokens/locks.
- **Handoff a Codex:** `docs/HANDOFF.md` (estado + backlog priorizado + cómo trabajamos + gotchas destilados multi-sesión + docs clave + entregable HANDOFF-BACK) + `docs/KICK-OFF-PROMPT.md` (prompt para arrancar la sesión Codex). Prioridad 1 de Codex = `ebrain up`/`onboard` (plug-and-play). maker(Codex)≠checker(Opus), gate con Fable 5.

---

## 2026-07-14 — F6.6 fixes de daily-driver (review-3 Eduardo): launch full-access + último español + DIAGNÓSTICO MCP-nunca-carga

- **Launch en full-access por diseño (bug: claude no arrancaba en `⏵⏵ bypass permissions on`).** Los manifests lanzaban el binario pelado (`launch: claude`), así que ninguna sesión arrancaba en su modo full-access. Corregido en los 6 adapters según la norma documentada (agentes en full-access gobernados por aislamiento-por-dir + normas + guard de secretos, NO por gates): claude `--dangerously-skip-permissions` · codex `--dangerously-bypass-approvals-and-sandbox` · gemini `--yolo` · cursor (`agent`) `--force` · opencode `--auto` · generic `bash` (sin flag). Verificado que tmux **argv-splitea** el string multi-palabra (`sleep 300`→`sleep`+`300`) y que `resolveLaunch` devuelve el comando completo para los 6.
- **Último español en la UI → inglés.** El `reason` del **RAM governor** (modal de confirmación de 2º-heavy) seguía en español ("ya hay 1 agente pesado vivo · … MB libres · la norma es UN heavy…") — traducido en `governor.ts` ("1 heavy agent already live · … MB free · norm is ONE heavy at a time (Celeron 4GB)"). Barrido confirmó que el resto del español restante son solo comentarios de código (no UI). Fixture español de `launch.test.ts` también a inglés.
- **DIAGNÓSTICO (no fix aún) — el MCP de ebrain nunca termina de cargar en sesiones lanzadas.** Root cause confirmado empíricamente: `gbrain-mcp` corre `gbrain serve` que abre **PGLite con lock single-writer**; NO hay host HTTP en :8541 (el "servedBy mcp:8541" del status es el PID, no un puerto abierto). El orquestador (este Claude Code) tiene el lock; cada `gbrain serve` de agente lanzado hace **polling del lock en silencio para siempre** → el handshake MCP nunca completa. Probe: 2º `gbrain-mcp` con `initialize` piped → **exit 124 (colgado), cero respuesta**. gbrain SÍ soporta **thin-client** (`isThinClient` = tiene bloque `remote_mcp` → sin DB local, proxya al host). **Fix = la fase-daemon (ADR-004 = GO):** UN `gbrain serve --http` persistente en :8541 (dueño del lock) + todos los agentes (orquestador + lanzados) como thin-clients. Es decisión de Eduardo (cambia el backend de memoria vivo + toca el secret `GBRAIN_REMOTE_CLIENT_SECRET`) — no se ejecuta autónomo a mitad de sesión.
- **Verify:** TUI 360 + CLI sessions 25 = verde; resolveLaunch de los 6 adapters correcto; attach confirmado por Eduardo (dentro de sesión → `Ctrl-b d` sale al panel de sessions; en el panel → ya no sale del TUI). Código barrido por el auto-backup `ckis-backup` (`1fa697e`).
- **Decisión abierta:** ¿arrancar la **fase-daemon** (desbloquea memoria en agentes lanzados = valor core del cockpit) antes de las features de 6.6 (launch wizard, prompt composer, advisor v1)?

---

## 2026-07-14 — F6.6 arranca: focus model (Tab) + cursor de selección + contornos visibles (review-2 de Eduardo)

- **Cursor de selección (matiz del contour-only):** el relleno interior SÍ se usa — pero como **cursor de la opción seleccionada**, no como fondo estático de panel. `selectedBg` en toda lista navegable (ScrollList: memory results + sessions; Doctor checks; Doctor fleet; home active-sessions + latest-memories). El bg se re-asserta tras cada reset interno para cubrir toda la fila (`highlightRow`).
- **Contornos visibles:** `blurBorder` era `#232B3D` (invisible sobre el fondo nativo). Subido a `text.muted #565F73` → toda caja queda claramente delineada (foco=teal, blur=muted). El modal de help ahora usa borde teal (foco) para leerse como capa distinta.
- **Focus model (Tab) — base de F6.6:** Tab ya NO cambia de vista (eso es 1-6). **Tab/Shift+Tab mueven el anillo de foco entre las cajas** de la vista (caja enfocada = borde teal); **↑↓** navegan ítems de la caja enfocada; **Enter** hace drill-in (home sesión→attach · home memories→vista memory · home system→routing · memory result→modal detail · doctor check→detail). `regionsFor()`/`focusedRegion()` manejan render + reduce; estado por-vista (`focusRegion`, `memSelected`, `logSelected`, `fleetSelected`). Nuevo overlay read-only `detail`. Hint bars por-vista actualizadas.
- **Attach:** el hint de handoff ahora es **consciente del entorno** — `attach-session` (fuera de tmux) → `Ctrl-b d` detach; `switch-client` (dentro de tmux) → `Ctrl-b L` (Ctrl-b d ahí saca del cliente tmux entero = el bug que Eduardo pegó). Fix de raíz pendiente de confirmar su entorno tmux.
- **Verify:** TUI 360 + CLI 117 = **477 pass / 0 fail**; cero-hex limpio. Renders verificados: el foco teal sigue a la caja enfocada, bordes muted visibles, cursor de selección explícito. Commit `b974db4`.
- **Sigue F6.6:** launch wizard (6.6.1) · prompt composer (6.6.3) · advisor v1 (6.6.2). Al cerrar 6.6/6.7 → **auditoría profunda Fable 5** de todo (6.5→) como pidió Eduardo.

---

## 2026-07-14 — F6 UX hardening (review de daily-driver de Eduardo): theming contour-only + UI 100% inglés + hint de detach

- **Fondos internos = bug visual.** El fondo de la terminal es del USUARIO y no se puede matchear; rellenar interiores de cajas cerradas con `background.surface/raised` bandea contra el fondo nativo y se ve buggy. **Quitados TODOS los rellenos interiores** (14 paneles + statusbar + campo del promptbox + palette + confirm + help). El design system ahora vive en los **CONTORNOS** (borde teal foco / dim blur) + tono de texto. Se mantienen los **cursores** de selección pequeños (tab activo, fila seleccionada) — son acentos intencionales, no rellenos de caja. Adaptación deliberada de los mockups de navegador al medio terminal (documentada en los widgets).
- **Idioma: TUI 100% inglés** (es UI de sistema). Convertidos todos los strings user-facing (paneles, hints, overlays, mensajes de estado/error, guard de min-size) en app.ts/commands.ts/help.ts/widgets. Comentarios de código sin tocar.
- **Attach — descubribilidad del detach.** Attachear cede el terminal por completo a tmux; la vuelta es el binding de detach de tmux (`Ctrl-b d`), que ebrain no controla. Agregado a la hint bar de sessions (persistente) + hint impreso en el handoff (`doAttach`).
- **Verify:** TUI 354 + CLI 117 = 471 pass / 0 fail (snapshots actualizados al render contour-only + inglés). Home re-renderizado y verificado: cero banding interior, fondo nativo intacto. Commit `5ba4cce`.
- **Pendiente F6.6 (interactividad, input de Eduardo pedido):** modelo de foco con **Tab** — `1-6` salto de vista · `Tab`/`Shift+Tab` mueven el anillo de foco entre cajas de la vista · `↑↓` navegan ítems de la caja enfocada · `Enter` drill-in contextual (sesión→attach, memoria→abrir, spend→routing). Base de F6.6.

---

## 2026-07-14 — FASE 6.5 CERRADA: paneles de conocimiento (Overview/Memory/Routing/Doctor) + GATE 6.5.7 `[AUDIT_PASS]` (self-audit)

- **Plano de datos de conocimiento** (`tui/src/knowledge/{contracts,run}.ts`): los 4 paneles leen los MISMOS subcomandos contract-tested de F6.1 vía spawn de `ebrain <sub> --json` — `buildFrame` sigue PURO, solo `runUi` (impuro) invoca los fetchers, que delegan a parsers puros. **Cero lógica huérfana (criterio #2 del gate):** ningún panel lee `routing.yaml`/`spend.jsonl`/fs directo. Slices async con estado `loading/ready/error` → **jamás spinner-forever**.
- **6.5.1 Overview**: `status --json` real (brain/spend/fleet/memoria) + últimas 3 memorias + sesiones; **statusbar global cableada a datos vivos** (antes hardcodeada "fleet 6/6"). **6.5.4 Fleet/Doctor**: `fleet`+`doctor --json` colorizado por nivel (**✓/!/✗** DS-sancionados, fallback ASCII), `r` re-run async con spinner. **6.5.5 lock-awareness**: banner "brain served by MCP (lock)" + timestamp cuando `cached=true` (validado en vivo: cached=true real).
- **6.5.2 Memory** (alcance honesto): learnings violeta + session-logs + `r`→overlay `remember` (round-trip a memoria permanente). Búsqueda `ebrain q` sin `--json` → PromptBox informativo (passthrough, sin score/source inventado); `think` con costo → **6.6**. **6.5.3 Routing** (alcance honesto): tabla por-cap + gauge de presupuesto + flag gbrain-untracked; **cadenas ganador/fallback/floor y ledger por-evento DIFERIDOS** (sin contrato `routing --json`; leerlos directo reprobaría el criterio #2) → nota "pendiente" en el panel.
- **GATE 6.5.7 `[AUDIT_PASS]` (SELF-AUDIT Opus, fase read-only, menor riesgo que 6.4):** revisión de imports OK (knowledge no lee yaml/jsonl/fs; solo spawn del dispatcher; 5 subcomandos en la suite de contratos F6.1); buildFrame puro; secret-safety (doctor muestra NOMBRES de env, no valores; `remember` rechaza secretos). **maker≠checker:** 6.5.7 no designa Fable 5 (solo 6.0.8/6.4.8/6.7.6) y es superficie read-only → self-audit defensible; checker Fable 5 disponible si Eduardo lo pide.
- **Verify:** **TUI 354 + CLI 117 = 471 pass / 0 fail** (offline, fixtures puros); boot headless rc=0, **RSS 46.9 MiB** (ADR-003 ≤100MB); cero-hex limpio; fetchers reales probados contra subcomandos vivos (brain up, fleet 5-6/6, spend real, cached=true). Renders eyeball-verificados contra `screens-b.jsx` (Memory/Routing/Doctor) y `screens-a.jsx` (Home).
- **Residuales LOW no bloqueantes → 6.7:** (a) fetch en vuelo huérfano si se cierra durante boot; (b) doble-fetch si `r` en doctor mientras ya carga; (c) `ebrain q` search live + `think` con costo → 6.6.
- **Estado F6:** 6.0 ✅ 6.1 ✅ 6.2 ✅ 6.3 ✅ 6.4 ✅ **6.5 ✅** → sigue 6.6 (orquestación + advisor v1: launch wizard, prompt composer, advisor v1) · 6.7 (hardening + ship). Aparte, fuera de F6: **fase-daemon (ADR-004 = GO)** a planear.

---

## 2026-07-14 — GATE 6.4.8 `[AUDIT_PASS]`: FASE 6.4 CERRADA (loop maker≠checker completo con Fable 5)

- **El gate funcionó.** El checker independiente **Fable 5** auditó la superficie tmux de F6.4, devolvió `[ISSUES]` con la arquitectura sólida pero **2 gaps de seguridad reales + 3 menores** que el maker (Opus) no había visto solo. Maker aplicó los 5 fixes; checker **re-verificó sobre `3c60beb` con probes directos** (`od -c` de los bytes de send-keys, symlink real a repo de cliente, los inputs exactos del scrubber) → **`[AUDIT_PASS]`**.
- **Fixes (commit `3c60beb`):** **#1** [MEDIA-ALTA] scrubber de peek fugaba `SECRET_KEY=`/`ENCRYPTION_KEY=`/`SSH_KEY:` (sufijo `KEY` no era alternante), `sk-proj-`/`sk-svcacct-` (el `sk-<alnum>{20,}` se rompía en el guion) y bloques PEM → cerrado (6/6 redactan). **#2** [MEDIA] deny-list de cliente evadible por symlink → `realpathSync` antes del chequeo (un `atajo→brisas-del-golfo` ahora deniega rc=2). **#3** [MEDIA·correctness] `send-keys` sin `-l` → `-l --` + Enter aparte (un prompt `"Space"`/`"C-c"` llega literal, no como pulsación). **#4** comentario falso corregido. **#5** governor fail-open en `unknown` → fail-safe (gatea como heavy).
- **Limpio confirmado por el checker** (no tocado): target inmutable en kill/send/attach, `y`-explícito (enter no confirma), override logueado, terminal SIEMPRE restaurada (`disposed`+`attaching`), `buildFrame` puro, cero-hex.
- **Residual LOW no bloqueante** (a 6.7.1): una llave PEM que cruce el borde de la ventana de captura de 200 líneas puede dejar body base64 visible; está detrás de `guard-secrets.sh` y cerrarlo del todo sobre-redactaría output legítimo — tradeoff defendible, documentado.
- **Verify:** **449 pass / 0 fail** (+4 regresiones que fijan los inputs exactos del gate). **FASE 6.4 CERRADA.**
- **Estado F6:** 6.0 ✅ 6.1 ✅ 6.2 ✅ 6.3 ✅ **6.4 ✅** → sigue 6.5 (paneles de conocimiento) · 6.6 (orquestación + advisor v1) · 6.7 (hardening + ship). Aparte, fuera de F6: **fase-daemon (ADR-004 = GO)** a planear.

---

## 2026-07-14 — F6.4.1–6.4.7: sustrato tmux + panel Sessions vivo + launch + gobernador RAM + ADR-004 (maker Opus)

- **6.4.1 `tui/src/sessions/tmux.ts`** — wrapper de control-plane que REUSA el backend de `cli/sessions.ts` (list/new/peek/send/kill + scrubber; cero lógica huérfana, crit#2) y agrega solo `insideTmux()`/`hasServer()`/`attachTarget()`. **6.4.2 `scripts/fake-agent.sh`** completo (trap TERM/INT/HUP, ticks, eco `recibí:` estable). E2E real contra tmux 3.2a: introspección + supervivencia + scrubber.
- **6.4.3 panel Sessions** (contra `screens-a.jsx SessionsScreen`): Panel focus `fleet · N` + ScrollList (Badge/nombre/uptime) | `TerminalPeek` live del seleccionado. **Peek con throttle ≤1Hz** (`sessions/peek.ts shouldCapture`, puro+testeado), SIEMPRE scrubbeado. Acciones ↑↓/a/k/p (`p`=PromptBox nuevo DS-bound; `k`=ConfirmDialog danger, SOLO `y`). **Arquitectura:** `buildFrame` PURO (uptime precomputado, sin Date.now()); data async en slice `sessions`; mutaciones por canal de **EFECTOS** en `ReduceResult` → `reduce` puro y 100% testeable.
- **6.4.4 attach handoff (core)**: efecto `attach` + `doAttach()` suspende alt-screen/reader/timer (`attaching` suprime repaints), cede stdio a tmux, restaura al volver; guard `disposed` evita re-entrar tras quit/señal (bug cazado en self-review). Attach interactivo real = manual (checklist humano).
- **6.4.5 launch básico**: vista `launch` = grid "agente" del mockup (subset; wizard advisor=6.6.1). enter → efecto `launch` → gobernador → `newSession` (env del manifest; deny-client rc=2 se surface-a en el panel).
- **6.4.6 gobernador RAM** `tui/src/sessions/governor.ts`: `governLaunch()` PURO (light nunca gatea · 2º heavy → confirm · 1er heavy con RAM crítica → confirm) reusa `readClass` de fleet.ts; `parseAvailableMb` (/proc/meminfo); `countLiveHeavy`; `logOverride` → `~/.config/ebrain/governor-overrides.jsonl`. Override SOLO con `y`.
- **6.4.7 ADR-004** (`docs/adr/ADR-004-shared-brain-daemon.md`): daemon HTTP-MCP compartido — **recomendación DEFER** (mismo listón que difirió Hermes; aislamiento federación/cliente gratis por proceso hoy) + 4 condiciones de GO. **Fork DEFER-vs-GO pendiente de ratificación de Eduardo.**
- **Verify:** suite completa **445 pass / 0 fail** (38 archivos); boot→quit exit 0, alt-screen enter/exit balanceado (el setInterval del peek no cuelga la salida); RSS 45.5 MiB (ADR-003 ≤100MB); cero-hex (solo theme.ts). Vistas y overlays renderizados y verificados contra los mockups (Sessions, kill-confirm, prompt, launch grid, governor-override).
- **Estado F6:** 6.0 ✅ 6.1 ✅ 6.2 ✅ 6.3 ✅ · **6.4 maker-completo (6.4.1–6.4.7)** → **GATE 6.4.8 PENDIENTE (auditoría Fable 5, checker independiente — maker≠checker, NO auto-aprobado).** Hallazgo menor para el gate: `sendToSession` usa `send-keys` sin `-l` (texto normal llega íntegro, probado; solo un prompt que sea exactamente un token de tecla tmux se interpretaría). Sigue: cerrar gate 6.4.8 · 6.5 paneles · 6.6 orquestación · 6.7 ship.

---

## 2026-07-13 — F6.3 CERRADA: command palette + help overlay + GATE 6.3.7 `[AUDIT_PASS]`

- **6.3.4 command palette** (`/` · `ctrl+p`): `tui/src/widgets/input/commandpalette.ts` (contra `CommandPalette.jsx` — `›` prompt bold, query, caret `▌`, **borde teal focus = el momento de acento**, fuzzy subsequence con matches en teal bold, selected en `background.raised`, footer `↑↓ navegar · enter · esc`) + `tui/src/palette.ts` (state + `filterCommands` fuzzy + `paletteApplyKey`, portado de FlowClock, sobre el registry `COMMANDS`) + wiring en `app.ts` (overlay state, `runCommand` mapea `Command.id`→transición, compositing band-clear centrado ~30% desde arriba). Verificado: `/`→abre, "ss"→sessions, enter→ejecuta+cierra, esc→cierra.
- **6.3.5 help overlay** (`?`): `tui/src/help.ts` `renderHelp` autogenera un dialog recto `┌─┐` agrupado nav/global **desde `COMMANDS`** — test dedicado itera el registry y asserta que cada `key` aparece → imposible desincronizar (regla claude-code). q dentro del overlay lo cierra sin matar el proceso.
- **Nota de proceso:** 6.3.4/6.3.5 los construyó **Opus directamente** (fallback: los workers Sonnet venían muriendo por límite de sesión), con auto-auditoría rigurosa — pura lógica de reducer + render con snapshots. Integración probada extremo a extremo.
- **GATE 6.3.7 `[AUDIT_PASS]`:** #1 boot **0.10s / RSS 43.2 MiB** con overlays (presupuesto ADR-003 ≤100MB); #8 `grep -rn '#[0-9a-fA-F]\{6\}' tui/src | grep -v theme` **vacío** (solo theme.ts tiene hex = el DS codificado). Suite completa **399 pass / 0 fail** (32 archivos), cero-emoji, boot→quit→restore limpio (alt enter/exit). **FASE 6.3 CERRADA.**
- **Estado F6:** 6.0 ✅ 6.1 ✅ 6.2 ✅ **6.3 ✅** → sigue 6.4 (sustrato tmux: panel Sessions con peek/attach/kill, gobernador RAM, ADR-004) · 6.5 (paneles de conocimiento) · 6.6 (orquestación+advisor v1) · 6.7 (hardening+ship). La TUI ya arranca como cockpit navegable.

---

## 2026-07-13 — F6.3.3 + 6.3.6: app shell bootable + `ebrain ui` `[AUDIT_PASS]` (la TUI arranca)

- **`ebrain ui` bootea.** `tui/src/app.ts`: `buildFrame(state,size,theme)` PURO (StatusBar→TabBar→hairline→vista→HintBar→Footer, compuesto con kit `splitV`/`splitH` + los 16 widgets) · `reduce(state,key)→{state,quit,forceRedraw}` PURO (nav 1-6/tab/shift+tab, quit) · `runUi()` main loop (alt-screen+diffFrames del kit, resize SIGWINCH, **terminal SIEMPRE restaurada**: try/finally + SIGINT/SIGTERM + uncaughtException). Registry central `tui/src/commands.ts` → HintBar+Footer generados de ahí (regla claude-code: nunca hardcode, keybinds/hints/help siempre en sync).
- **Fidelidad al mockup:** el shell replica `ui_kits/ebrain/shell.jsx` (orden de filas exacto) y el home replica `screens-a HomeScreen` (wordmark block centrado + panel `sistema` con gauges + `sesiones activas` focus + `ultimas memorias` violeta) — verificado renderizando el frame (32×120, todas las filas width 120, cero-hex). Las otras 5 tabs = stubs (vistas reales en F6.4–6.6).
- **Decisión de tabs (DS manda):** `home·sessions·launch·memory·routing·doctor` (del mockup), NO el `Overview·Fleet` del SPRINT. `launch`→tab, `fleet`→telemetría del StatusBar + vista doctor. Reconfigura levemente 6.5.4/6.6.1; anotado para revisar si Fleet merece vista propia.
- **Kit extendido:** `shift+tab` (`\x1b[Z`→`{name:"shifttab"}`) — gap real del kit vendored, scoped como divergencia propia de ebrain (Ctrl-C `\x03` verificado intacto tras el edit).
- **6.3.6:** caso `ui)` en `cli/ebrain` con guards (bun/TERM-no-dumb/≥80×24). **Boot 0.08s · RSS 43 MiB en el Celeron N4120** (criterio #1 del GATE 6.3.7 holgado; presupuesto ADR-003 ≤100MB) — `discovery/00-environment.md §F6.3.6`. Smoke sin TTY prueba boot→render→quit→restore (exit 0, alt enter/exit).
- **Auditoría Opus:** 29 tests app; guard 80×24; `TERM=dumb ebrain ui`→mensaje+rc1; suite completa **377 pass**; cero-hex (salvo theme.ts) + cero-emoji.
- **Sigue:** Ola 3b = 6.3.4 palette (`/`·`ctrl+p`, consume el registry) + 6.3.5 help (`?`, autogen del registry) → GATE 6.3.7.

---

## 2026-07-13 — F6.3.2 CERRADA: 16 widgets DS-bound (kit → widget library) `[AUDIT_PASS]`

- **16 widgets** construidos por 2 workers Sonnet ‖ (core/data/dialog + chrome/layout/brand) → `tui/src/widgets/{core,data,chrome,layout,brand,dialog}/`. Cada uno función pura `(props, theme) → string[]`, **theme inyectado** (determinista, cero hex hardcodeado), **1:1 con su contrato del design system** (props+enums de `_adherence.oxlintrc.json`, render matcheando el `.jsx`). Inventario: badge·gauge·toast·spinner (core) · table·scrolllist·sessioncard (data) · tabbar·statusbar·hintbar·keyhint·footer (chrome) · panel·terminalpeek (layout) · wordmark (brand) · confirm (dialog).
- **Auditoría Opus (maker≠checker)** — verificado en vivo renderizando cada widget difícil: Panel corners **redondeados `╭─╮`** (no-dialog, título izquierda como el `.jsx`) vs **rectos `┌─┐`** (dialog); TerminalPeek borde **siempre dim** (nunca teal — contenido ajeno); SessionCard `▸ ● agente nombre uptime estado` componiendo Badge; ScrollList ventana + marker ▸ + scrollbar █/░; Gauge auto-tone (warn≥75%/error≥90%); **Wordmark `WORDMARK_MATRIX` byte-verbatim del `.jsx`** (e/b/r/a/i/n idénticos — el elemento firma es fiel).
- **Símbolos DS-sancionados:** Toast/Confirm usan `✓`/`✗` (U+2713/U+2717) — NO emoji, definidos localmente con fallback ASCII (`+`/`x`), fuera de theme.ts (el token `scrollbar` del DS es prosa `"█ (thumb) │ (track)"` → widget usa glifos `gauge` █/░, workaround correcto).
- **Fix Opus:** header de Table `text.secondary`→`text.muted` (jsx-exact `--text-3`; body/sep/selected ya eran correctos) + test actualizado.
- **Checks de gate (anticipando 6.3.7):** cero hex hardcodeado en `tui/src` salvo theme.ts (fuente de tokens); cero-emoji. Snapshots width-exacto + variante ASCII por grupo. **Suite completa `bun test ./cli ./tui`: 346 pass / 0 fail** (29 archivos, 1.58s).
- **Nota:** naming de export inconsistente entre workers (`scrolllist`/`sessioncard` minúscula vs `terminalPeek`/`keyHint` camelCase) — sin impacto funcional; la Ola 3 (shell) importa por nombre exacto.
- **Sigue:** Ola 3 = 6.3.3 shell (contra mockups `ui_kits/ebrain/`) · 6.3.4 palette · 6.3.5 help · 6.3.6 `ebrain ui` → GATE 6.3.7. Pendiente resolver divergencia de tabs (mockup `home/sessions/launch/memory/routing/doctor` vs SPRINT `Overview/Sessions/Memory/Routing/Fleet/Doctor`).

---

## 2026-07-13 — F6.2 CERRADA (design-sync → theme.ts) + 6.3.1 (kit FlowClock extraído) `[AUDIT_PASS]`

- **Steer de Eduardo (vinculante para todo F6):** la TUI se construye **contra el design system, no inspirada** en él. Los widgets reflejan **1:1** el contrato de cada componente (`design-system/components/**/*.{d.ts,prompt.md,jsx}` — props y enums enumerados en `_adherence.oxlintrc.json`); los mockups de `ui_kits/ebrain/` son **referencia de aceptación** de las vistas (esqueleto obligatorio StatusBar·TabBar·hairline·contenido·HintBar·Footer, un momento teal por vista, violeta=solo memoria); cero hex hardcodeado (todo vía `theme.ts`). Esto gobierna Olas 2 (widgets) y 3 (shell/paneles).
- **6.2.2 `[AUDIT_PASS]`** — `scripts/design-sync-tui` (bun, idempotente: diff limpio 2×, sin timestamps) parsea `design-system/tokens/ebrain.tokens.json` → genera `tui/src/theme.ts` (= el DS codificado). `makeTheme({trueColor,ascii})` produce el `color?: string` que consume `draw.ts` del kit: `fg("accent.teal")`→`\x1b[38;2;45;212;191m` (=#2DD4BF), fallback 256→`\x1b[38;5;43m` (=xterm256 del token), `bg`/`agent(8)`/`glyph`(unicode+ASCII)/`reset`/`states` por el mismo pipeline `resolveColor`, passthrough de hex crudo con aproximación 6×6×6 solo para roles fuera de la tabla curada. `spinner.frames`→normalizado a `chars`.
- **6.2.3 `[AUDIT_PASS]`** — `tui/test/theme.test.ts` (24 pass): roles+8 agentes definidos, contraste texto/fondo, **política cero-emoji por regex** sobre theme+glifos. Worker removió `✗` (U+2717) del `die()` del generador por caer en rango emoji. Auditoría Opus: grep independiente de rangos emoji sobre script+theme = limpio. Nota: el rango 2600–27BF rechazaría `✓`/`✗` que el DS sí sanciona — sin conflicto hoy (los tokens no definen glifo check/cross).
- **6.3.1 `[AUDIT_PASS]`** — kit FlowClock extraído a `tui/src/kit/` (`screen/draw/layout/input/lineedit`, byte-idénticos a FlowClock v3.9.0 + header de atribución, closed-set: solo `lineedit`→`input.js`). `tui/package.json`+`tsconfig.json`. **149 tests** portados (`tui/test/kit/`). Auditoría Opus: byte `\x03` (Ctrl-C) íntegro en `input.ts` — el Write tool lo había comido silenciosamente; el worker lo detectó con `cmp`, lo reconstruyó con `cat`, verificado por `parseKey("\x03")`.
- **Gotcha del bunfig:** la suite `tui/` corre por ruta explícita con `./` (`bun test ./cli ./tui`) — el `[test] root="cli"` trata rutas sin `./` como filtro de nombre. Suite completa junta: **288 pass / 0 fail** (13 archivos, 1.38s).
- **Sigue:** Ola 2 = 6.3.2 widgets (contra los contratos DS, consumiendo theme+kit) → Ola 3 = 6.3.3–6.3.6 shell+palette+help+`ebrain ui` (contra los mockups) → GATE 6.3.7.

---

## 2026-07-13 — F6.1 (chunk 2: sessions/tmux + advisor v0) construido — pendiente audit Opus

- **Worker construyó 6.1.6** (`cli/sessions.ts` sobre tmux, `scripts/fake-agent.sh` fixture mínima): naming `ebr-<agente>-<slug>`; `list`/`peek`/`new`/`send`/`kill` con errores tipados (`tmux-not-installed`/`no-server`/`not-found`/`deny-client`/`confirm-required`/`bad-agent`/`exists`) que nunca crashean. **Nuevo campo `launch:` en los 6 `manifest.yaml`** (claude/codex/agent-cursor/opencode/gemini/bash-generic) — `sessions new` resuelve el comando+env real del adapter desde ahí, mismo patrón que `class:` de 6.1.4. **Scrubber de secretos** (`scrubSecrets`, hard requirement): redacta `NOMBRE=valor` cuando el nombre matchea forma de secreto (KEY/TOKEN/SECRET/PASSWORD/CREDENTIAL) + prefijos de proveedor conocidos (`sk-ant-`, `sk-or-v1-`, `ghp_`, `AKIA`, `AIza`, `xox[baprs]-`, `Bearer …`) dondequiera que aparezcan — corre SIEMPRE en `peekSession()`, sin bypass. `send`/`kill` exigen `--yes` explícito (sin excepción; sin él, error tipado `confirm-required` + payload `would` de lo que haría, nunca ejecuta). Deny-list de cliente (`brisas-del-golfo`/`dekko`) verificada por segmento exacto de path (case-insensitive) en `new --cwd` — probado en vivo end-to-end (`rc=2`).
- **Gotcha encontrado y resuelto:** `run_bun` (cli/ebrain) hace `cd` a un dir neutral antes de correr cualquier `cli/*.ts` (protección histórica contra el auto-load de `.env` de bun) — eso pisaba `process.cwd()` justo cuando SÍ importa (`sessions new` sin `--cwd` debe defaultear al dir real desde donde se invocó `ebrain`, no al neutral). Fix: `cli/ebrain` exporta `EBRAIN_CALLER_CWD="$PWD"` ANTES de cualquier `cd`; `sessions.ts` lo usa como fallback. Verificado end-to-end: `cd /tmp/x && ebrain sessions new generic foo` → `cwd:"/tmp/x"` correcto.
- **Worker construyó 6.1.7** (`cli/advise.ts` + `config/advisor-rules.yaml`, nuevo): clasificador determinista rule-based (keywords→capacidad, mismo criterio que `route.ts classify()`: empate no-cero → `general`). `capability_lane` (one-shot vs. sesión interactiva por capacidad) calcado 1:1 de `docs/tier0-playbook.md` §Filtro de decisión — no inventa un carril nuevo: Codex=código serio/agentic, OpenCode=scripts/scaffolding/contexto largo, Cursor=visual/frontend (web_design), gemini=multimodal free, Claude Code=auditoría **confirm-only**. Dos señales de override duro (`audit_signals`→`claude_audit`, `multimodal_signals`→`gemini_multimodal`) y una de downgrade (`oneshot_signals`: sesión→route barato). `est_cost` = estimado con tabla de pricing propia (snapshot `docs/model-registry.md` 2026-07-11) sobre un presupuesto de tokens ASUMIDO y documentado — modelo sin pricing verificado → `usd:null` explícito, nunca un número inventado.
- **Candado F4/D5 (frontier nunca-auto):** único lane con `frontier:true` es `claude_audit` (`kind:"confirm"`); `reason` SIEMPRE trae la advertencia de confirmación explícita cuando `frontier:true` — verificado por test dedicado. `advise.ts` es puramente read-only: no lanza nada, nunca (eso es F6.6.1).
- **10/10 tareas canónicas correctamente ruteadas** (criterio de éxito #5, primera pasada — `cli/advise.test.ts`): fix bug web app→coding/interactive_codex, batch summaries→long_context/one_shot_route, web design→web_design/interactive_cursor, architecture audit→claude_audit/**frontier**, scrape→agentic/one_shot_route, long refactor→coding/interactive_codex, one-shot regex→coding/one_shot_route, technical doc→general/one_shot_route, UI component→web_design/interactive_cursor, video/multimodal→gemini_multimodal.
- **Contrato JSON extendido** (`cli/contract.test.ts`): schemas `sessions list`/`sessions peek`/`sessions new·send·kill` (envelope `{ok,…}`/`{ok:false,error:{type,message}}`, con fixture del candado `--yes` y del deny-list) + `advise` (enum de 6 capacidades, `est_cost.usd` nullable). Suite completa: **`bun test` bare → 115 pass / 0 fail / 250 expect() en 7 archivos, ~1.3s** (sigue acotada a `cli/` por `bunfig.toml`). `contract-test.sh` (el que corre `ebrain doctor`) sigue en ~2.2s, 16 fixtures + JSON(zod) ok. `ebrain doctor` real: rc=0, 3 warn conocidos (sin cambios vs. baseline del chunk 1).
- **GATE 6.1.9 `[AUDIT_PASS]` (Opus, 2026-07-13):** auditoría en vivo del chunk 2 — scrubber redacta (`API_KEY`/`ghp_`/`password:` → `[REDACTED]`, línea limpia intacta), deny-list `new --cwd .../brisas-del-golfo` → **rc=2** `deny-client`, `send`/`kill` sin `--yes` → **rc=2** `confirm-required` (con `would`), frontier solo `claude_audit` (con warning en `reason`), bug-fix → `interactive_codex` no-frontier, 10/10 tareas. Blast-radius `EBRAIN_CALLER_CWD` verificado sin regresión (status/spend/fleet/memory/route OK; `sessions new` sin `--cwd` desde `/tmp` → `cwd:/tmp`). `launch: bash` del adapter `generic` = juicio aceptado (floor sin CLI dedicada). **FASE 6.1 CERRADA** — 8 subcomandos `--json` = el backend-contract completo de la TUI.

---

## 2026-07-13 — F6.1 (chunk read-only) construido + auditado por Opus: CLI backend `--json`

- **Worker Sonnet construyó** (commits `a29edc3`..`527d548`, uno por tarea): `status.sh --json` (`{brain,spend,fleet,memory}`, lock-aware), `doctor.sh --json` (`{checks[],rc}`), nuevos `cli/{spend,fleet,memory}.ts` (patrón route.ts), `class: heavy|light` en los 6 manifests (heavy=claude/codex/cursor/opencode), y `cli/contract.test.ts` (zod, 52 tests, cableado a `contract-test.sh`). Rutas runtime halladas: `~/.config/ebrain/{routing.yaml,spend.jsonl}`, memoria en `~/eBrain/memory/learnings/`.
- **Auditoría Opus (maker≠checker)** encontró 2 issues reales → devueltos y resueltos: (1) `fleet --json` en **28s** — `install.sh --doctor` corría `contract-test.sh` 6× (guard run-once `EBRAIN_CONTRACT_TESTED` por el worker) + los doctors per-adapter son lentos/independientes (codex ~5.5s, gemini ~4.3s) y corrían secuenciales → **Opus paralelizó** `fleet.ts` (`doctorOk` async + `Promise.all`, commit `6418d53`): **28s→7.6s**. (2) `bun test` pelado colgaba (>2min) escaneando `vendor/**/*.test.ts` → `bunfig.toml` acota discovery a `cli/`: **>2min→192ms**.
- **Auditado y aprobado:** fix del hook `pre-commit.security` (agrega `bun.lock` a los lockfiles reconocidos — **no debilita** el guard, sigue bloqueando sin lockfile). `ebrain help` lista spend/fleet/memory. `doctor --json` **31s→17s**.
- **Estado:** 6.1.1–6.1.5, 6.1.8 = **DONE + auditados**. Falta el chunk 2: **6.1.6 (sessions/tmux con guards+scrubber)** y **6.1.7 (advise v0)** → luego GATE 6.1.9. **6.2.1 (design-system) ya exportado por Eduardo.**

---

## 2026-07-12 — F6.0 CERRADA: reverse engineering de las 5 TUIs + GATE `[AUDIT_PASS]` (ADR-003 ratificado, Opción D)

- **6.0.1 — clones shallow a `vendor/`** (gitignored, read-only): `sst/opencode@cf75036`, `openai/codex@c888e8e`, `google-gemini/gemini-cli@f354eeb`. SHAs + stack en `discovery/00-environment.md §F6`. Reportes en `discovery/tui/` (no `05-10`: `05` lo ocupa F0).
- **6.0.2–6.0.6 — RE de las 5 TUIs** (5 workers Sonnet paralelos, patrón F0; relanzados tras reset de cuota, 4/5 reportes ya habían aterrizado): `discovery/tui/{opencode,codex,gemini-cli,claude-code,cursor}.md`, cada uno cubre la rúbrica (a)–(g) con archivo:línea (los 3 open-source) o docs públicas sin decompilación (claude-code/cursor cerradas).
- **Hallazgo central:** OpenCode migró su TUI a **`@opentui/{core,solid,keymap}`** (Bun/TS; ni bubbletea/Go ni Ink) → confirmó el runtime bun+TS **y abrió una Opción E (adoptar opentui)** no contemplada en el ADR. Evidencia de costo de Ink de primera mano (gemini `useMemoryMonitor.ts:11` **warn a 7GB RSS**, Ink forkeado, doble reconciler, yoga, 4 firefights de perf).
- **6.0.7 — síntesis** (`discovery/tui/_synthesis.md`): matriz rúbrica × (5 TUIs + FlowClock), canon de keybindings (evita colisión con prefix tmux), **gap-list del kit FlowClock** (solo ScrollList y Table con trabajo real; el kit resuelve el motor de render/layout/input/palette/confirm/gauge), patrones stack-agnósticos a robar, y la bifurcación D-vs-E.
- **6.0.8 — GATE `[AUDIT_PASS]` (Opus):** **ADR-003 RATIFICADO (Opción D — extraer kit FlowClock).** D2 (tmux data plane) doblemente validado (OpenCode + Claude Code resuelven multi-agente con dashboard+peek+attach, sin tabs); D3 (CLI-first) y rechazo de Ink ratificados. **Opción E (opentui) evaluada y rechazada** (batteries irrelevantes al scope orquestador de ebrain + binarios nativos/WASM sin beneficio en 4GB mono-plataforma). **Fork elevado a Eduardo (no auto-aprobado): eligió D** — de OpenCode solo el estilo, ya capturado en `design-system/`. **Steer:** portar UX de referencia, **especialmente el `agent view` de Claude Code** (cambiar entre ver qué hace cada agente) → blueprint del panel Sessions.
- **6.2.1 (paso humano) ya HECHO:** Eduardo exportó el `design-system/` de Claude Design (tokens, wordmark-matrix, 7 mockups, componentes) → desbloquea **6.1 (CLI backend) ‖ 6.2.2 (design-sync-tui)**. Commit síntesis `ade3f60` (los 5 reportes los versionó el auto-backup).

---

## 2026-07-12 — F6 PLANEADA: TUI ebrain (régimen operativo visual) — ULTRAPLAN + SPRINT + ADR-003 + design brief

- **Mandato de Eduardo:** envolver TODO ebrain en una TUI daily-driver (patrón FlowClock CLI→TUI, estética Claude Code/OpenCode incl. wordmark pixel-block bicolor): orquestar terminales agénticas multi-proveedor (claude/codex/gemini/opencode/cursor/route-stack) sobre las capas de memoria/harness/routing ya construidas, con visualización en vivo + advisor de carril por tarea.
- **`docs/adr/ADR-003-tui-stack.md`** (proposed): bun + **tui-kit extraído de FlowClock** (~2.6K líneas propias, 0 deps — ni Ink/React ni Go/Rust en 4GB) · **tmux 3.2a = data plane** (sesiones `ebr-*` sobreviven a la TUI; peek `capture-pane`, attach handoff, cero emulación propia) · **contrato CLI-first `--json`** (la TUI no implementa lógica) · lock-awareness PGLite obligatoria (la TUI jamás sostiene el lock). Ratificación en GATE 6.0.
- **`docs/ULTRAPLAN-TUI.md`**: tesis (la CLI es el backend; la TUI es el cockpit), arquitectura 3 planos, decisiones D1–D8 (gobernador RAM norma→mecanismo; candado nunca-auto-frontier; ADR-004 daemon HTTP-MCP compartido se estudia en 6.4), advisor v0 determinista→v1 con señales (memoria/gasto/RAM + log aceptado/rechazado), 8 criterios de éxito medibles, riesgos, delegación (workers Sonnet/Codex, Fable solo gates 6.0/6.4/6.7).
- **`docs/SPRINT-TUI.md`**: 8 fases atómicas con verify por tarea — **6.0 reverse engineering de las 5 TUIs de referencia** (opencode/codex/gemini-cli open-source a `vendor/` + claude-code/cursor conductual → `discovery/05–10` + gap-list del kit) → 6.1 CLI robusta (`--json` en todo + `sessions/fleet/memory/spend/advise` nuevos) → 6.2 design system → 6.3 kit+shell → 6.4 sesiones tmux → 6.5 paneles → 6.6 orquestación+advisor → 6.7 hardening+ship.
- **`docs/prompts/CLAUDE-DESIGN-BRIEF.md`** (formato busnet/dekko, adaptado a dominio TUI): retícula monoespaciada dura, paleta void `#0B0E14` + teal `#2DD4BF` + violeta memoria + 8 categóricos por agente, JetBrains Mono, **cero emoji**, wordmark "e·brain" pixel-block (matriz reproducible en ▀▄█), 7 mockups 120×32, tokens JSON con fallback xterm-256 → `design-system/` (stub README creado) → `design-sync-tui` → `theme.ts`.
- Estado: **planeación completa, ejecución pendiente de arranque** (6.0 delegable ya). Paso humano nuevo: generar/iterar/exportar en Claude Design (6.2.1).

---

## 2026-07-12 — F5 CERRADA: consolidación + gate `[AUDIT_PASS]` (8/8 Success Criteria)

- **5.2 — `ebrain doctor` + `ebrain status`** (`harness/core/{doctor,status}.sh` en `cli/ebrain`): salud CKIS lock-aware (launchers, config con presencia de keys sin volcar, **contract-test del guard cableado = alarma de drift, cierra 4.6h2**, flota de 6 adapters, aislamiento de sources de cliente, gasto MTD vs cap). rc=1 solo en fallo duro. Probado: doctor rc=0 (3 warns conocidos), status rc=0.
- **5.7 — auditoría de seguridad final: 0 hallazgos.** Escaneo 11-patrones (gitleaks-equivalente) sobre archivos trackeados de `~/eBrain` + `agent-memory` → 0 secretos reales; `.env` gitignored en ambos; sin pooler URL (PGLite); backup targets limpios.
- **5.4 — `.brain` de ebrain → Dev Brain** vía `brain-init`: registro + 5 git hooks (probados con commit) + grafo. `graphify update` salió contaminado por `vendor/` (12022 nodos) → **`.graphifyignore`** → 15 nodos limpios → **19 notas en `code-graph/ebrain/`**. `.gitignore` blindado (`.brain/`/`.claude/`/`graphify-out/`).
- **5.6 — decisión QMD ejecutada (FALLBACK, no retiro):** `knowledge-synthesis` skill del vault → ebrain semántico primario + QMD fallback (CLAUDE.md §Search ya lo tenía).
- **5.1 — dream-cycle construido** (`scripts/dream-cycle` lock-aware + `scripts/systemd/ebrain-dream.{service,timer}` 03:30/Persistent + `runbook.md` §dream-cycle). Subagent tier tool-capable (kimi-k2.6). **Corrida supervisada + enable = checklist humano** (config+dream requieren MCP idle).
- **5.3 — vault** `03-projects/ebrain/_overview` a estado real F5 + `_ACTIVE-PROJECTS` + CKIS CHANGELOG **v2.3.98**. **5.5 — Company Brain** `repos.md` + `engineering.md` + DRIFT **D-16** + CHANGELOG.
- **5.8 — 8/8 Success Criteria** (`docs/f5-success-criteria.md`, ULTRAPLAN §5): 5 fully MET, 3 con caveats documentados (PGLite vs Supabase, código=carril graphify, auto-hook graphify 0.6.7). **Crit.2 probado en vivo:** `think` cruzó SB+CB con 13 citas (minimax-m3, synthesisOk). **5.9 — retro** → `05-knowledge/permanent-notes/ebrain-build-lessons.md` (8 lecciones) + `docs/human-checklist.md`.
- **GATE F5 `[AUDIT_PASS]` (Opus).** Frontera restante = checklist humano (D-16). **ebrain funcional y completo; régimen operativo.** Commits `4476941`→`5414a8e`.

---

## 2026-07-12 — F4 CERRADA: gate `[AUDIT_PASS]` (routing + chat→OpenRouter + Hermes DEFER)

- **4.8 — chat LLM de gbrain → OpenRouter.** `models.default=openrouter:minimax/minimax-m3` (el knob que usa `think`; su default de fábrica era `anthropic:claude-opus-4-7`) + `GBRAIN_CHAT_MODEL` en ambos launchers (repo↔live reconciliados). **`think` probado 100% en OpenRouter (`Pages:40 | Citations:8`, sin frontier).** Embeddings intactos (OpenAI 3-large @1536d). Gap documentado: spend de gbrain no entra al ledger local (cap real = server-side). Reverse-engineering en `runbook.md` para el motor mejorado.
- **4.9 — Hermes = DEFER** (`hermes-evaluation.md`). Desviación consciente: NO instalar (RAM 4GB, routing ya capturado en route.ts, MCP stdio→Hermes remoto amnésico, amplifica exfil). Costos + 3 condiciones de revisita + guardrails. Confirmado por Fable.
- **4.10 — GATE F4 `[AUDIT_PASS]`.** Criterios verificados: 6 rutas con costo logueado (ganadores correctos), `model-registry.md` live, benchmark `~31×` (`benchmark-routing-cost.md`) + qmd-vs-ebrain, `tier0-playbook.md` escrito, Hermes entregado. **F4 cerrada.**
- **Contexto:** F4 incluyó además el harness unificado H1–H5, la auditoría Fable + 3/4 MUST, el arsenal de 6 agentes (codex/claude/cursor/opencode/gemini/generic) con memoria cross-provider probada, y `think` corriendo en el stack chino. Próximo: F5.

---

## 2026-07-11 — audit Fable 5 (harness) + 3/4 MUST + arsenal +2 (opencode, cursor)

- **Audit Fable 5** (read-only, 117k tokens, verificación en vivo): harness **sólido para construir encima, sin blocker de código**; deuda de gobernanza. 4 MUST antes de rol de control-plane.
- **MUST#1 (hecho) — trust-policy → allow-list única** `harness/core/trust.sh` (DEFAULT-DENY; federar solo repos propios: remote aedneth o slug local-only; hard-deny brisas/dekko), consumida por `sessions-federate` + `remember.sh`. Cierra el canal de exfil `find $HOME` default-open + mata la deny-list duplicada y **driftada** (faltaban AKIA/gh*_/glpat/AIza en el sweep — ahora unificados). **`busnet-app` (remote `Crisstianpd/busnet`, ajeno) ahora default-deny → confirmar con Eduardo.**
- **MUST#2 (hecho) — `install.sh` fail-hard** si el parser no lee la clave `agent` → aborta en vez de pintar "doctor OK" sin instalar (mata el éxito-silencioso del instalador).
- **MUST#3 (hecho) — session-log UTF-8-safe** (`log-session.sh` sándwich iconv -c; el `head -c` byte-oriented corrompía el índice Dev Brain → binario para grep). Índice existente reparado (grep `| flowclock-cli |` = 6).
- **MUST#4 (pendiente, humano) — sesión Codex real de humo:** H1 tiene 0 sesiones reales de Codex; `subagent_stop` quizá no dispara al cierre plano → si no, fallback git post-commit (H6).
- **Arsenal +2 (opencode, cursor):** adapters nuevos clase **no-hook** (`harness/adapters/{opencode,cursor}/manifest.yaml`) + `harness/core/mcp-wire.sh` (merge idempotente del MCP ebrain en `~/.cursor/mcp.json` y `~/.config/opencode/opencode.json`). **Bus de memoria LIVE:** `agent mcp list` → `ebrain: ready`, **102 tools** (misma memoria cross-source que Claude/Codex); opencode con `ebrain` + normas en `instructions`. Normas renderizadas a cada archivo nativo; guard = **advisory** (sin hooks, control por norma+aislamiento). opencode en PATH. Prueba la tesis en 2 agentes sin sistema de hooks. Commits `ab108bd` `f81a54d` `ac54fc4`.
- **Nice-to-have Fable pendientes:** endurecer readers/env-dump del guard (base64/dd/openssl/intérpretes lo bypassean — es *tripwire*, no control duro), `install --wire` (escribir hooks-config), `doctor --all` en cron, pre-check de costo en route.ts, aliases de skills-federate.

---

## 2026-07-11 — harness H3–H5: capa unificada provider-agnostic COMPLETA (ADR-002, tesis probada)

- **H3 — memoria semántica de escritura:** `harness/core/remember.sh` + skill `remember` (federada al skillpack, `source: harness`) + CLI unificado `ebrain` (`~/.local/bin/ebrain`: remember/q/route/harness/norms/federate). `ebrain remember "<learning>"` escribe página tipada `agent-learning` a `agent-memory` + `gbrain sync`. **Fail-closed:** niega repos de cliente (slug+remote) y texto con secreto. Verificado: 3 negativas + recall 0.847. Commit `e2170d3`.
- **H4 — fin de la divergencia de normas:** `harness/core/NORMS.md` = fuente única cross-agente; `render-norms.sh` inyecta bloque gestionado idempotente (0-diff al re-render, backup previo) en `~/.codex/AGENTS.md` (dedup) y `~/.claude/CLAUDE.md` (append; canary intacto). Commit `13cf2ed`.
- **H5 — la tesis probada:** adapters declarativos `harness/adapters/{claude,codex,gemini,generic}/manifest.yaml` + `inject-context.sh` + `install.sh` (`ebrain harness install/doctor <agent>`, idempotente, doctor rc=1 en pendientes = drift en rojo). **claude+codex = doctor OK, cero cambio de comportamiento** (overlay codex migrado a adapter). **gemini (agente nuevo) = 5/5 criterios de aceptación** (guard-deny, contexto, `agent: gemini` en session log + índice Dev Brain, recall ebrain 0.87, remember en skillpack). Agregar un agente = un manifest + install. Commit `830532a`.
- **Generaliza las capas:** L1 `.brain` → **L1.5 `agent-memory` (cross-agente)** → L2 Dev Brain → L3 vault. La lectura ya era agnóstica (MCP); ahora la escritura + gobernanza + contexto también. Deuda O(agentes×capas) → O(1 manifest/agente).
- **Pendiente (post-4.9):** H6 = adapterizar `brain-init` (per-proyecto) + adapter Hermes. Humano: cablear `hooks.json` de gemini cuando se verifique su formato de hooks.

---

## 2026-07-11 — F4 routing impecable: 2º audit Fable 5 + realidad de recursos (Codex $2500 = cerebro)

- **Nueva realidad de recursos (Eduardo):** Codex ($2500 hackatón + API OpenAI) = **cerebro/driver primario diario** (como se usaba Claude Code); **Claude Code baja a 2º de confianza** (Opus director/auditor, dueño de vault/CKIS); **Cursor $50 + CLI + modelos Anthropic**; OpenRouter **$10/mo** = carril daily ruteado (no agente); stack chino debe **construir proyectos enteros** cada modelo en máx capacidad.
- **2º audit Fable 5** (deep, read-only): proyecto sano, deuda de **gobernanza** no de código. Hallazgo #1: **Codex es el driver primario MENOS gobernado** (guardrails CKIS son per-harness Claude Code; brisas/dekko en disco; sin deny de secretos, sin MCP, sin session logs) → nueva §2.1 de gobernanza Codex + reframe de SPRINT 4.6 (= ejecución de 2.6b).
- **`route.ts` endurecido (6 bugs del audit):** append real concurrency-safe, fallback de costo estimado (nunca $0 silencioso → cap real), flag `--floor`, timeout 120s, **regex frontier hermético** (oN/gpt-N/gemini pro|ultra), empate→general. **12/12 tests.**
- **`routing.yaml`:** split `provider_routing`/`completion_defaults`, **`max_tokens:8192`** (anti-drenaje Kimi/Qwen-Max out), `general` cheap-first opcional vía `--floor`, ganadores en máx capacidad (directiva Eduardo).
- **`ROUTING.md` rediseñado → status:active:** Tier 0 reescrito (Codex cerebro), §2.1 gobernanza Codex, árbol de decisión nuevo (regla RAM 4GB: un agente vivo a la vez; maker≠checker invertido: Opus audita a Codex), §6 con ledger Codex + auto-recharge OFF + 4 medidores.
- **Acciones humanas abiertas:** auto-recharge OFF + límite per-key (OpenRouter); verificar expiry créditos Codex; confirmar dónde opera Codex (para el sandbox de 4.6).

---

## 2026-07-11 — harness H1: write-back floor — memoria agéntica permanente cross-agente (LIVE)

- **Cierra el hueco de capacidad #1:** Codex (driver primario) dejaba 0 session logs. Ahora cablea `subagent_stop` → logger canónico.
- **`harness/core/log-session.sh`** agent-agnostic: deriva el repo del `cwd` del payload, estampa `agent:`, escribe `.brain/sessions/*-<agent>-session.md` + índice Dev Brain (mismo esquema 6-campos, `[agent]` en el summary). Sin dependencia de transcript (eso es enriquecimiento por-agente). FAIL-OPEN.
- **`~/eBrain/memory/`** = repo git nuevo, source `agent-memory` (federated, ADR-001) — **L1.5 CKIS** entre `.brain` (L1) y Dev Brain (L2). Camino canónico markdown→git→`gbrain sync` (no put directo). Gitignored del repo ebrain; en `ckis-backup-all` (target agent-memory→aedneth/agent-memory).
- **`scripts/sessions-federate`** (hermano de skills-federate): barre session files de los `.brain/` propios → agent-memory. **Filtros de seguridad probados:** trust-policy (slug + remote → brisas/dekko NUNCA) + redact-scan por página. **Primer sweep: 38 sesiones, 8 proyectos, 0 clientes colados, 39 páginas embebidas, acceptance query score 0.85.**
- Codex: `~/.codex/hooks/log-session.sh` (wrapper AGENT_NAME=codex) + `subagent_stop` en hooks.json.

---

## 2026-07-11 — ADR-002: capa unificada de harness + memoria agéntica permanente (audit Fable 5)

- **Insight de Eduardo (pivote central):** dejar de re-implementar el harness CKIS por-agente; crear UNA capa provider-agnostic (harness + memoria permanente) servida por ebrain. La lectura de memoria ya es agnóstica (MCP); falta unificar harness + write-back.
- **Audit Fable 5 (3er pase, deep):** deuda real y compuesta O(agentes×capas); **hueco de capacidad confirmado — Codex (primario) deja 0 session logs** (los 348 del Dev Brain son de Claude). Capa unificada = movimiento correcto **como normalización fina** sobre el contrato ya-convergido, no framework. Unifica 2.6b + brain-init + skill-federation.
- **`docs/adr/ADR-002-unified-harness.md`** (proposed): arquitectura `~/eBrain/harness/` (contract congelado + core canónico + adapters manifest + `ebrain harness install`); **write-back loop** = nuevo source git-backed `agent-memory` (markdown→git→sync, no put directo), 3 tiers (floor hooks / sweep `sessions-federate` / skill `remember`); generaliza CKIS a L1→**L1.5 agent-memory**→L2→L3; test de aceptación "agregar agente = un manifest".
- **Plan SPRINT 4.C.2 (4.6h1–h6):** H1 write-back floor (BUILD FIRST) → H2 guard merge+contract freeze → H3 remember → H4 NORMS único → H5 manifests+install → H6 brain-init adapter. Riesgos acotados (drift→fixture tests en doctor; polución→cuarentena+human-gate; seguridad→trust-policy+redact+gitleaks).
- **Estado:** ADR proposed, **gate humano de Eduardo antes de construir H1** (crea el source `agent-memory` + cablea write-back de Codex = cambio estructural).

---

## 2026-07-11 — F4.6: harness DURO de Codex (hooks) — guard de secretos + contexto en session-start

- **Insight de Eduardo:** bajo `danger-full-access` el `AGENTS.md` es blando; el control duro es el **harness (hooks/scripts/guardrails)** que trabaja seguro + con contexto SIN interrumpir con permisos.
- **Reverse-engineering:** Codex soporta hooks **Claude-compatible** (`~/.codex/hooks/hooks.json`; eventos snake_case `pre_tool_use`/`session_start`/…; input `tool_input`/`tool_name`/`hook_event_name`; output `permissionDecision:deny`/exit2; sistema de hook-trust).
- **`overlay/codex-harness/`** (nuevo, versionado, `install.sh` idempotente + no-destructivo):
  - `block-secret-read.sh` (`pre_tool_use`) — **candado técnico de secretos** = port del `block-env-read.sh` de Claude Code. Bloquea leer `.env`/credenciales/`printenv` al contexto (deny+exit2). **Probado 3/3** (cat .env→deny, ls→allow, grep KEY .env→deny). FAIL-OPEN.
  - `session-context.sh` (`session_start`) — inyecta `additionalContext`: MCP ebrain, normas AGENTS.md, último CHANGELOG.
  - Instalado en `~/.codex/hooks/` · `codex doctor` verde · JSON válido.
- **Pendiente:** trust vivo del hook (Eduardo, próxima sesión `codex` — test: pedirle `cat .env` → debe negarse).

---

## 2026-07-11 — F4.6 (parcial): gobernanza del cerebro Codex — MCP ebrain + AGENTS.md

- **Flujo real de Eduardo:** corre `codex --sandbox danger-full-access` / `claude --dangerously-skip-permissions` en dirs aislados → gobernanza = **aislamiento + normas + MCP, no approval-gating** (memoria `feedback_agent_fullaccess_workflow`).
- **`~/.codex/AGENTS.md` global creado** — espeja el `~/.claude/CLAUDE.md`: reglas duras de secretos (nunca leer/imprimir `.env`/credenciales), repos de cliente (brisas/dekko) = deny de exfiltración/push/cross-pollination, disciplina SOP + **maker≠checker invertido** (Opus audita a Codex), rastro narrativo (session log + CHANGELOG), regla RAM (un agente vivo).
- **MCP ebrain registrado en codex-cli** (`codex mcp add ebrain -- ~/.config/ebrain/gbrain-mcp` → enabled) → Codex (primario) ahora tiene la MISMA memoria unificada + 75 skills federadas que Claude Code.
- **Riesgo confirmado (Fable):** `~/.codex/config.toml` ya tenía `dekko-floors` (cliente) como proyecto trusteado → la regla de aislamiento por-dir en AGENTS.md es la mitigación.
- Pendiente 4.6: expiry/ledger de créditos [Eduardo], `/codex` op-check, tier0-playbook.

---

## 2026-07-11 — F4 núcleo (4.1–4.4): router Tier 1 sobre OpenRouter vivo + auditado por Fable 5

- **Gate humano 4.2:** `OPENROUTER_API_KEY` colocada (presencia verificada sin imprimir), **$5 de crédito**. Recordatorio abierto: auto-recharge OFF + límite por-key server-side.
- **4.1 verificación en vivo** (`docs/model-registry.md`): los 5 slugs primarios EXISTEN en OpenRouter hoy. Δ notables: **GLM-5.2 −75% ($0.35/M in) + 1M ctx**, MiniMax M3 exacto ($0.30, 1M, multimodal), DeepSeek V4 Pro $0.435 (+56% vs spec), Kimi K2.6 out caro ($3.41 — riesgo de loops), Qwen3.7-Max el más caro ($1.25/$3.75). Tool-calling✓ en los 5; floors **cero-costo reales** (`qwen3-coder:free`, `qwen3-next-80b:free`) = carril multi-proveedor $0 nativo.
- **Auditoría Fable 5** (agente nativo del prompt original, solo audit por costo de tokens): VERDICT sound-to-implement con 3 fixes → integrados: `monthly_usd:4` (≤ crédito), capacidad **`reasoning`** añadida, `max_price` en `request_defaults`, fallbacks `long_context` por ventana, `usage:{include:true}` para USD real.
- **4.3 `cli/route.ts`** (bun, ~230 líneas): clasifica (keywords + `--cap`), array `models` `[ganador,fallback,floor]` (failover server-side), `provider:{data_collection:deny,max_price}`, loguea `spend.jsonl`, imprime costo, aborta si cap excedido. Doble candado frontier. **Probado end-to-end** (ruteó a deepseek-v4-pro, costo real $0.000077 capturado). **Tests 9/9** + integración hard-stop (exit 3 sin gastar). Launcher `ebrain-route`.
- **4.4 `routing.yaml`** escrito (7 capacidades, cadenas verificadas). `frontier.auto_escalate:false` config + hardcode.
- **Costo mensual estimado:** típico día-y-noche **~$6–9/mes** OpenRouter + <$0.50/mes embeddings OpenAI; $5 ≈ 3 semanas. Número exacto sale de `spend.jsonl` tras 1 semana (gate F4).

---

## 2026-07-11 — F3.9: federación de skills IMPLEMENTADA (75 skills unificadas vía MCP)

- **`scripts/skills-federate`** agrega las skills canónicas → `~/.config/ebrain/skills/<name>/SKILL.md` (copia; `skill.md`→`SKILL.md`; dedup prioridad ckis>company>gstack). **75 skills únicas** (+11 duplicados omitidos).
- Launchers (`gbrain-run`/`gbrain-mcp`) exportan `GBRAIN_SKILLS_DIR`; `mcp.publish_skills=true`.
- **Validado vía MCP**: `list_skills` → **count 75**, incluye ckis (braindump/process-inbox/daily-brief) Y gstack (autoplan/review/ship). **Agent-agnostic** (cualquier cliente MCP: Claude Code/Codex/gemini…), **opcional** (gated por publish_skills), **unificado + deduped**.
- `overlay/skills/registry.yaml` (catálogo versionado). Drift: re-correr `skills-federate` (copias). Doc: `docs/skill-federation.md`.

---

## 2026-07-11 — GATE F3 `[AUDIT_PASS]`: gstack overlay + skill federation diseñada

- **3.5**: `/learn` checkpoint local-only verificado; **secret scanner probado** (4/4 secretos falsos atrapados por los PATTERNS de gstack).
- **3.7**: **loop e2e corrido** en sandbox (`slugify()`): empirical-engine-first (4 invariant tests), commit-per-phase + `[AUDIT_PASS]`, gate objetivo + smoke real, PR local **sin push**. Fricción clave documentada (`docs/validation-f3.md`): los slash-skills son capa-sesión; el overlay impone la disciplina del SOP, no "corre" los skills.
- **3.9 [NUEVO — Eduardo]**: **federación de skills** diseñada (`docs/skill-federation.md`) — ebrain como capa unificada/opcional/agent-agnostic sobre gstack (54) + ckis-skills (35) + Company Brain (14) + skillified workflows, vía el **skillpack nativo de gbrain** (`list_skills` MCP). Impl diferida (converge con 2.6b en F4).
- **3.8 gate**: overlay no edita vendored; loop con disciplina SOP + sin push; agent-browser default. **F3 COMPLETA.**

---

## 2026-07-11 — F3 (en curso): overlay CKIS↔gstack (3.1–3.4, 3.6)

- **3.1 gstack ya instalado** (`~/.claude/skills/`, pin 9988cd3) — sin `./setup`, sin Chromium. Descubierto que estaba pre-instalado; `vendor/gstack` queda como referencia read-only. (Un `cp` mío creó un nested `gstack/gstack` → eliminado, install real intacto.)
- **Decisión de frontera (Eduardo, ULTRAPLAN L112):** browser = **agent-browser (Vercel) nativo** para QA/spec-driven-dev/web/fetch (Chromium propio, > playwright); gstack `/browse`+`/design-shotgun`+`/open-gstack-browser` = **opcionales/on-demand** (GUARDRAILS §9, 4GB). Visual gate corre con agent-browser.
- **`overlay/gstack-ckis/`** (3.2/3.3/3.4/3.6): `README.md` + `00-ckis-overlay-map.md` — mapa 7-phase ↔ skills gstack + 7 reglas de precedencia donde el **SOP de Eduardo gana** (gate pass/fail, maker≠checker, visual gate dual-viewport, commit-per-phase + `[AUDIT_PASS]`, contratos de worker herméticos, `.brain`/`.claude` nunca commiteados, irreversible→surface). Overlay vía CLAUDE.md/SOP, NUNCA editando los SKILL.md vendored (build-artifacts).
- **Pendiente F3:** 3.5 (`/learn` + checkpoint local-only + test secret scanner), 3.7 (sprint e2e sandbox), 3.8 (gate).

---

## 2026-07-11 — GATE F2 `[AUDIT_PASS]`: Federación CKIS COMPLETA

**Opus audit F2 (2026-07-11) — invariantes verificados:**
- Sources = solo `second-brain` (861p) + `company-brain` (163p); **cero clientes/código registrados**. brisas/dekko NO federados.
- Secret-scan del brain: 0 `sk-ant`, 0 pooler-urls. Repo `~/eBrain` secret-clean (46 archivos).
- korvex: solo commits locales, **cero push** (verificado). Único push = `~/eBrain` → `aedneth/ebrain` privado.
- Backup `ckis-backup-doctor` **verde** (all pushed). Recovery-from-git probado (863p/490 links). CHANGELOG al día.

**F2 (Federación CKIS) COMPLETA.** Hecho: 2.1 topología (ADR-001, 1 brain·N sources) · 2.2 aislamiento · 2.3 repos · 2.4 MCP + `ebrain-q` cross-source · 2.5 guidance blocks · 2.6 graphify (dos carriles bridge) · 2.6c `brain-init` · 2.7 benchmark QMD (ebrain primario, QMD fallback) · 2.8 backup/recovery.
**Diferido a F4:** 2.6b auditoría multi-proveedor (insumo del model-routing). **Siguiente fase: F3 (gstack + overlay CKIS)** o F4 (routing) según decida Eduardo.

---

## 2026-07-11 — F2.5 + F2.8: guidance blocks + backup/recovery probado

**2.5 — guidance blocks:** bloque `## ebrain Search + Code Guidance` (semántico→ebrain/MCP/`ebrain-q`, estructura→graphify/Dev Brain) inyectado en 7 repos propios con CLAUDE.md (5 CLIs + museum + korvex-web), **commit local sin push**. Integrado a `brain-init` (paso 5.5) para repos futuros.

**2.8 — backup/recovery:**
- **Recovery PROBADO** (GUARDRAILS §5) en brain aislado (`GBRAIN_HOME` desechable): 863 pág + 3689 chunks (`sync --no-embed` ~2min) + **490 links** (`extract links --source db`, 7s) — idéntico a producción. DB 100% reconstruible desde git. El paso de links correcto es `extract links --source db`.
- **`~/eBrain` añadido al manifest** de `ckis-backup-all` (target `ebrain`→`aedneth/ebrain` privado). Repo secret-clean (46 archivos, cero valores). Push inicial lo hace la corrida programada (auto-crea remote). PGLite NO se respalda (reconstruible).
- `ckis-backup-doctor` verde. Dump Supabase N/A (PGLite local). Documentado en `runbook.md` §recovery+§backup.

---

## 2026-07-11 — F2.7: benchmark QMD vs ebrain + decisión (ebrain primario, QMD fallback)

- **Benchmark** (`docs/benchmark-qmd-vs-ebrain.md`, 8 queries ES/EN): ebrain relevancia top-1 **0.81-0.91**; QMD `search` (BM25) devuelve "none" en queries conceptuales; QMD `vsearch` **113s + índice 76% stale**. ebrain vía MCP ~1-3s (persistente); CLI fan-out 11-16s (cold-start bun ×2).
- **Costo estimado** (uso intensivo): search ≈ **$0.006-0.094/mes**; + re-embed incremental ~$0.12/mes → **total < $0.50/mes con uso día-y-noche**. Cap $5 jamás tocado por búsqueda.
- **Decisión (gate Eduardo):** **ebrain = primario semántico** (vía MCP); **QMD = fallback cero-costo/offline** (BM25 keyword; vector en pausa hasta re-embed). CLAUDE.md del vault actualizado.
- **Follow-ups:** optimizar `ebrain-q` vía MCP persistente (~12s→~2s); multi-proveedor cero-costo (ZeroEntropy/gemini free) como columnas alternativas → 2.6b/F4.

---

## 2026-07-11 — F2.6c: `brain-init` implementado (bootstrap de proyecto agent-agnostic)

- **`~/eBrain/scripts/brain-init`** + template canónico `~/eBrain/templates/brain/` (scripts, githooks, config.sh.tmpl, claude-settings.hooks.json, ORCHESTRATOR_BOOTSTRAP.md.tmpl).
- Un comando deja un repo listo: `.brain` skeleton + scripts → config (rutas correctas) → git hooks → merge Claude hooks → bootstrap parametrizado → `.gitignore` → register-to-dev-brain → trust. Idempotente, `--dry-run`, `--client`, `--no-register`, `--force`.
- **Drift arreglado en el template:** `02-projects`→`03-projects`, `03-knowledge`→`05-knowledge` (afectaba config.sh + sync-graph-to-vault.sh de TODOS los `.brain` desplegados). Nuevos despliegues correctos; batch-fix de los desplegados = follow-up (solo repos propios).
- **Provider-agnostic:** `ORCHESTRATOR_BOOTSTRAP.md` parametrizado (`$ORCHESTRATOR_MODEL`/`$WORKER_MODEL`) reemplaza el `OPUS_BOOTSTRAP` Anthropic-locked. La generalización de los hooks de eventos (Claude Code→Codex/Cursor/gemini) va en 2.6b.
- **Frontera cliente:** `--client` → `BRAIN_TRUST=client` + `deny` en gstack repo-policy → brisas/dekko nunca federan.
- Verificado end-to-end en repo desechable: idempotencia, merge no-destructivo (preserva hooks de usuario), `--client`, doctor ✓. Doc: `docs/brain-init-pipeline.md`.

---

## 2026-07-11 — F2.4: MCP registrado + cross-source resuelto vía overlay `ebrain-q`

- **MCP `ebrain` registrado** (user scope, machine-wide) → `✔ Connected`. Launcher `~/.config/ebrain/gbrain-mcp` (cwd neutral + `.env` + `MCP_STDIO=1`). Tools `mcp__ebrain__*` en toda sesión nueva de Claude Code.
- **Corrección honesta al ADR-001:** el cross-source **nativo NO funciona** en pin a25209b — sonda MCP JSON-RPC probó que `{all_sources:true}` y `{source_id:"__all__"}` devuelven `[]` (v1 limitation, `relational-recall.ts:73`). Per-source sí funciona (CLI + MCP).
- **Overlay `~/.config/ebrain/ebrain-q`**: fan-out que consulta cada source federado y mergea por score → el cross-source instantáneo que gbrain no tiene en v1. Validado mezclando second-brain + company-brain. **Es el valor de ebrain sobre gbrain.**
- Roster carril-código (graphify, no gbrain): 5 CLIs + museum-of-us + busnet (read-only) + korvex-* (read-only); brisas + dekko = deny.

---

## 2026-07-11 — F2 (en curso): topología decidida (ADR-001) + Company Brain federado

**Tipo:** federación CKIS (Fase 2) — decisión de arquitectura + segundo source vivo.

- **ADR-001 — topología de brains:** **1 brain · N sources** (hub de federación único). Mounts descartados (fragmentarían el cross-source, e inmaduros). Decisión de frontera tomada con Eduardo: ebrain = indexador único de TODOS los brains, cross-source e instantáneo.
- **Modelo de aislamiento personal⊥Korvex** (GUARDRAILS §3): triple defensa — (1) token-scope de callers remotos (garantía dura, fase MCP remoto, diferida), (2) `.gbrain-source` pinning por repo, (3) wikilink scoping #972. El flag `federated` NO es la frontera de seguridad.
- **Cross-source (empírico, pin a25209b):** vive en la capa MCP/Operation (`operations.ts:478`: `all_sources || source_id==='__all__'`). El **`--source __all__` del CLI NO funciona** (regex `[a-z0-9-]` rechaza `_`; "v1 limitation" en `relational-recall.ts:73`). → interfaz real de ebrain = MCP (donde cruza); terminal crudo tendrá wrapper fan-out.
- **company-brain federado:** source registrado (`federated:true`) → `~/Documents/Company Brain`; **163 páginas · 801 chunks · 100% embebido · ~$0.06**. second-brain también federado. Total del brain: **1024 páginas · 4474 chunks · 100% embebidos**.
- **Aislamiento validado en vivo:** query personal `--source company-brain` → **cero notas personales**; `--source second-brain` → sí (aisladas). secret-scan company-brain 0/0.
- **Redirect graphify (Eduardo):** NO embeber Dev Brain crudo (2610 `.md`). graphify ya construye el grafo de código y se reconstruye solo → federar salidas destiladas / puentear su MCP (reforma SPRINT 2.3 + 2.6).
- **⚠ GUARDRAILS §2:** Dev Brain contiene `code-graph/brisas-del-golfo/` (commiteado) → `git ls-files --cached` no lo excluye por ignore. Exclusión por **registro sub-path**, no glob. brisas queda fuera de ebrain por default (decisión explícita de Eduardo para incluir su grafo, con alcance).

---

## 2026-07-11 — F1: Motor vivo + Second Brain indexado

**Tipo:** puesta en marcha del motor gbrain (Fase 1 del SPRINT) — PGLite local, ingesta completa del Second Brain.

- Motor **PGLite local** (`~/.gbrain/brain.pglite/`); Supabase diferido (free-tier lleno, migración lossless cuando Pro).
- Embeddings **`openai:text-embedding-3-large` @1536d** (Matryoshka; Eduardo pidió mejor calidad que 3-small; bajo el límite HNSW 2000d de pgvector). Schema pack `gbrain-base-v2`.
- Launcher `~/.config/ebrain/gbrain-run` (chmod 700) resuelve el **gotcha crítico**: `bun` auto-carga el `.env` del cwd → el `.env` del vault pisaba `OPENAI_API_KEY` (400 Bad Request en todo embedding). Fix: `cd` a dir neutral antes de correr. Documentado en `docs/runbook.md`.
- Ingesta: **861 páginas · 3673 chunks · 3673 embebidos (100%) · 490 links · 901 tags** · 33 tipos inferidos. `link_resolution.global_basename=true` (0→490 edges; DIR_PATTERN no cubre carpetas CKIS).
- Integridad: vault INTACTO byte-a-byte post-ingesta; secret-scan CLEAN (0 `sk-ant-`, 0 pooler URLs). Costo real **~$0.30–0.35** (muy bajo el cap $5).
- Validación (`docs/validation-f1.md`): 10 queries reales 5 ES/5 EN → **10/10 relevantes, 8/10 exactas top-1**, bilingüe simétrico. `gbrain think` diferido (requiere chat model → F4).
- **Diferido:** schema pack custom `ebrain-ckis-v1` (base-v2 suficiente); Company Brain sin embeber (es F2). → **Desbloquea F2** (federación).

---

## 2026-07-10 — F0: Setup + Reverse Engineering local completo

**Tipo:** setup de workspace + ingeniería inversa de gbrain/gstack (Fase 0 del SPRINT).

- Workspace `~/eBrain` creado (`vendor/ discovery/ overlay/ cli/ docs/ scripts/`), `git init` rama `main`, `.gitignore`, aislado del repo de `$HOME`. CLAUDE.md + README.md a raíz.
- Clonados full-depth: **gbrain** `a25209b` (v0.42.58.0, 337 commits) y **gstack** `7c9df1c` (v1.60.1.0, 329 commits). Pins en `discovery/00-environment.md`.
- 4 workers Sonnet produjeron 5 reportes de discovery (`00`–`04`), auditados por Opus con spot-checks contra código real → los 5 `[AUDIT_PASS]`.
- **Calibraciones del plan** (ver detalle en ULTRAPLAN §0.1 y ARCHITECTURE §9):
  - Contrato `BrainEngine` = **147 ops** (no ~47); capa `Operation` = **102** (= superficie MCP completa, no "30+"). Federación se integra en la capa `Operation` (ahí vive el trust-gating remoto/local).
  - Embedder por defecto = **ZeroEntropy `zembed-1` 1280d, hospedado** (no OpenAI); reranker ZeroEntropy hospedado. Cero peso local → ideal 4GB. OpenRouter es base-URL del gateway LLM pero NO tiene API de embeddings (confirmado).
  - **Trust triad = storage-flag skill-time, NO guard runtime.** `deny` frena el sync pre-flight (keyed por git-remote normalizado); `read-only` solo hace que el setup skill omita el import — no bloquea un `gbrain put`/`mcp__gbrain__put` manual. MCP se registra user-scope machine-wide. → brisas-del-golfo=deny se impone **NO registrándola como source**; korvex-*=read-only por disciplina ebrain + `federated:false`; falta gate de escritura verificable (test explícito en F2).
  - gbrain hace **write-through DB→disco** (`writePageThrough`) → **desactivar para el source del vault** (GUARDRAILS §2: la DB nunca escribe de vuelta al canónico). Config obligatoria F1.
  - `SKILL.md` de gstack es **build-artifact** de `SKILL.md.tmpl` → overlay CKIS vía sección en CLAUDE.md o wrapper skill, NUNCA editar el SKILL.md vendored (F3).
  - Dos secret scanners en gstack: `lib/redact-patterns.ts` (3-tier fuerte, pre-push) + `bin/gstack-brain-sync` embebido (más débil) → GUARDRAILS ebrain no debe sobre-estimar cobertura.
  - Default schema pack = `gbrain-base-v2` (15 tipos); schema real en `migrate.ts` (56 tablas), no solo `schema.sql`; "ontología" = columnas en `facts`. PGLite ~50K páginas single-writer → Supabase para prod.
- Estimado de ingesta: `discovery/05-cost-estimate.md` (vault ≈ 860 .md, ~2.14M tokens).
- **Gate humano 0.4.4 ✅ resuelto (2026-07-10):** (a) **PGLite LOCAL** (Supabase free-tier lleno; migración lossless cuando Pro); (b) embeddings **`openai:text-embedding-3-small`** hosted (key propia + $50 créditos, cap + canary). Verificado que **QMD NO es reusable** (EmbeddingGemma-300M local 768d vs gbrain — modelo/dims/store distintos); QMD se mantiene, benchmark F2. Detalle: ULTRAPLAN §0.1 "Decisión gate 0.4.4". → **Desbloquea F1** (tras colocar la key + cap OpenAI).
