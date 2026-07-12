---
type: sprint-plan
project: ebrain
created: 2026-07-08
modified: 2026-07-08
status: proposed
tags: [ebrain, sprint, tareas, agentes]
related: [ULTRAPLAN.md, CLAUDE.md, GUARDRAILS.md]
---

# SPRINT — ebrain (tareas atómicas)

Reglas de ejecución: una tarea = un worker Sonnet = un resultado verificable. Opus audita cada gate con `[AUDIT_PASS]` antes de avanzar. Commit por fase con mensaje descriptivo. Ninguna tarea toca brisas-del-golfo ni pushea repos korvex. Toda tarea que gasta dinero declara su costo estimado ANTES de correr y respeta el cap.

Convención de estado: `[ ]` pendiente · `[~]` en curso · `[x]` hecho+auditado · `[!]` bloqueado (anotar por qué).

---

## FASE 0 — Setup + Reverse Engineering local

### 0.1 Workspace
- [x] 0.1.1 Crear directorio `/ebrain` con subdirs: `vendor/ discovery/ overlay/ cli/ docs/ scripts/`. → `~/eBrain` (ruta real; ver discovery/00-environment.md).
- [x] 0.1.2 `git init` en `/ebrain`; copiar a `docs/` los 8 documentos de este paquete (ULTRAPLAN, ARCHITECTURE, SPRINT, GUARDRAILS, DESIGN, README, KICKOFF-PROMPT, CLAUDE.md → CLAUDE.md va a la raíz del repo). → rama `main`; CLAUDE.md y README.md a raíz; docs ya presentes.
- [x] 0.1.3 `.gitignore`: `vendor/`, `*.env`, `node_modules/`, `.gbrain/`, `spend.jsonl`. (+ `*.pem`, `*credentials*`)
- [x] 0.1.4 Instalar prerequisitos y verificar versiones: `bun --version` (≥1.0), `git`, `jq`. Registrar salida en `discovery/00-environment.md` junto con RAM libre (`free -h`) y disco. → bun 1.3.14, git 2.34.1, jq 1.6, gh 2.92.0; RAM 3.6Gi (~334Mi libre), disco 19G libre.
- [x] 0.1.5 Clonar `https://github.com/garrytan/gbrain` en `vendor/gbrain` (clon completo, NO shallow — necesitamos historia para entender decisiones). → SHA a25209b, v0.42.58.0, 337 commits.
- [x] 0.1.6 Clonar `https://github.com/garrytan/gstack` en `vendor/gstack`. → SHA 7c9df1c, v1.60.1.0, 329 commits.
- [x] 0.1.7 Registrar en `discovery/00-environment.md`: commit SHA y VERSION de ambos repos (base de la ingeniería inversa).

### 0.2 Reverse engineering gbrain (workers en paralelo, solo lectura)
- [x] 0.2.1 Leer `vendor/gbrain/{README.md,CLAUDE.md,AGENTS.md,DESIGN.md,docs/INSTALL.md}` → resumen operativo en `discovery/01-gbrain-engine.md` §overview. `[AUDIT_PASS]` (INSTALL.md→INSTALL_FOR_AGENTS.md).
- [x] 0.2.2 Analizar `src/core/engine.ts`: listar las ~47 operaciones del contrato BrainEngine con firma y propósito → §engine-contract. `[AUDIT_PASS]` — **son 147, no ~47** (verificado engine.ts:649-2200; README subestima 3×).
- [x] 0.2.3 Mapear el esquema de DB (migraciones/DDL): tablas, índices HNSW, edges, timeline, jobs → §schema (diagrama ASCII). `[AUDIT_PASS]` — schema real vive en migrate.ts, no solo schema.sql.
- [x] 0.2.4 Trazar el pipeline de escritura `put_page` → chunking → embedding → auto-link → §write-path (archivos + funciones exactas). `[AUDIT_PASS]`
- [x] 0.2.5 Trazar el pipeline de retrieval: hybrid search, RRF, boosts, reranker, search modes, `--explain` → §read-path. `[AUDIT_PASS]` — RRF_K=60, boosts 1.05/1.10, reranker ZeroEntropy hospedado.
- [x] 0.2.6 Documentar brains ⊥ sources: `.gbrain-source`, cadena de precedencia (6 tiers), `sources add`, `sync --strategy code` → `discovery/02-gbrain-federation.md`. `[AUDIT_PASS]` — tiers verificados en source-resolver.ts:263-272.
- [x] 0.2.7 Documentar MCP server: tools expuestos (30+), scopes, stdio vs http, `gbrain connect` → mismo archivo §mcp. `[AUDIT_PASS]` — **102 tools reales** (verificado operations.ts:5316-5401), 6 scopes con `agent` sibling (scope.ts:25-63).
- [x] 0.2.8 Documentar schema packs: formato, resolución 7-tier, `detect/suggest/review-candidates/use`, migración entre packs → §schema-packs. `[AUDIT_PASS]` — default pack = gbrain-base-v2 (15 tipos).
- [x] 0.2.9 Documentar Minions (job queue) y dream cycle: jobs, crons, presupuestos, crash-safety → §jobs-and-dreams. `[AUDIT_PASS]` — cola Postgres BullMQ-like, presupuesto por-fase, sin scheduler propio (cron de SO).
- [x] 0.2.10 Documentar soporte Obsidian: `link_resolution.global_basename`, qué NO resuelve, riesgos con el vault real → §obsidian. `[AUDIT_PASS]` — cross-source scoping #972 verificado en link-extraction.ts:911-916.
- [x] 0.2.11 Listar variables de config y env que gbrain lee (grep sistemático `process.env`, `config.get`) → §config-surface. `[AUDIT_PASS]` — 143 vars; incl. OPENROUTER_BASE_URL (gateway ya soporta OpenRouter), GBRAIN_DATABASE_URL, ZEROENTROPY/OPENAI/GOOGLE/VOYAGE keys.

### 0.3 Reverse engineering gstack
- [x] 0.3.1 Leer `vendor/gstack/{README.md,ARCHITECTURE.md,ETHOS.md,CLAUDE.md,SKILL.md}` → `discovery/03-gstack-skills.md` §overview. `[AUDIT_PASS]`
- [x] 0.3.2 Anatomía de una skill: estructura de directorio, SKILL.md, cómo `./setup` la instala/symlinkea por host → §skill-anatomy. `[AUDIT_PASS]` — **SKILL.md es build-artifact de SKILL.md.tmpl**; overlay vía CLAUDE.md-section o wrapper, NUNCA editar el SKILL.md vendored (verificado setup:563-587).
- [x] 0.3.3 Inventariar las skills y clasificarlas para CKIS: adoptar tal cual / adaptar con overlay / omitir (hardware o irrelevancia) → tabla §skill-triage. Mínimo evaluar: office-hours, autoplan, plan-eng-review, review, investigate, qa, ship, retro, learn, spec, careful/freeze/guard, document-release, cso, codex, setup-gbrain, sync-gbrain. Marcar browse/design-shotgun/open-gstack-browser como opt-in (Chromium en 4 GB). `[AUDIT_PASS]` con **corrección Opus**: setup-gbrain/sync-gbrain = **ADOPTAR** (centrales a ebrain F1/F2), NO "omitir" (el worker razonó desde el estado pre-ebrain).
- [x] 0.3.4 Documentar `/learn` y checkpoint mode: dónde vive el estado (`~/.gstack/`), formato, sync a repo privado, secret scanner → §memory. `[AUDIT_PASS]`
- [x] 0.3.5 Documentar `setup --host` y el mecanismo multi-agente (codex/cursor/hermes/gbrain) → §hosts. `[AUDIT_PASS]` — 10 hosts, mutual-blindness by design.
- [x] 0.3.6 Leer `vendor/gstack/USING_GBRAIN_WITH_GSTACK.md` completo → `discovery/04-connection-contract.md`: los 4 paths de setup-gbrain, trust triad (read-write/read-only/deny, stickiness por remote), sync-gbrain, bloque `## GBrain Search Guidance`, env vars GSTACK_*. `[AUDIT_PASS]` — **HALLAZGO CRÍTICO**: trust triad = storage-flag skill-time, NO guard runtime (verificado repo-policy:32-37); brisas=deny se impone NO registrándola como source; korvex=read-only por disciplina ebrain.
- [x] 0.3.7 Documentar el secret scanner de gstack (qué patrones bloquea) y `.gitleaks.toml` de gbrain → insumo para GUARDRAILS. `[AUDIT_PASS]` — DOS scanners: `lib/redact-patterns.ts` (3-tier fuerte, verificado :183-200) + `bin/gstack-brain-sync` embebido (más débil); ebrain GUARDRAILS no debe sobre-estimar cobertura.

### 0.4 Gate F0
- [x] 0.4.1 Opus audita los 5 reportes de discovery contra el código real (spot-checks) → `[AUDIT_PASS]` o correcciones. **`[AUDIT_PASS]`** los 5 (00-environment + 01-04); spot-checks verificados: 102 ops array, SOURCE_TIER_NAMES, #972 cross-source, scopes, 147 BrainEngine sigs, ZeroEntropy default, RRF_K=60, setup symlink, redact HIGH tier, repo-policy caller-level.
- [x] 0.4.2 Actualizar `docs/ULTRAPLAN.md` y `docs/ARCHITECTURE.md` con descubrimientos que cambien decisiones; anotar cada cambio en `CHANGELOG.md` del repo ebrain. → ULTRAPLAN §0.1 (tabla de deltas), ARCHITECTURE §9, CHANGELOG.md creado.
- [x] 0.4.3 Commit: `F0: discovery complete (gbrain@<sha>, gstack@<sha>)`. → `f8e218b` (vendor/ excluido).
- [x] 0.4.4 **GATE HUMANO**: Eduardo aprueba (a) proyecto Supabase dedicado, (b) provider de embeddings + presupuesto de ingesta estimado en 0.4.5. **✅ RESUELTO 2026-07-10:** (a) **NO Supabase por ahora** (free-tier lleno, 2/2 proyectos) → **PGLite LOCAL** para F1/F2; migración lossless a Supabase cuando Pro. (b) Embeddings = **`openai:text-embedding-3-small`** (key propia, $50 créditos); cap dashboard OpenAI + monitoreo local; canary-first. QMD (EmbeddingGemma-300M local, 5190 vectores) verificado **NO reusable** (modelo/dims/store distintos) — QMD se queda, benchmark F2.
- [x] 0.4.5 Estimar costo de ingesta total: contar tokens aproximados del vault (`find + wc`) × precio del provider elegido → escribir en `discovery/05-cost-estimate.md`. → 860 .md, ~2.14M tokens brutos, ~2.5M a embeber, full-ingest ≈ centavos–$0.33 (no es riesgo de costo).

---

## FASE 1 — Motor vivo (PGLite local + Second Brain)

> **Calibración 0.4.4 (2026-07-10) + ejecución (2026-07-11):** F1 corrió en **PGLite LOCAL**, no Supabase (free-tier lleno). Embeddings finales = **`openai:text-embedding-3-large` @1536d** (Eduardo pidió mejor calidad; Matryoshka bajo el límite HNSW 2000d). Ojo RAM: un proceso pesado a la vez, batch caps en embed. **Resultado F1: 861 páginas · 3673 chunks · 100% embebidos · 490 links · 901 tags.**

### 1.1 Provisión
- [x] 1.1.1 ~~Eduardo crea proyecto Supabase `ebrain-prod`~~ → **N/A: PGLite local** (Supabase diferido a Pro). El "init a Supabase" se reemplazó por `gbrain init --pglite`.
- [x] 1.1.2 `~/.config/ebrain/.env` (chmod 600, 181 bytes) con `OPENAI_API_KEY`. Eduardo colocó la key (nunca entró al contexto del agente); presencia verificada sin imprimir. PGLite local (sin `EBRAIN_DATABASE_URL`). `.env` gitignored en todo repo. Cap servidor $5 en el dashboard OpenAI.
- [x] 1.1.3 gbrain corre desde el clon local vía launcher `~/.config/ebrain/gbrain-run` (`bun run vendor/gbrain/src/cli.ts`) — NO upstream remoto; overlay/patches locales aplican.
- [x] 1.1.4 `gbrain init --pglite` con `GBRAIN_EMBEDDING_MODEL=openai:text-embedding-3-large` + `GBRAIN_EMBEDDING_DIMENSIONS=1536`. `gbrain doctor` → verde. Salida y gotcha crítico (bun auto-carga `.env` del cwd → launcher hace `cd` a dir neutral) en `docs/runbook.md`.

### 1.2 Canary PGLite (barato y local primero)
- [x] 1.2.1 `gbrain init --pglite` en brain de prueba; luego reinit limpio para el full-ingest.
- [x] 1.2.2 20 notas representativas (daily, permanent, MOC, decision, wikilinks ES/EN).
- [x] 1.2.3 Canary importado: frontmatter intacto (diff byte-a-byte), 20 páginas / 45 chunks, edges de wikilinks, `search` encuentra las 20. **Root-cause del 400 Bad Request resuelto** (bun `.env` del vault pisaba la key → launcher con cwd neutral).
- [x] 1.2.4 Costo real del canary (centavos) → recalibrado en `discovery/05-cost-estimate.md`.

### 1.3 Schema pack `ebrain-ckis-v1`
- [~] 1.3.1 `schema detect`/`suggest` — **DIFERIDO**: `gbrain-base-v2` infiere ya 33 tipos correctos del vault (system, permanent-note, session-log, project-overview, sop, dip…); el pack custom no es bloqueante para F2.
- [~] 1.3.2 Redacción del pack `ebrain-ckis-v1` — **DIFERIDO** (edges custom `client_of` se evaluarán con evidencia en F2/F5).
- [~] 1.3.3 `schema use` — DIFERIDO.
- [~] 1.3.4 Versionar en `overlay/schema-packs/` — DIFERIDO (tarea de F5 si la evidencia lo justifica).

### 1.4 Ingesta Second Brain (PGLite local)
- [x] 1.4.1 Exclusiones: `.env*`, `.obsidian/`, binarios, `.claude/backups/` (heredadas por defecto del sync de gbrain; verificado en secret-scan post-ingesta).
- [x] 1.4.2 Vault registrado como source `second-brain` (`isolated`, `federated:false`) → `~/Documents/Second Brain`.
- [x] 1.4.3 `sync --no-embed` (estructura+grafo sin costo); 861 páginas.
- [x] 1.4.4 `link_resolution.global_basename = true` activado (0 → 490 edges; neto muy positivo — el whitelist DIR_PATTERN no cubre carpetas CKIS).
- [x] 1.4.5 Embedding por lotes: 3673 chunks, 100% cobertura, ~$0.30–0.35 (muy bajo el cap $5). Vault verificado INTACTO byte-a-byte post-ingesta; secret-scan CLEAN (0 `sk-ant-`, 0 `postgres://…@`).
- [x] 1.4.6 Validación: 10 queries reales (5 ES / 5 EN) → **10/10 relevantes, 8/10 exactas en top-1**; documentado en `docs/validation-f1.md`. `think` diferido (requiere chat model, F4).
- [x] 1.4.7 Gate F1: `[AUDIT_PASS]` + commit `F1: engine live, second-brain indexed`.

---

## FASE 2 — Federación CKIS

> **Decisión de topología (ADR-001, 2026-07-11):** **1 brain · N sources** (hub de federación único; mounts descartados por fragmentar el cross-source). Aislamiento personal⊥Korvex por triple defensa (token-scope remoto + `.gbrain-source` pin + wikilink #972), NO por el flag `federated`. Cross-source vive en la capa MCP/Operation (`source_id:'__all__'`), no en el `--source` del CLI (v1 limitation).
> **Redirect graphify (Eduardo, 2026-07-11):** NO embeber el Dev Brain crudo (2610 `.md`, redundante). graphify ya construye el grafo de código y se reconstruye solo. Federar **salidas destiladas** (wiki/GRAPH_REPORT/graph.json) y/o puentear el MCP de graphify para queries de grafo. Reforma 2.3 + 2.6.

- [x] 2.1 Source `company-brain` registrado (`federated:true` por ADR-001) → `~/Documents/Company Brain` (163 pág, 801 chunks, 100% embebido, ~$0.06). second-brain federado también. ADR-001 escrito en `docs/adr/`. **Topología decidida con Eduardo.**
- [x] 2.2 Aislamiento validado: query personal `--source company-brain` → **cero notas personales filtradas**; misma query `--source second-brain` → sí aparecen (aisladas). Cross-source caracterizado (funciona vía MCP/Operation, no CLI). secret-scan company-brain 0/0. Test adversarial de escritura remota → diferido a fase MCP remoto (no hay callers remotos en F2).
- [x] 2.3 **CORREGIDO + REFORMADO**: los repos SÍ están presentes (anidados en `Documents/Startups/Korvex/{Systems,Projects}/…`): korvex-web + korvex-crm (`aedneth/*`, read-only), **brisas-del-golfo Y dekko-floors** (`aedneth/*`, **ambos = deny**, repos de cliente presentes) + CLI-suite (tuyos). **Decisión (2.6): NO `--strategy code` masivo, NO embeber Dev Brain** → carril de código = graphify puenteado (ver `docs/graphify-integration.md`). Cero código de cliente entra a gbrain por diseño.
- [x] 2.4 MCP `ebrain` registrado (user scope, `claude mcp add ebrain --scope user -- ~/.config/ebrain/gbrain-mcp`) → `✔ Connected`. Validado end-to-end vía sonda JSON-RPC: `query` per-source funciona vía MCP. **Hallazgo:** cross-source nativo (`all_sources:true`) devuelve `[]` (v1 limitation confirmada) → resuelto con overlay `~/.config/ebrain/ebrain-q` (fan-out + merge, validado mezclando ambos sources). MCP de graphify → diferido a 2.5 (guidance block; su modelo per-graph no mapea a "todos los proyectos" sin grafo merged).
- [x] 2.5 Bloque `## ebrain Search + Code Guidance` (semántico→ebrain/MCP/`ebrain-q`, estructura→graphify/Dev Brain) inyectado en 7 repos propios con CLAUDE.md (5 CLIs + museum + korvex-web), commit **local sin push**. Integrado a `brain-init` (paso 5.5) para repos futuros. `.gbrain-source` pin N/A (no registramos código como source gbrain — carril graphify). korvex-crm sin CLAUDE.md → lo recibe cuando se le cree uno / vía brain-init.
- [x] 2.6 **Graphify (decidido)**: `docs/graphify-integration.md` escrito. Decisión = **dos carriles (bridge, no embed)**: Carril 1 semántico (ebrain), Carril 2 estructura (graphify auto-reconstruido, puenteado vía su MCP + guidance block). Cero cliente en embeddings. Incluye Plan B (multi-proveedor) y Plan C (bootstrap). Ejecución de MCP-bridge → con 2.4/2.5.
- [ ] 2.6b **[NUEVO — Eduardo] Auditoría multi-agente/multi-proveedor** de `.brain`/hooks/scripts/OPUS_BOOTSTRAP: capa de adaptadores de eventos (Claude Code/Codex/Cursor/gemini/genérico), `ORCHESTRATOR_BOOTSTRAP.md` parametrizado (`$ORCHESTRATOR_MODEL`/`$WORKER_MODEL`), fallback sin-hooks vía git-hooks+CLI. **Insumo/ejecución en F4 (model-routing).** Doc: `docs/multi-provider-brain-audit.md`.
- [x] 2.6c **[Eduardo] Pipeline `brain-init` — IMPLEMENTADO + probado end-to-end**. `~/eBrain/scripts/brain-init` (idempotente, `--dry-run`, `--client`, `--no-register`, `--force`) + template canónico `~/eBrain/templates/brain/`. Verificado: config con rutas correctas (03-projects/05-knowledge — **drift arreglado en template**), 5 git hooks, merge no-destructivo de 5 Claude hooks (preserva hooks de usuario), `--client`→deny, doctor ✓. Doc: `docs/brain-init-pipeline.md`. **Pendiente:** batch-fix del drift en los ~10 `.brain` YA desplegados (solo repos propios; clientes intocables) + el paso graphify-semántico multi-proveedor va en 2.6b.
- [x] 2.7 Benchmark QMD vs ebrain hecho → `docs/benchmark-qmd-vs-ebrain.md`. **Decisión (Eduardo): ebrain primario semántico + QMD fallback cero-costo/offline.** Datos: ebrain relevancia 0.81-0.91 vs QMD BM25 pierde semántica + vector 76% stale/113s. Costo estimado **< $0.50/mes** con uso día-y-noche (search ≈ gratis). CLAUDE.md del vault actualizado. Follow-ups: optimizar `ebrain-q` vía MCP persistente; multi-proveedor cero-costo (ZeroEntropy/gemini) en 2.6b/F4.
- [x] 2.8 Backup/recovery: (a) **recovery PROBADO** en brain aislado — 863 pág + 3689 chunks (~2min) + 490 links (`extract links --source db`, 7s), idéntico a producción; (b) dump lógico N/A (PGLite local); (c) **ebrain en el manifest** de `ckis-backup-all` (target `ebrain`→`aedneth/ebrain` privado; repo secret-clean, 46 archivos); (d) `ckis-backup-doctor` **verde**. Documentado en `docs/runbook.md` §recovery + §backup. Nota: el push inicial de ebrain lo hace la corrida programada (auto-crea el remote).
- [x] 2.9 **Gate F2: `[AUDIT_PASS]`** (Opus, 2026-07-11). Verificado: sources = solo second-brain + company-brain (cero clientes/código); secret-scan del brain 0/0; brisas/dekko NO federados; korvex sin push (solo commits locales); backup `ckis-backup-doctor` **verde** (ebrain respaldado en `aedneth/ebrain` privado); recovery-from-git probado; CHANGELOG al día. **F2 COMPLETA.** Único diferido: **2.6b (auditoría multi-proveedor) → F4** (es el insumo natural del model-routing, framing de Eduardo).

---

## FASE 3 — Workflow gstack con overlay CKIS

- [x] 3.1 **gstack YA instalado** en `~/.claude/skills/` (pin 9988cd3): /autoplan /review /ship /qa /office-hours /learn /retro /careful /freeze /guard verificados. **Sin `./setup`, sin descarga de Chromium** (Eduardo: agent-browser nativo; `vendor/gstack` queda como referencia read-only de auditoría). *(Corrección: un `cp` mío creó un nested `gstack/gstack` que eliminé; install real intacto.)*
- [x] 3.2 `overlay/gstack-ckis/` creado: `README.md` (filosofía overlay, no editar vendored) + `00-ckis-overlay-map.md`. Adaptación vía CLAUDE.md/SOP, nunca tocando los SKILL.md.
- [x] 3.3 **Mapa 7-phase ↔ /autoplan** en `00-ckis-overlay-map.md`: tabla de equivalencias + overlay que impone fases numeradas, spec numérico cerrado, `[AUDIT_PASS]`/fase, commit-per-phase, visual gate 1440×900+393×852 (con **agent-browser**, no /browse).
- [x] 3.4 **Mapa SOP ↔ /review+/ship** + reglas de precedencia (7 reglas donde el SOP gana: gate pass/fail, maker≠checker, visual gate agent-browser, commit-per-phase, contratos herméticos, .brain/.claude nunca commiteados, irreversible→surface).
- [x] 3.5 `/learn` checkpoint = **local-only** verificado (`checkpoint_push=false`, `checkpoint_mode=explicit` — sin sync remoto). **Secret scanner probado**: los PATTERNS de gstack (`redact-patterns.ts`) atrapan **4/4** secretos falsos (anthropic.key, aws.secret_key, db.url_with_password, github.pat); placeholder también matchea (over-redacción segura). Documentado en `docs/validation-f3.md`.
- [x] 3.6 Opt-in por hardware documentado (`00-ckis-overlay-map.md` §triage): browse/design-shotgun/open-gstack-browser = Chromium sólo on-demand. **Default de browser = agent-browser (Vercel)** para QA/spec/web/fetch (ULTRAPLAN L112).
- [x] 3.7 **Loop e2e corrido** en sandbox desechable (feature `slugify()`): 7-phase con empirical-engine-first (4 invariant tests), commit-per-phase + `[AUDIT_PASS]`, gate objetivo `bun test` + smoke real, **PR local sin push** (cero remote). Fricciones en `docs/validation-f3.md` (clave: los slash-skills son capa-sesión, no orquestador-programables; el overlay impone la disciplina del SOP, el skill se dispara en sesión).
- [x] 3.9 **[NUEVO — Eduardo] Federación de skills — IMPLEMENTADA + validada por MCP** (`docs/skill-federation.md`). ebrain = capa de skills unificada/opcional/agent-agnostic.
  - [x] 3.9a `overlay/skills/registry.yaml` — catálogo dedup generado (75 únicas: gstack + 35 ckis + 14 company, +11 duplicados omitidos, prioridad ckis>company>gstack).
  - [x] 3.9b `scripts/skills-federate` — agrega a `~/.config/ebrain/skills/<name>/SKILL.md` (copia; confinación de gbrain rechaza symlinks cross-dir; maneja `skill.md`→`SKILL.md`). Launchers exportan `GBRAIN_SKILLS_DIR`; `mcp.publish_skills=true`.
  - [x] 3.9c **Validado vía MCP**: `list_skills` → **count 75**, incluye ckis (braindump/process-inbox/daily-brief) Y gstack (autoplan/review/ship). Agent-agnostic (cualquier cliente MCP), opcional (gated).
  - [x] 3.9d Patrón `skillify` documentado (`skill-federation.md`) — SOP dev-pipeline como ejemplo. Convergencia con 2.6b (adaptadores por host) en F4. **Drift:** re-correr `skills-federate` refresca (copias); candidato a hook en F4/F5.
- [x] 3.8 **Gate F3: `[AUDIT_PASS]`** (Opus, 2026-07-11). Verificado: overlay no edita SKILL.md vendored; loop e2e corrió con disciplina SOP intacta + sin push; checkpoint local-only + secret scanner probado; agent-browser como default de browser (Chromium gstack opt-in). **F3 COMPLETA.** Diferido: 3.9 impl (skill federation) tras F4/2.6b; validación de skills pesadas bajo demanda.

---

## FASE 4 — Capa de ejecución de inteligencia (spec: ROUTING.md)

### 4.A Registry y mecánica OpenRouter
- [x] 4.1 **Verificación en vivo hecha (2026-07-11)** → `docs/model-registry.md`. Los 5 slugs primarios EXISTEN vivos (nombres especulativos aterrizaron): `deepseek/deepseek-v4-pro` ($0.435/$0.87, 1.05M ctx), `moonshotai/kimi-k2.6` ($0.66/$3.41, tools✓, multimodal), `z-ai/glm-5.2` ($0.35/$1.10 — **−75% vs spec** + 1M ctx), `minimax/minimax-m3` ($0.30/$1.20, 1M, text+image+video), `qwen/qwen3.7-max` ($1.25/$3.75, 1M). **Audit Fable expandió el check**: tool-calling✓ en los 5, ctx confirmado, floors cero-costo reales (`qwen/qwen3-coder:free`, `qwen/qwen3-next-80b-a3b-instruct:free`). Cadenas `[ganador,fallback,floor]` fijadas en el registry §4.
- [x] 4.2 **Key colocada** por Eduardo (`OPENROUTER_API_KEY`, presencia verificada sin imprimir, `sk-or-v1-…`), **$5 de crédito cargado**. Test controlado de cap = **hard-stop LOCAL probado** (gasto sembrado >$4 → abortó exit 3 sin gastar). **Pendiente lado-servidor (recordatorio a Eduardo):** confirmar auto-recharge OFF (el balance $5 = techo real) y opcional límite por-key en el dashboard. `data_collection:deny` validado implícitamente (la llamada real pasó con deny activo).
- [x] 4.3 **`cli/route.ts` implementado + probado + endurecido** (bun, ~250 líneas, build OK). Carga `routing.yaml` (Bun.YAML nativo), clasifica (keywords + `--cap`), llama array `models` (failover server-side), `provider_routing:{data_collection:deny,max_price}` + `completion_defaults:{max_tokens}` + `usage:{include:true}` (costo USD real), loguea `{ts,src,cap,model,tokens_in,tokens_out,usd}` a `spend.jsonl`, imprime `model=… cost=$…`, aborta si cap excedido. **Hardening pass (2º audit Fable, 6 bugs):** append real (concurrency-safe), fallback de costo estimado (nunca $0 silencioso), flag `--floor`, timeout 120s, **regex frontier hermético** (oN/gpt-N/gemini pro|ultra), empate→general. **Tests: 12/12 pasan** + integración hard-stop (exit 3 sin gastar). Launcher `~/.config/ebrain/ebrain-route`.
- [x] 4.4 **`~/.config/ebrain/routing.yaml` escrito** con el registry de 4.1. Fixes del 1er audit Fable: capacidad **`reasoning`** (7ª), `max_price` en `provider_routing`, `long_context` por ventana (≥1M ctx). Directiva Eduardo: **ganadores = máxima capacidad** (el stack construye proyectos enteros), `monthly_usd:10`, `max_tokens:8192` (anti-drenaje). `frontier.auto_escalate:false` config + hardcode. **`ROUTING.md` rediseñado (status:active)** con el 2º audit Fable: Codex=cerebro/primario, Claude Code=2º de confianza (director/auditor), stack chino=constructor completo ruteado, árbol de decisión + regla RAM + maker≠checker invertido.

### 4.B Benchmark de categorías en disputa (ROUTING.md §3.2)
- [ ] 4.5 Correr `gstack-model-benchmark` (o el router directo) con 4 tareas REALES de Eduardo: (a) componente Next.js+Tailwind del design system Korvex → GLM-5.2 vs Kimi K2.6; (b) problema de arquitectura ebrain → MiniMax M3 vs DeepSeek V4; (c) script bash CKIS → Qwen3.7 Max vs DeepSeek; (d) digestión de un repo completo → MiniMax vs GLM. Resultados + costo por corrida en `docs/validation-f4.md`; fijar los ganadores en routing.yaml.

### 4.C Tier 0 — cerebro Codex cableado + gobernado (**= ejecución de 2.6b, ya no diferible**)
- [~] 4.6 **Gobernanza del cerebro Codex** (ROUTING §2.1). Flujo real (Eduardo): `--sandbox danger-full-access` en dirs aislados → control = aislamiento + normas + MCP, NO approval-gating. **HECHO:** (b) **`~/.codex/AGENTS.md` global** (espeja CLAUDE.md: secretos duros, repos cliente=deny, SOP+maker≠checker, rastro narrativo, RAM); (c) **MCP ebrain en codex-cli** (`codex mcp add ebrain` → enabled). **PENDIENTE:** (a) aislamiento por-dir doc (riesgo confirmado: dekko-floors trusteado en config.toml); (d) **expiry créditos + burn-ledger** [acción Eduardo]; (e) reversión; `/codex` op-check con 1 tarea atómica; `docs/tier0-playbook.md`. codex-cli 0.144.1 ✓.
- [ ] 4.7 gemini-cli (0.50.0 ✓): verificar login free tier; documentar en el playbook sus usos (ingesta masiva, resúmenes batch, borradores) + límites de rate. Incluir reglas de **Cursor ($50 + CLI + Anthropic — solo edición interactiva)** y la advertencia ToS del proxy OAuth de Hermes (prohibido).

### 4.D Integración motor + evaluación Hermes
- [ ] 4.8 Apuntar providers LLM de gbrain (dream cycle, judges, brainstorm, `think`) a OpenRouter con perfil `:floor`; confirmar que embeddings siguen en su provider directo (OpenRouter no tiene embeddings API); verificar presupuesto respetado en una corrida.
- [ ] 4.9 **Evaluación Hermes** (opt-in, sin adopción todavía): instalar en la laptop SOLO para prueba corta (venv fuera del source tree, gateway apagado al terminar); configurar provider OpenRouter con la misma key; probar 1 cron y 1 tarea vía CLI; medir RAM real consumida; cotizar VPS $5 vs Modal/Daytona serverless. Entregar `docs/hermes-evaluation.md` con recomendación y costos. **Gate humano: Eduardo decide adopción y hábitat.** Si adopta: `skills.write_approval: true`, `memory.write_approval: true`, `max_concurrent_sessions` bajo.
- [ ] 4.10 Gate F4: `[AUDIT_PASS]` + commit. Criterio: 3 tareas ruteadas con costo logueado, registry verificado, benchmark resuelto, playbook Tier 0 escrito, evaluación Hermes entregada.

---

## FASE 5 — Consolidación

- [ ] 5.1 Configurar dream cycle nocturno (horario que no choque con backup 15-min ni con dip-collect 19:30); presupuesto acotado; primera corrida supervisada.
- [ ] 5.2 `ebrain doctor` y `ebrain status` implementados en `cli/` (agregan checks CKIS sobre `gbrain doctor`).
- [ ] 5.3 Vault: crear `02-projects/ebrain/` con `_overview.md`, enlace a ADRs, runbook resumido, y decisiones tomadas (QMD, topología de brains). Frontmatter CKIS correcto.
- [ ] 5.4 Repo /ebrain: `.brain` conectado a Dev Brain (hooks graphify post-commit instalados y probados con un commit).
- [ ] 5.5 Company Brain: fila en `registry/repos.md` para /ebrain, actualización de domain card engineering, entrada DRIFT si algo quedó abierto, línea en CHANGELOG.
- [ ] 5.6 Ejecutar decisión QMD de 2.7 (retiro o fallback); actualizar skills/docs del vault que lo referencian.
- [ ] 5.7 Auditoría final de seguridad: gitleaks sobre /ebrain y overlay; grep de la pooler URL y keys en todos los repos tocados → cero hallazgos.
- [ ] 5.8 Verificar los 8 Success Criteria del ULTRAPLAN §5; marcar checkboxes con evidencia (paths).
- [ ] 5.9 Commit final + retro (`/retro`) → lecciones a `03-knowledge/` del vault.
