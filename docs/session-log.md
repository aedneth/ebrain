# session-log — ebrain

Handoff entre sesiones. El más reciente arriba. Formato: fecha · fase · qué se hizo · qué quedó a medias · cómo arrancar la próxima.

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
