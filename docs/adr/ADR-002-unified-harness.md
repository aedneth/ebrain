---
type: adr
project: ebrain
id: ADR-002
created: 2026-07-11
status: proposed
tags: [ebrain, harness, multi-agent, agentic-memory, provider-agnostic]
related: [ADR-001-brain-topology.md, ROUTING.md, skill-federation.md, graphify-integration.md, brain-init-pipeline.md, SPRINT.md]
audited-by: Fable 5 (2026-07-11)
---

# ADR-002 — `ebrain harness`: capa unificada de harness + memoria agéntica permanente, provider-agnostic

## Contexto (el patrón que Eduardo detectó)

CKIS resolvió la amnesia cross-sesión **para Claude Code** (3 capas: L1 `.brain` → L2 Dev Brain → L3 vault, + session-injection + skills + "Harness Engineering"). Pero cada agente nuevo obliga a **re-implementar el harness a mano** (Codex: reverse-engineering de hooks, port del guard de secretos, `AGENTS.md` desde `CLAUDE.md`, registro MCP). Es deuda **O(agentes × capas)** y ya causó un hueco: **la capa de write-back nunca se portó → Codex, driver primario, no deja rastro.**

## Decisión

Construir **UNA capa canónica de harness** en `~/eBrain/harness/`, con **adaptadores finos por-agente (manifest, no código)**, y un **loop de write-back** que hace la memoria permanente y cross-agente. NO es un framework nuevo: es la unificación de tres hilos ya diseñados (2.6b hook-adapters, `brain-init` vehículo de instalación, skill-federation campo `hosts:`). **Enabler verificado:** el contrato de hooks de Codex es byte-compatible con el de Claude (mismo stdin JSON, `hookSpecificOutput`, eventos snake_case) → adaptadores = puro config, cero shim.

## Arquitectura

```
~/eBrain/harness/
├── contract/
│   ├── events.md         # EL contrato congelado (eventos + JSON) — spec propia de ebrain
│   └── fixtures/         # payloads de muestra → contract tests (corren en `ebrain doctor`)
├── core/                 # canon: un archivo por concern, bash agent-agnostic
│   ├── guard-secrets.sh  # MERGE de block-env-read.sh + block-secret-read.sh (dual-output:
│   │                     #   JSON permissionDecision + stderr + exit2 — válido para ambos)
│   ├── inject-context.sh # session_start: MCP ebrain + puntero de normas + head del CHANGELOG
│   ├── log-session.sh    # write-back floor; estampa `agent:` (desde $AGENT_NAME del adapter)
│   ├── remember.sh       # primitiva de write-back semántico
│   └── NORMS.md          # ÚNICA fuente de gobernanza → render a bloques CLAUDE.md / AGENTS.md
├── adapters/
│   ├── claude/manifest.yaml   codex/manifest.yaml   gemini/…  cursor/…  hermes/…
│   └── generic/               # piso sin-hooks: git hooks + CLI + cron
└── install →  `ebrain harness install <agent>`   (idempotente, doctor al final)
```

La **lectura** de memoria NO se toca: el MCP de gbrain ya es el bus agnóstico; el harness nunca lo duplica.

**Adaptador = manifest declarativo** (ejemplo codex): `hooks_config: ~/.codex/hooks/hooks.json`, `config_format: claude-json`, `events:{session_start→session_start, stop→null, …}`, `norms:{target:~/.codex/AGENTS.md, mode:managed-block}`, `mcp:{register:"codex mcp add ebrain …"}`, `env:{AGENT_NAME:codex}`, `doctor:"codex doctor"`. Reglas para mantenerlo fino: sin shim hasta que un payload real diverja; normas en bloque gestionado (`<!-- ebrain-norms:begin/end -->`) para preservar secciones a mano; agentes sin hooks → adapter `generic`. **El `overlay/codex-harness/` actual migra a ser el adapter `codex` de esta capa**, no queda como artefacto paralelo.

### Memoria agéntica permanente (el write-back loop)

Nueva sub-capa CKIS **`agent-memory`** = repo markdown git-backed (`~/eBrain/memory/`, cubierto por `ckis-backup-all`), registrado como **nuevo source en el mismo hub 1-brain** (ADR-001). **Camino de escritura canónico = markdown → git → `gbrain sync`, NO `put` directo a la DB** (preserva invariante #1 git-canónico; evita las complicaciones de writePageThrough/auto-link-off; la memoria sobrevive aunque se reemplace gbrain). Tres tiers:

1. **Piso determinístico (gratis, garantizado):** hook stop/subagent_stop → `core/log-session.sh` → `.brain/sessions/*.md` + índice Dev Brain, estampado `agent:`. Agentes sin evento stop (Codex): `subagent_stop` + git `post-commit` + CLI genérico.
2. **Sweep `sessions-federate`** (hermano de `skills-federate`; cron o pre-step del dream cycle): copia session/decision files NUEVOS de los `.brain/` propios → `agent-memory/`, luego `gbrain sync --source agent-memory`. **Filtros:** trust-policy (los `.brain` de cliente brisas/dekko NUNCA se barren; Dev Brain se filtra por slug contra el registry) + scan `redact-patterns` por página antes del sync.
3. **Semántico, iniciado por el agente (alta señal):** skill canónica **`remember`** (publicada en el skillpack → todo cliente MCP la descubre) + `ebrain remember "<learning>"` CLI. Escribe página tipada (`type: agent-learning`, frontmatter agent/project/date/session). `remember.sh` se niega en repos deny-policy.

**Dedup/curación:** el dream cycle (F5, presupuestado) consolida/dedup **solo** `agent-memory`. **Promoción al vault sigue human-gated** (weekly review / monthly consolidation) — los agentes nunca escriben a `second-brain`/`company-brain`. Generaliza las 3 capas: L1 `.brain` → **L1.5 `agent-memory` (NUEVA, cross-agente)** → L2 Dev Brain → L3 vault.

### Test de aceptación — "agregar un agente nuevo"
`ebrain harness install gemini` (un comando, un manifest). Pasa si en una sola sentada: (1) `cat .env`→denegado por el guard canónico; (2) sesión arranca con contexto ebrain inyectado; (3) sesión termina → `.brain/sessions/*-session.md` con `agent: gemini` en el índice Dev Brain; (4) tras el sweep, `ebrain-q "qué hizo gemini ayer"` lo responde; (5) `list_skills` devuelve 75+`remember`. Única "arqueología" restante: escribir el manifest — acotado, declarativo, una vez.

## Plan (SPRINT 4.C — esto ES 2.6b ejecutado; tareas 4.6h1–h6)

| # | Tarea | Por qué ese orden |
|---|---|---|
| **H1** | **Write-back floor** (BUILD FIRST): `agent-memory/` git + registro de source; campo `agent:` en log-session; Codex session logging (subagent_stop + post-commit); sweep `sessions-federate` con filtros trust+redact | El hueco de capacidad. Cada día sin esto, las sesiones del primario se evaporan |
| **H2** | **Guard merge + contract freeze:** `core/guard-secrets.sh` dual-output, repointar ambos configs; `contract/events.md` + fixture tests en `ebrain doctor` | Mata la duplicación más peligrosa (regex de seguridad ×2); los tests = alarma de drift |
| **H3** | **`remember` skill + CLI** → `registry.yaml` (`source: skillified`) + línea en NORMS | Convierte el piso en memoria semántica; trivial una vez que existe H1 |
| **H4** | **NORMS.md + render de bloque gestionado** a CLAUDE.md / AGENTS.md | Termina la divergencia de prosa (canary vs RAM rule) |
| **H5** | **Manifests + `ebrain harness install`:** claude + codex primero (deben dar CERO cambio de comportamiento = la validación), luego gemini-cli como test real | Prueba la tesis en un agente genuinamente nuevo |
| **H6** | **Adapterizar brain-init** (paso 4 loopea adapters instalados) + adapter `generic`/Hermes post-4.9 | Extiende 2.6c; cablea per-proyecto también agnóstico |

**Deltas doc:** ULTRAPLAN §4 (+track harness + success criterion); ARCHITECTURE (L4 gana "ebrain harness"; §2.2 fila `agent-memory | ~/eBrain/memory (git) | markdown | rw, federated:true`); ROUTING §2.1 (codex-harness = adapter codex); graphify-integration Hallazgo B + skill-federation 3.9d → punteros "converge en harness".

## Riesgos (con cota)

1. **Contract drift** — la convergencia es cortesía, no estándar (Codex ya no tiene evento `stop`; gemini/Cursor sin verificar, N=2). **Cota:** contrato congelado como spec propia + fixture tests en `doctor` (drift = doctor rojo, no silencioso) + declaración de `events:` con fallback + adapter `generic` como piso garantizado.
2. **Polución de write-back / feedback loops** — basura cross-agente (junk de Codex confundiendo a Claude). **Cota:** `agent-memory` en cuarentena como source propio con provenance; agentes nunca escriben al vault; dedup del dream cycle; promoción human-gated; retención (páginas raw expiran/agregan a N días).
3. **Seguridad bajo full-access** — un bug en el guard canónico desarma a TODOS (fail-open); y el write-path es un canal de exfil (sesión Codex en repo cliente → logs → sweep → embeddings). **Cota:** guard contract tests en doctor; trust-policy dentro de `remember.sh` Y del sweep; redact scan antes de cada sync; `agent-memory` en el pase gitleaks (5.7).

## BUILD FIRST
El **write-back floor (H1)**: `~/eBrain/memory/` como source `agent-memory` git-backed + `log-session.sh` estampado `agent:` cableado a Codex + el sweep `sessions-federate`. Convierte el bus ya-agnóstico de solo-lectura en lectura/escritura y frena la pérdida diaria e irrecuperable de las sesiones del driver primario. Todo lo demás es consolidación; esto es el órgano faltante.
