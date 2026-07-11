---
type: overlay-map
project: ebrain
sprint: "3.3 + 3.4"
created: 2026-07-11
source_of_truth: "01-systems/sops/dev/development-pipeline-pattern-sop.md (v2.1) + structured-agentic-development/01-seven-phase-loop.md"
---

# CKIS ↔ gstack — mapa de equivalencias + overlay

> El **7-phase loop de CKIS** (CONTEXT → PLAN → IMPLEMENT → REVIEW → QA → SHIP → RETRO) es el marco. Los skills de gstack se enchufan como pasos. **Donde chocan, gana el SOP de Eduardo.**

## Tabla de equivalencias (3.3 / 3.4)

| # | Fase CKIS | Skill gstack más cercano | **Overlay — lo que CKIS impone encima (el SOP gana)** |
|---|---|---|---|
| 0 | **State / context budget** | `/office-hours`, `context-save`/`context-restore` | STATE.md o `.brain/sessions/`; **reset de sesión a ~40%** de contexto + handoff por state file (nunca seguir con contexto degradado). |
| 1 | **Context** | `CLAUDE.md` honesto + `/office-hours` | Context file honesto (comandos exactos, fronteras reales). **Premise correction ANTES de diseñar** — si la premisa del request es falsa, se corrige primero (la jugada de mayor leverage). `graphify query` + `ebrain-q` cargados. |
| 2 | **Plan** | `/autoplan` | + **fases numeradas**, **PLAN.md escrito antes de código**, premisas pressure-tested contra el código real, **spec numérico cerrado** para trabajo delegado (geometría/opacidades/duraciones/breakpoints — el gusto no se delega), y un **`[AUDIT_PASS]` por fase**. AskUserQuestion sólo en bifurcaciones que son de Eduardo. |
| 3 | **Implement** | dispatch de workers (Agent tool / gstack) | + **empirical-engine-first** (invariant tests + smoke e2e en dir desechable ANTES de UI). **Sprint atómico**: brain (modelo más capaz) posee integración/creative-core/git; **workers** (baratos, rotables — Sonnet/Codex/Gemini/DeepSeek) sólo en archivos nuevos/aditivos/disjuntos, en **worktrees o in-session**, con **contrato hermético** (allowlist + prohibiciones `sin git/gh/publish/build/sub-agentes` + spec sin bifurcaciones). |
| 4 | **Review** | `/review` | + **3 pasadas**: (a) ground-truth facts (leer archivos, `git status`, match de versión), (b) **maker ≠ checker** (verificador separado, contexto fresco), (c) **gate objetivo** `build && test && lint && typecheck` (pass/fail, no "se ve bien"). Findings → loop back **bajo hard stop** (máx N intentos / budget). |
| 5 | **QA** | `/qa` | + **visual gate = gate, no cortesía**: **agent-browser** (Vercel, NO gstack `/browse`) en **1440×900 Y 393×852** cada iteración, auditando capturas. **Consistencia visual site-wide** (cero islas visuales). Los gates estáticos mienten sobre UIs. |
| 6 | **Ship** | `/ship` | + **stop en el límite irreversible**: decisiones de seguridad/irreversibles se surface con opciones, no se deciden solas (aun con mandato de autonomía). **Commit-per-phase** (escalera de rollback). npm **tag-triggered**; web-app = merge-a-master ES el deploy (Vercel), QA pre-merge contra build local, post-merge contra dominio público con agent-browser. |
| 7 | **Retro / Persist** | `/retro` | + **persistir a CKIS**: ADR en `.brain/decisions/`, CHANGELOG, `_overview.md`, memoria, CKIS CHANGELOG si es cross-cutting. **Plan-got-wrong → context file**; blind spots → plan template. Backup automático (3-2-1); si `ckis-backup-doctor` 🔴 = secreto en compact, redáctalo. |

## Reglas de precedencia (donde gstack y el SOP chocan → SOP gana)

1. **"Done" es un gate pass/fail**, nunca "looks good" de un skill. Aunque `/review` de gstack apruebe, el gate CKIS (`build && test && lint && typecheck` + visual) es el que manda.
2. **Maker ≠ checker es obligatorio** aunque el skill lo haga en una sola pasada — el auditor CKIS es un contexto fresco/sub-agente sin exposición al razonamiento del maker.
3. **Visual gate con agent-browser** reemplaza cualquier verificación visual de gstack `/browse` — dual viewport, cada iteración.
4. **Commit-per-phase + `[AUDIT_PASS]`** por fase es innegociable (rollback ladder), aunque el skill agrupe.
5. **Contratos de worker herméticos** (allowlist + prohibiciones + fork-free) — el modelo de sub-agentes de gstack se somete a esto.
6. **Repos públicos**: `.brain/` y `.claude/` NUNCA se commitean; gh por keyring (sin PAT en archivos).
7. **Irreversible/seguridad → surface con opciones**, aunque el skill tenga modo autónomo.

## Skills gstack: triage bajo CKIS (3.6)

- **Adoptar como pasos del loop:** `/office-hours` (0/1), `/autoplan` (2), `/review` (4), `/qa` (5), `/ship` (6), `/retro` (7), `/learn` (memoria), `/careful`+`/freeze`+`/guard` (disciplina de shell cerca de configs globales).
- **Opt-in bajo demanda (hardware 4GB):** `/browse`, `/design-shotgun`, `/open-gstack-browser` — Chromium sólo cuando se invoquen explícitamente; el default de browser es **agent-browser**.
- **Trigger canónico del loop completo:** `"apply the dev pipeline"` / `"aplica el pipeline de desarrollo"` → ejecuta el SOP v2.1 (§8), usando los skills gstack como pasos.

## Estado F3

- 3.1 gstack instalado ✓ · 3.2 overlay dir ✓ · 3.3 mapa /autoplan↔7-phase ✓ · 3.4 SOP↔/review+/ship ✓ · 3.6 opt-in + agent-browser ✓.
- Pendiente: 3.5 (`/learn` + checkpoint local-only + test del secret scanner), 3.7 (sprint e2e sandbox), 3.8 (gate F3).
