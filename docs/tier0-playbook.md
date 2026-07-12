---
type: playbook
project: ebrain
created: 2026-07-12
status: active
tags: [ebrain, playbook, tier-0, codex, routing, workflow, agents]
related: [ROUTING.md, OPEN-CODE.md, benchmark-routing-cost.md, ADR-002-unified-harness.md]
---

# Playbook operativo — el arsenal agéntico de Eduardo (Tier 0 → Tier 2)

> Cómo trabajar día a día con la flota, gastando lo mínimo y sin pisar herramientas entre sí.
> Regla de oro: **capacidad sobre vendor · barato por default · frontier solo a mano · un agente vivo a la vez.**

## Los tiers

| Tier | Qué | Cuándo |
|---|---|---|
| **Tier 0 — cerebro** | **Codex** (`--sandbox danger-full-access`) | Constructor agresivo diario. Créditos $2500 + API OpenAI = mejor calidad/precio. La mayoría del trabajo serio de código. |
| **Tier 0 — director/auditor** | **Claude Code (Opus)** | Orquestación, arquitectura compleja, y **auditar** lo que Codex construye (maker≠checker). Dueño del vault/CKIS/ebrain. Tu agente de confianza. |
| **Tier 1 — routed** | **`ebrain route --cap`** (stack chino vía OpenRouter, $10/mo cap) | One-shots programáticos, batch, jobs. ~31× más barato que frontier. NO interactivo. |
| **Tier 1 — CLI barato** | **OpenCode** (`opencode`) | Caballo de batalla CLI: scripts, scaffolding, escaneo de archivos grandes con modelos chinos + Zen (free). Multi-sesión paralela. |
| **Tier 1 — visual** | **Cursor** (`agent`) | Edición visual/frontend + refactors breves. Modelos Anthropic (créditos $50). Scriptable con `agent -p`. |
| **Tier 1 — free** | **gemini** | Ingesta masiva, resúmenes batch, borradores (free tier). |
| **Tier 2 — autónomo 24/7** | **Hermes** | **DIFERIDO** (`hermes-evaluation.md`). No adoptado. |

## Filtro de decisión (costo/complejidad)

```
¿Trabajo serio de código / arquitectura?        → Codex (Tier 0); Opus audita antes de merge.
¿Depuración crítica de infra / decisión de diseño? → Claude Code (Opus).
¿One-shot programático / batch / job de gbrain? → ebrain route --cap <cap>.
¿Script / scaffolding / escaneo de archivos?    → OpenCode (modelos chinos, casi gratis).
¿Edición visual / frontend?                     → Cursor.
¿Ingesta masiva / resumen batch barato?         → gemini (free).
¿Proyecto entero autónomo con la laptop cerrada? → (futuro) Hermes sobre Tier 1; hoy NO.
```

## Reglas duras (las mismas para todos — `harness/core/NORMS.md`)

- **Un agente interactivo a la vez** (RAM 4GB). Opus ↔ Codex se pasan la posta por archivos (plan → Codex ejecuta → Opus audita), no en paralelo.
- **maker ≠ checker:** lo que un constructor produce, Opus lo audita antes de merge. Nadie se auto-aprueba en alto riesgo.
- **Nunca auto-escalar a frontier.** Eso lo invocás vos a mano.
- **Secretos, repos de cliente (brisas/dekko), rastro narrativo:** ver NORMS (renderizado en cada agente).

## La capa unificada (por qué no es onboarding individual)

Todos los agentes comparten **una** capa: memoria (MCP de ebrain, lectura + `ebrain remember` escritura), normas (`NORMS.md`), contexto de sesión, guard de secretos. **Lo único por-agente es un manifest** (`harness/adapters/<agente>/manifest.yaml`).

```bash
ebrain harness install <agente>     # onboardear/actualizar uno
ebrain harness install --all        # toda la flota
ebrain harness doctor --all         # verificar los 6 (rc=1 si hay pendientes — cron-ready)
ebrain remember "<learning>"        # escribir a la memoria permanente cross-agente
ebrain route --cap <cap> "<prompt>" # rutear al stack barato (con costo logueado)
ebrain q "<pregunta>"               # buscar cross-source
```

## Disciplina de dinero

- OpenRouter = **$10/mo hard-cap** (server-side + `route.ts` pre-call). Auto-recharge OFF.
- Costo medido del stack ruteado: ~$0.001/tarea (`benchmark-routing-cost.md`, ~31× < frontier).
- **Gap conocido:** el spend de gbrain (think/dream/judges vía OpenRouter) NO entra al ledger local — el cap real de esas llamadas es el server-side. Instrumentar `src:gbrain` = mejora futura.
- Cada suscripción (Codex, Cursor) se usa en **su** herramienta nativa. Nunca por proxy (ToS).
