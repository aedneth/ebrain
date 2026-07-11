---
type: ultraplan
project: ebrain
created: 2026-07-08
modified: 2026-07-08
status: proposed
tags: [ebrain, ckis, gbrain, gstack, arquitectura, routing]
related: [ARCHITECTURE.md, SPRINT.md, ROUTING.md, GUARDRAILS.md, CLAUDE.md, KICKOFF-PROMPT.md]
---

# ULTRAPLAN — CKIS → ebrain

> **Tesis:** ebrain NO reemplaza CKIS. ebrain es la capa de inteligencia CENTRALIZADA que conecta todas las capas existentes (Second Brain, Company Brain, Dev Brain, Per-Project Brains, QMD, Autonomous Backup) sobre un motor de producción (gbrain) y un sistema operativo de desarrollo agéntico (gstack), más una capa propia de enrutamiento de modelos.

## 0. Hallazgo central del reverse engineering remoto (2026-07-08)

Verificado en vivo contra github.com/garrytan/gbrain y github.com/garrytan/gstack:

| Descubrimiento | Consecuencia para ebrain |
|---|---|
| gbrain: **el brain repo es git+markdown como system of record**; la DB es índice derivado | Idéntico al principio CKIS "el vault es canónico". La migración NO destruye nada: el vault sigue siendo la fuente; gbrain lo indexa. |
| gbrain: motor dual **PGLite (WASM local)** ↔ **Supabase Postgres + pgvector**, contrato `BrainEngine` (~47 ops, `src/core/engine.ts`) | Eduardo YA usa Supabase. El motor de producción de ebrain corre en Supabase → **cero carga de DB en el ProBook de 4 GB**. PGLite queda para experimentos/canary. |
| gbrain: **brains ⊥ sources** (un brain = una DB; un source = un repo dentro del brain) + `.gbrain-source` dotfiles | La federación multi-capa CKIS (second-brain, company-brain, dev-brains) es NATIVA. No hay que construirla. |
| gbrain: búsqueda híbrida (pgvector HNSW + BM25 + RRF + reranker + graph signals) + `gbrain think` (síntesis con citas y gap analysis) | Supera a QMD (solo BM25/local). QMD no se elimina en fase 1; se evalúa retiro tras benchmark comparativo. |
| gbrain: grafo auto-cableado sin LLM + soporte wikilinks Obsidian (`link_resolution.global_basename`) | El vault Obsidian entra sin reescribir enlaces. `gbrain doctor` reporta cuántas edges se ganan antes de activarlo. |
| gbrain: `gbrain sync --strategy code` + `sources add` | Indexa repos de código → complementa (no reemplaza) graphify, que sigue siendo determinista y gratis vía hooks. |
| gbrain: cola de jobs Minions (Postgres-native, crash-safe), dream cycle (crons de consolidación nocturna) | Sustituye/absorbe la arquitectura de crons CKIS (`17-crons-architecture.md`) de forma durable - o directamente readaptar el  Autonomous Backup basado en systemd. |
| gbrain: MCP server (stdio + HTTP OAuth 2.1, scopes read/write/admin) + `gbrain connect --install` | Todas las terminales de Claude Code consumen UNA memoria vía MCP → el "System Bus" que Eduardo describió en gbrain-handoff. |
| gbrain: schema packs (`gbrain schema detect/suggest/use`) | El taxonomy CKIS (00-inbox…09-archive, tipos de nota, frontmatter de `08-note-templates`) se codifica como **schema pack propio `ebrain-ckis-v1`** en vez de forzar el layout de Garry. |
| gstack: skills markdown multi-host (`./setup --host claude/codex/cursor/hermes/gbrain`), `/autoplan`, `/learn`, trust triad por repo, secret scanner | gstack ES la versión industrializada de `structured-agentic-development` + los SOPs CKIS. Se instala y se ADAPTA (overlay), no se copia a mano. |
| gstack ↔ gbrain: `/setup-gbrain`, `/sync-gbrain`, `USING_GBRAIN_WITH_GSTACK.md`, trust por repo (read-write/read-only/deny) | El contrato de conexión ya existe y está documentado. ebrain lo hereda y lo extiende. |

**Decisión de estrategia (Status: proposed):** construir **sobre** ambos repos clonados localmente (forks bajo control de Eduardo), con adaptaciones en capas overlay — nunca reescritura desde cero.

## 0.1 Calibración F0 — ingeniería inversa LOCAL (2026-07-10)

> Reverse engineering sobre los clones locales (gbrain `a25209b` v0.42.58.0, gstack `7c9df1c` v1.60.1.0), 4 workers Sonnet auditados por Opus con spot-checks contra código real. Estos hallazgos **corrigen o refinan** los supuestos del §0 (verificación remota). Detalle completo: `discovery/01`–`04`.

| Descubrimiento (verificado, archivo:línea en discovery/) | Cambia la decisión |
|---|---|
| Contrato `BrainEngine` = **147 ops**, no ~47 (`engine.ts:649-2200`). Hay 3 capas de conteo: 147 `BrainEngine` (storage) / **102 `Operation`** (`operations.ts:5316-5401`, lógica+MCP, con trust-gating remoto/local) / superficie MCP = las 102 (no "30+"). | La federación CKIS y cualquier wrapper se integran en la capa **`Operation`** (ahí vive `ctx.remote`/`localOnly`/`scope`), no en `BrainEngine` crudo. |
| Embedder por defecto = **ZeroEntropy `zembed-1` 1280d, hospedado** (`ai/defaults.ts:20-21`), elegido tras evals (11/20 vs OpenAI). Reranker `zerank-2` hospedado. | **Cero peso local** → confirma 4GB-safe. El provider de embeddings del gate 0.4.4 puede ser ZeroEntropy (default) / Gemini / OpenAI / Voyage(code) — decisión con costo. |
| OpenRouter es base-URL soportada del AI gateway (`OPENROUTER_BASE_URL`) pero **NO tiene API de embeddings**. | F4: llamadas LLM de gbrain (dream/think/judges) → OpenRouter `:floor`; embeddings → provider directo. (Ya estaba en el plan; ahora verificado en código.) |
| **Trust triad = storage-flag evaluado en skill-time, NO guard runtime** (`gstack-gbrain-repo-policy:32-37`). `deny` frena `/sync-gbrain` pre-flight (keyed por git-remote normalizado). `read-only` solo omite el import del setup — **no bloquea** un `gbrain put`/`mcp__gbrain__put` manual. MCP se registra user-scope machine-wide → tools llamables desde cualquier repo. No hay auto-import daemon en v1.60.1.0. | **brisas-del-golfo=deny se impone NO registrándola como source** (y verificar que tiene `origin` remote, si no el triad no-opea). **korvex-*=read-only por disciplina ebrain** (nunca escribir desde contexto korvex) + `federated:false`. El gate de escritura verificable se prueba explícitamente en F2 (SPRINT 2.2/2.3). GUARDRAILS necesita addendum de endurecimiento. |
| Frontera **personal⊥Korvex**: MCP local stdio no tiene auth por-token (`takesHoldersAllowList:['world']`); `all_sources=true` solo para trusted-local callers; wikilink `global_basename` está scoped por `sourceId` (#972). | La separación NO se puede apoyar en scopes de token en el MVP local. Se logra con **`federated:false`** en el source personal (no aparece en búsqueda cross-source salvo `--source` explícito) o **2 brains montados**. Decisión F2 → ADR-001. |
| gbrain hace **write-through DB→disco** (`writePageThrough`, `operations.ts:900+`). Auto-link/auto-timeline se DESACTIVAN para llamadas MCP remotas no confiables. | **Desactivar write-through para el source del vault** (GUARDRAILS §2). Ingesta del vault vía **CLI local** (`ctx.remote===false`=trusted → auto-link SÍ corre), no vía MCP remoto. |
| `SKILL.md` de gstack es **build-artifact** de `SKILL.md.tmpl`. Dos secret scanners (`redact-patterns.ts` fuerte + `gstack-brain-sync` embebido débil). gbrain trae budget system nativo (BudgetMeter por fase, `mcp_spend_log`, `budget_ledger`). | Overlay CKIS (F3) vía sección en CLAUDE.md / wrapper, nunca editar SKILL.md vendored. GUARDRAILS ebrain no sobre-estima cobertura de scanner. El doble-cap de gasto (GUARDRAILS §4) puede apoyarse en el budget nativo de gbrain. |
| Default schema pack = `gbrain-base-v2` (15 tipos). Schema real en `migrate.ts` (56 tablas), no solo `schema.sql`. "Ontología" = columnas en `facts`. PGLite ~50K páginas single-writer. | `ebrain-ckis-v1` extiende `gbrain-base-v2`. Prod en Supabase (aunque el vault son ~860 páginas, cabe en PGLite — Supabase igual por federación multi-source + plan). |

### Decisión gate 0.4.4 (2026-07-10) — motor local, embeddings hosted

Eduardo resolvió el gate con dos ajustes que **calibran la arquitectura**:

- **DB: PGLite LOCAL, no Supabase (por ahora).** Free-tier de Supabase lleno (2/2 proyectos) y sin presupuesto para Pro. El vault (~860 páginas) está muy por debajo del límite de PGLite (~50K), así que **F1 y F2 corren 100% local**. Cuando haya Supabase Pro (o un Postgres free tipo Neon), se migra con `gbrain migrate` (lossless, verificado en discovery/04). Reusar un proyecto Supabase existente queda **descartado** (violaría personal⊥cliente, GUARDRAILS §3).
- **Embeddings: `openai:text-embedding-3-small` hosted** (Eduardo tiene key + $50 créditos). Hosted → **no consume la RAM local** (crítico: 138MB libres). Costo full-ingest ≈ $0.05; cap en dashboard OpenAI + monitoreo local + canary-first protegen los créditos.
- **QMD NO es reusable por gbrain** (verificado): QMD embebió 5,190 vectores de ambos brains con **EmbeddingGemma-300M local (768d)** en SQLite propio — modelo/dims/store incompatibles con gbrain. Son "otro tipo" de embeddings. QMD **se mantiene** como capa de search local; el benchmark QMD-vs-gbrain (2.7) ahora es apples-to-apples y **decide su retiro o rol de fallback** con evidencia. gbrain no es redundante: aporta grafo + `think` + federación + MCP + code-intel que QMD no tiene.

## 1. Qué es ebrain (definición operativa)

```
                        ┌──────────────────────────────┐
                        │       ebrain CLI (bun)        │  wrapper fino
                        │  route · sync · backup ·      │
                        │  doctor · brains · mcp        │
                        └───────┬──────────┬────────────┘
                                │          │
              ┌─────────────────┘          └──────────────────┐
              ▼                                               ▼
   ┌───────────────────────┐                     ┌────────────────────────┐
   │  MOTOR: gbrain (fork) │                     │ WORKFLOW: gstack (fork)│
   │  Supabase + pgvector  │                     │ skills → Claude Code   │
   │  brains ⊥ sources     │                     │ /autoplan /review /qa  │
   │  Minions · dream cycle│                     │ /learn · trust triad   │
   └───────┬───────────────┘                     └───────────┬────────────┘
           │ indexa (system of record = git/markdown)        │ orquesta
           ▼                                                 ▼
  ┌────────────────────────────────────────────────────────────────────┐
  │ CAPAS CKIS EXISTENTES (intactas, ahora federadas)                  │
  │ Second Brain (vault) · Company Brain (repo) · Dev Brain (graphify) │
  │ Per-Project Brains (.brain) · QMD (transición) · Backup 15-min    │
  └────────────────────────────────────────────────────────────────────┘
           ▲
           │ consume
  ┌────────┴───────────────────────────────┐
  │ CAPA DE ROUTING (ebrain route)         │  Part VII Company Brain
  │ OpenRouter 1 key + hard cap · perfiles │
  │ por capacidad · frontier solo manual   │
  └────────────────────────────────────────┘
```

- **ebrain-engine** = fork local de gbrain configurado con motor Supabase, schema pack `ebrain-ckis-v1`, y los brains: `second-brain`, `company-brain`, `dev` (código vía sources con `--strategy code`).
- **ebrain-workflow** = fork local de gstack instalado en Claude Code, con overlay CKIS: skills mapeadas a `structured-agentic-development` y `development-pipeline-pattern-sop.md`.
- **ebrain CLI** = wrapper delgado propio. NO duplica funcionalidad: delega en `gbrain`/`gstack` y agrega los verbos que ellos no tienen: `ebrain route`, `ebrain backup` (envuelve `ckis-backup-all`), `ebrain doctor --all` (motor + qmd + graphify + backup), `ebrain status`.
- **Centralización** = un solo MCP endpoint (`ebrain-mcp` → `gbrain serve`) que TODAS las sesiones de Claude Code o agentes de código como Codex y otros del router consumen, con trust triad por repo.

## 2. Invariantes constitucionales (no negociables, heredados de CKIS)

1. **El markdown en git es canónico.** La DB de ebrain es índice derivado y reconstruible. Nada se borra del vault ni del Company Brain.
2. **Fronteras de capa:** conocimiento personal en Second Brain; Korvex en Company Brain; código en repos. ebrain federa, no fusiona. Trust triad por repo evita contaminación cruzada.
3. **Producción intocable:** brisas-del-golfo jamás se toca; korvex-web/korvex-crm y todos los demás proyectos nunca se pushean sin Eduardo.
4. **Cero secretos** en vault, Brain, DB de ebrain o config versionada. Secrets en `~/.config/ckis/.env` y `~/.config/ebrain/.env` (gitignored). Secret scanner de gstack activo + gitleaks (gbrain ya trae `.gitleaks.toml`). Fusiona nuestro scanner local que scannea e ignorara todas las variables de entorno y el agente nunca lee archivos .env.
5. **Copy-verify-then-remove** en cualquier movimiento de artefactos; commits por fase; CHANGELOG por capa.
6. **Vendor independence (Part VII):** ningún workflow hardcodea nombres de modelo; el routing apunta a capacidades. gbrain/gstack son reemplazables porque el system of record es markdown.
7. **Coste como restricción arquitectónica:** embeddings baratos por API (el ProBook no corre modelos locales), hard cap de gasto en OpenRouter y en la key de embeddings, canary antes de cualquier ingesta masiva.
8. **Canary-first:** toda ingesta/índice/migración corre primero sobre un subconjunto de 20 archivos con verificación byte-a-byte.

## 3. Restricción de hardware (crítica)

HP ProBook, Celeron N4120, 4 GB RAM:
- **DB pesada → Supabase** (motor Postgres de gbrain). PGLite solo para canarios pequeños (<1K páginas).
- **Embeddings/reranker → API hosted** (gbrain soporta 16 providers incl. OpenAI, Gemini, OpenRouter). Nada de Ollama/llama.cpp local.
- **gstack `/browse` (Chromium headless)** es pesado: se instala pero se marca como opcional/bajo demanda; el visual gate del SOP korvex sigue usando el flujo existente. Seguiremos utilizando agent-browser de vercel nativamente para todo lo relacionado a QA, spec driven development, busquedas web, fetch, etc. 
- **Sync de brains**: usar el patrón per-source con `timeout` que gbrain documenta para evitar syncs colgados en máquina lenta.
- Bun es liviano; el CLI de ebrain no agregará daemons residentes salvo el cron de sync/backup ya existente (systemd timers actuales).

## 4. Fases

### F0 — Reverse engineering local + calibración del plan (gate: reportes escritos)
1. Crear `/ebrain` (o `~/ebrain`), clonar `garrytan/gbrain` y `garrytan/gstack` (depth completo, forks a `aedneth/` opcional).
2. Agentes de descubrimiento (Opus orquesta, Sonnet ejecuta) producen 4 reportes en `/ebrain/discovery/`:
   - `01-gbrain-engine.md` — contrato BrainEngine, esquema SQL, pipeline put_page→chunk→embed→link, config resolution (7 tiers), Minions, dream cycle.
   - `02-gbrain-federation.md` — brains ⊥ sources, `.gbrain-source`, sync, MCP server + scopes, `connect`, Obsidian link resolution.
   - `03-gstack-skills.md` — anatomía de skill, setup multi-host, /learn, /autoplan, trust triad, secret scanner, state en `~/.gstack/`.
   - `04-connection-contract.md` — USING_GBRAIN_WITH_GSTACK, /setup-gbrain, /sync-gbrain, GBrain Search Guidance block en CLAUDE.md.
3. **Actualizar este ULTRAPLAN** con descubrimientos que cambien decisiones (regla: el plan es vivo; los cambios se anotan en CHANGELOG del proyecto).

### F1 — Motor ebrain vivo (gate: `gbrain doctor` verde + canary Second Brain)
1. Provisionar proyecto Supabase dedicado `ebrain` (NO el de CRM/clientes). Guardar pooler URL en `~/.config/ebrain/.env`.
2. `gbrain init` contra Supabase; elegir embedding provider barato hosted; hard cap en la key.
3. Crear schema pack `ebrain-ckis-v1` (vía `schema detect` + `suggest` sobre el vault + revisión manual): tipos alineados a `08-note-templates-and-frontmatter.md` y a la taxonomía 00–09.
4. Canary: importar 20 notas del vault → verificar chunks, edges, frontmatter intacto, búsqueda. Activar `link_resolution.global_basename` solo si `doctor` muestra ganancia.
5. Ingesta completa de Second Brain como brain/source `second-brain` (excluyendo `.env`, adjuntos binarios pesados).

### F2 — Federación total CKIS (gate: query cruzada funcional + trust triad aplicado)
1. Company Brain como source separado (`company-brain`), respetando la frontera personal/organizacional.
2. Repos de código (korvex-web, korvex-crm, recmp3-cli, ebrain) como sources con `sync --strategy code`, trust: korvex-* = read-only para escritura de brain, brisas-del-golfo = **deny**.
3. Graphify se mantiene como productor determinista; sus reportes (`engineering/graph-reports/`, `.brain/`) se indexan como páginas. Decisión posterior: exponer graph.json como tool MCP adicional.
4. QMD coexiste. Benchmark: 20 queries reales qmd vs `gbrain search` vs `gbrain think` → decisión documentada (retirar / mantener como fallback offline).
5. Backup: extender `ckis-backup-all` para cubrir config de ebrain + dump lógico Supabase (o confiar en PITR de Supabase + reindex-from-git como recovery; documentar la elección — el system of record git ya está respaldado cada 15 min).
6. MCP: `gbrain serve` registrado en Claude Code global; GBrain Search Guidance block en los CLAUDE.md de cada repo vía `/sync-gbrain`.

### F3 — Capa workflow (gstack adaptado) (gate: sprint de prueba end-to-end con skills)
1. Instalar gstack para Claude Code desde el clon local (`./setup`).
2. Overlay CKIS: mapear `/autoplan`→ workflow `structured-agentic-development` (fases numeradas, `[AUDIT_PASS]`, commit-per-phase, visual gate 1440×900 + 393×852 donde aplique) y `development-pipeline-pattern-sop.md`. Donde gstack y el SOP choquen, **el SOP de Eduardo gana**; la adaptación vive en un overlay versionado, no editando archivos upstream (para poder hacer `git pull` de upstream).
3. `/learn` + checkpoint mode activados; memoria de gstack sincronizada a repo privado con secret scanner.
4. Skills pesadas (browse/design-shotgun) marcadas opt-in por hardware.

### F4 — Capa de ejecución de inteligencia (gate: 3 tareas ruteadas con costo reportado + registry verificado)
**Especificación completa en `ROUTING.md`** (documento dedicado). Implementa Part VII en tres tiers:
1. **Tier 0 — activos existentes formalizados:** Claude Code (Pro) = driver default (Opus orquesta, Sonnet ejecuta); Codex (créditos) = worker paralelo vía skill `/codex` de gstack; Cursor Composer (créditos) = solo autocomplete/edits inline; gemini-cli (free tier) = ingesta masiva y batch gratis. Cada uno con su rol y su anti-patrón declarados en ROUTING.md §2 (incluida la advertencia de NO usar el proxy OAuth de Hermes sobre suscripciones).
2. **Tier 1 — stack chino por capacidad** (directiva THE STACK, canónica): coding→DeepSeek V4, agentic→Kimi K2.6, web/design→GLM-5.2, long-context+reasoning→MiniMax M3, general→Qwen3.7 Max (+`terminal` candidata a Qwen). Verificación en vivo de slugs/precios ANTES de fijar config; las 4 categorías en disputa entre las dos guías de Eduardo (design GLM vs Kimi, reasoning MiniMax vs DeepSeek, terminal, contexto masivo) se resuelven con `gstack-model-benchmark` sobre tareas reales.
3. **Mecánica OpenRouter verificada:** una key + hard cap; fallback nativo con array `models` `[ganador, fallback, floor]` (nunca frontier); failover de provider automático; `:floor` en batch; `data_collection: deny` con contexto Korvex/vault; cap mensual local con `hard_stop` en `spend.jsonl`. Embeddings de gbrain van por provider directo (OpenRouter no tiene API de embeddings); solo las llamadas LLM de gbrain rutean por OpenRouter.
4. **Tier 2 — Hermes (evaluación, opt-in):** verificado como runtime autónomo real (Python 3.11, gateway 20+ plataformas, crons, subagentes, `provider_routing` OpenRouter nativo). Veredicto: NO es el bus central (ese es el MCP de gbrain) y NO corre en la laptop de 4 GB — su hábitat es un VPS de $5 o serverless (Modal/Daytona, backends nativos de Hermes). F4 entrega la evaluación con costos; la adopción es decisión de Eduardo. Guardrails Hermes: `skills.write_approval` + `memory.write_approval` en true, misma key OpenRouter con el mismo cap.
5. Un solo registry de modelos (`routing.yaml`) alimenta `ebrain route`, gbrain y Hermes.

### F5 — Consolidación y operación (gate: Success Criteria abajo)
1. Dream cycle nocturno configurado (consolidación, citation fixing, dedup) con presupuesto acotado.
2. Documentación del proyecto en el vault: `02-projects/ebrain/` (overview, decisiones, runbook) + `.brain` del repo /ebrain conectado a Dev Brain (hooks graphify post-commit).
3. Registro en Company Brain: fila en registry/repos, domain card de engineering, entrada en DRIFT si algo queda abierto, línea en CHANGELOG.
4. Retiro (o degradación a fallback) de QMD según benchmark F2; actualización de skills/docs CKIS que lo referencien.

## 5. Success Criteria (el programa queda ACTIVE hasta que todo pase)

- [ ] `gbrain doctor` verde con motor Supabase; reindex-from-git reproducible desde cero.
- [ ] Una query (`gbrain think`) responde cruzando Second Brain + Company Brain + código, con citas correctas.
- [ ] Todas las sesiones de Claude Code consumen ebrain vía MCP; trust triad verificado (brisas = deny probado).
- [ ] Graphify sigue actualizando `.brain` por hook; sus reportes son consultables desde ebrain.
- [ ] Backup cubre ebrain (config + estrategia de recovery documentada y probada una vez).
- [ ] `ebrain route` ejecuta 3 tareas (coding / design / long-context) con costo logueado y cap activo; cero escaladas automáticas a frontier.
- [ ] Benchmark QMD vs gbrain documentado con decisión tomada.
- [ ] Vault: `02-projects/ebrain/` documentado; Company Brain: registry + CHANGELOG actualizados; cero secretos en repos (gitleaks limpio).

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| 4 GB RAM insuficiente para sync grande | Motor Supabase (DB remota), sync per-source con timeout, `--no-embed` en primera pasada + embed por lotes |
| Costo de embeddings en ingesta inicial (~miles de notas) | Provider barato, canary 20 → estimación de costo total ANTES de bulk; cap en key |
| Upstream gbrain/gstack cambian rápido | Forks + overlays (nunca editar upstream directo); `gstack-upgrade` y `git pull` controlados; el system of record markdown hace todo reversible |
| Contaminación entre brains (personal ↔ Korvex) | Brains/sources separados + trust triad + fuzz de scoping ya probado upstream |
| Slugs/precios de modelos del doc THE STACK desactualizados | Verificación en vivo en F4; routing.yaml es config, no código |
| Sobre-ingeniería (trampa de premature tooling) | Cada fase tiene gate; F4/F5 no arrancan si F1–F2 no pasan; QMD no se retira sin benchmark |
| Hermes daemon en la laptop de 4 GB / dos "cerebros" en paralelo | Hermes es opt-in post-F4, hábitat = VPS/serverless, y NUNCA es el bus central (ese es el MCP de gbrain); write-approval gates activos si se adopta |

## 7. Roles de ejecución

- **Opus** = orquestador/auditor (ver CLAUDE.md): planifica, despacha, audita `[AUDIT_PASS]`, jamás implementa en paralelo consigo mismo.
- **Sonnet (workers)** = implementación por tarea atómica de SPRINT.md, in-session, commit por fase.
- **Eduardo** = gates humanos: aprobación de costos, decisión QMD, cualquier cambio de frontera constitucional, y todo push a repos korvex.
