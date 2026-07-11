# ebrain

**La capa de inteligencia centralizada del CKIS.** ebrain evoluciona el Central Knowledge & Intelligence System de Eduardo Borjas de una arquitectura de carpetas + hooks + scripts a un sistema de base de datos e infraestructura RAG de nivel de producción — construido **sobre** [gbrain](https://github.com/garrytan/gbrain) (motor de conocimiento) y [gstack](https://github.com/garrytan/gstack) (sistema operativo de desarrollo agéntico) de Garry Tan, adaptados y federados con todas las capas CKIS existentes.

## El problema

CKIS ya funciona: Second Brain (vault Obsidian), Company Brain (Korvex OS), Dev Brain (graphify + hooks), Per-Project Brains (`.brain`), búsqueda local (QMD) y backup autónomo cada 15 minutos. Pero las capas están conectadas por convención, no por infraestructura: cada terminal de Claude Code re-lee contexto redundante, la búsqueda es solo léxica (BM25), no hay grafo de conocimiento consultable, no hay síntesis con citas, y no hay memoria única que todas las sesiones compartan.

## La solución

Un bus central de conocimiento:

- **Motor (gbrain fork):** Postgres + pgvector en Supabase, búsqueda híbrida (vector + BM25 + RRF + reranker), grafo de conocimiento auto-cableado sin LLM, síntesis con citas y gap analysis (`gbrain think`), cola de jobs durable (Minions), consolidación nocturna (dream cycle). **El markdown en git sigue siendo canónico** — la DB es un índice derivado y reconstruible, exactamente el principio CKIS.
- **Federación:** Second Brain, Company Brain y repos de código como brains/sources separados con política de confianza por repo (read-write / read-only / deny). brisas-del-golfo = deny, siempre.
- **Workflow (gstack fork):** skills de desarrollo agéntico (/autoplan, /review, /qa, /ship, /learn…) instaladas en Claude Code con un overlay que impone los SOPs CKIS (structured-agentic-development, development-pipeline-pattern).
- **Bus MCP:** una memoria, N terminales. Toda sesión de Claude Code consulta ebrain vía MCP en lugar de re-leer el disco.
- **Capa de ejecución de inteligencia (ver `docs/ROUTING.md`):** tres tiers. Tier 0 = los activos que Eduardo ya paga, cada uno en su mejor rol (Claude Code Pro como driver default, Codex para workers de código paralelos, Cursor Composer solo inline, gemini-cli free tier para batch gratis). Tier 1 = stack chino ruteado por capacidad vía OpenRouter (coding→DeepSeek V4, agentic→Kimi K2.6, web/design→GLM-5.2, long-context+reasoning→MiniMax M3, general→Qwen3.7 Max) con fallback nativo y doble cap de gasto. Tier 2 = Hermes como runtime autónomo 24/7 opcional corriendo en VPS/serverless, orquestando los mismos modelos. Frontier nunca se invoca automáticamente. Implementa el AI Execution Layer de Company Brain Part VII.

## Estructura del repo

```
/ebrain
├── CLAUDE.md          # documento maestro para agentes (Opus orquesta, Sonnet ejecuta)
├── docs/              # ULTRAPLAN, ARCHITECTURE, SPRINT, ROUTING, GUARDRAILS, DESIGN, ADRs, runbook
├── discovery/         # reportes de reverse engineering (gbrain, gstack, contrato de conexión)
├── vendor/
│   ├── gbrain/        # clon local — SOLO LECTURA para agentes
│   └── gstack/        # clon local — SOLO LECTURA para agentes
├── overlay/           # adaptaciones CKIS: schema pack ebrain-ckis-v1, deltas de skills
├── cli/               # wrapper delgado (bun): route, doctor, status, sync, backup
└── scripts/           # utilidades idempotentes (--dry-run siempre)
```

## Principios

1. El vault/git es canónico; la DB es desechable y reconstruible.
2. Construir sobre upstream (forks + overlay), nunca reescribir ni editar `vendor/` directo.
3. Centralizado: una memoria, una política de confianza, un log de gasto.
4. Coste como restricción arquitectónica: caps duros, canary antes de bulk, embeddings hosted (la máquina local tiene 4 GB de RAM).
5. Vendor independence: capacidades sobre modelos; todo reemplazable (Part VII).
6. Cero secretos en repos o en el brain. gitleaks + secret scanner activos.

## Estado

Ver `docs/ULTRAPLAN.md` (fases F0–F5 y Success Criteria) y `docs/SPRINT.md` (tareas). El proyecto queda ACTIVO hasta que todos los Success Criteria pasen. Documentación viva del proyecto en el vault: `02-projects/ebrain/`.

## Relación con el ecosistema CKIS

| Capa existente | Destino con ebrain |
|---|---|
| Second Brain (vault) | System of record; indexado como source `second-brain` |
| Company Brain | System of record; source `company-brain` (frontera personal/Korvex preservada) |
| Dev Brain / graphify | Intacto (hooks post-commit); reportes indexados; posible tool MCP hermano |
| QMD | Coexiste → benchmark → retiro o fallback offline (decisión con evidencia) |
| Autonomous Backup | Extendido: config ebrain + recovery reindex-from-git probado |
| Content OS, crons | Intactos en el vault; el dream cycle se suma, no reemplaza |

## Licencias

gbrain y gstack son MIT. ebrain respeta ambas licencias y mantiene atribución; los overlays y el CLI propio heredan MIT salvo decisión contraria de Eduardo.
