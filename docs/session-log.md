# session-log — ebrain

Handoff entre sesiones. El más reciente arriba. Formato: fecha · fase · qué se hizo · qué quedó a medias · cómo arrancar la próxima.

---

## 2026-07-11 — Fase 1 completa (orquestador Opus)

**Fase:** F1 (Motor vivo — PGLite local + Second Brain) → ✅ **completa y auditada**.

**Qué se hizo:**
- Motor **PGLite local** en `~/.gbrain/brain.pglite/`; embeddings `openai:text-embedding-3-large` **@1536d** (Matryoshka, bajo el HNSW 2000d). Schema pack `gbrain-base-v2`.
- Launcher `~/.config/ebrain/gbrain-run` (chmod 700): `cd` a dir neutral → sourcea `.env` → `bun run vendor/gbrain/src/cli.ts`. Key en `~/.config/ebrain/.env` (chmod 600), nunca en contexto del agente.
- Canary 20 notas OK; **root-cause del 400 Bad Request** = bun auto-carga `.env` del cwd (el del vault pisaba la key) → fix: launcher con cwd neutral.
- Full-ingest: **861 páginas · 3673 chunks · 3673 embebidos (100%) · 490 links · 901 tags** · 33 tipos inferidos. `global_basename=true` (0→490 edges).
- Vault verificado INTACTO byte-a-byte; secret-scan CLEAN. Costo ~$0.30–0.35 (cap $5).
- Validación 10 queries (5 ES/5 EN): **10/10 relevantes, 8/10 exactas top-1** → `docs/validation-f1.md`. Runbook operativo en `docs/runbook.md`.

**Qué quedó a medias / diferido:**
- Schema pack custom `ebrain-ckis-v1` (1.3.*) DIFERIDO — base-v2 infiere bien; se reevalúa en F5 con evidencia.
- `gbrain think` (síntesis con citas) requiere chat model (`GBRAIN_CHAT_MODEL`) — natural para F4.
- Company Brain **NO** embebido (correcto: es F2 2.1). Vault existe: 163 `.md`, ~1.91 MB, ~499K tokens → costo trivial.

**Cómo arrancar la próxima sesión (F2 — Federación CKIS):**
1. Leer `discovery/02-gbrain-federation.md` (tiers, `.gbrain-source`, `sync --strategy code`) y `discovery/04-connection-contract.md` (trust triad, `## GBrain Search Guidance`, GSTACK_*).
2. Releer GUARDRAILS §2 (fronteras repos: brisas=deny NO registrándola; korvex-* read-only sin push) y §3 (personal ⊥ korvex).
3. Arrancar por SPRINT 2.1: decisión de topología de brains (mismo brain vs separado) → ADR-001 en `docs/adr/`.

---

## 2026-07-10 — Fase 0 completa (orquestador Opus)

**Fase:** F0 (Setup + Reverse Engineering local) → ✅ **completa y auditada**. Commit `f8e218b`.

**Qué se hizo:**
- Workspace `~/eBrain` (main, aislado del repo de `$HOME`), `.gitignore`, CLAUDE.md+README a raíz.
- Clones full-depth: gbrain `a25209b` (v0.42.58.0), gstack `7c9df1c` (v1.60.1.0) en `vendor/` (read-only, gitignored).
- 4 workers Sonnet → 5 reportes `discovery/00`–`05`, todos `[AUDIT_PASS]` con spot-checks contra código real.
- Calibraciones aplicadas a ULTRAPLAN §0.1, ARCHITECTURE §9, CHANGELOG.md.
- Estimado de ingesta: ~2.14M tokens (860 .md); full-embed ≈ centavos–$0.33 (no es riesgo de costo).
- Vault: `03-projects/ebrain/_overview.md`, registro en `_ACTIVE-PROJECTS.md`, CKIS CHANGELOG v2.3.96.

**Hallazgos que condicionan F1+ (leer antes de seguir):**
1. **Trust triad NO es guard runtime** → brisas-del-golfo se protege NO registrándola como source (verificar que tiene `origin` remote); korvex-* read-only por disciplina + `federated:false`; test de escritura adversarial en F2 (2.2).
2. **Write-through DB→disco** (`writePageThrough`) → desactivar para el source del vault en F1 (GUARDRAILS §2). Ingesta por CLI local (auto-link ON), no MCP remoto.
3. **Embedder default = ZeroEntropy hospedado** (verificar precio) o OpenAI 3-small (~$0.05 total, known). Embeddings NO por OpenRouter.
4. **Federación se integra en la capa `Operation` (102)**, no en `BrainEngine` (147).
5. **Overlay gstack** vía sección CLAUDE.md / wrapper — NUNCA editar SKILL.md vendored (build-artifact).

**Qué quedó a medias / bloqueo:**
- ⛔ **Gate humano 0.4.4** pendiente de Eduardo: (a) proyecto Supabase dedicado `ebrain-prod`, (b) provider de embeddings + presupuesto. Sin esto no arranca F1.
- Pendiente F1 (tras aprobación): `~/.config/ebrain/.env` (chmod 600), `gbrain init` contra Supabase, canary PGLite 20 notas, schema pack `ebrain-ckis-v1`, ingesta Second Brain.
- Diferido a F5: `.brain`/graphify del repo ebrain (KICKOFF 1.3).

**Cómo arrancar la próxima sesión:**
1. Leer `docs/GUARDRAILS.md`, `docs/SPRINT.md` (estado real), `docs/ULTRAPLAN.md §0.1` (calibración F0).
2. Si Eduardo ya aprobó 0.4.4 → arrancar F1 desde SPRINT 1.1.1 (él crea Supabase) / 1.1.2.
3. Si no → recordarle el gate 0.4.4 con el estimado de `discovery/05-cost-estimate.md`.
