# CHANGELOG — ebrain

Una línea por cambio estructural (disciplina Company Brain). El más reciente arriba.

---

## 2026-07-11 — F2.4: MCP registrado + cross-source resuelto vía overlay `ebrain-q`

- **MCP `ebrain` registrado** (user scope, machine-wide) → `✔ Connected`. Launcher `~/.config/ebrain/gbrain-mcp` (cwd neutral + `.env` + `MCP_STDIO=1`). Tools `mcp__ebrain__*` en toda sesión nueva de Claude Code.
- **Corrección honesta al ADR-001:** el cross-source **nativo NO funciona** en pin a25209b — sonda MCP JSON-RPC probó que `{all_sources:true}` y `{source_id:"__all__"}` devuelven `[]` (v1 limitation, `relational-recall.ts:73`). Per-source sí funciona (CLI + MCP).
- **Overlay `~/.config/ebrain/ebrain-q`**: fan-out que consulta cada source federado y mergea por score → el cross-source instantáneo que gbrain no tiene en v1. Validado mezclando second-brain + company-brain. **Es el valor de ebrain sobre gbrain.**
- Roster carril-código (graphify, no gbrain): 5 CLIs + museum-of-us + busnet (read-only) + korvex-* (read-only); brisas + dekko = deny.

---

## 2026-07-11 — F2 (en curso): topología decidida (ADR-001) + Company Brain federado

**Tipo:** federación CKIS (Fase 2) — decisión de arquitectura + segundo source vivo.

- **ADR-001 — topología de brains:** **1 brain · N sources** (hub de federación único). Mounts descartados (fragmentarían el cross-source, e inmaduros). Decisión de frontera tomada con Eduardo: ebrain = indexador único de TODOS los brains, cross-source e instantáneo.
- **Modelo de aislamiento personal⊥Korvex** (GUARDRAILS §3): triple defensa — (1) token-scope de callers remotos (garantía dura, fase MCP remoto, diferida), (2) `.gbrain-source` pinning por repo, (3) wikilink scoping #972. El flag `federated` NO es la frontera de seguridad.
- **Cross-source (empírico, pin a25209b):** vive en la capa MCP/Operation (`operations.ts:478`: `all_sources || source_id==='__all__'`). El **`--source __all__` del CLI NO funciona** (regex `[a-z0-9-]` rechaza `_`; "v1 limitation" en `relational-recall.ts:73`). → interfaz real de ebrain = MCP (donde cruza); terminal crudo tendrá wrapper fan-out.
- **company-brain federado:** source registrado (`federated:true`) → `~/Documents/Company Brain`; **163 páginas · 801 chunks · 100% embebido · ~$0.06**. second-brain también federado. Total del brain: **1024 páginas · 4474 chunks · 100% embebidos**.
- **Aislamiento validado en vivo:** query personal `--source company-brain` → **cero notas personales**; `--source second-brain` → sí (aisladas). secret-scan company-brain 0/0.
- **Redirect graphify (Eduardo):** NO embeber Dev Brain crudo (2610 `.md`). graphify ya construye el grafo de código y se reconstruye solo → federar salidas destiladas / puentear su MCP (reforma SPRINT 2.3 + 2.6).
- **⚠ GUARDRAILS §2:** Dev Brain contiene `code-graph/brisas-del-golfo/` (commiteado) → `git ls-files --cached` no lo excluye por ignore. Exclusión por **registro sub-path**, no glob. brisas queda fuera de ebrain por default (decisión explícita de Eduardo para incluir su grafo, con alcance).

---

## 2026-07-11 — F1: Motor vivo + Second Brain indexado

**Tipo:** puesta en marcha del motor gbrain (Fase 1 del SPRINT) — PGLite local, ingesta completa del Second Brain.

- Motor **PGLite local** (`~/.gbrain/brain.pglite/`); Supabase diferido (free-tier lleno, migración lossless cuando Pro).
- Embeddings **`openai:text-embedding-3-large` @1536d** (Matryoshka; Eduardo pidió mejor calidad que 3-small; bajo el límite HNSW 2000d de pgvector). Schema pack `gbrain-base-v2`.
- Launcher `~/.config/ebrain/gbrain-run` (chmod 700) resuelve el **gotcha crítico**: `bun` auto-carga el `.env` del cwd → el `.env` del vault pisaba `OPENAI_API_KEY` (400 Bad Request en todo embedding). Fix: `cd` a dir neutral antes de correr. Documentado en `docs/runbook.md`.
- Ingesta: **861 páginas · 3673 chunks · 3673 embebidos (100%) · 490 links · 901 tags** · 33 tipos inferidos. `link_resolution.global_basename=true` (0→490 edges; DIR_PATTERN no cubre carpetas CKIS).
- Integridad: vault INTACTO byte-a-byte post-ingesta; secret-scan CLEAN (0 `sk-ant-`, 0 pooler URLs). Costo real **~$0.30–0.35** (muy bajo el cap $5).
- Validación (`docs/validation-f1.md`): 10 queries reales 5 ES/5 EN → **10/10 relevantes, 8/10 exactas top-1**, bilingüe simétrico. `gbrain think` diferido (requiere chat model → F4).
- **Diferido:** schema pack custom `ebrain-ckis-v1` (base-v2 suficiente); Company Brain sin embeber (es F2). → **Desbloquea F2** (federación).

---

## 2026-07-10 — F0: Setup + Reverse Engineering local completo

**Tipo:** setup de workspace + ingeniería inversa de gbrain/gstack (Fase 0 del SPRINT).

- Workspace `~/eBrain` creado (`vendor/ discovery/ overlay/ cli/ docs/ scripts/`), `git init` rama `main`, `.gitignore`, aislado del repo de `$HOME`. CLAUDE.md + README.md a raíz.
- Clonados full-depth: **gbrain** `a25209b` (v0.42.58.0, 337 commits) y **gstack** `7c9df1c` (v1.60.1.0, 329 commits). Pins en `discovery/00-environment.md`.
- 4 workers Sonnet produjeron 5 reportes de discovery (`00`–`04`), auditados por Opus con spot-checks contra código real → los 5 `[AUDIT_PASS]`.
- **Calibraciones del plan** (ver detalle en ULTRAPLAN §0.1 y ARCHITECTURE §9):
  - Contrato `BrainEngine` = **147 ops** (no ~47); capa `Operation` = **102** (= superficie MCP completa, no "30+"). Federación se integra en la capa `Operation` (ahí vive el trust-gating remoto/local).
  - Embedder por defecto = **ZeroEntropy `zembed-1` 1280d, hospedado** (no OpenAI); reranker ZeroEntropy hospedado. Cero peso local → ideal 4GB. OpenRouter es base-URL del gateway LLM pero NO tiene API de embeddings (confirmado).
  - **Trust triad = storage-flag skill-time, NO guard runtime.** `deny` frena el sync pre-flight (keyed por git-remote normalizado); `read-only` solo hace que el setup skill omita el import — no bloquea un `gbrain put`/`mcp__gbrain__put` manual. MCP se registra user-scope machine-wide. → brisas-del-golfo=deny se impone **NO registrándola como source**; korvex-*=read-only por disciplina ebrain + `federated:false`; falta gate de escritura verificable (test explícito en F2).
  - gbrain hace **write-through DB→disco** (`writePageThrough`) → **desactivar para el source del vault** (GUARDRAILS §2: la DB nunca escribe de vuelta al canónico). Config obligatoria F1.
  - `SKILL.md` de gstack es **build-artifact** de `SKILL.md.tmpl` → overlay CKIS vía sección en CLAUDE.md o wrapper skill, NUNCA editar el SKILL.md vendored (F3).
  - Dos secret scanners en gstack: `lib/redact-patterns.ts` (3-tier fuerte, pre-push) + `bin/gstack-brain-sync` embebido (más débil) → GUARDRAILS ebrain no debe sobre-estimar cobertura.
  - Default schema pack = `gbrain-base-v2` (15 tipos); schema real en `migrate.ts` (56 tablas), no solo `schema.sql`; "ontología" = columnas en `facts`. PGLite ~50K páginas single-writer → Supabase para prod.
- Estimado de ingesta: `discovery/05-cost-estimate.md` (vault ≈ 860 .md, ~2.14M tokens).
- **Gate humano 0.4.4 ✅ resuelto (2026-07-10):** (a) **PGLite LOCAL** (Supabase free-tier lleno; migración lossless cuando Pro); (b) embeddings **`openai:text-embedding-3-small`** hosted (key propia + $50 créditos, cap + canary). Verificado que **QMD NO es reusable** (EmbeddingGemma-300M local 768d vs gbrain — modelo/dims/store distintos); QMD se mantiene, benchmark F2. Detalle: ULTRAPLAN §0.1 "Decisión gate 0.4.4". → **Desbloquea F1** (tras colocar la key + cap OpenAI).
