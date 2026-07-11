# overlay/gstack-ckis — CKIS discipline over gstack skills (F3)

> **gstack da el andamiaje de skills; el SOP de Eduardo da la disciplina — y el SOP gana en todo choque.** Esta carpeta documenta los deltas CKIS vs gstack upstream **sin editar nunca los archivos vendored** (los `SKILL.md` son build-artifacts de `SKILL.md.tmpl` — F0 §skill-anatomy). La adaptación se impone vía sección en `CLAUDE.md` / referencia al SOP, no tocando `~/.claude/skills/gstack/`.

## Por qué overlay y no fork

- `git pull` de upstream sigue funcionando (mejoras de Garry Tan entran sin merge-conflicts).
- Cada delta CKIS es auditable en un solo lugar.
- gstack ya está **instalado** en `~/.claude/skills/` (pin 9988cd3): `/autoplan /review /ship /qa /office-hours /learn /retro /careful /freeze /guard`… (3.1 ✓, sin `./setup`, sin Chromium).

## Cómo se aplica

1. **Fuente de verdad = el SOP de Eduardo**: `01-systems/sops/dev/development-pipeline-pattern-sop.md` (v2.1) + el workflow `structured-agentic-development` (7-phase loop). Los skills de gstack se usan COMO PASOS de ese loop, no al revés.
2. **Bloque CKIS en CLAUDE.md** de cada repo (ya se inyecta el de search/graphify en F2.5; el de disciplina de dev referencia el SOP por trigger `"apply the dev pipeline"`).
3. **Donde gstack y el SOP choquen → el SOP gana** (ver `00-ckis-overlay-map.md`).

## Decisiones de frontera (fijadas por Eduardo)

- **Browser = agent-browser (Vercel), nativo.** Para QA / spec-driven-dev / búsquedas web / fetch se usa **agent-browser** (Chromium propio integrado, más efectivo que playwright). gstack `/browse` (+ `/design-shotgun`, `/open-gstack-browser`) quedan **opcionales/bajo demanda** (ULTRAPLAN L112, GUARDRAILS §9 — Chromium sólo on-demand en 4GB). El visual gate del SOP (1440×900 + 393×852) corre con agent-browser, no con `/browse`.
- **Skills pesadas opt-in por hardware**: `browse`, `design-shotgun`, `open-gstack-browser` — documentar activación bajo demanda, nunca en el loop por defecto.

## Archivos

- `00-ckis-overlay-map.md` — el mapa 7-phase ↔ skills gstack + las reglas donde CKIS gana (3.3 + 3.4).
