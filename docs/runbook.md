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

## Cross-source (F2) — usar `ebrain-q`, NO el CLI nativo

```bash
~/.config/ebrain/ebrain-q "<pregunta>" [topN]     # cross-source real (fan-out + merge por score)
```

⚠ **El cross-source nativo de gbrain NO funciona** en este pin (v1 limitation): `--source __all__` / `--all-sources` / `{all_sources:true}` devuelven vacío. Usa **siempre `ebrain-q`** para buscar en TODO el knowledge layer (second-brain + company-brain + los que se federen). Per-source sí funciona: `gbrain-run query "<q>" --source <id> --no-expand`. Ver ADR-001 §cross-source.

## MCP (F2) — ebrain en las sesiones de Claude Code

- Registrado a **user scope** (machine-wide): `claude mcp add ebrain --scope user -- ~/.config/ebrain/gbrain-mcp`. Verificar: `claude mcp get ebrain` → `✔ Connected`.
- Launcher `~/.config/ebrain/gbrain-mcp` (cwd neutral + sourcea `.env` + `MCP_STDIO=1`). Limpieza al cerrar sesión: watchdog de ppid de gbrain.
- Tools disponibles en cualquier sesión nueva: `mcp__ebrain__query` / `search` / `get_page` / `think` / `code_*` (102 ops). **Cross-source por MCP aún per-source** (usar `ebrain-q` en CLI hasta que el nativo funcione).
- Quitar: `claude mcp remove ebrain -s user`.

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
(El markdown en git es canónico; el vault se respalda cada 15 min.)

**Recovery PROBADO (F2 §2.8a, 2026-07-11):** en un brain aislado (`GBRAIN_HOME` desechable) se reconstruyó desde git: **863 páginas + 3689 chunks** (`sync --no-embed` ~2 min) + **490 links** (`extract links --source db`, 7s) — idéntico a producción. Luego `embed --stale` (= pasada de F1, ~$0.30–0.35). `global_basename` persiste en el brain. La DB es reconstruible al 100%. **Ojo:** el paso de links es `extract links --source db` (NO `extract --stale`, que no reconstruye los wikilinks).

## Backup (F2 §2.8)

- El repo **`~/eBrain` está en el manifest** de `ckis-backup-all` (`~/Documents/ckis-infra/ckis-manifest.json`, target `ebrain` → `aedneth/ebrain` privado). La próxima corrida programada auto-crea el remote y lo pushea (secret-scan en pre-commit). Verificado: repo limpio de secretos (46 archivos, cero valores).
- La **DB PGLite NO se respalda** (índice derivado reconstruible desde git — ver Recovery). Los launchers viven versionados en `scripts/` (la key sigue solo en `~/.config/ebrain/`, fuera de todo repo).
- Health: `bash ~/Documents/ckis-infra/bin/ckis-backup-doctor.sh --oneline` → verde.
- Dump lógico de Supabase (SPRINT 2.8b): N/A mientras sea PGLite local; aplica al migrar a Supabase Pro.

## Costo (F1)

Full-ingest: 3673 chunks / ~2.14M tokens de contenido → **~$0.30–0.35** con `text-embedding-3-large` ($0.13/1M input). Cifra exacta en el dashboard de OpenAI. Cap servidor $5 (Eduardo). Muy por debajo.

## Seguridad

- Key SOLO en `~/.config/ebrain/.env` (chmod 600), nunca en repos/brain/logs. El agente nunca la lee/imprime.
- Secret-scan post-ingesta: `search "sk-ant-api"` / `search "postgres pooler password"` → cero secretos reales confirmado.
