# discovery/05-cost-estimate.md — Estimado de costo de ingesta

> SPRINT 0.4.5. Insumo para el gate humano 0.4.4 (provider de embeddings + presupuesto). Se recalibra con el costo REAL del canary de 20 notas (SPRINT 1.2.4).

## Volumen medido (Second Brain, 2026-07-10)

- **Archivos markdown:** 860 (`.md`, excluyendo `.git/`, `.obsidian/`, `node_modules/`, `.claude/backups/`)
- **Bytes totales:** 8,547,544 (~8.5 MB)
- **Tokens brutos (≈ bytes/4):** **~2.14 M**
- Distribución: 01-systems 226 · 06-resources 196 · 02-daily 149 · 05-knowledge 91 · 00-inbox 50 · 03-projects 44 · resto ~104

## Tokens a embeber

Los embeddings se calculan sobre **chunks**, no sobre el archivo crudo. En modo `balanced` (default de facto), gbrain usa contextual retrieval `title` → antepone el título de la página a cada chunk (overhead ~10-15%). El chunking en sí no añade tokens netos (parte, no duplica). Estimación:

- **Tokens a embeber ≈ 2.14 M × ~1.15 ≈ ~2.5 M** (primer full-ingest, una sola vez).
- Re-embeds posteriores solo tocan chunks stale (páginas modificadas) → marginal.

## Costo por provider candidato

⚠ **Precios a VERIFICAR EN VIVO en el gate/F1** (no inventar). Órdenes de magnitud conocidos, por 1 M tokens de input:

| Provider / modelo | Precio aprox / 1M | Costo full-ingest (~2.5M) | Nota |
|---|---|---|---|
| OpenAI `text-embedding-3-small` | ~$0.02 | **~$0.05** | Barato, conocido, 1536d. Fallback seguro. |
| OpenAI `text-embedding-3-large` | ~$0.13 | **~$0.33** | Mejor calidad, 3072d. |
| Gemini `text-embedding-004` | free tier / bajo | **~$0** (dentro de free tier) | Rate limits; útil para batch gratis. |
| Voyage `voyage-3` / `voyage-code-3` | ~$0.06–0.18 | ~$0.15–0.45 | `voyage-code-3` para código (F2). |
| **ZeroEntropy `zembed-1`** (default gbrain) | **VERIFICAR** | ? | Es el default del motor; precio no confirmado — verificar antes de fijarlo. |

## Costo REAL medido (F1, 2026-07-11)

Full-ingest ejecutado con **`openai:text-embedding-3-large` @1536d** (Eduardo eligió calidad sobre el 3-small):

- **861 páginas → 3673 chunks → 3673 embebidos (100%).**
- Tokens embebidos ≈ 2.14M contenido × ~1.15 overhead de contextual retrieval ≈ **~2.5M**.
- Precio `text-embedding-3-large` = $0.13 / 1M input → **~$0.30–0.35** (cifra exacta en el dashboard OpenAI).
- Muy por debajo del cap servidor de **$5**. La estimación previa (centavos–$0.33) se confirmó.
- Re-embeds posteriores solo tocan chunks stale → marginal.
- **Company Brain (F2):** 163 `.md`, ~1.91 MB, ~499K tokens → ~$0.06–0.07 adicional con el mismo modelo. Trivial.

## Conclusión para el gate 0.4.4

- **La ingesta del vault NO es un riesgo de costo:** el corpus es pequeño (~2.5M tokens); el full-embed cuesta **de centavos a ~$0.33** en cualquier provider frontier de embeddings. El cap real importa más para (a) el dream cycle nocturno (llamadas LLM, no embeddings) y (b) el routing F4.
- **Recomendación de provider:** decidir entre (i) **ZeroEntropy** (default de gbrain, cero fricción de config — pero verificar precio) o (ii) **OpenAI 3-small** (known-quantity, ~$0.05 total, muy barato). Gemini free-tier queda como opción de batch gratis.
- **Presupuesto sugerido para F1:** cap de **$2** en la key de embeddings (30× el costo estimado) — margen amplio, imposible de drenar con este corpus. Canary de 20 notas primero (SPRINT 1.2) para medir costo real por-nota y recalibrar aquí.
- Company Brain (F2) es un corpus adicional menor; se estima por separado antes de su ingesta.
