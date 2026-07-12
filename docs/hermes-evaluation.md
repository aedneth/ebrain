---
type: evaluation
project: ebrain
created: 2026-07-12
status: active
decision: DEFER (no adoptar, no instalar todavía)
tags: [ebrain, hermes, autonomous-runtime, evaluation, tier-2, routing]
related: [ROUTING.md, ADR-002-unified-harness.md, SPRINT.md, THE STACK · ON OPENROUTER · PER 1M INPUT.md]
---

# Evaluación Hermes (SPRINT 4.9) — recomendación: **DEFER**

> **Desviación consciente del SPRINT.** 4.9 pedía "instalar Hermes para una prueba corta y medir RAM". Esta evaluación concluye **NO instalarlo ahora** — y eso ES un resultado de evaluación válido. Instalar un daemon autónomo en esta laptop contradice restricciones duras ya establecidas (abajo). La recomendación se basa en la investigación de código ya hecha (ROUTING.md §4, verificada 2026-07-08) + la auditoría Fable 5 (2026-07-11), que concluyó independientemente lo mismo: *"el aplazamiento es la decisión correcta, y no por poco."*

## Qué es Hermes (y qué NO es en ebrain)
`NousResearch/hermes-agent` — runtime autónomo Python ≥3.11: gateway multiplataforma (Telegram/Discord/Slack/WhatsApp/Signal/email), self-learning (crea/mejora skills, memoria FTS5, modelado de usuario), subagentes en background, crons en lenguaje natural, cliente MCP (OAuth 2.1), 6 backends de terminal (local/Docker/SSH/Daytona/Singularity/Modal — serverless hibernan en idle). Soporte OpenRouter de primera clase (`provider_routing` en `config.yaml`).

**Su rol en ebrain es acotado:** NO es el bus de memoria (eso es el MCP de gbrain), NO es el router (eso es `route.ts`). Hermes solo aporta **una** cosa que hoy nadie más da: la **superficie de ejecución autónoma 24/7** (trabajo con la laptop cerrada, hablarle por Telegram mientras corre en la nube).

## Por qué DEFER (4 razones, todas duras)
1. **RAM.** La laptop es de 4GB y la regla del harness es **un agente interactivo a la vez**. Un daemon always-on Python contradice esa restricción de raíz. No hay hábitat local viable.
2. **El valor del prompt original ya se capturó sin Hermes.** THE STACK quería el stack "wrapped in Hermes" — pero lo que aportaba valor era el **routing por capacidad**, y eso vive completo en `route.ts` (probado: 6 caps, ~31× más barato). Hermes quedó **aditivo** (24/7 + Telegram), no fundacional.
3. **MCP stdio-local → Hermes en VPS sería amnésico.** El MCP de gbrain es stdio-local; un Hermes en un VPS correría **sin la memoria de ebrain** (o vía SSH-backend a la laptop, frágil). Adoptarlo antes de MCP-over-HTTP+OAuth daría un agente autónomo **sin memoria** — lo contrario de la tesis.
4. **Amplifica el canal de exfil.** Hermes es un **escritor autónomo 24/7**. Enchufarlo mientras el write-back apenas pasó a allow-list (MUST#1, recién) multiplicaría la superficie de exfiltración sin supervisión humana. Orden correcto: allow-list battle-tested → MCP HTTP → recién ahí Hermes.

## Costos (si algún día se adopta)
| Opción | Costo | Nota |
|---|---|---|
| **VPS $5/mo** | ~$5/mo fijo | systemd + auto-restart; el caso que Hermes publicita ("run it on a $5 VPS, talk from Telegram"). Resuelve el STEP 5 del plan original sin hacks de suspensión de la laptop. |
| **Modal/Daytona serverless** | ~$0 idle + uso | backend nativo de Hermes; hiberna en idle. Ideal si el uso es esporádico. |
| LLM | dentro del cap | su provider = la MISMA key OpenRouter con el MISMO hard-cap de $10/mo. Un solo grifo. |

## Condiciones para revisitar (gate de adopción)
Adoptar Hermes **solo cuando se cumplan las 3**:
1. **MCP-over-HTTP + OAuth 2.1** expuesto por ebrain (para que Hermes remoto tenga memoria).
2. **Allow-list de federación battle-tested** (MUST#1 con semanas de uso sin fugas).
3. **Un caso de uso 24/7 concreto** que lo justifique (p.ej. "quiero dispararle tareas por Telegram y que trabajen en la nube de noche").

**Si se adopta**, activar de una: `skills.write_approval: true` + `memory.write_approval: true` (todo write staged para tu aprobación — crítico en daemon autónomo), `max_concurrent_sessions` bajo, **venv FUERA del source tree** (el propio CONTRIBUTING advierte que el agente puede borrarse su runtime), y su provider = la key OpenRouter con hard-cap.

## Lo que NO usar (ToS)
El proxy OAuth local de Hermes (expone Claude Pro/ChatGPT Pro como endpoints para Codex/Aider/Cline) **no se usa** — rutear una suscripción por proxy hacia terceros arriesga la cuenta. Cada suscripción en su herramienta nativa.

## Veredicto
**DEFER.** ebrain está **completo y funcional sin Hermes**; Hermes solo lo vuelve 24/7, y ese salto no se justifica hoy contra RAM + memoria-remota-ausente + canal-de-exfil-fresco. No instalar. Revisitar cuando se cumplan las 3 condiciones. **Gate humano: Eduardo decide adopción y hábitat** — esta evaluación recomienda esperar.
