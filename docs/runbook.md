# runbook — ebrain (operación)

## Cómo correr gbrain (SIEMPRE vía el launcher)

```bash
~/.config/ebrain/gbrain-run <args de gbrain>     # usa rutas ABSOLUTAS en los args
```

El launcher (`~/.config/ebrain/gbrain-run`, chmod 700):
1. Hace `cd` a `~/.config/ebrain/wd` (cwd NEUTRAL sin `.env`).
2. Sourcea `~/.config/ebrain/.env` (la key de OpenAI) al entorno del proceso.
3. Ejecuta `bun run ~/eBrain/vendor/gbrain/src/cli.ts "$@"`.

### ⚠ GOTCHA CRÍTICO (root cause F1, 2026-07-10): bun auto-carga `.env` del cwd
`bun` lee automáticamente el `.env` del directorio de trabajo. Si corres gbrain desde `~/Documents/Second Brain` (que tiene su propio `.env`), **ese `.env` pisa la `OPENAI_API_KEY` correcta** → todas las llamadas de embedding dan `400 Bad Request`. **Por eso el launcher hace `cd` a un dir neutral.** Nunca corras gbrain directo desde el vault sin el launcher.

### Config de embeddings (persistida en el brain)
- Modelo: `openai:text-embedding-3-large` a **1536 dimensiones** (Matryoshka; bajo el límite HNSW de pgvector de 2000d, calza con el schema base). Mejor calidad que 3-small, sin riesgo de índice que traería el 3072d nativo.
- Se fijó con `GBRAIN_EMBEDDING_MODEL` + `GBRAIN_EMBEDDING_DIMENSIONS` en `gbrain init`. Exportarlas también en comandos posteriores por seguridad.
- `link_resolution.global_basename = true` — OBLIGATORIO para que los wikilinks estilo CKIS (`[[01-systems/ckis/x]]`, bare `[[x]]`) resuelvan a edges (el whitelist DIR_PATTERN de gbrain no cubre las carpetas CKIS).

## Estado del motor (F1)

- Engine: **PGLite local** en `~/.gbrain/brain.pglite/` (directorio). Supabase diferido (free-tier lleno).
- Source: `second-brain` (`federated: false`) → `~/Documents/Second Brain`.
- Índice: **861 páginas, 3673 chunks (100% embebidos), 490 links, 901 tags.**
- Schema pack: `gbrain-base-v2` (custom `ebrain-ckis-v1` diferido — la inferencia de tipos de base-v2 ya es buena).

## Comandos útiles

```bash
~/.config/ebrain/gbrain-run stats                          # páginas/chunks/links/tipos
~/.config/ebrain/gbrain-run search "<términos>"            # keyword (barato)
~/.config/ebrain/gbrain-run query "<pregunta>" --no-expand # híbrido vector+keyword (sin LLM)
~/.config/ebrain/gbrain-run list -n 30                     # listar páginas
~/.config/ebrain/gbrain-run doctor                         # salud
```

- `query --no-expand`: evita el paso de expansión LLM (no hay chat model configurado; solo embeddings). `gbrain think` (síntesis con citas) requiere configurar un chat model — pendiente (natural para F4 routing o un `GBRAIN_CHAT_MODEL=openai:gpt-4o-mini`).

## Re-ingesta / actualización

```bash
# incremental (tras cambios en el vault):
~/.config/ebrain/gbrain-run sync --source second-brain
~/.config/ebrain/gbrain-run extract links --source db      # refrescar grafo
~/.config/ebrain/gbrain-run embed --stale                  # embeber chunks nuevos
```

## Recovery (reindex-from-git)

La DB es índice derivado reconstruible. Para reconstruir desde cero:
```bash
rm -rf ~/.gbrain/brain.pglite
~/.config/ebrain/gbrain-run init --pglite --schema-pack gbrain-base-v2
~/.config/ebrain/gbrain-run config set link_resolution.global_basename true
~/.config/ebrain/gbrain-run sources add second-brain --path "$HOME/Documents/Second Brain"
~/.config/ebrain/gbrain-run sync --source second-brain --no-embed
~/.config/ebrain/gbrain-run extract links --source db
~/.config/ebrain/gbrain-run embed --stale
```
(El markdown en git es canónico; el vault se respalda cada 15 min. Recovery probado formalmente en F2 §2.8.)

## Costo (F1)

Full-ingest: 3673 chunks / ~2.14M tokens de contenido → **~$0.30–0.35** con `text-embedding-3-large` ($0.13/1M input). Cifra exacta en el dashboard de OpenAI. Cap servidor $5 (Eduardo). Muy por debajo.

## Seguridad

- Key SOLO en `~/.config/ebrain/.env` (chmod 600), nunca en repos/brain/logs. El agente nunca la lee/imprime.
- Secret-scan post-ingesta: `search "sk-ant-api"` / `search "postgres pooler password"` → cero secretos reales confirmado.
