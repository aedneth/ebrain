---
title: gbrain — federación, MCP server y soporte Obsidian (ingeniería inversa)
pin_sha: a25209bbb2bacf1b88e06fd5282b27f1bf4a3e7a
pin_version: v0.42.58.0
vendor_path: ~/eBrain/vendor/gbrain
generated: 2026-07-10
mode: solo-lectura
---

# gbrain — Federación, MCP server y soporte Obsidian

Todas las citas son `ruta:línea` relativas a `vendor/gbrain/` (pin SHA `a25209bbb2bacf1b88e06fd5282b27f1bf4a3e7a`, v0.42.58.0). El código manda; los README solo orientan.

━━━

## §brains-sources

### Modelo brains ⊥ sources (dos ejes ortogonales)

gbrain tiene **dos jerarquías de resolución paralelas y ortogonales**, no una sola:

1. **Brain = QUÉ BASE DE DATOS** (Postgres o PGLite). Eje de "mounts". Resolución de 6 tiers en `src/core/brain-resolver.ts:1-20` (comentario de cabecera):
   > "`--brain <id>` picks WHICH DATABASE to target (mounts + host). `--source <id>` (v0.18.0) picks WHICH REPO WITHIN the selected brain. Orthogonal axes." — `src/core/brain-resolver.ts:9-11`

2. **Source = QUÉ REPO DENTRO de ese brain**. Cada `pages`/`files`/`ingest_log` row está scoped a una fila `sources(id)`; los slugs son únicos por source. `src/commands/sources.ts:5-7`:
   > "A source is a logical brain-within-the-DB: wiki, gstack, yc-media, etc. Every page/file/ingest_log row is scoped to a sources(id) row. Slugs are unique per source."

La ortogonalidad está confirmada explícitamente en el código de operaciones: `src/core/operations.ts:368` — *"Orthogonal to v0.18.0's source_id, which scopes per-repo WITHIN a brain."*

**Implicación directa para ebrain**: gbrain YA soporta nativamente ambas topologías que estamos evaluando —
- **1 brain (1 DB) + N sources** (repos dentro de esa DB) vía `gbrain sources add`, o
- **N brains separados** (N DBs, cada uno Postgres o PGLite) vía `~/.gbrain/mounts.json` + `.gbrain-mount` + `--brain` — ver `src/core/brain-registry.ts:1-23,33-86`.

No hace falta elegir una sola arquitectura al nivel de gbrain: el mecanismo de `mounts` (brain axis) y el mecanismo de `sources` (repo axis) son composables (un mount puede a su vez tener múltiples sources).

### El dotfile `.gbrain-source`

- Definido en `src/core/source-resolver.ts:22` (`const DOTFILE = '.gbrain-source';`).
- Se escribe/borra vía subcomandos `attach`/`detach`: `src/commands/sources.ts:15-16` (comentario) y la implementación real en `src/commands/sources.ts:663-676` — `attach` hace `writeFileSync(join(process.cwd(), '.gbrain-source'), ...)`, `detach` lo borra.
- **Resolución con walk-up de directorio** (hasta 50 niveles, hasta llegar a la raíz del filesystem): `src/core/source-resolver.ts:33-64` (`readDotfileWalk`).
- **Endurecido contra symlinks / archivos plantados por otro usuario**: usa `lstatSync` (no `statSync`) + `isTrustedDotfile()` que rechaza symlinks, archivos de otro dueño, y archivos world-writable (issue #418) — `src/core/source-resolver.ts:38-45`. Fail-closed: cualquier error de stat → se salta ese candidato y sigue subiendo.
- Un `.gbrain-source` inválido (regex `[a-z0-9-]{1,32}`) **no lanza error** — cae silenciosamente al siguiente tier (a diferencia del flag `--source` y `GBRAIN_SOURCE`, que sí lanzan) — `src/core/source-resolver.ts:49-54`.
- Existe el análogo `.gbrain-mount` para el eje "brain" (no "source"): `src/core/brain-resolver.ts:26,32-52`.

### El subcomando `sources add` / `sources federate`

- `gbrain sources add <id> [--path <path> | --url <https-url>] [--name <display>] [--federated|--no-federated] [--clone-dir <path>]` — cabecera + implementación: `src/commands/sources.ts:10,118-165`.
- `--path` (repo local ya clonado) y `--url` (clona un remoto vía la ruta anti-SSRF) son mutuamente excluyentes — `src/commands/sources.ts:150-153`.
- **`federated` controla visibilidad en búsqueda cross-source por defecto**: `src/commands/sources.ts:185-187`:
  > `federated: ${fed}${fed ? ' — appears in cross-source default search' : ' — only searched when explicitly named via --source'}`
  Esto es EXACTAMENTE la "política de confianza por repo" que necesitamos para la frontera personal ⊥ Korvex: un source no-federado (default) solo se busca cuando se nombra explícitamente con `--source`; un source federado entra en el pool de búsqueda cruzada.
- Endurecimiento automático de clones remotos gestionados (git durability) si se aporta un PAT: `src/commands/sources.ts:189-200` (best-effort, nunca bloquea `add`).
- `federate`/`unfederate` — flip de `sources.config.federated`: dispatch en `src/commands/sources.ts:1318-1319`, handler `runFederate` en `src/commands/sources.ts:681-` (línea 681 en adelante).
- El flag se lee/normaliza en `src/core/sources-load.ts:57-61` (`isSourceFederated` — `parsed.federated === true`).

### `sync --strategy code` vs sync de markdown

Tipo `SyncStrategy = 'markdown' | 'code' | 'auto'` — `src/core/sync.ts:34`.

Filtro de admisión por estrategia — `src/core/sync.ts:181-190` (`isAllowedByStrategy`):
```
markdown → solo .md/.mdx (isMarkdownFilePath, src/core/sync.ts:173-175)
code     → solo extensiones de CODE_EXTENSIONS (35+ lenguajes vía tree-sitter, src/core/sync.ts:53-94)
auto     → markdown + code + imágenes (si multimodal está prendido)
```
- `CODE_EXTENSIONS` cubre ts/tsx/js/jsx/py/rb/go/rs/java/cs/cpp/php/swift/kt/scala/lua/ex/elm/dart/zig/sol/sh/css/html/vue/json/yaml/toml/**tf/tfvars/hcl** (Terraform, v0.36.x #878) y **sql** (v0.41, vía tree-sitter-sql) — `src/core/sync.ts:53-94`.
- El comando CLI parsea `--strategy` en `src/commands/sync.ts:3471` y lo enhebra en el full-sync / incremental / dry-run — `src/commands/sync.ts:2962-3008,3097-3113`.
- Cada source puede tener su propia estrategia guardada en `sources.config.strategy` (`markdown | code | auto`) que se lee en múltiples call-sites: `src/commands/sync.ts:395-397,3667,4146`.
- Chunking difiere fundamentalmente: sync de código usa el chunker AST vía tree-sitter (`src/core/chunkers/code.ts`), sync de markdown usa el pipeline de páginas/frontmatter/wikilinks normal.

### La cadena de precedencia de 6 tiers (config de fuente)

**Esta es la cadena canónica reutilizada en todo el codebase** — `src/core/source-resolver.ts:1-14` (comentario de cabecera) y la implementación en `src/core/source-resolver.ts:80-161` (`resolveSourceId`) / `285-354` (`resolveSourceWithTier`, versión que además retorna el tier ganador):

| Tier | Señal | Detalle | Falla si inválido |
|---|---|---|---|
| 1 | `--source <id>` flag explícito | `src/core/source-resolver.ts:85-92` | **throw** (regex `[a-z0-9-]{1,32}`) |
| 2 | env var `GBRAIN_SOURCE` | `src/core/source-resolver.ts:94-102` | **throw** |
| 3 | dotfile `.gbrain-source` (walk-up) | `src/core/source-resolver.ts:104-109` | silencioso → sigue |
| 4 | source registrado cuyo `local_path` contiene el CWD (longest-prefix match, ambos lados con `realpath`) | `src/core/source-resolver.ts:111-132` | — |
| 5 | default a nivel brain (`sources.default` en DB config) | `src/core/source-resolver.ts:134-142` | silencioso → sigue |
| 5.5 | **(añadido v0.41.13, #1434)** único source no-default registrado con `local_path` (conveniencia "sole non-default") | `src/core/source-resolver.ts:144-156,175-190` | — |
| 6 | literal `'default'` (compat pre-v0.17) | `src/core/source-resolver.ts:158-160` | nunca falla — terminal |

Los nombres de tier exportados (`SOURCE_TIER_NAMES`) son `['flag','env','dotfile','local_path','brain_default','sole_non_default','seed_default']` — `src/core/source-resolver.ts:263-272` (7 etiquetas porque el 5.5 tiene nombre propio, pero el código y todos los comentarios en el repo la llaman consistentemente **"6-tier chain"**, contando 5 y 5.5 como un solo escalón lógico: p. ej. `src/commands/call.ts:10`, `src/cli.ts:785`, `src/commands/capture.ts:461`).

Esta cadena se reutiliza literalmente (mismo patrón, incluso el mismo docstring) en:
- **Eje "brain"** (qué DB): `--brain` → `GBRAIN_BRAIN_ID` → `.gbrain-mount` → mount path-prefix → default (no cableado en PR0) → `'host'` — `src/core/brain-resolver.ts:19-40,95-134`.
- **Eje "modelo"** (qué LLM usar por operación): cliFlag → config-key nuevo → config-key deprecado → `models.default` → `models.tier.<tier>` → env var — `src/core/model-config.ts:128-190` (también documentado como "6-tier precedence chain").
- **Eje "schema pack"** (7 tiers, un peldaño más porque añade `SearchOpts.schema_pack` por-call antes del flag): `src/core/config.ts:295-313`, `src/core/schema-pack/registry.ts:24`.

Esto confirma que la precedencia `flag > env > archivo-local (dotfile) > convención-de-ruta > default-de-brain > fallback-hardcodeado` es un **patrón arquitectónico deliberado y repetido**, no un accidente de una sola feature — buena señal de consistencia para razonar sobre ebrain apoyándose en el mismo mental model.

━━━

## §mcp

### Transporte: stdio vs HTTP

- **stdio** (`gbrain serve`, sin flags): `src/commands/serve.ts:126-142` arranca `startMcpServer(engine)` (`src/mcp/server.ts:18-123`) sobre `StdioServerTransport` del SDK oficial (`@modelcontextprotocol/sdk`). Lifecycle robusto: shutdown en EOF de stdin, señales SIGTERM/SIGINT/SIGHUP, y un **watchdog de proceso padre** que hace polling cada 5s vía `ps -o ppid=` porque `process.ppid` no se actualiza tras un re-parent del kernel — `src/commands/connect.ts` no, ver `src/commands/serve.ts:244-374`.
  - `MCP_STDIO=1` desactiva los hooks de `stdin.on('end'/'close')` porque algunos gateways (OpenClaw) cierran su mitad de stdin tras el handshake JSON-RPC sin que sea una desconexión real — `src/mcp/server.ts:109-117`, `src/commands/serve.ts:59-65,232-243`.
  - stdio **no tiene auth por-token** (es un pipe local): el dispatcher fija `takesHoldersAllowList: ['world']` y `sourceId: GBRAIN_SOURCE || 'default'` por defecto — `src/mcp/server.ts:38-54`.
- **HTTP** (`gbrain serve --http [--port N] [--bind HOST] [--public-url URL] [--enable-dcr] [--enable-dcr-insecure] [--token-ttl N] [--log-full-params] [--suppress-bootstrap-token]`): dispatcha a `runServeHttp` en `src/commands/serve-http.ts` — flags parseados en `src/commands/serve.ts:79-123`. Bind por defecto `127.0.0.1` (loopback); requiere `--bind 0.0.0.0` explícito para exposición de red — comentario en `src/commands/serve.ts:105-113`.

### OAuth 2.1 (solo transporte HTTP)

`src/core/oauth-provider.ts:1-14` (cabecera): implementa `OAuthServerProvider` del SDK MCP. Soporta:
- **Authorization Code + PKCE** (ChatGPT, clientes basados en navegador) — `src/core/oauth-provider.ts:9`.
- **Client Credentials** (machine-to-machine: Perplexity, Claude) — `src/core/oauth-provider.ts:10`, hándler custom porque el SDK no lo soporta nativamente: `src/commands/serve-http.ts:597-598,622` (`if (req.body?.grant_type !== 'client_credentials') ...`).
- **Dynamic Client Registration (DCR)**: por defecto los clientes DCR quedan en `authorization_code` (consent-bearing); `client_credentials` vía DCR requiere el flag explícito `--enable-dcr-insecure` — `src/core/oauth-provider.ts:187-190,257-268`, `src/commands/serve.ts:88-93`.
- **`token_endpoint_auth_method`**: allowlist de 3 valores — `client_secret_post`, `client_secret_basic`, `none` (cliente público solo-PKCE: Claude Code, Cursor, ChatGPT custom connector) — `src/core/oauth-provider.ts:55-69`.
- **Descubrimiento**: `/.well-known/oauth-authorization-server`, interceptado para inyectar `client_credentials` en `grant_types_supported` porque el SDK solo anuncia `authorization_code`+`refresh_token` — `src/commands/serve-http.ts:756-765`.
- **Legacy bearer fallback**: tokens creados vía `gbrain auth create` (`access_tokens` table) siguen funcionando junto al esquema OAuth — `src/core/oauth-provider.ts:13`.
- **Jerarquía de 6 scopes** — `src/core/scope.ts:25-34,51-59`:
  ```
                    admin
                      │
      ┌──────────┬────┴────┬──────────┐
      ▼          ▼         ▼          ▼
   sources_admin  users_admin  write  read
                                │      ▲
                                └──────┘
  ```
  `admin` implica todo; `write` implica `read`; `sources_admin`/`users_admin`/`agent` son hermanos que solo se implican a sí mismos — `src/core/scope.ts:51-59`. `agent` es el 6º scope, añadido v0.38 para `submit_agent` (dispatch de subagentes LLM pagados vía OAuth) — deliberadamente NO implicado por `admin` para que un token admin viejo no gane de golpe la capacidad de gastar dinero en agentes — `src/core/scope.ts:57` y comentario en `src/core/operations.ts:2888-2900`.

### `gbrain connect` / `gbrain serve --install`

`src/commands/connect.ts:1-33` (cabecera): onboarding de un coding agent a un `gbrain serve --http` remoto.
- `gbrain connect <mcp-url> [--token <bearer>] [--agent claude-code|codex|perplexity|generic] [--oauth [--register|--client-id..--client-secret..]] [--install] [--yes] [--json]` — flags completos en `src/commands/connect.ts:98-126`.
- **Registro real en Claude Code** vía `--install`: ejecuta `execFileSync('claude', ['mcp','add', name, '-t','http', url, '-H', 'Authorization: Bearer <tok>'])` — argv construido en `src/commands/connect.ts:263` y ejecutado en `src/commands/connect.ts:482`.
- Codex usa una variante con token vía variable de entorno: `['mcp','add', name, '--url', url, '--bearer-token-env-var', envVar]` — `src/commands/connect.ts:268`.
- Perplexity/generic no soportan `--install` (se configuran por su propia UI) pero sí `--oauth` (client-credentials) — tabla `AGENT_SPECS` en `src/commands/connect.ts:61-66`.
- Tras `--install`, el flujo de auto-orientación instruye al agente a llamar `get_brain_identity` → `list_skills` → `list_brain_skillpack` — `LEARN_INSTRUCTION` en `src/commands/connect.ts:71-77`.
- `--install` en shell no interactivo exige `--yes` (rechaza registrar un MCP server con credencial sin confirmación) — `src/commands/connect.ts:720`.

### Tools expuestos por el MCP server

**102 operaciones totales** (no ~30 — la cifra real casi triplica la estimación), definidas como el array plano `operations: Operation[]` en `src/core/operations.ts:5316-5401` y transformadas 1:1 a `McpToolDef` (JSON Schema) por `buildToolDefs()` — `src/mcp/tool-defs.ts:40-54`. **No hay filtrado por transporte a nivel de lista**: tanto stdio (`src/mcp/server.ts:27-29`) como HTTP exponen el mismo array completo; el control de acceso ocurre **por-llamada**, no por-listado, vía `scope` + `localOnly` chequeados en el dispatcher / `serve-http.ts` (p. ej. `get_recent_transcripts` es `localOnly: true` y rechaza tráfico HTTP-borne en tool-list time según su propio comentario, `src/core/operations.ts:3624`).

El shape `Operation` (interfaz fuente de verdad) vive en `src/core/operations.ts:589-619`: `name`, `description`, `params`, `handler`, `mutating?`, **`scope?: 'read'|'write'|'admin'|'sources_admin'|'users_admin'`** (comentario dice 5, el código real añade `'agent'` como 6º vía `as any` en `submit_agent` — `src/core/operations.ts:605,2900`), `localOnly?`, `cliHints?`.

Tabla completa (las 102), agrupadas por la categorización oficial del propio array `operations` (comentarios `// Page CRUD`, `// Search`, etc. en `src/core/operations.ts:5317-5400`):

<!-- TOTAL: 102 -->

| # | Tool | Categoría | Qué hace | Scope | archivo:línea |
|---|------|-----------|----------|-------|----------------|
| 1 | `get_page` | Page CRUD | Read a page by slug (supports optional fuzzy matching). Soft-deleted pages are hidden by default; pass include_deleted: true to surface them with deleted_at populated (see ... | read | `src/core/operations.ts:623` |
| 2 | `put_page` | Page CRUD | Write/update a page (markdown with frontmatter). Chunks, embeds, reconciles tags, and (when auto_link/auto_timeline are enabled) extracts + reconciles graph links and timel... | write | `src/core/operations.ts:724` |
| 3 | `delete_page` | Page CRUD | Soft-delete a page. The row is hidden from search and from get_page/list_pages, but is recoverable via restore_page within 72h. The autopilot purge phase hard-deletes after... | write | `src/core/operations.ts:1282` |
| 4 | `restore_page` | Page CRUD (soft-delete) | v0.26.5 — restore a soft-deleted page (clear deleted_at). Returns success only if the page was actually soft-deleted. After this op, the page reappears in search and in get... | write | `src/core/operations.ts:1315` |
| 5 | `purge_deleted_pages` | Page CRUD (soft-delete) | v0.26.5 — admin-only. Hard-deletes pages whose deleted_at is older than older_than_hours (default 72). Cascades through content_chunks, page_links, chunk_relations. Local C... | admin | `src/core/operations.ts:1342` |
| 6 | `list_pages` | Page CRUD | List pages with optional filters. For 'what's recent' questions, use sort=updated_desc instead of semantic search. | read | `src/core/operations.ts:1363` |
| 7 | `search` | Search | Keyword full-text search. For code-symbol questions prefer code_callers/code_callees/code_def/code_refs (structural, not text chunks). | read | `src/core/operations.ts:1419` |
| 8 | `query` | Search | Hybrid search (vector + keyword + multi-query expansion). For personal/emotional questions prefer get_recent_salience/find_anomalies/get_recent_transcripts. | read | `src/core/operations.ts:1478` |
| 9 | `takes_list` | Takes + think | List takes (typed/weighted/attributed claims) filtered by holder/kind/active/etc. | read | `src/core/operations.ts:1715` |
| 10 | `takes_search` | Takes + think | Keyword search across takes (pg_trgm similarity over claim text). | read | `src/core/operations.ts:1747` |
| 11 | `takes_scorecard` | Calibration aggregates | Calibration scorecard for resolved bets: counts, accuracy, Brier (correct vs incorrect only), partial_rate. | read | `src/core/operations.ts:1772` |
| 12 | `takes_calibration` | Calibration aggregates | Calibration curve: resolved correct/incorrect bets binned by stated weight; observed vs predicted per bucket. | read | `src/core/operations.ts:1800` |
| 13 | `think` | Takes + think | Multi-hop synthesis across pages + takes + graph. Pulls relevant evidence and produces a cited answer with conflict + gap analysis. | write | `src/core/operations.ts:1820` |
| 14 | `add_tag` | Tags | Add tag to page | write | `src/core/operations.ts:1891` |
| 15 | `remove_tag` | Tags | Remove tag from page | write | `src/core/operations.ts:1910` |
| 16 | `get_tags` | Tags | List tags for a page | read | `src/core/operations.ts:1928` |
| 17 | `add_link` | Links/Graph | Create link between pages | write | `src/core/operations.ts:1960` |
| 18 | `remove_link` | Links/Graph | Remove link between pages | write | `src/core/operations.ts:2001` |
| 19 | `get_links` | Links/Graph | List outgoing links from a page | read | `src/core/operations.ts:2028` |
| 20 | `get_backlinks` | Links/Graph | List incoming links to a page | read | `src/core/operations.ts:2044` |
| 21 | `list_link_sources` | Links/Graph | List distinct link_source provenances in the brain with edge counts (e.g. citation-graph, manual, markdown) | read | `src/core/operations.ts:2060` |
| 22 | `traverse_graph` | Links/Graph | Traverse link graph from a page. With link_type/direction, returns edges (GraphPath[]) instead of nodes. | read | `src/core/operations.ts:2086` |
| 23 | `add_timeline_entry` | Timeline | Add timeline entry to a page | write | `src/core/operations.ts:2122` |
| 24 | `get_timeline` | Timeline | Get timeline entries for a page | read | `src/core/operations.ts:2165` |
| 25 | `get_stats` | Admin | Brain statistics (page count, chunk count, etc.) | admin | `src/core/operations.ts:2182` |
| 26 | `get_health` | Admin | Brain health dashboard (embed coverage, stale pages, orphans) | admin | `src/core/operations.ts:2193` |
| 27 | `get_brain_identity` | Identity (thin-client) | Brain identity + counters for thin-client banner. Returns version, engine kind, and page/chunk counts. Read-scope. | read | `src/core/operations.ts:2217` |
| 28 | `list_skills` | Skill catalog | List the skills this brain publishes (prose instruction sets, not code) with triggers + usable/unavailable tools. Read-scope; gated by mcp.publish_skills. | read | `src/core/operations.ts:2259` |
| 29 | `get_skill` | Skill catalog | Fetch one skill's full prose instructions by name, plus usable_tools/unavailable_tools. Read-scope; gated by mcp.publish_skills. | read | `src/core/operations.ts:2281` |
| 30 | `list_brain_skillpack` | Skill catalog | List brain-resident skillpacks this brain ships (per-source). Returns each pack's skills, one-line descriptions, the schema pack it targets + whether that matches this brai... | read | `src/core/operations.ts:2317` |
| 31 | `advisor` | Skill catalog | Ranked, read-only "what to do next" for this brain: version drift, pending migrations, schema-pack issues, stalled jobs, usage-shape gaps, and setup smells. Each finding ha... | read | `src/core/operations.ts:2336` |
| 32 | `get_status_snapshot` | Status snapshot | Snapshot for `gbrain status` thin-client mode: sync freshness + last cycle. Admin-scope. | admin | `src/core/operations.ts:2408` |
| 33 | `run_doctor` | Admin | Run brain health checks and return a structured DoctorReport (thin-client doctor surface). | admin | `src/core/operations.ts:2475` |
| 34 | `get_versions` | Admin | Page version history | read | `src/core/operations.ts:2487` |
| 35 | `revert_version` | Admin | Revert page to a previous version | write | `src/core/operations.ts:2508` |
| 36 | `sync_brain` | Sync | Sync git repo to brain (incremental) | admin | `src/core/operations.ts:2532` |
| 37 | `put_raw_data` | Raw data | Store raw API response data for a page | write | `src/core/operations.ts:2560` |
| 38 | `get_raw_data` | Raw data | Retrieve raw data for a page | read | `src/core/operations.ts:2579` |
| 39 | `resolve_slugs` | Resolution & chunks | Fuzzy-resolve a partial slug to matching page slugs | read | `src/core/operations.ts:2596` |
| 40 | `get_chunks` | Resolution & chunks | Get content chunks for a page | read | `src/core/operations.ts:2608` |
| 41 | `log_ingest` | Ingest log | Log an ingestion event | write | `src/core/operations.ts:2624` |
| 42 | `get_ingest_log` | Ingest log | Get recent ingestion log entries | read | `src/core/operations.ts:2647` |
| 43 | `file_list` | Files | List stored files | admin | `src/core/operations.ts:2666` |
| 44 | `file_upload` | Files | Upload a file to storage | admin | `src/core/operations.ts:2684` |
| 45 | `file_url` | Files | Get a URL for a stored file | admin | `src/core/operations.ts:2768` |
| 46 | `submit_job` | Jobs (Minions) | Submit a background job to the Minions queue. Built-in types: sync, embed, lint, import, extract, backlinks, autopilot-cycle. The `shell` type is CLI-only and rejected over... | admin | `src/core/operations.ts:2789` |
| 47 | `submit_agent` | Agent dispatch | Submit an LLM agent job that the worker dispatches via the gateway-native tool loop. Requires the `agent` OAuth scope. Tools, source, slug prefixes, max concurrency, and da... | agent | `src/core/operations.ts:2888` |
| 48 | `get_job` | Jobs (Minions) | Get job status and details by ID | admin | `src/core/operations.ts:3044` |
| 49 | `list_jobs` | Jobs (Minions) | List jobs with optional filters | admin | `src/core/operations.ts:3060` |
| 50 | `cancel_job` | Jobs (Minions) | Cancel a waiting, active, or delayed job | admin | `src/core/operations.ts:3082` |
| 51 | `retry_job` | Jobs (Minions) | Re-queue a failed or dead job for retry | admin | `src/core/operations.ts:3100` |
| 52 | `get_job_progress` | Jobs (Minions) | Get structured progress for a running job | admin | `src/core/operations.ts:3118` |
| 53 | `pause_job` | Jobs (Minions) | Pause a waiting, active, or delayed job | admin | `src/core/operations.ts:3134` |
| 54 | `resume_job` | Jobs (Minions) | Resume a paused job back to waiting | admin | `src/core/operations.ts:3150` |
| 55 | `replay_job` | Jobs (Minions) | Replay a completed/failed/dead job, optionally with modified data | admin | `src/core/operations.ts:3166` |
| 56 | `send_job_message` | Jobs (Minions) | Send a sidechannel message to a running job's inbox | admin | `src/core/operations.ts:3184` |
| 57 | `find_orphans` | Orphans | Find pages with no inbound wikilinks. Essential for content enrichment cycles. | read | `src/core/operations.ts:3205` |
| 58 | `get_calibration_profile` | Calibration | Read the active calibration profile for a holder. Returns the latest row from calibration_profiles (per-source, per-holder) including Brier score, accuracy, pattern stateme... | read | `src/core/operations.ts:3233` |
| 59 | `get_recent_salience` | Salience/anomalies | Pages recently touched, ranked by emotional + activity salience (deterministic emotional_weight + take density + recency decay). For 'what's going on' questions instead of ... | read | `src/core/operations.ts:3259` |
| 60 | `volunteer_context` | Push-based context | Push-based context: volunteer brain pages relevant to a rolling conversation window WITHOUT being asked. Zero-LLM, confidence-gated (alias 0.9 / exact-title 0.8 / slug-suff... | read | `src/core/operations.ts:3299` |
| 61 | `find_anomalies` | Salience/anomalies | Statistical anomalies in recent page activity grouped by cohort (tag/type) — surfaces patterns the user wouldn't have searched for. | read | `src/core/operations.ts:3390` |
| 62 | `find_experts` | Experts routing | Answers 'who in my brain knows about X' — ranked person/company pages by expertise depth + relationship recency + salience. | read | `src/core/operations.ts:3419` |
| 63 | `find_contradictions` | Contradictions | Return suspected-contradiction findings from the most recent `gbrain eval suspected-contradictions` probe run (cached; does not trigger a new probe). | read | `src/core/operations.ts:3466` |
| 64 | `find_trajectory` | Trajectory | Chronological claim trajectory for an entity: typed metric values over time + auto-detected regressions + narrative drift score. | read | `src/core/operations.ts:3532` |
| 65 | `get_recent_transcripts` | Salience/anomalies | One-line summaries of recent raw conversation transcripts (canonical source for the user's own state). Local-only — rejects remote MCP/HTTP callers. | read | `src/core/operations.ts:3624` |
| 66 | `whoami` | Whoami + sources mgmt | Introspect the calling identity. Returns one of three transport shapes: {transport: "oauth", client_id, client_name, scopes, expires_at}, {transport: "legacy", token_name, ... | read | `src/core/operations.ts:3664` |
| 67 | `sources_add` | Whoami + sources mgmt | Register a new source. Supports either --path (existing v0.17 behavior) or --url (v0.28 federated remote-clone path: parses the URL through the SSRF gate, clones into $GBRA... | sources_admin | `src/core/operations.ts:3715` |
| 68 | `sources_list` | Whoami + sources mgmt | List registered sources with page counts and remote_url. v0.28 surfaces the new remote_url field so a remote MCP caller can confirm a source is managed by clone+pull rather... | read | `src/core/operations.ts:3792` |
| 69 | `sources_remove` | Whoami + sources mgmt | Hard-remove a source (cascades pages/chunks/embeddings). Refuses to delete the auto-managed clone dir unless its resolved path is confined under $GBRAIN_HOME/clones/ (realp... | sources_admin | `src/core/operations.ts:3813` |
| 70 | `sources_status` | Whoami + sources mgmt | Per-source diagnostic. Returns clone_state ("healthy" \| "missing" \| "not-a-dir" \| "no-git" \| "url-drift" \| "corrupted" \| "not-applicable") so a remote MCP caller can diagno... | read | `src/core/operations.ts:3847` |
| 71 | `extract_facts` | Hot memory (facts) | v0.31: extract personal-knowledge facts (events, preferences, commitments, beliefs) from a conversation turn into the per-source hot memory. Sanitizes turn_text via INJECTI... | write | `src/core/operations.ts:3869` |
| 72 | `recall` | Hot memory (facts) | v0.31: query per-source hot memory (facts table). Filters by entity / since / session. Remote callers see only visibility=world facts. Returns most-recent first. v0.32 adds... | read | `src/core/operations.ts:3925` |
| 73 | `forget_fact` | Hot memory (facts) | v0.32.2: forget a fact. Rewrites the page's `## Facts` fence to strike through the row and set valid_until=today (the DB's expired_at derives via valid_until + now() on the... | write | `src/core/operations.ts:4038` |
| 74 | `code_callers` | Code intel | BEFORE editing a function, find every direct caller from the tree-sitter call graph — sizes the blast radius of a change. | read | `src/core/operations.ts:4108` |
| 75 | `code_callees` | Code intel | Forward call-graph view: what does this symbol call (DB/HTTP/file I/O)? Use when tracing behavior or planning an extract/inline. | read | `src/core/operations.ts:4139` |
| 76 | `code_def` | Code intel | Where is this symbol defined? One row per definition site (function/class/type/interface/enum/struct/trait/module/contract). | read | `src/core/operations.ts:4169` |
| 77 | `code_refs` | Code intel | Every reference to a symbol across the codebase (comments, strings, imports, type annotations too) — for renames/deprecations. | read | `src/core/operations.ts:4192` |
| 78 | `code_blast` | Code intel (recursive) | BEFORE editing any function, run code_blast with the symbol name to surface every transitive caller grouped by depth (direct → 2-hop → 3-hop). Use this during plan-mode to ... | read | `src/core/operations.ts:4217` |
| 79 | `code_flow` | Code intel (recursive) | When tracing how a request flows through the codebase from entry point to side effect (DB write, HTTP call, file I/O), run code_flow from the entry point. Returns ordered e... | read | `src/core/operations.ts:4256` |
| 80 | `code_traversal_cache_clear` | Code intel admin | Clear cached code_blast / code_flow traversal results. Source-scoped by default; pass all_sources=true to wipe everything (D8 destructive-guard). | admin | `src/core/operations.ts:4294` |
| 81 | `search_by_image` | Cross-modal search | v0.36 cross-modal Phase 2: image-as-query retrieval. Accepts a local path (CLI), data: URI, or http(s):// URL (SSRF-defended). Returns visually-similar image chunks plus an... | read | `src/core/operations.ts:4325` |
| 82 | `get_active_schema_pack` | Schema Cathedral | v0.40.6.0: cheap identity packet for the active schema pack. Returns {pack_name, version, sha8, page_types_count, link_types_count, primitive_summary, source_tier}. Useful ... | read | `src/core/operations.ts:4480` |
| 83 | `list_schema_packs` | Schema Cathedral | v0.40.6.0: list installed schema packs (bundled + user-installed). Returns {bundled: string[], installed: string[]}. Read-only directory listing. | read | `src/core/operations.ts:4510` |
| 84 | `schema_stats` | Schema Cathedral | v0.40.6.0: per-type page counts + typed-coverage from the DB. Returns {schema_version:1, pack_identity, aggregate, per_source, dead_prefixes}. Multi-source aware via ctx.so... | read | `src/core/operations.ts:4534` |
| 85 | `schema_lint` | Schema Cathedral | v0.40.6.0: lint the active (or named) schema pack. File-plane rules only over MCP — the with_db option is rejected for remote callers (DB-aware rules require local CLI). Re... | read | `src/core/operations.ts:4549` |
| 86 | `schema_graph` | Schema Cathedral | v0.40.6.0: schema pack graph as JSON edges. Returns {nodes: [{name, primitive}], edges: [{from, verb, to}]} derived from link_types inference + frontmatter_links. | read | `src/core/operations.ts:4587` |
| 87 | `schema_explain_type` | Schema Cathedral | v0.40.6.0: resolved settings for a single page_type in the active pack. Returns {pack, type, primitive, path_prefixes, aliases, extractable, expert_routing}. | read | `src/core/operations.ts:4615` |
| 88 | `schema_review_orphans` | Schema Cathedral | v0.40.6.0: list pages with no active-pack type match. Returns {orphan_count, orphans: [{slug, source_id}]}. | read | `src/core/operations.ts:4633` |
| 89 | `schema_apply_mutations` | Schema Cathedral | v0.40.7.0: batched schema pack mutation. ATOMIC: all mutations succeed or all roll back. Audit log records one batch_id. Admin scope; NOT localOnly so remote agents (your O... | admin | `src/core/operations.ts:4668` |
| 90 | `reload_schema_pack` | Schema Cathedral | v0.40.6.0: flush the in-process schema pack cache so the next loadActivePack re-reads from disk. Cascades through extends-chain (codex C6). Admin scope; NOT localOnly. Retu... | admin | `src/core/operations.ts:4805` |
| 91 | `run_onboard` | Onboard | Probe brain health + optionally submit onboard remediations. Admin scope required. Protected handlers (LLM-bearing) require run_protected_onboard scope ADDITIONALLY. | admin | `src/core/operations.ts:4844` |
| 92 | `run_skillopt` | SkillOpt | Run SkillOpt against a single skill. Admin scope; mutating; rate-limited per-skill via DB lock. See gbrain skillopt CLI for the full flag surface. | admin | `src/core/operations.ts:4930` |
| 93 | `chronicle_day` | Life Chronicle | Life Chronicle: events + timeline entries on a given day (or ISO week), chronological, each row backlinks to its source page. | read | `src/core/operations.ts:5055` |
| 94 | `chronicle_on_this_day` | Life Chronicle | Life Chronicle: events from the same calendar day in PRIOR years ("on this day"). CLI: `gbrain on-this-day [--date YYYY-MM-DD]`. | read | `src/core/operations.ts:5083` |
| 95 | `chronicle_since` | Life Chronicle | Life Chronicle: events + timeline entries on or after a date, optionally filtered by event kind. CLI: `gbrain since <date> [--kind commitment]`. | read | `src/core/operations.ts:5101` |
| 96 | `chronicle_last_seen` | Life Chronicle | Life Chronicle: when an entity was last seen (its own timeline rows OR an event's `who`). Returns last_date + days_ago. | read | `src/core/operations.ts:5122` |
| 97 | `ontology_get` | Life Chronicle | Life Chronicle: current resolved per-entity ontology (dimension -> value) at `asof`, with provenance + confidence + validity. | read | `src/core/operations.ts:5141` |
| 98 | `ontology_propose` | Life Chronicle | Life Chronicle: record one ontology observation (entity has dimension=value), sourced + confidence-weighted + bi-temporal. Idempotent on (entity,dimension,value,source). A ... | write | `src/core/operations.ts:5166` |
| 99 | `ontology_dimensions` | Life Chronicle | Life Chronicle meta-ontology: which dimensions the brain tracks across entities, with entity + observation counts. CLI: `gbrain ontology-dimensions`. | read | `src/core/operations.ts:5200` |
| 100 | `ontology_conflicts` | Life Chronicle | Life Chronicle: dimensions with ≥2 distinct current values from ≥2 provenances (genuine disagreement, not temporal supersession). CLI: `gbrain ontology-contradictions`. | read | `src/core/operations.ts:5211` |
| 101 | `volunteer_chronicle` | Life Chronicle | Life Chronicle agent-orientation: the recent timeline (last N days) + the current validity-resolved ontology for the named entities, in one zero-LLM payload, so an agent or... | read | `src/core/operations.ts:5235` |
| 102 | `chronicle_backfill` | Life Chronicle | Life Chronicle: sweep existing meeting/conversation/calendar pages into timeline events by enqueuing chronicle_extract jobs (one per eligible page). --dry-run counts withou... | admin | `src/core/operations.ts:5264` |

**Notas de dispatch compartido** (stdio y HTTP usan el MISMO módulo para evitar drift — `src/mcp/dispatch.ts:1-7`):
- `dispatchToolCall()` resuelve la operación, valida params contra `op.params` (tipo + requeridos), construye `OperationContext`, invoca el handler, serializa el resultado/error siempre como JSON `{content:[{type:'text',text}], isError?}` — `src/mcp/dispatch.ts:222-283`.
- `buildOperationContext()` — `sourceId` cae a `'default'` si el caller no resolvió uno; `remote` por defecto `true` (CLI local pasa `false`) — `src/mcp/dispatch.ts:195-214`.
- Los logs de request MCP se **redactan** por diseño: solo se registra la forma del request (qué op, qué keys DECLARADAS del schema fueron pasadas, tamaño en buckets de 1KB) — nunca los valores — para que notas privadas de personas/deals no queden en `mcp_request_log` ni en el feed SSE del admin. Bypass explícito vía `--log-full-params` con warning ruidoso — `src/mcp/dispatch.ts:75-168`.
- `_meta.brain_hot_memory`: cada respuesta de tool-call exitosa puede llevar metadata inyectada best-effort (`metaHook`) con "hot memory" relevante — absorbe errores, nunca rompe la llamada — `src/mcp/dispatch.ts:14-28,255-267`.

━━━

## §obsidian

### `link_resolution.global_basename`

**Qué hace exactamente**: cuando está en `true`, un wikilink "pelado" `[[nombre]]` que NO cae dentro del whitelist de directorios de entidad (`DIR_PATTERN` — ver abajo) y que por tanto normalmente se descartaría, se resuelve contra el **basename** (último segmento tras `/`, o el slug entero si no tiene `/`) de TODAS las páginas del brain (scoped a un solo `source_id`, ver más abajo). Cada página cuyo basename matchea emite **una arista de grafo separada** tipo `wikilink_basename` con `linkSource: 'wikilink-resolved'`.

- Definición del flag y su propia cadena de resolución (3 niveles: env override → DB config → default `false`) — `src/core/link-extraction.ts:1203-1229` (`isGlobalBasenameEnabled`):
  1. `GBRAIN_LINK_RESOLUTION_GLOBAL_BASENAME=1` (env, operator override)
  2. `engine.getConfig('link_resolution.global_basename')` (DB plane, `gbrain config set link_resolution.global_basename true`)
  3. default `false` — **opt-in, apagado en brains existentes**.
- Constante del tipo de arista: `WIKILINK_BASENAME_LINK_TYPE = 'wikilink_basename'` — `src/core/link-extraction.ts:74`.
- El índice basename→slug[] se construye UNA vez por resolver-instance (`buildBasenameIndex`) con 3 keys por slug: tail crudo, tail lowercase, tail slugificado — `src/core/link-extraction.ts:835-861`. Query estable (orden por longitud de slug, luego lexical) vía `queryBasenameIndex` — `src/core/link-extraction.ts:863-870`.
- Consumido en `extractPageLinks()` — `src/core/link-extraction.ts:465-521`, específicamente el branch `ref.needsResolution` en líneas `484-508`: si el flag está apagado O el resolver no implementa `resolveBasenameMatches`, el ref se descarta silenciosamente (back-compat pre-v0.40.8.2).
- **Multi-match es por diseño**: un wikilink puede resolver a VARIAS páginas con el mismo basename — se emite una arista por cada match (`src/core/link-extraction.ts:496-506`). Auto-loop guard: si un match resuelve a la propia página, se descarta (`matched === slug`) — `src/core/link-extraction.ts:499`.
- **Scoping por source (no cross-source)**: el índice se construye vía `engine.getAllSlugs({sourceId})` cuando el resolver conoce el source — comentario explícito en `src/core/link-extraction.ts:911-916`:
  > "getAllSlugs({sourceId}) keeps wikilink resolution from spanning unrelated sources — a bare [[name]] must NOT resolve to a same-tail page in a DIFFERENT source and create a cross-source edge. #972 is 'global basename across folders,' not 'cross-source federation.'"
  Esto es **directamente relevante para la frontera personal⊥Korvex**: si Second Brain y Company Brain viven como 2 `sources` dentro de UN `brain`, un `[[nota]]` ambiguo en Second Brain NUNCA resolverá silenciosamente contra una página de Company Brain — está aislado por diseño a nivel de motor, no solo por convención.
- Invocado en runtime real desde `put_page` (auto-link on write) — `src/core/operations.ts:1136-1145` — y desde `gbrain extract` (batch) — `src/commands/extract.ts:972,1085,1239,1315-1396`.
- Reconciliación: las aristas `wikilink-resolved` SON reconciliables (se borran si el wikilink desaparece de la página o si el flag se apaga después) — a diferencia de aristas `manual` que nunca se tocan — `src/core/operations.ts:1192-1203`.

### Qué tipos de wikilink resuelve

Cuatro regex en cascada sobre el contenido (después de `stripCodeBlocks`, así que wikilinks dentro de fences/inline-code NUNCA se extraen):

1. **Markdown link a entidad**: `[Nombre](people/slug.md)` o `[Nombre](../people/slug)` — `ENTITY_REF_RE`, `src/core/link-extraction.ts:98-101`.
2. **Wikilink calificado por source**: `[[source-id:dir/slug]]` o con alias `[[source-id:dir/slug|Texto]]` — pin explícito de source, ignora el fallback local-first — `QUALIFIED_WIKILINK_RE`, `src/core/link-extraction.ts:111-131`.
3. **Wikilink Obsidian estándar dentro del whitelist de directorios** (`DIR_PATTERN` = `people|companies|meetings|concepts|deal|civic|project|projects|source|media|yc|tech|finance|personal|openclaw|entities`): `[[people/alice-chen]]` o `[[people/alice-chen|Alice]]` — `WIKILINK_RE`, `src/core/link-extraction.ts:86,111-114`.
4. **Wikilink genérico "pelado"** (issue #972, cualquier texto sin gate de `DIR_PATTERN`, p. ej. `[[Fast-Weigh]]`, `[[2026-05-07-cost-plan]]`): capturado con `needsResolution: true`, solo se materializa en arista si `global_basename` está prendido — `WIKILINK_GENERIC_RE`, `src/core/link-extraction.ts:133-154`.

En los 4 casos: **alias con pipe (`|Texto`) se soporta y se descarta correctamente** (el texto de display no participa en la resolución, solo el slug/target — fix explícito para el caso `[[struktura|the project]]` que debe resolver `struktura`, no "the project" — `src/core/link-extraction.ts:488-491`).

### Qué NO resuelve (y riesgos concretos)

1. **Headings (`#heading`) — se STRIPPEAN, no se distinguen**. Los 4 regex capturan y descartan el segmento `#...` sin registrar a qué heading apunta: `(?:#[^|\]]*?)?` en las 4 definiciones (`src/core/link-extraction.ts:99,112,129,154`). Un `[[nota#Sección 3]]` resuelve exactamente igual que `[[nota]]` — se pierde la granularidad de sub-página.

2. **Block references (`^blockid`) — mismo destino que los headings**. Obsidian usa `#^blockid` para referencias a bloque; como el patrón de anchor es `#[^|\]]*?` (cualquier cosa tras `#`), el prefijo `^` cae dentro de la misma captura descartada. **No hay tratamiento especial de block refs en absoluto** — se tratan como un heading más y se pierden.

3. **Embeds (`![[archivo.png]]`, `![[nota#^bloque]]`) — NO se distinguen de wikilinks normales**. Ninguno de los 4 regex excluye el prefijo `!` de un embed Obsidian. En la práctica esto es benigno funcionalmente para adjuntos binarios (el basename `archivo.png` no matcheará ningún slug de página real, así que `resolveBasenameMatches` devuelve `[]` y el ref se descarta silenciosamente — `src/core/link-extraction.ts:493`), pero SÍ es un riesgo de ruido/costo: cada embed de imagen en un vault real dispara un intento de resolución que nunca hace match, y si alguna vez una página se nombra igual que un adjunto (`daily-note.png` vs `daily-note.md`), podría producir una arista falsa.

4. **Basenames duplicados — riesgo real y ya instrumentado por gbrain mismo**. El propio `doctor` de gbrain tiene un check dedicado (`link_resolution_opportunity`) que escanea hasta 1000 páginas recientes, cuenta wikilinks "pelados" y cuántos resolverían bajo `global_basename`, y emite un **warning** si ≥5 matches Y ≥20% de los wikilinks pelados tienen match — `src/commands/doctor.ts:1082-1180`. Esto confirma que el propio equipo de gbrain considera la ambigüedad de basename un riesgo real de UX en vaults grandes, no un caso de esquina.
   - **Riesgo concreto para un vault Obsidian real y grande** (como el Second Brain de Eduardo): notas con basenames genéricos repetidos entre carpetas (`README.md` en múltiples proyectos, notas diarias con patrones similares, plantillas, notas tipo "Untitled") producirían, al activar `global_basename`, una **explosión combinatoria de aristas `wikilink_basename`** — un solo `[[resumen]]` podría resolver a 5-10 páginas distintas de dominios no relacionados (Korvex, universidad, salud, finanzas), contaminando el grafo con conexiones espurias entre brains/áreas que NO deberían estar vinculadas semánticamente.
   - **Mitigante ya presente**: el scoping por `sourceId` (punto anterior) limita el radio de la ambigüedad a un solo source — si Second Brain y Company Brain son sources separados, la explosión de basenames de uno NUNCA contaminará al otro. Pero SÍ puede ocurrir DENTRO de un mismo source con carpetas grandes (p. ej. dentro del propio Second Brain entre `03-projects/` y `05-knowledge/`).
   - El flag está **apagado por defecto** en brains existentes — el riesgo solo se activa si ebrain decide encenderlo explícitamente vía `gbrain config set link_resolution.global_basename true`.

5. **Rutas ambiguas por basename duplicado no tienen desambiguación por proximidad/carpeta** — a diferencia de Obsidian nativo (que sí tiane heurísticas de "same folder first" en algunas versiones), gbrain simplemente devuelve TODOS los matches sin preferencia posicional; el único criterio de orden es longitud de slug + alfabético (`basenameSort`, `src/core/link-extraction.ts:839-841`), no "misma carpeta que el origen" ni "más reciente".

━━━

## §hallazgos-que-cambian-el-plan

1. **gbrain ya resuelve la pregunta "1 brain con 2 sources vs 2 brains separados" con un mecanismo nativo de doble eje — no hay que elegir a nivel de motor.** Existen DOS registros independientes: `sources` (dentro de una DB, tabla `sources`, resolución vía `--source`/`GBRAIN_SOURCE`/`.gbrain-source`) y `mounts` (entre DBs, archivo `~/.gbrain/mounts.json`, resolución vía `--brain`/`GBRAIN_BRAIN_ID`/`.gbrain-mount`) — `src/core/brain-resolver.ts:1-20`, `src/core/brain-registry.ts:1-23,52-86`. Para la frontera personal⊥Korvex, la decisión real es de **política**, no de capacidad: ¿un solo brain con 2 sources federados/no-federados, o 2 brains montados? Recomendación basada en lo leído: 2 sources dentro de 1 brain si se quiere que `find_experts`/`think`/búsqueda puedan cruzar personal↔Korvex cuando sea útil (con `federated: false` por default en el source personal para que NO aparezca en cross-source search salvo pedido explícito); 2 brains separados (mounts) si se quiere aislamiento HTTP-level distinto (tokens OAuth completamente distintos por brain) — el mecanismo de mounts es más nuevo (PR 0, "solo direct-transport mounts soportados", HTTP MCP mounts vienen en "PR 2" según el propio comentario — `src/core/brain-registry.ts:9-11` — posible inmadurez).

2. **La cadena de 6 tiers no es una sola implementación — es un patrón repetido 3+ veces** (source, brain, model, +schema-pack con 7). Diseñar ebrain para leer/honrar esta convención (flag > env > dotfile > path-match > default > fallback) da consistencia gratis con cómo gbrain ya resuelve TODO, incluida la futura resolución de "qué brain estoy tocando desde este terminal de Claude Code".

3. **El aislamiento cross-source de `global_basename` (scoped por `sourceId`, issue #972 P1) es la garantía anti-exfiltración-cross-brain más concreta que encontré.** Confirma que un wikilink ambiguo en Second Brain nunca resolverá silenciosamente hacia Company Brain SI están separados como sources distintos dentro del mismo brain. Pero esta garantía es SOLO sobre wikilink-resolution — no cubre `query`/`search`/`think` que si se llaman con `all_sources=true` (solo permitido para "trusted local callers") sí pueden abarcar todo — `src/core/operations.ts:397-531` (comentario sobre `resolveRequestedScope`, "empty scope: span everything only for trusted local callers; a remote caller... must NOT get cross-source results"). **Para el scoping de queries de ebrain**: cualquier terminal de Claude Code conectado vía MCP remoto (HTTP + OAuth) hereda el scope de su token; solo callers locales (`ctx.remote === false`, es decir, CLI directo) pueden pedir `all_sources`. Si ebrain expone el MCP de gbrain a N terminales vía HTTP, cada terminal necesita su propio token/scope acotado a los sources que debe ver — el bearer-token largo-vivo de `gbrain connect` (default) es "full-access": para N terminales con distinta confianza (p. ej. un terminal de trabajo Korvex vs uno personal) hace falta usar el path `--oauth` con scopes acotados por cliente, no el bearer simple.

4. **102 tools MCP, no ~30 — la superficie real es 3.4x la estimada.** Todas están en un solo array plano sin segmentación por transporte a nivel de listado (`ListToolsRequestSchema` devuelve las 102 tanto en stdio como HTTP) — el control de acceso vive en `scope`+`localOnly` por-llamada, evaluado en el dispatcher/`serve-http.ts`, NO en qué se anuncia. Para N terminales de Claude Code esto significa: cualquier terminal conectado ve el mismo catálogo de 102 tools en `tools/list` independientemente de sus permisos reales; el rechazo ocurre recién al invocar (`tools/call`) si el scope del token no alcanza. Esto es aceptable por spec MCP pero vale la pena que ebrain lo sepa: **no hay "vista filtrada" del catálogo por cliente**, solo enforcement en el momento de la llamada.

5. **`get_recent_transcripts` es un ejemplo ya-resuelto por gbrain de "localOnly rejects remote at tool-list time"** (`src/core/operations.ts:3624`, comentario) — contradice ligeramente el hallazgo #4 (dice que SÍ filtra en tool-list). Vale la pena que quien audite esto verifique en `serve-http.ts` si `localOnly` efectivamente filtra el `tools/list` para HTTP (filtrado real) o solo bloquea en `tools/call` (enforcement tardío) — no llegué a confirmar el mecanismo exacto de filtrado de listado en `serve-http.ts` dentro del alcance de esta tarea; **esto queda como cabo suelto para una pasada de auditoría dedicada a `src/commands/serve-http.ts`** (2176 líneas, no leído completo).

6. **Riesgo de ruido de grafo si se activa `global_basename` sobre el Second Brain real**: el propio `doctor` de gbrain (`link_resolution_opportunity`) es la herramienta correcta para medir el radio de la ambigüedad ANTES de prender el flag — recomendaría correr `gbrain doctor` (o el check aislado) sobre el Second Brain real antes de decidir si conviene activarlo, dado el patrón de notas con basenames repetidos típico de un vault Obsidian orgánico de años.

7. **Embeds Obsidian (`![[...]]`) no se distinguen de wikilinks** — riesgo menor pero real de intentos de resolución espurios contra adjuntos binarios (imágenes, PDFs) en el vault; no rompe nada hoy (el basename no matchea ninguna página real → se descarta silenciosamente) pero es una imprecisión a tener en cuenta si ebrain construye tooling propio sobre el grafo de gbrain y espera que `wikilink_basename` signifique exclusivamente "referencia a otra nota".

━━━

*Fin del reporte. 3 secciones + hallazgos. Todas las afirmaciones citan `archivo:línea` real dentro de `vendor/gbrain` en el pin SHA `a25209bbb2bacf1b88e06fd5282b27f1bf4a3e7a`.*
