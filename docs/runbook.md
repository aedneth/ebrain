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

- `query --no-expand`: evita el paso de expansión LLM. **Chat model configurado (F4.8, 2026-07-12):** `gbrain think` (síntesis con citas) ya corre — retrieval por embeddings (OpenAI 3-large, intacto) + síntesis por **`openrouter:minimax/minimax-m3`** (stack chino, sin frontier). Probado: `Model: openrouter:minimax/minimax-m3 | Pages: 40 | Citations: 8`.

### Chat model → OpenRouter (F4.8 — reverse-engineering para el motor mejorado)
- **Dos knobs distintos, no los confundas:**
  - `GBRAIN_CHAT_MODEL` (env, exportado en los launchers) → query-expansion / chat general.
  - `models.default` (config del brain, `gbrain config set models.default <model>`) → **el que usa `think`** para síntesis. Su default de fábrica era `anthropic:claude-opus-4-7` (por eso pedía `ANTHROPIC_API_KEY`). Seteado a `openrouter:minimax/minimax-m3`.
- **Recipe OpenRouter nativo** (`core/ai/recipes/openrouter.ts`): `base_url_default: https://openrouter.ai/api/v1` (BASE_URL opcional), requiere `OPENROUTER_API_KEY`, forma `openrouter:<provider>/<model>`. `splitProviderModelId` (colon-first) soporta la forma anidada `openrouter:minimax/minimax-m3`.
- **Embeddings NO se tocan:** OpenRouter no tiene API de embeddings; siguen en `openai:text-embedding-3-large @1536d` (fijados en init). Solo migra el LLM de chat/síntesis.
- **GAP de presupuesto (Fable #4/#8):** el spend de gbrain (think/dream/judges) **NO** entra en `~/.config/ebrain/spend.jsonl` (solo `route.ts` escribe ahí). El cap real de estas llamadas es **server-side (OpenRouter dashboard)**. Instrumentar `src: gbrain` en el ledger local = mejora futura del motor ebrain.
- **Para F5 (dream cycle):** `models.tier.subagent` necesita un modelo **tool-capable** (p.ej. `openrouter:moonshotai/kimi-k2.6`); no lo cubre `models.default`. Setearlo cuando se arme el dream cycle.

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

## Dream cycle (F5.1) — consolidación nocturna

`gbrain dream` corre el ciclo de mantenimiento nocturno (dedup, inferencia de links, extracción de patrones/insights). En ebrain se dispara vía `~/eBrain/scripts/dream-cycle` (**lock-aware**) para no chocar con el lock PGLite de una sesión de agente.

**Prerequisito de modelo (F4.8/F5.1):** el dream/subagent usa `models.tier.subagent` — debe ser **tool-capable**. El script lo asegura idempotente a `openrouter:moonshotai/kimi-k2.6` (verificado tool-calling ✓ en F4.1). Las fases de síntesis del dream caen a `models.default` (=`openrouter:minimax/minimax-m3`, F4.8). gbrain **valida** capacidad de tools (`enforceSubagentCapable`) y aborta con instrucción de fix si no.

**Lock (crítico):** gbrain es single-connection. Mientras un MCP `serve` de sesión tiene el lock, `config`/`dream`/`sources` fallan ("Timed out waiting for PGLite lock"). Por eso el dream es una operación **MCP-idle** (nocturna). `dream-cycle` aborta limpio (rc=0, "DIFERIDO") si detecta un serve vivo — nunca deadlockea.

**Gasto/audit:** el dream gasta OpenRouter (subagent/default). Ese gasto **NO** entra a `spend.jsonl` (ledger de route.ts); gbrain lo audita en `~/.gbrain/audit/` (dream-budget JSONL). Cap real = server-side OpenRouter ($10/mo). Revisar el audit tras las primeras corridas.

**Corrida supervisada (HUMANO, con MCP idle — sin sesión de agente viva):**
```bash
bash ~/eBrain/scripts/dream-cycle --dry-run   # preview, CERO gasto
bash ~/eBrain/scripts/dream-cycle             # real; ver ~/.config/ebrain/dream.log + ~/.gbrain/audit/
```

**Habilitar el timer nocturno (HUMANO — gasto autónomo recurrente):** unit files listos en `~/eBrain/scripts/systemd/` (03:30, `Persistent=true` = catch-up al próximo boot si la laptop estuvo apagada; evita dip-collect 19:30 y el cluster de las 02:2x).
```bash
cp ~/eBrain/scripts/systemd/ebrain-dream.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now ebrain-dream.timer
systemctl --user list-timers ebrain-dream.timer   # verificar
```

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
