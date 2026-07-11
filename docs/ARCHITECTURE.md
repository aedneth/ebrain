---
type: architecture
project: ebrain
created: 2026-07-08
modified: 2026-07-08
status: proposed
tags: [ebrain, arquitectura, gbrain, gstack, supabase, mcp, routing]
related: [ULTRAPLAN.md, GUARDRAILS.md, DESIGN.md]
---

# ARCHITECTURE — ebrain

Arquitectura inspirada directamente en gbrain + gstack (verificados 2026-07-08), evolucionada con las capas CKIS. Principio rector: **thin harness, fat knowledge** — el valor está en el markdown versionado y el grafo, no en el código del wrapper.

## 1. Vista de capas

```
┌─────────────────────────────────────────────────────────────────────┐
│ L5 · INTERFACES                                                     │
│  Claude Code (N terminales) · Codex · Cursor · gemini-cli · Obsidian│
└──────────────┬──────────────────────────────────────────────────────┘
               │ MCP (stdio local / HTTP OAuth2.1 futuro) + slash skills
┌──────────────▼──────────────────────────────────────────────────────┐
│ L4 · ORQUESTACIÓN                                                   │
│  gstack skills (overlay CKIS) · ebrain CLI · Minions job queue      │
│  ebrain route (capability routing → OpenRouter)                     │
└──────────────┬──────────────────────────────────────────────────────┘
┌──────────────▼──────────────────────────────────────────────────────┐
│ L3 · MOTOR DE CONOCIMIENTO (gbrain fork)                            │
│  BrainEngine (contrato ~47 ops) → PostgresEngine (Supabase+pgvector)│
│  hybrid search (HNSW+BM25+RRF+rerank) · knowledge graph · think     │
│  schema pack ebrain-ckis-v1 · dream cycle · evals                   │
└──────────────┬──────────────────────────────────────────────────────┘
               │ sync (git → DB; DB = índice derivado, reconstruible)
┌──────────────▼──────────────────────────────────────────────────────┐
│ L2 · SYSTEM OF RECORD (intacto)                                     │
│  Second Brain (vault git) · Company Brain (repo git) ·              │
│  repos de código (korvex-web/crm, recmp3-cli, ebrain, …)            │
└──────────────┬──────────────────────────────────────────────────────┘
┌──────────────▼──────────────────────────────────────────────────────┐
│ L1 · INFRAESTRUCTURA COMPARTIDA (existente, extendida)              │
│  graphify (hooks post-commit, .brain) · ckis-backup-all (15 min) ·  │
│  systemd timers · gitleaks/secret-scan · QMD (transición)           │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. Motor (L3): decisiones

**2.1 Engine = Supabase Postgres + pgvector.** Razones: (a) 4 GB RAM local → DB fuera de la máquina; (b) stack que Eduardo ya opera; (c) gbrain lo soporta como primera clase con el mismo contrato `BrainEngine` que PGLite → los canarios corren en PGLite y producción en Supabase sin cambiar código. Proyecto Supabase **dedicado** (aislado de CRM/clientes), región más cercana, RLS activo, acceso solo por pooler URL en `~/.config/ebrain/.env`.

**2.2 Brains ⊥ sources (mapeo CKIS).** Un brain (DB) por dominio de confianza; sources = repos dentro:

| Brain | Sources | Estrategia sync | Escritura |
|---|---|---|---|
| `personal` | Second Brain vault | markdown | read-write |
| `korvex` | Company Brain repo; korvex-web, korvex-crm (código) | markdown / `--strategy code` | brain repo: rw; código: read-only |
| — | brisas-del-golfo | **ninguna** | **deny** |

Nota: empezar con **un solo brain con dos sources** es válido si el aislamiento por source + trust triad resulta suficiente en F2; dos brains separados es la opción conservadora si la frontera personal/Korvex debe ser física. Decisión en F2 con evidencia (query fuzzing como upstream).

**2.3 Schema pack `ebrain-ckis-v1`.** No adoptar `gbrain-base-v2` a ciegas: generar candidatos con `gbrain schema detect/suggest` sobre el vault real y mapear a los tipos de `08-note-templates-and-frontmatter.md` (daily, permanent, MOC, decision, project, sop, person, source, capture). Frontmatter existente se preserva byte-a-byte (invariante de migración ya probado en Waves 1–5). El pack declara qué tipos son `extractable` (facts) y cuáles participan en `expert_routing`.

**2.4 Grafo.** Auto-link de gbrain (cero LLM) + `link_resolution.global_basename` para wikilinks Obsidian con basename (activar solo tras `gbrain doctor` mostrar ganancia neta). Edges tipadas relevantes para Korvex: `works_at`, `client_of` (custom en pack), `mentions`, `part_of`.

**2.5 Pipeline de escritura** (heredado de gbrain, sin modificar): `put_page → parse frontmatter/tipo (pack) → chunk → embed (API) → auto-link edges → timeline`. Ingesta masiva: primera pasada `--no-embed`, embed por lotes con presupuesto.

**2.6 Retrieval.** `gbrain search` (raw, barato) para contexto de agentes; `gbrain think` (síntesis + citas + gap analysis) para preguntas estratégicas de Eduardo. Modo por defecto `balanced`; `tokenmax` solo bajo demanda (costo).

## 3. Coexistencia con capas CKIS existentes

- **graphify (Per-Project/Dev Brain):** se mantiene íntegro — es determinista, local y gratis, y produce AST/grafo de código que gbrain no genera igual. Integración en dos vías: (a) sus reportes markdown (`.brain/`, graph-reports) se indexan como páginas; (b) evaluación F5: exponer `graph.json` como tool MCP hermano de ebrain para queries estructurales exactas.
- **QMD:** capa BM25 local. Redundante en teoría con gbrain, pero funciona offline y sin costo. Transición: coexistencia → benchmark (20 queries reales, P@5 subjetivo + latencia + costo) → decisión (retiro, o fallback offline cuando no hay red). Nada se retira sin benchmark documentado.
- **Autonomous Backup:** el system of record (git) ya está respaldado cada 15 min ⇒ la DB es reconstruible con `gbrain sync` desde cero. Estrategia de recovery: **reindex-from-git** como camino primario (documentado y probado una vez), + dump lógico semanal de Supabase como cinturón. El manifest de `ckis-backup-all` agrega: config de ebrain, routing.yaml, schema pack, spend log.
- **Content OS, crons CKIS:** intactos en el vault. El dream cycle de gbrain se suma como cron nuevo, no reemplaza los timers existentes en F1–F4.

## 4. Capa MCP (el bus central)

- Local (día 1): `claude mcp add ebrain -- gbrain serve` (stdio, cero red, cero token). Cada repo recibe el bloque `## GBrain Search Guidance` en su CLAUDE.md vía `/sync-gbrain` para que los agentes prefieran `search/code-def/code-refs` sobre Grep.
- Trust triad por repo (feature nativa gstack↔gbrain): korvex-* código = `read-only`; brisas-del-golfo = `deny`; vault/ebrain = `read-write`. Sticky por remote.
- Remoto (futuro, opcional): `gbrain serve --http` con OAuth 2.1 + scopes si algún día se accede desde otra máquina. No en el MVP (una sola laptop).

## 5. ebrain CLI (wrapper propio, bun)

Delgado por diseño; delega siempre que puede:

| Verbo | Implementación |
|---|---|
| `ebrain sync [--all\|--source X]` | loop per-source con `timeout` sobre `gbrain sync` (patrón anti-cuelgue upstream) |
| `ebrain doctor` | `gbrain doctor` + checks propios: qmd index age, graphify hook presente, backup last-run, spend cap restante |
| `ebrain backup` | invoca `ckis-backup-all` + dump lógico opcional |
| `ebrain route "<task>"` | ver §6 |
| `ebrain status` | resumen: brains, páginas, último dream cycle, gasto del mes |

Repo `/ebrain` con estructura: `vendor/gbrain`, `vendor/gstack` (clones/forks), `overlay/` (skills y configs CKIS), `cli/` (wrapper), `discovery/` (reportes F0), `docs/`.

## 6. Capa de ejecución de inteligencia — Part VII implementado

**Especificación completa y extendida en `ROUTING.md`** (documento propio: tiers, mapa de capacidades del stack chino, mecánica OpenRouter verificada, veredicto Hermes, gobernanza de gasto). Resumen arquitectónico:

- **Tres tiers:** Tier 0 = frontier interactivo con activos existentes (Claude Code Pro como driver default, Codex vía skill `/codex`, Cursor Composer para inline, gemini-cli free tier para batch gratis). Tier 1 = stack chino ruteado por capacidad vía OpenRouter (`ebrain route`, 1 key, hard cap). Tier 2 = Hermes como runtime autónomo 24/7 opt-in, corriendo en VPS/serverless — no en la laptop de 4 GB.
- **Capacidades (directiva de Eduardo, THE STACK):** coding→DeepSeek V4 · agentic→Kimi K2.6 · web/design→GLM-5.2 · long-context+reasoning→MiniMax M3 · general→Qwen3.7 Max (+capacidad `terminal` candidata a Qwen). Categorías en disputa entre las dos guías fuente se resuelven con `gstack-model-benchmark` en F4, no por opinión.
- **Fallback nativo de OpenRouter:** array `models` por request (`[ganador, fallback, floor]`) — el failover lo ejecuta el gateway, no un loop local; failover a nivel provider automático; sufijos `:floor`/`:nitro`; `provider: {data_collection: deny}` obligatorio con contexto Korvex/vault; requests fallidas no se cobran.
- **Sin proxy local** (LiteLLM descartado: OpenRouter ya es el gateway y la RAM no sobra) y **sin router-LLM** en el MVP (keywords + `--cap` manual).
- **Doble cap:** hard cap en la key (servidor) + cap mensual local con `hard_stop` (spend.jsonl). Slugs/precios se verifican en vivo en F4.
- **Corrección importante:** OpenRouter NO ofrece API de embeddings → los embeddings de gbrain van por provider directo barato (Gemini/OpenAI) con key y límite propios; solo las llamadas LLM de gbrain (dream cycle, judges, `think`) rutean por OpenRouter con perfil `:floor`.
- **Un solo registry de modelos, tres consumidores:** `routing.yaml` alimenta a `ebrain route`, a los providers LLM de gbrain y al `provider_routing` de Hermes.

## 7. Flujo diario resultante

1. Boot: timers existentes (backup 15-min) + sync de ebrain programado.
2. Commit en cualquier repo → hook graphify actualiza `.brain` (ms, gratis).
3. Terminal Claude Code en cualquier proyecto → MCP ebrain conectado → el agente consulta memoria unificada en vez de re-leer el disco (menos tokens del plan Pro).
4. Trabajo de desarrollo → skills gstack con overlay CKIS (`/autoplan` → implementar → `/review` → `/qa` → `/ship`), respetando SOPs de Eduardo.
5. Tareas batch/baratas → `ebrain route` a modelos abiertos.
6. Noche: dream cycle consolida, dedup, fija citas, dentro de presupuesto.
7. Todo cambio estructural → línea en CHANGELOG de la capa correspondiente (disciplina existente).

## 8. Por qué esta arquitectura sobrevive (Part VII checklist)

- Fortalece la abstracción: BrainEngine y routing.yaml son seams de reemplazo.
- Reduce dependencia de vendor: markdown+git canónico; DB, modelos y hasta gbrain mismo son reemplazables.
- Mejora capacidad real: síntesis con citas + grafo + memoria única para N terminales.
- Sostenible: costo acotado por diseño, hardware respetado, upstream actualizable vía forks+overlay.

## 9. Calibración F0 (2026-07-10) — hallazgos que tocan el diseño

Reverse engineering local (gbrain `a25209b`, gstack `7c9df1c`); detalle en `discovery/01`–`04` y síntesis en `ULTRAPLAN §0.1`. Refinamientos a esta arquitectura:

- **L3/L4 seam de integración = capa `Operation` (102), no `BrainEngine` (147).** El trust-gating (`ctx.remote`, `localOnly`, `scope`) vive en `operations.ts`; ahí se engancha la federación, no en el contrato de storage crudo.
- **§2.5 embeddings:** el default real es **ZeroEntropy hospedado** (`zembed-1` 1280d) + reranker ZeroEntropy hospedado — cero peso local (4GB-safe). El pipeline `put_page` incluye un **write-through DB→disco** (`writePageThrough`) que **debe desactivarse para el source del vault** (invariante §2.1/GUARDRAILS §2: el markdown es canónico, la DB nunca escribe de vuelta). Ingesta del vault por **CLI local** (trusted, auto-link ON), no por MCP remoto (auto-link OFF para untrusted).
- **§4 MCP/trust (corrección importante):** la trust triad de gstack (`gbrain-repo-policy.json`) es un **storage-flag evaluado en skill-time**, no un guard runtime. `deny` frena `/sync-gbrain` (por git-remote normalizado); `read-only` solo omite el import del setup. MCP es **user-scope machine-wide** → los tools `mcp__gbrain__*` son llamables desde cualquier repo. Por tanto la frontera dura se logra así: **brisas-del-golfo = NO registrada como source** (deny efectivo; verificar `origin` remote); **korvex-* = read-only por disciplina** (nunca `put`/sync-write desde contexto korvex) + `federated:false`; **personal⊥Korvex** por `federated:false` en el source personal o 2 brains montados (decisión F2 → `ADR-001`). Un **test de escritura adversarial** (SPRINT 2.2) valida el gate antes de confiar en él.
- **Gasto:** gbrain trae budget nativo (BudgetMeter por fase del dream cycle, `mcp_spend_log`, `budget_ledger`) sobre el que se puede apoyar el doble-cap de GUARDRAILS §4.
- **§5 CLI / overlay:** `SKILL.md` de gstack es build-artifact de `SKILL.md.tmpl` → el overlay CKIS (F3) va por sección en `CLAUDE.md` o wrapper skill, nunca editando el vendored.
