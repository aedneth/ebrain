# discovery/01-gbrain-engine.md — gbrain engine, ingeniería inversa

> Alcance: SOLO LECTURA sobre `~/eBrain/vendor/gbrain`, pin SHA `a25209bbb2bacf1b88e06fd5282b27f1bf4a3e7a` (VERSION `0.42.58.0`, confirmado vía `git rev-parse HEAD` y `cat VERSION`). Todas las rutas de este reporte son relativas a `vendor/gbrain/`. Ningún archivo de vendor fue modificado; ningún CLI/instalador fue ejecutado.

━━━

## §overview

**Qué es.** gbrain es un motor RAG + grafo de conocimiento personal/de equipo. Persiste páginas markdown (con frontmatter) en una base relacional (Postgres+pgvector o PGLite embebido), las trocea y embebe, extrae enlaces tipados sin LLM ("self-wiring knowledge graph"), y ofrece dos superficies de consulta: `search` (retrieval crudo) y `think` (síntesis con citas + gap analysis). Se opera vía CLI (`gbrain`), o vía MCP (stdio o HTTP) para clientes tipo Claude Code/Codex/Cursor/ChatGPT. README.md:1-20, 253-288.

**Instalación / inicialización.**
- CLI standalone: `bun install -g github:garrytan/gbrain` → `gbrain init --pglite` (bootstrap PGLite en ~2s, sin Docker/servidor) → `gbrain doctor` → `gbrain import ~/notes/` → `gbrain query "..."`. README.md:119-129.
- Wiring a un agente de código: `gbrain init --pglite && claude mcp add gbrain -- gbrain serve` (zero server/tunnel). README.md:92-97.
- Remoto: `gbrain connect https://host/mcp --token gbrain_xxx [--install]`. README.md:99-104, 135-141.
- Servidor: `gbrain serve` (stdio MCP) o `gbrain serve --http` (HTTP MCP + OAuth 2.1 + admin dashboard en `/admin`). README.md:146-151.
- Troubleshooting de dims/embeddings documentado in extenso (`gbrain doctor` autodiagnostica y sugiere el comando exacto de reparación). README.md:292-315.
- No existe `docs/INSTALL.md` como tal; el equivalente real para setup guiado por agente es `INSTALL_FOR_AGENTS.md` (raíz) — confirma la calibración ya registrada en `discovery/00-environment.md:62`.

**Comandos CLI principales** (de `src/commands/`, 132 archivos de comando; lista no exhaustiva de los citados por SPRINT): `init`, `doctor`, `import`, `search`, `think` (via `src/core/think/`, expuesto como comando `call`/`think`), `capture`, `sync`, `dream`, `autopilot`, `embed`, `reindex*`, `schema*`, `jobs*`, `serve`/`serve-http`, `connect`, `config`, `models`, `providers`, `whoknows`, `brainstorm`, `graph-query`, `backlinks`, `orphans`, `takes`, `export`/`import`. Ver `src/commands/*.ts` (152 archivos listados por `find`).

**Motores soportados — dos, un contrato.** `PGLiteEngine` (Postgres 17 vía WASM, cero-config, arranque ~2s) y `PostgresEngine` (Postgres+pgvector, self-hosted o Supabase). Ambos implementan la interfaz `BrainEngine`:
- `src/core/postgres-engine.ts:98` — `export class PostgresEngine implements BrainEngine`
- `src/core/pglite-engine.ts` — `class PGLiteEngine implements BrainEngine` (confirmado por grep; ver docs/architecture/KEY_FILES.md:30).
- README.md posiciona PGLite para "personal brains up to ~50K pages" y Postgres/Supabase para "shared / large / multi-machine". README.md:282-284. El propio brain de producción de Garry Tan (146,646 páginas) corre necesariamente sobre Postgres/Supabase, no PGLite — ver §hallazgos.

**Reranker / embeddings por defecto (dato de código, no de README):** el modelo de embedding de fábrica es **ZeroEntropy `zembed-1` a 1280 dimensiones**, NO OpenAI — `src/core/ai/defaults.ts:20-21` (`DEFAULT_EMBEDDING_MODEL = 'zeroentropyai:zembed-1'`, `DEFAULT_EMBEDDING_DIMENSIONS = 1280`). El reranker por defecto en modo `balanced`/`tokenmax` es ZeroEntropy `zerank-2` **hospedado** (llamada HTTP, sin peso local) — `src/core/search/mode.ts:337-346`. Solo el recipe opt-in `llama-server-reranker` corre un cross-encoder local (Qwen3-Reranker). Ver §hallazgos para el riesgo en máquinas de poca RAM.

━━━

## §engine-contract

Interfaz `BrainEngine` en `src/core/engine.ts:649-2200` (1551 líneas). **Conteo real: 147 firmas de método únicas** (`grep -c` sobre el bloque de la interfaz), NO ~47 como afirma README.md:282 ("defines ~47 operations"). Ambos motores (`PostgresEngine`, `PGLiteEngine`) implementan las 147. Ver §hallazgos — esta es la desviación más grande del reporte respecto al plan.

Tabla completa, agrupada por subsistema (todas citan `src/core/engine.ts:<línea>`):

### Conexión / transacciones (6)
| Operación | Firma resumida | Propósito | Línea |
|---|---|---|---|
| connect | `connect(config: EngineConfig): Promise<void>` | Abre conexión/pool | 654 |
| disconnect | `disconnect(): Promise<void>` | Cierra conexión | 655 |
| reconnect | `reconnect(ctx?): Promise<void>` | Reconstruye conexión tras error (self-heal de pooler) | 664 |
| initSchema | `initSchema(): Promise<void>` | Aplica DDL/migraciones | 665 |
| transaction | `transaction<T>(fn): Promise<T>` | Wrapper transaccional genérico | 666 |
| withReservedConnection | `withReservedConnection<T>(fn): Promise<T>` | Reserva 1 conexión física (advisory locks) | 672 |

### Páginas — CRUD y queries (17)
| Operación | Firma resumida | Propósito | Línea |
|---|---|---|---|
| getPage | `getPage(slug, opts?): Promise<Page\|null>` | Lee una página | 682 |
| putPage | `putPage(slug, page, opts?): Promise<Page>` | Upsert de página | 690 |
| findDuplicatePage | `findDuplicatePage?(...)` (opcional) | Pre-check de dedup por identidad (v0.41.13) | 716 |
| deletePage | `deletePage(slug, opts?): Promise<void>` | Soft-delete de 1 página | 742 |
| deletePages | `deletePages(slugs[], opts): Promise<string[]>` | Soft-delete batch | 773 |
| resolveSlugsByPaths | `resolveSlugsByPaths(...)` | Resuelve slug por ruta de archivo (sync) | 791 |
| softDeletePage | `softDeletePage(slug, opts?)` | Marca `deleted_at` | 801 |
| restorePage | `restorePage(slug, opts?): Promise<boolean>` | Revierte soft-delete | 807 |
| purgeDeletedPages | `purgeDeletedPages(olderThanHours)` | Hard-delete tras ventana de recuperación | 813 |
| listPages | `listPages(filters?): Promise<Page[]>` | Listado filtrado | 818 |
| resolveSlugs | `resolveSlugs(partial, opts?)` | Autocompletado/resolución parcial de slug | 832 |
| getAllSlugs | `getAllSlugs(opts?): Promise<Set<string>>` | Set completo de slugs (auto-link, dedup) | 843 |
| listAllPageRefs | `listAllPageRefs()` | Refs `{slug, source_id}` de todo el brain | 857 |
| listAllSources | `listAllSources(opts?)` | Lista de `sources` (tenancy) | 875 |
| updateSourceConfig | `updateSourceConfig(sourceId, patch)` | Actualiza `sources.config` JSONB | 895 |
| listPrefixSampledPages | `listPrefixSampledPages(opts): Promise<DomainBankRow[]>` | Muestreo estratificado por prefijo | 914 |
| listCorpusSample | `listCorpusSample(opts): Promise<DomainBankRow[]>` | Muestreo de corpus para evals | 925 |

### Búsqueda cruda (2)
| searchKeyword | `searchKeyword(query, opts?)` | BM25/FTS keyword | 928 |
| searchVector | `searchVector(embedding, opts?)` | Similaridad HNSW/pgvector | 929 |

### Chunks / embeddings (10)
| Operación | Propósito | Línea |
|---|---|---|
| getEmbeddingsByChunkIds | Lee vectores por id de chunk | 943 |
| upsertChunks | Escribe/reemplaza chunks de una página | 960 |
| getChunks | Lee chunks de una página | 967 |
| countStaleChunks | Cuenta chunks sin embedding vigente | 978 |
| sumStaleChunkChars | Suma de caracteres pendientes de embed | 993 |
| setPageEmbeddingSignature | Marca firma de modelo/dims usada | 999 |
| invalidateStaleSignatureEmbeddings | Invalida embeddings tras cambio de proveedor/dims | 1009 |
| listStaleChunks | Lista candidatos a re-embed | 1026 |
| deleteChunks | Purga chunks (contenido vaciado/quarantine) | 1047 |
| getChunksWithEmbeddings | Lee chunks + vector (debug/reindex) | 2022 |

### Staleness de extracción (3)
| countStalePagesForExtraction / listStalePagesForExtraction / markPagesExtractedBatch | Gestión del watermark `links_extracted_at` | 1061 / 1069 / 1090 |

### Links / grafo (13)
| Operación | Propósito | Línea |
|---|---|---|
| addLink | Crea 1 edge tipado | 1104 |
| addLinksBatch | Batch insert de edges (self-retry) | 1129 |
| removeLink | Borra 1 edge | 1138 |
| getLinks | Edges salientes de una página | 1161 |
| getBacklinks | Edges entrantes | 1167 |
| listLinkSources | Distribución de `link_source` (provenance) | 1175 |
| findByTitleFuzzy | Match difuso de título (pg_trgm) | 1191 |
| traverseGraph | BFS acotado (`frontierCap`) | 1204 |
| traversePaths | Caminos entre dos nodos | 1218 |
| relationalFanout | Expansión relacional tipada (arma RRF #4, v0.43) | 1242 |
| getBacklinkCounts | Conteo de backlinks por slug (boost de ranking) | 1251 |
| getAdjacencyBoosts | Señal de adyacencia por query (graph signals) | 1277 |
| getContentFlagsByPageIds | Lee marcadores `content_flag`/quarantine | 1286 |

### Fechas / salience / orphans (4)
| getPageTimestamps / getEffectiveDates / getSalienceScores / findOrphanPages | 1297 / 1307 / 1317 / 1332 |

### Tags (3)
| addTag / removeTag / getTags | 1344 / 1345 / 1352 |

### Timeline / chronicle (7)
| addTimelineEntry / addTimelineEntriesBatch / getTimeline / getTimelineForDate / getSince / getOnThisDay / getLastSeen / upsertEventProjection | 1368 / 1385 / 1386 / 1392 / 1394 / 1396 / 1398 / 1405 |

### Ontología (4) — construida sobre la tabla `facts`, no una tabla propia (ver §schema)
| mergeOntologyFact / getOntology / discoverOntologyDimensions / findOntologyConflicts | 1416 / 1418 / 1420 / 1422 |

### Raw data / archivos (5)
| putRawData / getRawData / upsertFile / getFile / listFilesForPage | 1431 / 1437 / 1442 / 1443 / 1444 |

### Takes / calibración (16)
| addTakesBatch / listTakes / searchTakes / searchTakesVector / getTakeEmbeddings / countStaleTakes / listStaleTakes / updateTake / supersedeTake / resolveTake / getScorecard / getCalibrationCurve / addSynthesisEvidence / getDreamVerdict / putDreamVerdict / listActiveTakesForPages | 1466–1595 |

### Contradicciones (5)
| writeContradictionsRun / loadContradictionsTrend / getContradictionCacheEntry / putContradictionCacheEntry / sweepContradictionCache | 1595–1674 |

### Facts / hechos (13)
| insertFact / insertFacts / deleteFactsForPage / expireFact / listFactsByEntity / listFactsSince / listFactsBySession / listSupersessions / countUnconsolidatedFacts / findCandidateDuplicates / consolidateFact / findTrajectory / getFactsHealth | 1695–1838 |

### Versiones (3)
| createVersion / getVersions / revertToVersion | 1846 / 1852 / 1858 |

### Stats / ingest log (4)
| getStats / getHealth / logIngest / getIngestLog | 1861 / 1862 / 1865 / 1866 |

### Slug / alias / mantenimiento (8)
| updateSlug / rewriteLinks / resolveSlugWithAlias / resolveAliases / setPageAliases / refreshPageBody / updatePageContextualRetrievalState / migrateFactsToCanonical | 1875–1998 |

### Config (4)
| getConfig / setConfig / unsetConfig / listConfigKeys | 2005 / 2006 / 2012 / 2018 |

### Escape hatches SQL crudo (2)
| runMigration / executeRaw / executeRawDirect | 2021 / 2033 / 2051 |

### Code intelligence (6)
| addCodeEdges / deleteCodeEdgesForChunks / getCallersOf / getCalleesOf / getEdgesByChunk / searchKeywordChunks | 2066–2114 |

### Eval framework (5)
| logEvalCandidate / listEvalCandidates / deleteEvalCandidatesBefore / logEvalCaptureFailure / listEvalCaptureFailures | 2122–2130 |

### Emocional / enriquecimiento / anomalías (5)
| batchLoadEmotionalInputs / setEmotionalWeightBatch / getRecentSalience / listEnrichCandidates / findAnomalies | 2152–2199 |

**Capa superior (no confundir con el contrato del engine):** `src/core/operations.ts` define **102** objetos `Operation` (`grep -c "^const [a-z_]*: Operation = {" src/core/operations.ts` → 102) — la capa de lógica de negocio/MCP que consume el `BrainEngine`. Ejemplo: la operación `search` (`src/core/operations.ts:1419`) internamente llama `hybridSearchCached` (motor de retrieval), que a su vez llama a `engine.searchKeyword`/`engine.searchVector`. Es decir: **tres capas de conteo distintas** — 147 (engine) / 102 (operations) / un subconjunto expuesto vía MCP según `localOnly` (`src/core/operations.ts:606`). El "~47" y "30+ tools over MCP" de README parecen referirse a versiones anteriores del motor o a capas distintas — ver §hallazgos.

━━━

## §schema

Fuente primaria: `src/schema.sql` (1438 líneas, DDL base para Postgres) — pero **no es el esquema completo**: varias tablas centrales (`facts`, `takes`, `synthesis_evidence`, `code_edges_chunk/symbol` como definición canónica, `drift_decisions`, `query_cache`, `search_telemetry`, `mcp_spend_log`, `calibration_profiles`, `take_proposals`, etc.) viven como migraciones incrementales en `src/core/migrate.ts` (56 bloques `CREATE TABLE IF NOT EXISTS` detectados) y se replican en `src/core/pglite-schema.ts` para PGLite. `schema.sql` es el snapshot bootstrap, no el estado final tras todas las migraciones — ver §hallazgos.

### Tablas principales (columnas clave + índices)

**`sources`** (multi-tenancy, `src/schema.sql:26`) — `id` (citation key), `name`, `local_path`, `config JSONB` (federación + ACL). Índice: `sources_github_repo_idx` (`src/schema.sql:74`).

**`pages`** (`src/schema.sql:85-149`) — `id SERIAL`, `source_id` FK→sources, `slug`, `type`, `page_kind` (`markdown|code|image`), `title`, `compiled_truth`, `timeline`, `frontmatter JSONB`, `content_hash`, `emotional_weight REAL`, `deleted_at` (soft-delete), `effective_date`/`effective_date_source` (salience/recency), `last_retrieved_at` (señal LSD), `links_extracted_at` (watermark de extracción), `contextual_retrieval_mode`/`corpus_generation` (cache de contextual retrieval), `generation BIGINT` (invalidación de cache, trigger `bump_page_generation_fn` en `src/schema.sql:157-176`). UNIQUE `(source_id, slug)`. Índices: `idx_pages_type`, `idx_pages_frontmatter` (GIN), `idx_pages_trgm` (GIN trgm sobre title), `idx_pages_updated_at_desc`, `idx_pages_source_id`, `pages_generation_idx` — `src/schema.sql:195-290`.

**`page_generation_clock`** (`src/schema.sql:218`) — contador global de 1 fila (`id=1 CHECK`), bumped por-statement; substrato del "Layer 1 bookmark" del query cache (arregla el bug de MAX(generation) no avanzando en UPDATE de fila no-MAX ni en DELETE).

**`content_chunks`** (`src/schema.sql:296-343`) — `page_id` FK→pages, `chunk_index`, `chunk_text`, `chunk_source` (`compiled_truth|timeline|fenced_code`), `embedding vector(1536)` (columna base; el runtime usa HALFVEC dinámicamente si el pgvector del host lo soporta, ver `src/core/migrate.ts` ~2270-2280), `model`, campos de código (`language`, `symbol_name`, `symbol_type`, `start_line`, `end_line`, `parent_symbol_path`, `symbol_name_qualified`), `search_vector TSVECTOR` (FTS a nivel de chunk), `modality` (`text|image`), `embedding_image vector(1024)`, `embedding_multimodal vector(1024)`. **Índice HNSW:** `idx_chunks_embedding ON content_chunks USING hnsw (embedding vector_cosine_ops)` (`src/schema.sql:333`) y `idx_chunks_embedding_image` HNSW parcial (`src/schema.sql:339-341`). GIN FTS: `idx_chunks_search_vector` (`src/schema.sql:343`).

**`code_edges_chunk`** / **`code_edges_symbol`** (`src/schema.sql:387-430`) — diseño de dos tablas (resueltos vs. no-resueltos por nombre calificado); `edge_type`, `edge_metadata JSONB`, UNIQUE por (`from,to,edge_type`). Usado por `getCallersOf`/`getCalleesOf` (engine.ts:2083/2093).

**`links`** (`src/schema.sql:464-491`) — `from_page_id`/`to_page_id` FK→pages (self-referencing, edges del grafo), `link_type`, `link_source` (provenance abierta kebab-case: `markdown|frontmatter|mentions|wikilink-resolved|manual|<custom>`), `link_kind` (`plain|typed_ner`), `origin_page_id`/`origin_field` (para reconciliación de edges derivados de frontmatter), `resolution_type` (`qualified|unqualified`). UNIQUE `NULLS NOT DISTINCT (from_page_id, to_page_id, link_type, link_source, origin_page_id)`.

**`tags`** (`src/schema.sql:505`), **`raw_data`** (`:518`), **`timeline_entries`** (`:532-558`, con `event_page_id` para proyección de "Life Chronicle" v0.42.x + dedup UNIQUE parcial), **`page_versions`** (`:563`), **`ingest_log`** (`:581`), **`config`** (`:597`), **`files`** (`:777`, dedup por `content_hash`).

**`facts`** (definida en `src/core/migrate.ts:2288-2321`, NO en `schema.sql` base) — `entity_slug`, `fact`, `kind` (`event|preference|commitment|belief|fact`), `visibility` (`private|world`), `notability` (`high|medium|low`), `valid_from/valid_until/expired_at`, `superseded_by` (self-FK), `confidence REAL`, `embedding VECTOR/HALFVEC(dim)` dinámico, `row_num`/`source_markdown_slug` (fence round-trip v0.32.2). La "ontología" (`mergeOntologyFact`) NO es una tabla separada: usa `facts` con columnas adicionales `dimension`/`value`/`value_hash`/`dim_status` — confirmado en `src/core/postgres-engine.ts:3572-3620` (`INSERT INTO facts (..., dimension, value, value_hash, dim_status, ...)`).

**`takes`** (`src/core/migrate.ts:1191-1220`) — `page_id` FK→pages, `row_num`, `claim`, `kind` (`fact|take|bet|hunch`), `holder`, `weight`, `resolved_*` (outcome/value/unit/source/by), `embedding VECTOR(1536)` + índice HNSW parcial (`idx_takes_embedding_hnsw ... WHERE active AND embedding IS NOT NULL`). UNIQUE `(page_id, row_num)`.

**`synthesis_evidence`** (`src/core/migrate.ts:1225`) — vincula página de síntesis ↔ take citado (`synthesis_page_id`, `take_page_id`, `take_row_num`, `citation_index`).

**`minion_jobs`** (`src/schema.sql:868-911`) — cola de jobs estilo BullMQ: `status` (`waiting|active|completed|failed|delayed|dead|cancelled|waiting-children|paused`), `priority`, `data JSONB`, `max_attempts`/`attempts_made`/`attempts_started`, `backoff_type`/`backoff_delay`/`backoff_jitter`, `lock_token`/`lock_until` (fencing), `parent_job_id` (self-FK, jobs hijos), `on_child_fail`, `tokens_input/output/cache_read`, `idempotency_key` UNIQUE parcial, `timeout_ms`/`timeout_at`. Índice de claim: `idx_minion_jobs_claim ON minion_jobs (queue, priority ASC, created_at ASC) WHERE status='waiting'`.

**`minion_inbox`** (`:927`) — mensajería lateral por job (`job_id`, `sender`, `payload JSONB`, `read_at`). **`minion_attachments`** (`:939`) — blobs por job.

**`dream_verdicts`** (`:1081`), **`gbrain_cycle_locks`** (`:1099`, lock del dream cycle), **`eval_candidates`/`eval_capture_failures`/`eval_takes_quality_runs`/`eval_contradictions_cache`/`eval_contradictions_runs`** (framework de evals), **`calibration_profiles`/`take_proposals`/`take_grade_cache`/`take_nudge_log`** (Hindsight calibration wave v0.36.1.0), **`think_ab_results`** (A/B de `think`).

Otras tablas fuera del snapshot base (en `migrate.ts`, confirmadas por grep): `access_tokens`, `mcp_request_log`, `oauth_clients/tokens/codes`, `budget_ledger/reservations`, `drift_decisions`, `code_traversal_cache`, `query_cache`, `search_telemetry`, `mcp_spend_log`/`mcp_spend_reservations`, `op_checkpoints`/`op_checkpoint_paths`, `minion_lease_pressure_log`/`minion_budget_log`/`minion_self_fix_log`, `take_domain_assignments`, `conversation_parser_llm_cache`, `migration_impact_log`, `slug_aliases`, `page_aliases`, `extract_rollup_7d`, `context_volunteer_events`.

### Diagrama ASCII (relaciones principales)

```
                         ┌───────────┐
                         │  sources  │  (tenancy: 1 fila = 1 brain-within-DB)
                         └─────┬─────┘
                               │ source_id (FK, casi toda tabla de contenido)
                               ▼
     ┌─────────────────────────────────────────────────────────┐
     │                          pages                           │◄────────┐
     │  id · slug · type · frontmatter JSONB · compiled_truth   │         │
     │  generation (cache-invalidation) · deleted_at · ...       │         │ self-FK
     └───┬───────┬────────┬────────┬────────┬────────┬─────────┘         │
         │        │        │        │        │        │                  │
         │        │        │        │        │        │                  │
   page_id  page_id  page_id  page_id  page_id  from/to_page_id ─────────┘
         │        │        │        │        │        │
         ▼        ▼        ▼        ▼        ▼        ▼
   content_  tags   raw_   timeline_ page_    links (edges tipados;
   chunks           data   entries   versions  link_source=provenance)
      │  │                    │
      │  │                    └─ event_page_id → pages (proyección Life Chronicle)
      │  └─ HNSW(embedding) · GIN(search_vector) · symbol_* (code intel)
      │
      ├──< code_edges_chunk  (from_chunk_id, to_chunk_id → content_chunks)
      └──< code_edges_symbol (from_chunk_id → content_chunks; to_symbol_qualified sin resolver)

   facts (entity_slug, dimension/value = "ontología"; source_id FK sources;
          superseded_by = self-FK) ─── independiente de pages (vínculo suave
          vía source_markdown_slug)

   takes (page_id → pages) ──< synthesis_evidence (synthesis_page_id, take_page_id)

   minion_jobs (parent_job_id = self-FK, árbol de jobs hijos)
       ├──< minion_inbox      (job_id)
       └──< minion_attachments(job_id)

   gbrain_cycle_locks · dream_verdicts · calibration_profiles · take_proposals
   query_cache · search_telemetry            (soporte operativo, sin FK a pages)
```

━━━

## §write-path

Pipeline `put_page` → chunking → embedding → auto-link, en orden real de llamada:

1. **`put_page` (operación MCP/CLI)** — `src/core/operations.ts:724-1115`. Valida namespace de subagente, aplica *trust gate* de provenance (`ctx.remote===false` vs stamping del servidor), y en `src/core/operations.ts:835` llama:
2. **`importFromContent(engine, slug, content, opts)`** — `src/core/import-file.ts:220`. Orden interno:
   a. `parseMarkdown(content, slug+'.md', {activePack})` — `src/core/markdown.ts:93`. Infiere `type` desde el schema pack activo o `inferType()` legacy.
   b. Gate anti-injection (v0.42, #1699): si `opts.remote===true` se borran las llaves de frontmatter reservadas al gate (`quarantine`/`content_flag`/`embed_skip`) — `src/core/import-file.ts:316-320`.
   c. `runGuardrails({hook:'file_storage.markdown', ...})` — seam vendor-neutral, observe-only — `src/core/import-file.ts:328`.
   d. **Content-sanity gate**: `assessContentSanity(...)` — clasifica junk/oversize/markup-heavy; puede quarantinear (`QUARANTINE_KEY`) o marcar `EMBED_SKIP_KEY` — `src/core/import-file.ts:342-490`.
   e. Hash de contenido (excluye timestamps de frontmatter) para short-circuit de no-cambio.
   f. **Chunking**: `chunkText(parsed.compiled_truth)` y `chunkText(parsed.timeline)` — `src/core/chunkers/recursive.ts:72` — más `extractFencedChunks(...)` (función local, `src/core/import-file.ts:113`) para bloques de código fenced. Todo esto SOLO si la página no está `embed_skip`/`quarantine` — `src/core/import-file.ts:632-654`.
   g. **Embedding**: `embedBatch(wrappedTexts)` — `src/core/embedding.ts:91` (sub-batches de 100; delega en el AI gateway con adaptive batch splitting). Antes se resuelve el modo de *contextual retrieval* (`none|title|per_chunk_synopsis`) vía `resolveContextualRetrievalMode` y se envuelve el texto con `wrapChunkForEmbedding` — `src/core/import-file.ts:668-707`.
   h. **Transacción** (`engine.transaction`) — `src/core/import-file.ts:723-830`: `tx.createVersion` (si existía) → `tx.putPage(...)` → `tx.updatePageContextualRetrievalState(...)` → `tx.addTag(...)` por cada tag (add-only, v0.41.37.0 #1621) → `tx.upsertChunks(slug, chunks, txOpts)` → `tx.setPageEmbeddingSignature(...)` (si se embebió) → si `chunks.length===0`, `tx.deleteChunks(slug)` (purga stale).
3. **De vuelta en `put_page` (`src/core/operations.ts:900-990`)**:
   - `writePageThrough(...)` — escribe el markdown a disco (write-through DB→archivo), best-effort.
   - **Auto-link**: `runAutoLink(engine, slug, parsedPage, opts)` — `src/core/operations.ts:1115`. Internamente: `extractPageLinks(...)` (`src/core/link-extraction.ts`) resuelve wikilinks/typed-links vía `makeResolver(engine,{mode:'live'})`, filtra contra `engine.getAllSlugs()`, abre una transacción con `pg_advisory_xact_lock(hashtext(slug))` para serializar reconciliaciones concurrentes, reconcilia contra `tx.getLinks`/`tx.getBacklinks` y llama `addLink`/`removeLink`. **Sin llamadas LLM** — solo pattern-matching de `[[wiki/x/y]]` y verbos tipados. Se salta para llamadas remotas MCP no confiables (`ctx.remote!==false && !trustedWorkspace`) por riesgo de inyección de enlaces vía contenido no confiable.
   - **Auto-timeline**: `parseTimelineEntries(...)` + `engine.addTimelineEntriesBatch(...)` — mismo gate de confianza que auto-link.
   - **Facts backstop**: `runFactsBackstop(...)` — `src/core/facts/backstop.ts:135`, encolado (`mode:'queue'`), nunca bloqueante — `src/core/operations.ts:1004-1032`.

━━━

## §read-path

Entrada MCP/CLI: operación `search` (`src/core/operations.ts:1419`, cheap-hybrid, expansion OFF) o el comando `gbrain query`/`think` (control total). Ambos convergen en:

**`hybridSearch(engine, query, opts)`** — `src/core/search/hybrid.ts:809`. Pipeline documentado en cabecera del archivo (`src/core/search/hybrid.ts:2-9`): *keyword + vector → RRF fusion → normalize → boost → cosine re-score → dedup*.

1. Resuelve el modo activo (`loadSearchModeConfig` + `resolveSearchMode`, `src/core/search/mode.ts`) — precedencia per-call → per-key config → `MODE_BUNDLES[cfg.search.mode]` → `MODE_BUNDLES.balanced`.
2. Clasifica intent (`classifyQuery`) → pesos de intent (`weightsForIntent`) sin LLM.
3. Ejecuta `engine.searchKeyword` + `engine.searchVector` (vía `resolvedCol`, columna de embedding resuelta una sola vez).
4. Aplica arma relacional (v0.43, `relationalFanout` como 4ª rama de RRF cuando `relationalRetrieval` está ON) y arma multimodal (`both` mode: texto + imagen).
5. **Fusión RRF**: `rrfFusionWeighted(allLists, ...)` → `rrfFusion(lists, k, applyBoost)` — `src/core/search/hybrid.ts:1860/1903`. Constante `RRF_K = 60` (`src/core/search/hybrid.ts:47`); fórmula `score = Σ 1/(60 + rank_en_lista)`.
6. **`runPostFusionStages(...)`** — `src/core/search/hybrid.ts:432` — aplica en cadena: `applyBacklinkBoost` (:152), `applySalienceBoost` (:229), `applyRecencyBoost` (:261), `applyTitleBoost` (:316), `applyChronicleTypeBoost` (:347), y **graph signals** (`applyGraphSignals`, `src/core/search/graph-signals.ts:289`): adjacency boost ×1.05 (`ADJACENCY_BOOST`, graph-signals.ts:53), cross-source boost ×1.10 (`CROSS_SOURCE_BOOST`, :56), session demote ×0.95 (`SESSION_DEMOTE`, :59) — coinciden exactamente con los valores del README.
7. **Reranker**: `applyReranker` (`src/core/search/rerank.ts`) llama `gateway.rerank()` (`src/core/ai/gateway.ts:3264`) sobre el top `reranker_top_n_in` candidatos; fail-open en cualquier error (auth/timeout/rate-limit) — devuelve orden RRF sin romper la búsqueda. Off en `conservative`; ON en `balanced` (desde v0.36.0.0, D6) y `tokenmax` — `src/core/search/mode.ts:337-346, 425-433`.
8. **Autocut** (`src/core/search/autocut.ts`) y `enforceTokenBudget`/dedup/pool-best-chunk cierran el pipeline.
9. **`hybridSearchCached`** (`src/core/search/hybrid.ts:1569`) envuelve todo con el query cache semántico (umbral de similaridad coseno 0.92 por defecto).

**Modos con nombre** (`SearchMode = 'conservative'|'balanced'|'tokenmax'`, `src/core/search/mode.ts:55-60`): bundles completos en `MODE_BUNDLES` (`:285-430+`) — `conservative` (reranker OFF, tokenBudget 4000, sin graph signals, CR='none'), `balanced` (reranker ON, tokenBudget 12000, graph signals ON, CR='title', autocut ON — **default de facto**), `tokenmax` (expansion LLM ON, reranker ON top_n_in=50, CR='per_chunk_synopsis', sin tokenBudget cap).

**`--explain`**: flag de CLI parseado en `src/core/cli-options.ts:112-114`; en `src/cli.ts:860-868` cambia el formatter de `search`/`query` a `formatResultsExplain` (`src/core/search/explain-formatter.ts:39` en adelante) — imprime atribución por etapa (base RRF+coseno, cada boost multiplicativo con su factor, delta de reranker) leyendo los campos `base_score`/`*_boost` que cada etapa de `runPostFusionStages` estampa en el `SearchResult`.

**Capa de síntesis (`gbrain think`)**: `runThink` — `src/core/think/index.ts:226` — orquesta `runGather` (`src/core/think/gather.ts:97`, reutiliza el mismo `hybridSearch`), arma el prompt (`buildThinkSystemPrompt`/`buildThinkUserMessage`, `src/core/think/prompt.ts:72/155`) pidiendo explícitamente un array `gaps` ("I don't have data on X" — `src/core/think/prompt.ts:13,67`) y resuelve citas inline (`resolveCitations`, `src/core/think/cite-render.ts:112`). Persistencia opcional vía `persistSynthesis` (`src/core/think/index.ts:527`).

━━━

## §schema-packs

Doc de referencia verificado contra código (coincide, sin drift): `docs/architecture/schema-packs.md`.

**Formato del pack**: YAML (`api_version: gbrain-schema-pack-v1`), campos `name`/`version`/`gbrain_min_version`/`extends`/`page_types[].path_prefixes`/`migration_from`. Validado por `src/core/schema-pack/manifest-v1.ts` (Zod schema, `migration_from: MigrationFromSchema.optional()` en `:377`).

**Packs incluidos**: `gbrain-base` (legado, 24 tipos), `gbrain-base-v2` (default desde v0.41.22, 15 tipos DRY/MECE — `src/core/schema-pack/base/gbrain-base-v2.yaml`), `gbrain-recommended` (extiende base con 13 directorios adicionales).

**Resolución de 7 tiers** — implementada en `src/core/schema-pack/load-active.ts:280-292` (`buildResolutionInput`), coincide con la tabla de `docs/architecture/schema-packs.md:78-88`:
1. Per-call `schema_pack` opt (solo CLI local, `ctx.remote===false`)
2. `GBRAIN_SCHEMA_PACK` env (`load-active.ts:282`)
3. Config DB por-source (`schema_pack:source:<id>`)
4. Config DB brain-wide (`schema_pack`)
5. `gbrain.yml` sección `schema:`
6. `~/.gbrain/config.json` campo `schema_pack` (`load-active.ts:284`, `homeConfig`)
7. Default `gbrain-base`

**Subcomandos** (`docs/architecture/schema-packs.md:34-64`, verificados contra `src/core/schema-pack/*.ts`): `detect` → `runDetect` (`src/core/schema-pack/detect.ts:99`), `suggest` → `runSuggest` (`suggest.ts:70`, refinamiento LLM sobre los candidatos de detect), `review-candidates`/`review-orphans` → `runReviewCandidates`/`runReviewOrphans` (`review.ts:39/113`), `use`, `active`, `list`, `validate`, `lint`, `explain`, `graph`, `diff`, `usage` (telemetría D14).

**Migración entre packs (`migration_from:`)**: mecanismo completo en `docs/architecture/pack-upgrade-mechanism.md` (verificado contra `src/core/schema-pack/load-active.ts:188-260` `findPackSuccessors`/`_versionRangeMatches`/`_versionDescCompare`). Un pack declara `migration_from: {pack: gbrain-base, version: "1.x"}` + `mapping_rules:`; el check de onboard (`checkPackUpgradeAvailable`) detecta brains elegibles y dispara el remediation step hacia el **job Minion protegido `unify-types`** (`src/core/schema-pack/unify-types-handler.ts:1-236`, fases: lock advisory `gbrain-unify` → `retype-explicit` → `retype-catch-all` → `page-to-link` → …), ejecutable vía `gbrain jobs submit unify-types --allow-protected --params '{"target_pack":"gbrain-base-v2"}'` (README.md:209).

━━━

## §jobs-and-dreams

**Minions — cola Postgres-native** (`src/core/minions/queue.ts`, clase `MinionQueue`, comentario propio: "inspired by BullMQ" — `:1-9`).

- **Encolado**: `queue.add(name, data, opts)` — `src/core/minions/queue.ts:77`. Escribe fila en `minion_jobs` (status `waiting`, `priority`, `backoff_type/delay/jitter`, `max_attempts`, `idempotency_key` opcional).
- **Claim (crash-safe)**: `claim(lockToken, lockDurationMs, queue, registeredNames)` — `queue.ts:605-636` — `SELECT ... FOR UPDATE SKIP LOCKED` sobre `status='waiting' ORDER BY priority ASC, created_at ASC`, set `lock_token`/`lock_until = now() + duration`. El **token fencing** (`lock_token`) es lo que hace segura la reclamación concurrente: `completeJob`/`failJob`/`renewLock` (`:807/915/1092`) solo aplican si el `lock_token` coincide — un worker muerto que "resucita" tarde no puede pisar el trabajo de otro.
- **Detección de stalls**: `handleTimeouts()` (`:647`) libera jobs `active` con `lock_until < now()` de vuelta a `waiting`; `handleWallClockTimeouts` (`:729`) cubre el caso `timeout_ms IS NULL` con `2 * lockDurationMs * max_stalled`.
- **Jobs hijos**: `parent_job_id` self-FK + `on_child_fail` (`fail_parent|remove_dep|ignore|continue`) + `depth`/`max_children` (cascading timeouts, límite de profundidad de spawn `DEFAULT_MAX_SPAWN_DEPTH=5`, `queue.ts:36`).
- **Subagentes durables (two-phase pending→done)**: `src/core/minions/handlers/subagent.ts` — persiste cada mensaje Anthropic en `subagent_messages` y cada tool call en `subagent_tool_executions` (ledger de dos fases) ANTES de ejecutar el side-effect, de modo que un crash a mitad de tool-call es replay-safe al reanudar (`subagent.ts:734,1067,1108`).
- **Attachments**: `minion_attachments`, cap por defecto 5 MiB (`DEFAULT_MAX_ATTACHMENT_BYTES`, `queue.ts:37`).
- **Rate leases / budget**: `subagent_rate_leases` (tabla), `src/core/minions/lease-cap-controller.ts`, `budget-meter.ts` (ver abajo).

**Dream cycle** — `gbrain dream` (`src/commands/dream.ts:1-25`) es un alias delgado sobre `runCycle` (`src/core/cycle.ts:1406`), el mismo primitivo que usa `gbrain autopilot` para el daemon continuo.

- **Fases** (`ALL_PHASES`, `src/core/cycle.ts:101-140`, orden real de ejecución): `lint → backlinks → sync → synthesize → extract → extract_facts → extract_atoms → resolve_symbol_edges → patterns → synthesize_concepts → recompute_emotional_weight → consolidate → propose_takes → grade_takes → calibration_profile → embed → orphans → purge` (+ fases opt-in: `schema-suggest`, `conversation_facts_backfill`, `enrich_thin`, `skillopt`).
- **Alcance por fase**: `PHASE_SCOPE: Record<CyclePhase, 'source'|'global'|'mixed'>` (`cycle.ts:210`) — separa fases que corren por-source de las globales.
- **Presupuestos por corrida** (`BudgetTracker`, `src/core/cycle/budget-meter.ts:30-172`): cada fase resuelve un `budgetUsd` (config → default) y un `BudgetMeter` rechaza la llamada si `cumulativeUsd + estimatedCost > budgetUsd` (razón `BUDGET_EXHAUSTED`, `:139-156`). Defaults observados por fase: `extract_atoms` → `DEFAULT_BUDGET_USD = 0.3` (`cycle/extract-atoms.ts:55`); `synthesize_concepts` → `1.5` (`cycle/synthesize-concepts.ts:28`); `auto-think`/`drift` → `2.0`/`1.0` vía env override (`cycle/auto-think.ts:75`, `cycle/drift.ts:45`); `conversation_facts_backfill`/`enrich_thin` → `1.0` por-source-por-ciclo (`cycle/conversation-facts-backfill.ts:142`, `cycle/enrich-thin.ts:124`, con cap adicional brain-wide vía `remainingBrainWide`); `skillopt` → cap $0.50/skill + $2.00 brain-wide (`cycle.ts:96,2135`).
- **Locking del ciclo**: tabla `gbrain_cycle_locks` (`schema.sql:1099`) + `cycleLockIdFor(sourceId)` (`cycle.ts:526`) — evita dos `dream`/`autopilot` concurrentes sobre el mismo source.
- **Cron real**: no hay scheduler propio embebido — README documenta el patrón vía cron de SO: `0 2 * * * gbrain dream --json >> log` (README.md:294-315), con flags `--break-lock --all --max-age` para auto-sanar locks huérfanos.

━━━

## §config-surface

Grep sistemático de `process.env.<NOMBRE>` sobre `src/` (143 nombres únicos referenciados; **solo nombres, ningún valor leído**). Tabla agrupada — cita la primera ocurrencia real (`archivo:línea`) por variable; la mayoría tiene 1-3 sitios de lectura adicionales no listados aquí por brevedad.

### Proveedores / claves de API (referenciadas por nombre, nunca impresas)
| Variable | Para qué | Archivo:línea |
|---|---|---|
| ANTHROPIC_API_KEY | Modelo de chat/gateway Anthropic | src/core/config.ts:527 |
| OPENAI_API_KEY | Embeddings/transcripción OpenAI | src/core/transcription.ts:91 |
| ZEROENTROPY_API_KEY | Embeddings + reranker por defecto | src/core/config.ts:528 |
| VOYAGE_API_KEY | Embeddings multimodal | src/commands/providers.ts:285 |
| GOOGLE_GENERATIVE_AI_API_KEY | Gemini | src/commands/providers.ts:283 |
| GROQ_API_KEY | Groq | src/core/transcription.ts:90 |
| DEEPSEEK_API_KEY | DeepSeek | src/commands/providers.ts:286 |
| TOGETHER_API_KEY | Together AI | src/commands/providers.ts:288 |
| DEEPGRAM_API_KEY | Transcripción de voz | src/core/transcription.ts:99 |
| X_API_BEARER_TOKEN | Resolver de tweets (X API) | src/core/resolvers/builtin/x-api/handle-to-tweet.ts:351 |
| GBRAIN_GITHUB_PAT | Operaciones Git sobre el brain repo | src/core/brain-repo-durability.ts:562 |

### Base URLs de proveedores (self-host / proxy)
| LITELLM_BASE_URL / LLAMA_SERVER_BASE_URL / LLAMA_SERVER_RERANKER_BASE_URL / LMSTUDIO_BASE_URL / OLLAMA_BASE_URL / OPENROUTER_BASE_URL | Endpoints locales/proxy para el AI gateway | src/core/ai/build-gateway-config.ts:50-54, src/core/ai/probes.ts:40-57 |

### Base de datos / conexión
| DATABASE_URL / GBRAIN_DATABASE_URL | URL de Postgres (con precedencia: GBRAIN_* gana sobre genérica) | src/core/config.ts:479-480 |
| GBRAIN_DIRECT_DATABASE_URL / GBRAIN_DIRECT_POOL_SIZE / GBRAIN_DISABLE_DIRECT_POOL | Pool directo (bypass de pooler tipo Supavisor) | src/core/connection-manager.ts:175-217 |
| GBRAIN_POOL_SIZE / GBRAIN_MAX_CONNECTIONS | Tamaño de pool | src/core/db.ts:109, src/core/sync-concurrency.ts:178 |
| GBRAIN_PREPARE | Prepared statements toggle | src/core/db.ts:87 |
| GBRAIN_PG_NOTICES | Verbosidad de notices Postgres | src/core/postgres-engine.ts:193 |
| GBRAIN_PGLITE_SNAPSHOT | Ruta de snapshot PGLite | src/core/pglite-engine.ts:283 |
| GBRAIN_NO_RETRY_CONNECT | Desactiva reintentos de conexión | src/cli.ts:2094 |

### Embeddings / búsqueda
| GBRAIN_EMBEDDING_MODEL / GBRAIN_EMBEDDING_DIMENSIONS | Override de modelo/dims de embedding | src/cli.ts:1388-1389 |
| GBRAIN_EMBEDDING_MULTIMODAL / GBRAIN_EMBEDDING_MULTIMODAL_MODEL | Config multimodal | src/cli.ts:2151, src/core/config.ts:542 |
| GBRAIN_EMBEDDING_IMAGE_OCR / GBRAIN_EMBEDDING_IMAGE_OCR_MODEL | OCR de imágenes en pipeline multimodal | src/cli.ts:2154-2157 |
| GBRAIN_EMBED_CONCURRENCY / GBRAIN_EMBED_TIME_BUDGET_MS | Concurrencia y presupuesto de tiempo de `gbrain embed` | src/commands/embed.ts:680,874 |
| GBRAIN_QUERY_EMBED_TIMEOUT_MS | Timeout de embed de query en hybridSearch | src/core/search/hybrid.ts:750 |
| GBRAIN_SEARCH_DEBUG / GBRAIN_SEARCH_EXCLUDE / GBRAIN_SOURCE_BOOST / GBRAIN_RECENCY_DECAY / GBRAIN_NO_MODE_SWITCH_UX | Tuning/observabilidad de búsqueda | src/core/search/hybrid.ts:133, source-boost.ts:110-126, recency-decay.ts:194, mode-switch-ux.ts:247 |
| GBRAIN_EXPANSION_MODEL / GBRAIN_CHAT_MODEL / GBRAIN_CHAT_FALLBACK_CHAIN | Modelos por rol | src/core/config.ts:531-533 |
| GBRAIN_RETRIEVAL_REFLEX / GBRAIN_RETRIEVAL_REFLEX_WINDOW_TURNS | Reflejo de retrieval automático por turno | src/core/config.ts:548-551 |

### Ingesta / sync / sanidad de contenido
| GBRAIN_NO_SANITY / GBRAIN_NO_JUNK_PATTERNS / GBRAIN_MAX_MARKUP_RATIO / GBRAIN_PAGE_WARN_BYTES / GBRAIN_PAGE_BLOCK_BYTES | Kill-switch y umbrales del content-sanity gate | src/core/import-file.ts:396, src/core/config.ts:566-580 |
| GBRAIN_MAX_FENCES_PER_PAGE / GBRAIN_MAX_WALK_DEPTH / GBRAIN_MAX_REGEX_INPUT_CHARS | Límites anti-ReDoS/anti-DoS en import | src/core/import-file.ts:105, src/commands/import.ts:478, src/core/schema-pack/redos-guard.ts:48 |
| GBRAIN_SYNC_TRACE / GBRAIN_SYNC_CHECKPOINT_EVERY / GBRAIN_SYNC_CHECKPOINT_SECONDS / GBRAIN_SYNC_MAX_CHECKPOINT_FAILURES / GBRAIN_SYNC_YIELD_EVERY / GBRAIN_SYNC_NO_EXTRACT_NUDGE | Tracing y checkpointing de `gbrain sync` | src/commands/sync.ts:128-4632 |
| GBRAIN_INGEST_MAX_BYTES | Límite de tamaño en webhook `/ingest` | src/commands/serve-http.ts:1781 |
| GBRAIN_EXTRACT_STALE_BATCH / GBRAIN_EXTRACT_TIME_BUDGET_MS / GBRAIN_EXTRACTION_LAG_FAIL_PCT | Batching de `gbrain extract` + gate de doctor | src/commands/extract.ts:81-85, src/commands/doctor.ts:3129 |
| GBRAIN_LINK_RESOLUTION_GLOBAL_BASENAME | Resolución global de wikilinks bare por basename (opt-in) | src/core/link-extraction.ts:1220 |
| GBRAIN_GIT_ALLOW_FILE_TRANSPORT / GBRAIN_ALLOW_PRIVATE_REMOTES | Gate de seguridad para transporte git | src/core/git-remote.ts:111,320 |

### Minions / cola / cycle
| GBRAIN_ALLOW_SHELL_JOBS | Habilita el handler `shell` (job protegido) | src/core/minions/handlers/shell.ts:13 |
| GBRAIN_ANTHROPIC_MAX_INFLIGHT | Cap de llamadas Anthropic concurrentes en subagentes | src/core/minions/handlers/subagent.ts:86 |
| GBRAIN_CONTEXTUAL_HAIKU_RPM | Rate-limit del reindex contextual per-chunk | src/core/minions/handlers/contextual-reindex-per-chunk.ts:61 |
| GBRAIN_SUPERVISED / GBRAIN_SUPERVISOR_HARD_STOP_CRASHES / GBRAIN_SUPERVISOR_PID_FILE | Modo supervisor de workers | src/core/minions/worker.ts:351, supervisor.ts:133-202 |
| GBRAIN_WEDGED_QUEUE_WARN_MINUTES / GBRAIN_QUEUE_WAITING_THRESHOLD | Alertas de doctor sobre cola atascada | src/commands/jobs.ts:609, src/commands/doctor.ts:6941 |
| GBRAIN_PHANTOM_REDIRECT_LIMIT | Cap del phantom-redirect (fase de cycle) | src/core/cycle/phantom-redirect.ts:529 |
| GBRAIN_PROGRESSIVE_BATCH_AUTO / _DISABLED / _STAGES | Progressive-batch orchestrator | src/core/progressive-batch/orchestrator.ts:107-405 |
| GBRAIN_BATCH_PROMPT_THRESHOLD_MIN / _USD | Umbral del prompt de confirmación de coste batch | src/core/minions/batch-projection.ts:181-182 |

### Rutas / entorno / identidad de proceso
| GBRAIN_HOME / HOME | Raíz de config (`~/.gbrain`) | src/core/preferences.ts:17,40 |
| GBRAIN_MOUNTS_PATH / GBRAIN_RECIPES_DIR / GBRAIN_CLAW_SCENARIOS_DIR / GBRAIN_PLUGIN_PATH / GBRAIN_AUDIT_DIR | Rutas de datos/plugins/auditoría | src/core/brain-registry.ts:47, src/commands/integrations.ts:350, src/core/claw-test/scenarios.ts:40, src/core/minions/plugin-loader.ts:82, src/core/audit-week-file.ts:56 |
| GBRAIN_BRAIN_ID / GBRAIN_SOURCE / GBRAIN_SCHEMA_PACK | Identidad de brain/source/pack activos | src/core/brain-resolver.ts:108, src/core/source-resolver.ts:95, src/core/schema-pack/op-trust-gate.ts:105 |
| GBRAIN_REMOTE_MCP_URL / _ISSUER_URL / _CLIENT_ID / _CLIENT_SECRET / _ADMIN_BOOTSTRAP_TOKEN | Config de `gbrain connect` (OAuth remoto) | src/commands/init.ts:574-576, src/commands/serve-http.ts:525, src/core/doctor-remote.ts:122 |
| NODE_ENV / MCP_STDIO / RAILWAY_ENVIRONMENT / RENDER / FLY_APP_NAME / HOSTNAME | Detección de entorno de ejecución/plataforma | src/cli.ts:139, src/mcp/server.ts:114, src/commands/autopilot.ts:1084-1086, src/core/schema-pack/pack-lock.ts:190 |

### Feature flags "GBRAIN_NO_*" / nudges (silenciar avisos)
| GBRAIN_NO_BANNER / GBRAIN_BANNER / GBRAIN_NO_BRAINSTORM_PREVIEW / GBRAIN_NO_CODE_MODEL_NUDGE / GBRAIN_NO_GITIGNORE / GBRAIN_NO_ONBOARD_NUDGE / GBRAIN_NO_PROBE_PROMPT / GBRAIN_NO_REEMBED / GBRAIN_NO_SKILL_NAG / GBRAIN_NO_SOLE_NON_DEFAULT_NUDGE | Suprimen banners/nudges específicos de UX de CLI | src/cli.ts:636-638, varios `src/commands/*.ts` |

*(143 variables totales identificadas; tabla arriba cubre ~110 con cita directa; el resto — timeouts finos como `GBRAIN_MIGRATE_BACKOFF_MS`, `GBRAIN_TEARDOWN_DEADLINE_MS`, `GBRAIN_FLUSH_GRACE_MS`, `GBRAIN_POST_UPGRADE_TIMEOUT_MS`, `GBRAIN_DOCTOR_FM_TIMEOUT_MS`, `GBRAIN_CHUNKER_TIMEOUT_MS`, `GBRAIN_LOCK_STEAL_GRACE_SECONDS` — siguen el mismo patrón de override de timing/backoff y están listados íntegramente en el archivo de trabajo del worker, disponible bajo pedido.)*

No se leyó ningún `.env`/`.env.*` ni contenido de credenciales; solo se referenciaron NOMBRES de variables tal como aparecen literalmente en el código fuente (`process.env.<NOMBRE>`).

━━━

## §hallazgos-que-cambian-el-plan

1. **El contrato `BrainEngine` tiene 147 operaciones, no ~47.** README.md:282 dice "defines ~47 operations both engines implement". El conteo real por grep sobre `src/core/engine.ts:649-2200` da **147 firmas de método únicas**, verificado dos veces (con y sin colapsar overloads). Esto es 3× el número que el plan probablemente usó como referencia de superficie a federar. Impacto directo en el diseño de la federación CKIS: cualquier capa de adaptador/proxy sobre `BrainEngine` necesita cubrir 147 métodos, no 47, y muchos tienen semántica no trivial (advisory locks, batch self-retry, generation-based cache invalidation).

2. **Tres capas de conteo distintas, fácil de confundir.** `BrainEngine` (147, capa de storage) ≠ `Operation` en `src/core/operations.ts` (102, capa de lógica/MCP, `grep -c` confirmado) ≠ "30+ tools over MCP" de README (subset con `localOnly !== true`). Al diseñar la federación, decidir explícitamente en cuál capa se integra CKIS (probablemente la capa `Operation`, no `BrainEngine` directamente, dado que ahí vive el trust-gating de remoto/local).

3. **El embedding provider por defecto NO es OpenAI — es ZeroEntropy (`zembed-1`, 1280 dims), hospedado.** `src/core/ai/defaults.ts:20-21`. El reranker por defecto en modo `balanced`/`tokenmax` también es ZeroEntropy `zerank-2` **hospedado** (llamada HTTP), sin costo de RAM local. Esto es una buena noticia para la máquina de 4GB del entorno (`discovery/00-environment.md`: Celeron N4120, 3.6 GiB RAM total, ~334 MiB libres al momento del setup): el camino por defecto NO requiere cargar pesos de embedding/reranking localmente. El riesgo aparece solo si se activa el recipe opt-in `llama-server-reranker` (cross-encoder local tipo Qwen3-Reranker) — evitarlo en esta máquina.

4. **PGLite está explícitamente limitado a "~50K pages" (README.md:282-284) y es single-writer** (confirmado: `gbrain serve` compite por el lock de escritura con un `sync` grande corriendo en simultáneo, ver troubleshooting README.md:396-399). El propio brain de producción de Garry Tan (146,646 páginas, mencionado en README.md:5) corre necesariamente sobre Postgres/Supabase — el PGLite local NO es el motor recomendado a esa escala. Esto refuerza la calibración ya hecha en `discovery/00-environment.md:10,24` ("embeddings/DB van a Supabase, nunca local") — el propio código y docs de gbrain corroboran esa decisión independientemente.

5. **`schema.sql` NO es el esquema completo.** Es un snapshot de bootstrap; tablas centrales al negocio (`facts`, `takes`, `synthesis_evidence`, `calibration_profiles`, `query_cache`, `search_telemetry`, `drift_decisions`, y ~40 tablas más) viven exclusivamente como bloques `CREATE TABLE IF NOT EXISTS` dentro de `src/core/migrate.ts` (56 ocurrencias) y se replican a mano en `src/core/pglite-schema.ts` para PGLite. Cualquier intento de "leer el schema" para la federación debe recorrer `migrate.ts` completo (5946 líneas de `pglite-engine.ts` + 6057 de `postgres-engine.ts` sugieren que ambos motores tienen SQL bastante distinto por debajo del contrato común), no solo `schema.sql`.

6. **La "ontología" (`mergeOntologyFact`/`getOntology`) no es una tabla propia — vive dentro de `facts`** vía columnas `dimension`/`value`/`value_hash`/`dim_status`. Un diseño de federación que asuma una tabla `ontology` separada estaría equivocado; la fuente de verdad real está en `facts` con filtros por `dimension`.

7. **La dimensión de embedding en `content_chunks.embedding` es `vector(1536)` en el DDL estático (`src/schema.sql:302`, comentario de modelo default `text-embedding-3-large`)**, pero el runtime real usa HALFVEC dinámico y 1280 dims por defecto (ZeroEntropy) vía lógica en `migrate.ts` (~línea 2270-2280: `useHalfvec` se decide según la versión de pgvector del host). El `schema.sql` estático es aspiracional/legacy, no la verdad de una instalación fresca — importante para no asumir 1536 fijo al diseñar cualquier capa de compatibilidad de vectores.

8. **Los 16 recipes de embedding del README (README.md:275) son exactos** — verificado: 17 archivos en `src/core/ai/recipes/` menos `index.ts` menos `llama-server-reranker.ts` (que es solo-reranker, no embedding) = 16. Sin desviación aquí.

9. **Riesgo operativo para agentes remotos**: el auto-link y auto-timeline se DESACTIVAN completamente para llamadas MCP remotas no confiables (`ctx.remote !== false`, `src/core/operations.ts:950-952`) — por diseño, para evitar que contenido no confiable inyecte enlaces salientes arbitrarios vía prompt injection en el cuerpo de la página. Si la federación CKIS opera como cliente MCP remoto (no local CLI), el grafo de auto-link NUNCA se construirá automáticamente en ese camino — habría que decidir explícitamente un "trusted workspace" (allow-list de prefijos de slug, mismo mecanismo que usa el propio dream cycle, `src/core/operations.ts:941-949`) o resignarse a construir enlaces manualmente vía `add_link`.

10. **Todos los escritos de estado sensible (`GBRAIN_ADMIN_BOOTSTRAP_TOKEN`, `GBRAIN_REMOTE_CLIENT_SECRET`, cualquier `*_API_KEY`) son solo nombres, nunca valores, en este reporte** — cumplido según regla dura de seguridad.

━━━

**Cierre de auditoría interna:** archivo escrito una sola vez en `~/eBrain/discovery/01-gbrain-engine.md`; ningún otro archivo tocado; ningún comando de `gbrain`/`bun install` ejecutado; ninguna lectura de `.env*`/`*.pem`/credenciales.
