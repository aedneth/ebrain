---
type: benchmark
project: ebrain
sprint: "2.7"
created: 2026-07-11
status: decided
decision: "ebrain primario (semántico, vía MCP) + QMD fallback cero-costo/offline"
related: [SPRINT.md, ADR-001-brain-topology.md]
---

# Benchmark QMD vs ebrain (SPRINT 2.7)

> Gate humano. Eduardo (2026-07-11): *"corre las queries primero… QMD siempre se queda y se incorpora al ebrain como fallback para cero costo… por el momento usar la api key que tenemos y combinarlo con qmd. Multi-proveedor (ZeroEntropy, otros) para cero costo más adelante."*

## Setup
- **ebrain:** gbrain PGLite, `text-embedding-3-large` @1536d, 100% embebido (1024 pág / 4474 chunks), cross-source (second-brain + company-brain) vía `ebrain-q` (fan-out) o MCP.
- **QMD:** v2.5.3, EmbeddingGemma-300M local 768d. **Índice stale: 76% de docs sin re-embed** (aviso de `qmd`). Solo second-brain.

## Resultados (8 queries reales ES/EN, medidos 2026-07-11)

| Dimensión | ebrain | QMD |
|---|---|---|
| **Relevancia semántica** | Alta (top-1 score **0.81–0.91**); encuentra matches conceptuales | `search` (BM25) devuelve **"none"** en queries conceptuales ("korvex pricing", "ICP flujo de caja") — keyword-exacto no capta semántica |
| **Latencia (semántica)** | **MCP persistente: ~1–3s** · CLI fan-out: 11–16s (2× cold-start de bun ~2s c/u, no la búsqueda) | `vsearch`: **113 s** (con expansión) · `search` BM25: ~0.5s (pero keyword-only) |
| **Frescura** | **100% embebido** | **76% stale** — re-embed = multi-hora (EmbeddingGemma local en Celeron; "dos noches" histórico) |
| **Cobertura** | cross-source (vault + company-brain + lo que federes) | single-vault |
| **Integración** | **nativo MCP** (tus agentes lo llaman) | solo CLI |
| **Costo/query** | ~$0.0000021 (negligible, ver abajo) | $0 |
| **Offline** | necesita red + key OpenAI | **100% offline, modelo local** |

**Veredicto de relevancia:** ebrain gana decisivamente en semántica (QMD BM25 pierde conceptos; QMD vector está stale + 100× más lento). QMD BM25 sigue siendo rápido y útil para **keyword exacto** y **offline**.

## Estimación de costo (uso intensivo — lo pediste explícito)

Query de búsqueda = **1 embedding del texto de la query** (~8 tokens) con `text-embedding-3-large` ($0.13/1M input). Fan-out cross-source = ~2 embeddings (~$0.0000021/query). **El search NO usa LLM** → no hay costo de generación.

| Escenario | queries/día | **/día** | **/semana** | **/mes** |
|---|---|---|---|---|
| Moderado | 100 | $0.0002 | $0.0015 | **$0.006** |
| Intensivo | 500 | $0.001 | $0.007 | **$0.031** |
| Extremo (día + noches) | 1500 | $0.003 | $0.022 | **$0.094** |

**+ re-embed incremental** por ediciones del vault (~20 notas/día → ~50 chunks → ~30K tokens): ~$0.004/día → **~$0.12/mes**.

**Total realista con uso constante día y noche: < $0.50/mes.** El cap de $5 **jamás** se toca por búsqueda. Los únicos drivers reales de costo son: full-ingests puntuales (~$0.35 c/u) y `think`/síntesis LLM (F4, aparte). **Conclusión: usar ebrain como primario todo el día es esencialmente gratis.**

## Decisión (gate — Eduardo)

**ebrain = primario semántico (vía MCP para velocidad). QMD = se queda, incorporado como fallback cero-costo.**

Roles concretos:
- **ebrain (MCP / `ebrain-q`):** toda búsqueda semántica y cross-source. Default para agentes y para "¿qué sé de X?".
- **QMD `search` (BM25):** keyword exacto rápido + **red de seguridad offline** (sin red / cero costo / cero API).
- **QMD semántico (`vsearch`/`query`):** en pausa hasta re-embed (multi-hora) — no vale la pena mientras ebrain esté fresco. Si se quiere QMD como fallback semántico offline real, correr `qmd embed` una noche.

## Follow-ups
1. **Optimizar `ebrain-q`**: que consulte vía el MCP persistente (evita cold-start de bun ×2) → de ~12s a ~2s en CLI. Enhancement.
2. **Multi-proveedor cero-costo** (Eduardo): evaluar **ZeroEntropy** (default hosted de gbrain) y **gemini free-tier embeddings** como columnas alternativas (`embedding_columns` de gbrain soporta A/B) → fallback sin costo ni red-dependencia-OpenAI. Va con 2.6b / F4.
3. **CLAUDE.md del vault**: actualizar la sección Search → ebrain primario / QMD fallback.
