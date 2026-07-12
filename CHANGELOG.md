# CHANGELOG — ebrain

Una línea por cambio estructural (disciplina Company Brain). El más reciente arriba.

---

## 2026-07-11 — F4 routing impecable: 2º audit Fable 5 + realidad de recursos (Codex $2500 = cerebro)

- **Nueva realidad de recursos (Eduardo):** Codex ($2500 hackatón + API OpenAI) = **cerebro/driver primario diario** (como se usaba Claude Code); **Claude Code baja a 2º de confianza** (Opus director/auditor, dueño de vault/CKIS); **Cursor $50 + CLI + modelos Anthropic**; OpenRouter **$10/mo** = carril daily ruteado (no agente); stack chino debe **construir proyectos enteros** cada modelo en máx capacidad.
- **2º audit Fable 5** (deep, read-only): proyecto sano, deuda de **gobernanza** no de código. Hallazgo #1: **Codex es el driver primario MENOS gobernado** (guardrails CKIS son per-harness Claude Code; brisas/dekko en disco; sin deny de secretos, sin MCP, sin session logs) → nueva §2.1 de gobernanza Codex + reframe de SPRINT 4.6 (= ejecución de 2.6b).
- **`route.ts` endurecido (6 bugs del audit):** append real concurrency-safe, fallback de costo estimado (nunca $0 silencioso → cap real), flag `--floor`, timeout 120s, **regex frontier hermético** (oN/gpt-N/gemini pro|ultra), empate→general. **12/12 tests.**
- **`routing.yaml`:** split `provider_routing`/`completion_defaults`, **`max_tokens:8192`** (anti-drenaje Kimi/Qwen-Max out), `general` cheap-first opcional vía `--floor`, ganadores en máx capacidad (directiva Eduardo).
- **`ROUTING.md` rediseñado → status:active:** Tier 0 reescrito (Codex cerebro), §2.1 gobernanza Codex, árbol de decisión nuevo (regla RAM 4GB: un agente vivo a la vez; maker≠checker invertido: Opus audita a Codex), §6 con ledger Codex + auto-recharge OFF + 4 medidores.
- **Acciones humanas abiertas:** auto-recharge OFF + límite per-key (OpenRouter); verificar expiry créditos Codex; confirmar dónde opera Codex (para el sandbox de 4.6).

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
