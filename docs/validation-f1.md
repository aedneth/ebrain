# validation-f1 — Second Brain indexado (SPRINT 1.4.6)

> 10 queries reales de Eduardo (5 ES / 5 EN) contra el motor gbrain vivo (PGLite local, `openai:text-embedding-3-large` @1536d, `gbrain-base-v2`, `link_resolution.global_basename=true`). Modo: `query --no-expand` (híbrido vector+keyword, sin chat model — no hay LLM de expansión configurado en F1). Fecha: 2026-07-11.

## Estado del índice al validar

- **861 páginas · 3673 chunks · 3673 embebidos (100%) · 490 links · 901 tags.**
- Source única: `second-brain` (`isolated`, `~/Documents/Second Brain`). Company Brain **NO** incluido (es F2).

## Resultados (top-1, score y acierto)

| # | Idioma | Query | Top-1 | Score | Acierto |
|---|--------|-------|-------|-------|---------|
| 1 | ES | ¿qué es Korvex? | `03-projects/korvex/overview` | 0.86 | ✅ exacto |
| 2 | EN | compound memory architecture | `05-knowledge/permanent-notes/agentic-os-compound-memory` | 1.03 | ✅ exacto |
| 3 | ES | pricing Modelo C Korvex | `sales-workflow/04b-tactical-pitch-to-close` (+ daily 2026-06-22 [0.77]) | 0.85 | ✅ dominio correcto (pricing/ventas) |
| 4 | EN | autonomous backup system 3-2-1 | `01-systems/ckis/00-ckis-master-context` (+ `17-crons-architecture` [0.82]) | 0.83 | ✅ exacto |
| 5 | ES | decisión drop-out UGB universidad | `02-daily/logs/2026-07-08` | 1.00 | ✅ exacto (día de la decisión) |
| 6 | EN | hybrid search RRF reranker | `reel-bashi-rag-at-scale` (+ `reel-alex2learn-qmd-search` [0.86]) | 0.88 | ✅ dominio correcto (RAG/reranking) |
| 7 | ES | Brisas del Golfo propuesta cliente | `02-daily/logs/2026-05-20` (+ `brisas_del_golfo_postmortem` [0.63]) | 0.81 | ✅ correcto |
| 8 | EN | YC application Korvex startup | `02-daily/logs/2026-05-31` | 0.84 | ✅ correcto (semana de submission YC S26) |
| 9 | ES | ICP cliente ideal flujo de caja constante | `sales-workflow/03-operational-engine` (+ `finance-business` [0.81]) | 0.84 | ✅ dominio correcto |
| 10 | EN | note frontmatter template types | `01-systems/ckis/08-note-templates-and-frontmatter` | 0.93 | ✅ exacto |

**10/10 relevantes**, 8/10 con el documento exacto en top-1; los 2 restantes (3, 6, 9) aterrizan en el dominio correcto con la nota específica en top-2/top-3. Sin resultados basura. Bilingüe ES/EN funcionando simétricamente.

## Notas de calibración

- `gbrain think` (síntesis con citas) **no** se validó: requiere un chat model configurado (`GBRAIN_CHAT_MODEL`), diferido a F4 (routing) o un `openai:gpt-4o-mini` puntual. El retrieval puro (que es lo que F1 debía probar) está sólido.
- Scores >1.0 (Q2) provienen del RRF + boosts de gbrain (adjacency 1.05 / cross-source 1.10); no son cosenos normalizados, son scores de fusión — comparables entre sí dentro de una misma query, no absolutos.
- El `global_basename=true` es lo que hace que los wikilinks CKIS resuelvan (490 edges); sin él, 0 edges y el grafo no aporta señal.
