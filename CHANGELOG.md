# CHANGELOG — ebrain

Una línea por cambio estructural (disciplina Company Brain). El más reciente arriba.

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
