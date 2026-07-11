---
type: validation
project: ebrain
sprint: "3.7"
created: 2026-07-11
---

# validation-f3 — dev-loop e2e en sandbox (SPRINT 3.7)

> Corrida real del 7-phase loop CKIS (bajo el overlay gstack) en un repo sandbox desechable. Objetivo: validar la mecánica del loop + registrar fricciones.

## Qué se corrió (feature trivial: `slugify()` pure function)

| Fase | Acción | Evidencia |
|---|---|---|
| 0-1 Context+Plan | CLAUDE.md honesto + PLAN.md antes de código | commit `f0a1093` |
| 3A Implement (engine-first) | `slugify()` + **4 invariant tests** ANTES de usarlo | commit `86f7816`, `bun test` 4 pass |
| 3B Implement | CLI que usa el motor (diff aditivo) | commit `fefbb3c` |
| 4 Review | facts (`git status` limpio, archivos reales) + gate objetivo `bun test` + smoke e2e real (`loop-engineering-works`) | 4 pass, output real |
| 6 Ship | **PR local**: merge `feat/slugify`→master `--no-ff`; **cero remote** | commit `1984bea`, `git remote` vacío |

**Commit-per-phase + `[AUDIT_PASS]` por fase** ✓ (escalera de rollback). Empirical-engine-first ✓. Gate objetivo pass/fail ✓. Sin push ✓.

## Fricciones registradas

1. **Los slash-skills de gstack son de capa-sesión, no orquestador-programables.** `/office-hours`, `/autoplan`, `/review`, `/ship` los invoca un humano/agente *escribiéndolos* en una sesión Claude Code. El orquestador Opus (corriendo vía tools) ejecuta la **mecánica** del loop siguiendo el SOP, no llamando los skills por API. → El overlay (F3.3/3.4) mapea la **disciplina** del SOP sobre los skills; el skill se dispara en la sesión. Esto es correcto por diseño, pero conviene tenerlo claro: ebrain no "corre /autoplan"; impone la disciplina que /autoplan debe seguir.
2. **Visual gate = agent-browser, no aplica a features no-UI.** Este sandbox es pure-function → sin visual gate. Para frontend, el gate es agent-browser 1440×900+393×852 cada iteración (SOP §7) — validado como decisión, no ejecutado aquí (no hay UI).
3. **No-push discipline se sostiene trivialmente** con el patrón "branch → merge local `--no-ff`" y cero `git remote`. Replicable en korvex-* (commit local, nunca push).
4. **`bun test` como gate único** funcionó; en repos reales el gate es `build && test && lint && typecheck` — el sandbox no tiene build/lint (feature pura), lo cual es fiel al scope triage del SOP (ceremonia proporcional al cambio).

## Complementos validados esta fase

- **3.5 `/learn` checkpoint = local-only** (`checkpoint_push=false`, `checkpoint_mode=explicit`) — sin sync remoto salvo activación explícita.
- **3.5 secret scanner** (gstack `redact-patterns` PATTERNS): atrapa **4/4** secretos falsos (anthropic.key, aws.secret_key, db.url_with_password, github.pat); placeholder también matchea (over-redacción = seguro). Si algún día se activa memory-sync a repo privado, el scanner bloquea.

## Conclusión

El loop CKIS↔gstack es ejecutable end-to-end con la disciplina del SOP intacta. Las fricciones son de **capa de invocación** (skills = sesión), no de mecánica. F3 validada.
