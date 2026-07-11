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
- [ ] 0.4.3 Commit: `F0: discovery complete (gbrain@<sha>, gstack@<sha>)`.
- [ ] 0.4.4 **GATE HUMANO**: Eduardo aprueba (a) proyecto Supabase dedicado, (b) provider de embeddings + presupuesto de ingesta estimado en 0.4.5.
- [x] 0.4.5 Estimar costo de ingesta total: contar tokens aproximados del vault (`find + wc`) × precio del provider elegido → escribir en `discovery/05-cost-estimate.md`. → 860 .md, ~2.14M tokens brutos, ~2.5M a embeber, full-ingest ≈ centavos–$0.33 (no es riesgo de costo).

---

## FASE 1 — Motor vivo (Supabase + Second Brain)

### 1.1 Provisión
- [ ] 1.1.1 Eduardo crea proyecto Supabase `ebrain-prod` (manual, gate humano) y entrega pooler URL.
- [ ] 1.1.2 Crear `~/.config/ebrain/.env` (chmod 600) con `EBRAIN_DATABASE_URL`, `OPENROUTER_API_KEY` (si ya existe), key del provider de embeddings. Verificar que NINGÚN repo la trackea.
- [ ] 1.1.3 Instalar gbrain desde el clon local (`bun install` + link global o wrapper) — NO desde upstream remoto, para que overlay/patches locales apliquen.
- [ ] 1.1.4 `gbrain init` apuntando a Supabase con el embedding provider aprobado. `gbrain doctor` → verde. Guardar salida en `docs/runbook.md`.

### 1.2 Canary PGLite (barato y local primero)
- [ ] 1.2.1 `gbrain init --pglite` en un brain de prueba desechable.
- [ ] 1.2.2 Seleccionar 20 notas representativas del vault (mix: daily, permanent, MOC, decision, con wikilinks ES/EN) → copiarlas a `/tmp/ebrain-canary/`.
- [ ] 1.2.3 Importar canary; verificar: frontmatter intacto byte-a-byte (diff), chunks creados, edges de wikilinks, `gbrain search` encuentra las 20 por título.
- [ ] 1.2.4 Registrar resultados + costo real de embeddings del canary en `discovery/05-cost-estimate.md` (recalibrar estimación total).

### 1.3 Schema pack `ebrain-ckis-v1`
- [ ] 1.3.1 `gbrain schema detect` + `suggest` sobre el vault (o el canary ampliado a ~100 notas si detect es caro).
- [ ] 1.3.2 Redactar el pack: tipos mapeados a `08-note-templates-and-frontmatter.md` y carpetas 00–09; declarar `extractable`/`expert_routing` por tipo; edges custom (`client_of`).
- [ ] 1.3.3 `gbrain schema use ebrain-ckis-v1` en el canary; validar inferencia de tipo por path en 20 notas.
- [ ] 1.3.4 Guardar el pack versionado en `/ebrain/overlay/schema-packs/ebrain-ckis-v1/`.

### 1.4 Ingesta Second Brain (producción Supabase)
- [ ] 1.4.1 Definir exclusiones de sync: `.env*`, adjuntos binarios, `.obsidian/`, carpetas temporales → config de source.
- [ ] 1.4.2 Registrar el vault como source (`gbrain sources add`) en el brain `personal`.
- [ ] 1.4.3 Primera pasada `gbrain sync --no-embed` (estructura+grafo sin costo); revisar conteo de páginas vs archivos.
- [ ] 1.4.4 `gbrain doctor` → decidir `link_resolution.global_basename` según edges ganadas reportadas; activar si neto positivo.
- [ ] 1.4.5 Embedding por lotes con monitoreo de gasto (parar si supera el estimado aprobado +20%).
- [ ] 1.4.6 Validación: 10 queries reales de Eduardo (mitad ES, mitad EN) contra `gbrain search` y 3 contra `gbrain think`; documentar calidad en `docs/validation-f1.md`.
- [ ] 1.4.7 Gate F1: `[AUDIT_PASS]` + commit `F1: engine live, second-brain indexed`.

---

## FASE 2 — Federación CKIS

- [ ] 2.1 Registrar Company Brain repo como source `company-brain` (mismo brain u otro — decidir con evidencia de aislamiento; documentar la decisión como ADR en `docs/adr/ADR-001-brain-topology.md`).
- [ ] 2.2 Sync + validación: query cruzada personal↔korvex responde con citas correctas y sin filtrar contenido personal cuando se consulta desde contexto korvex (probar scoping).
- [ ] 2.3 Registrar repos de código como sources con `--strategy code`: korvex-web, korvex-crm, recmp3-cli, /ebrain. Trust triad: código korvex = read-only. Verificar que brisas-del-golfo NO está registrado y queda `deny`.
- [ ] 2.4 MCP: `claude mcp add ebrain -- gbrain serve`; probar desde una sesión Claude Code que los tools aparecen tipados.
- [ ] 2.5 `/sync-gbrain` (o equivalente manual) en cada repo → bloque `## GBrain Search Guidance` en sus CLAUDE.md. Commit local en cada repo, SIN push en korvex-*.
- [ ] 2.6 Graphify: verificar hooks post-commit siguen vivos; indexar `.brain/` y graph-reports como páginas; documentar en `docs/graphify-integration.md`.
- [ ] 2.7 Benchmark QMD vs gbrain: 20 queries reales (mismas para ambos), medir relevancia top-5 (juicio de Eduardo o Opus), latencia y costo → `docs/benchmark-qmd-vs-ebrain.md` con recomendación. **Gate humano: Eduardo decide.**
- [ ] 2.8 Backup: (a) probar recovery reindex-from-git en un brain limpio (cronometrar); (b) script de dump lógico semanal Supabase; (c) agregar config ebrain al manifest de `ckis-backup-all`; (d) `ckis-backup-all` corre verde. Documentar en `docs/runbook.md` §recovery.
- [ ] 2.9 Gate F2: `[AUDIT_PASS]` + commit.

---

## FASE 3 — Workflow gstack con overlay CKIS

- [ ] 3.1 `cd vendor/gstack && ./setup` (host claude). Verificar skills visibles en Claude Code.
- [ ] 3.2 Crear `/ebrain/overlay/gstack-ckis/`: archivo por skill adaptada que documenta el delta vs upstream (NUNCA editar `vendor/gstack` directamente).
- [ ] 3.3 Mapear `structured-agentic-development` (leer el workflow canónico en el vault) contra `/autoplan`: producir tabla de equivalencias y el overlay que impone: fases numeradas, spec numérica cerrada, `[AUDIT_PASS]`, commit-per-phase, visual gate 1440×900 + 393×852 para trabajo UI.
- [ ] 3.4 Mapear `development-pipeline-pattern-sop.md` contra `/review`+`/ship`; overlay donde el SOP gana.
- [ ] 3.5 Activar `/learn` + checkpoint mode local-only; si se activa memory sync a repo privado, verificar secret scanner con un secreto de prueba falso (debe bloquear).
- [ ] 3.6 Marcar opt-in por hardware: browse, open-gstack-browser, design-shotgun (documentar cómo activarlas bajo demanda).
- [ ] 3.7 Sprint de prueba end-to-end en un repo sandbox: `/office-hours → /autoplan → implementar (worker) → /review → /ship` (PR local, sin push a korvex). Registrar fricciones en `docs/validation-f3.md`.
- [ ] 3.8 Gate F3: `[AUDIT_PASS]` + commit.

---

## FASE 4 — Capa de ejecución de inteligencia (spec: ROUTING.md)

### 4.A Registry y mecánica OpenRouter
- [ ] 4.1 **Verificación en vivo** (openrouter.ai/models + API): existencia, slugs y precios actuales de DeepSeek V4, GLM-5.2, Kimi K2.6, MiniMax M3, Qwen3.7 Max + candidatos a `fallback` y `floor` (modelos abiertos baratos y confiables). Tabla fechada en `docs/model-registry.md`.
- [ ] 4.2 Eduardo crea key OpenRouter con **hard cap** en el dashboard (gate humano); key a `~/.config/ebrain/.env`. Verificar que el cap rechaza (429) con un test controlado si es posible en cap bajo temporal.
- [ ] 4.3 Implementar `cli/route.ts` (bun, ≤300 líneas): carga `routing.yaml`; clasifica (keywords + `--cap` override); llama con array `models` `[ganador, fallback, floor]` (failover lo hace OpenRouter) y `provider: {data_collection: deny}`; escribe `{ts, cap, model_usado, tokens_in, tokens_out, usd}` a `spend.jsonl`; imprime `model=… cost=$…` al final; aborta si cap mensual local excedido. Tests: camino feliz + cap excedido + fallback simulado.
- [ ] 4.4 Escribir `~/.config/ebrain/routing.yaml` con el registry de 4.1 (incluye capacidad `terminal`). `frontier.auto_escalate: false` en config Y hardcodeado (defensa doble).

### 4.B Benchmark de categorías en disputa (ROUTING.md §3.2)
- [ ] 4.5 Correr `gstack-model-benchmark` (o el router directo) con 4 tareas REALES de Eduardo: (a) componente Next.js+Tailwind del design system Korvex → GLM-5.2 vs Kimi K2.6; (b) problema de arquitectura ebrain → MiniMax M3 vs DeepSeek V4; (c) script bash CKIS → Qwen3.7 Max vs DeepSeek; (d) digestión de un repo completo → MiniMax vs GLM. Resultados + costo por corrida en `docs/validation-f4.md`; fijar los ganadores en routing.yaml.

### 4.C Tier 0 — activos existentes cableados
- [ ] 4.6 Verificar skill `/codex` de gstack operativa con los créditos de OpenAI: despachar UNA tarea atómica de código con spec cerrada y auditarla. Documentar el patrón de uso en `docs/tier0-playbook.md`.
- [ ] 4.7 gemini-cli: verificar instalación/login free tier; documentar en el mismo playbook sus 3 usos asignados (ingesta masiva, resúmenes batch, borradores) y sus límites de rate observados. Incluir en el playbook las reglas de Cursor Composer (solo inline) y la advertencia de ToS sobre el proxy OAuth de Hermes (prohibido).

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
