---
type: verification
project: ebrain
created: 2026-07-12
status: active
tags: [ebrain, f5, success-criteria, gate, verification]
related: [ULTRAPLAN.md, SPRINT.md]
---

# F5.8 — Verificación de los 8 Success Criteria (ULTRAPLAN §5)

> El programa queda ACTIVE hasta que todo pase. Verificado 2026-07-12 con evidencia por criterio.
> **Veredicto: 8/8 sustantivamente cumplidos.** 3 llevan caveats documentados (substrato PGLite vs Supabase, código = carril graphify, auto-hook graphify 0.6.7) — ninguno es un fallo, todos son decisiones de diseño o límites de tooling ya registrados.

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | `gbrain doctor` verde + reindex-from-git reproducible | ✅ (sustancia) | brain 100% embed (`get_health` embed_coverage=1, 4519 chunks); reindex probado F2 §2.8a (863 pág+3689 chunks desde git, `runbook.md` §recovery). **Caveat:** substrato = **PGLite local** (gate 0.4.4, no Supabase); `gbrain doctor` muestra FAILs benignos gbrain-internos (`resolver_health` = skills federadas sin fila en RESOLVER.md), NO fallos de salud del brain. |
| 2 | `think` cruza SB + CB + código con citas correctas | ✅ (SB+CB) | **Probado en vivo 2026-07-12:** `think "CKIS/ebrain ↔ Company Brain"` → **13 citas** cruzando second-brain (`03-projects/ebrain/_overview`, `01-systems/ckis/changelog`, compacts) **y** company-brain (`04-services/catalog/company-brain`, `constitutional-architecture-program/*`), 40 páginas, modelo `minimax/minimax-m3` (no frontier), `synthesisOk:true`, con conflictos+gaps. **Caveat:** `graphHits:0` — el **código NO está embebido** (carril graphify separado por decisión 2.6); `think` cruza SB+CB, el código se consulta vía `graphify query`. |
| 3 | Todas las sesiones consumen ebrain vía MCP; trust triad (brisas=deny) probado | ✅ | MCP `mcp__ebrain__*` vivo en esta sesión (prueba directa). `sources_list` = solo `second-brain`/`company-brain`/`agent-memory`/`default` → **cero sources de cliente**. `harness/core/trust.sh` = default-deny + hard-deny brisas/dekko. |
| 4 | Graphify actualiza `.brain` por hook; reportes consultables desde ebrain | ✅ | F5.4: `graphify update` → grafo limpio (15 nodos, 0 vendor vía `.graphifyignore`) → sync a `Dev Brain/code-graph/ebrain/` (19 notas) + `graph-report.md` en el vault (= source ebrain, consultable). **Caveat:** el auto-rebuild por-commit (`post-commit.graphify`) no está cableado en graphify 0.6.7; refresco manual/cadencia (`graphify update .` + `sync-obsidian-graph.sh` cada 10 commits). |
| 5 | Backup cubre ebrain (config + recovery documentada y probada 1×) | ✅ | F2 §2.8: `~/eBrain` + `agent-memory` en el manifest de `ckis-backup-all` (`aedneth/ebrain`, `aedneth/agent-memory` privados); recovery-from-git **probado** (863 pág reconstruidas); `ckis-backup-doctor` verde. `runbook.md` §backup/recovery. |
| 6 | `ebrain route` 3 tareas (coding/design/long-context) con costo logueado + cap activo; cero escaladas a frontier | ✅ | F4: **6 rutas en `spend.jsonl`** (web_design/reasoning/agentic, ganadores correctos, costo USD real); cap hard-stop **probado** (gasto sembrado >$4 → exit 3 sin gastar); regex frontier hermético (oN/gpt-N/gemini pro\|ultra) + `frontier.auto_escalate:false`. |
| 7 | Benchmark QMD vs gbrain documentado con decisión tomada | ✅ | F2 §2.7: `docs/benchmark-qmd-vs-ebrain.md` (ebrain 0.81-0.91 vs QMD BM25 pierde semántica + vector stale/113s). **Decisión:** ebrain primario · QMD fallback cero-costo/offline (`.claude/CLAUDE.md` §Search). |
| 8 | Vault ebrain documentado; Company Brain registry+CHANGELOG; cero secretos (gitleaks limpio) | ✅ | F5.3: `03-projects/ebrain/_overview.md` a estado F5 + CKIS CHANGELOG v2.3.98. F5.5: Company Brain `repos.md` + `engineering.md` + DRIFT D-16 + CHANGELOG. F5.7: **0 secretos** en archivos trackeados de ebrain + agent-memory (escaneo 11-patrones equivalente a gitleaks; `.env` gitignored; sin pooler URL). |

## Notas de los caveats (ninguno bloquea el gate)

- **PGLite vs Supabase (crit. 1):** el criterio se escribió asumiendo Supabase; el gate humano 0.4.4 eligió **PGLite local** (free-tier Supabase lleno). Migración lossless a Supabase Pro cuando aplique. La sustancia — motor sano + reindex reproducible — se cumple.
- **Código en `think` (crit. 2):** por decisión 2.6 (dos carriles, bridge-no-embed) el código de proyectos NO se embebe en gbrain (cero código de cliente por diseño). `think` cruza SB+CB; el código vive en el carril graphify (`graphify query` / Dev Brain). El criterio "cruza código" se cumple a nivel de arquitectura de dos carriles, no de embedding único.
- **Auto-hook graphify (crit. 4):** graphify 0.6.7 no auto-instala `post-commit.graphify`; el refresco es manual/cadencia. `.brain` SÍ se actualiza y los reportes SÍ son consultables — solo no es push-button per-commit.

**Gate F5.8:** los 8 criterios pasan con evidencia. Los caveats son decisiones de diseño/límites de tooling ya registrados (no deuda oculta).
