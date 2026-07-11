# CHANGELOG — ebrain

Una línea por cambio estructural (disciplina Company Brain). El más reciente arriba.

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
- **Pendiente gate humano 0.4.4:** Eduardo aprueba (a) proyecto Supabase dedicado y (b) provider de embeddings + presupuesto.
