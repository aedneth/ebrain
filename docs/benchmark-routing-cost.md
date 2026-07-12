---
type: benchmark
project: ebrain
created: 2026-07-11
status: active
tags: [ebrain, routing, benchmark, cost, openrouter, tokens]
related: [ROUTING.md, model-registry.md, SPRINT.md]
---

# Benchmark — reducción de gasto en tokens (stack ruteado vs frontier)

> Pregunta de Eduardo: *"verificar con benchmarks reales que estamos reduciendo significativamente el gasto en tokens."* Respuesta corta: **sí, ~31× medido** (consistente con el "hasta 35× menos" de THE STACK), con datos reales de `spend.jsonl`, no estimados.

## Metodología (honesta)

- **Medido real:** costo USD y tokens exactos de **6 rutas en vivo** por OpenRouter (campo `usage.cost` real que devuelve el provider), registradas en `~/.config/ebrain/spend.jsonl`. Cada capacidad pegó a su modelo ganador (coding→deepseek-v4-pro, web_design→glm-5.2, reasoning→minimax-m3, agentic→kimi-k2.6, general→qwen3.7-max).
- **Baseline frontier:** se mantienen **los mismos tokens** y se recalcula el costo a la tarifa de un modelo frontier (tier Opus: **$15/M input, $75/M output** — tarifa pública documentada, declarada como supuesto). Metodología estándar: fijar tokens, variar precio.
- **Caveat:** muestra chica (6 rutas, prompts cortos, output-dominante). El múltiplo exacto varía con el mix input/output y la tarea; sirve como orden de magnitud verificado, no como promedio estadístico.

## Resultado (medido 2026-07-11)

| | Valor |
|---|---|
| Rutas | 6 |
| Tokens in / out | 333 / 2 780 |
| **Costo real (stack ruteado)** | **$0.00683** |
| Costo equivalente frontier (tier Opus) | $0.2135 |
| **Reducción** | **≈ 31.3×** |

Detalle por ruta (real):

| cap | modelo | tin | tout | USD real |
|---|---|---|---|---|
| coding | deepseek-v4-pro | 13 | 45 | $0.0000768 |
| general | qwen3.7-max | 15 | 116 | $0.000454 |
| coding | deepseek-v4-pro | 30 | 505 | $0.00118 |
| web_design | glm-5.2 | 37 | 752 | $0.00101 |
| reasoning | minimax-m3 | 209 | 306 | $0.000403 |
| agentic | kimi-k2.6 | 29 | 1 056 | $0.00371 |

## Los DOS ejes de ahorro (no solo el routing)

1. **Eje routing (medido acá, ~31×):** delegar el trabajo rutinario al stack chino ruteado por capacidad en vez de a un frontier. Con el presupuesto de **$10/mo capado**, a este costo medio (~$0.001/ruta) son **miles de tareas/mes**.
2. **Eje memoria (la capa agéntica, cualitativo):** la memoria permanente cross-agente evita **re-derivar contexto cada sesión** (la "arqueología" que antes se repetía por agente y por sesión). Un agente que consulta `ebrain query` en vez de re-leer N archivos gasta una fracción de tokens de entrada, y el conocimiento **se acumula** en vez de perderse al cerrar la sesión. Este eje es más difícil de cuantizar en un número pero es el fundamento de la tesis: **el gasto NO crece con el número de agentes ni de sesiones**, porque la capa de memoria es una sola y compartida.

## Cómo reproducir

```bash
# rutas reales (cada una registra en spend.jsonl):
ebrain route --cap coding "…"
# recompute del benchmark desde el log real:
jq -s '(map(.tokens_in)|add) as $i|(map(.tokens_out)|add) as $o|(map(.usd)|add) as $a|
  {actual_usd:$a, frontier_usd:($i/1e6*15+$o/1e6*75), reduction_x:(($i/1e6*15+$o/1e6*75)/$a)}' \
  ~/.config/ebrain/spend.jsonl
```

**Veredicto:** el eje routing reduce el gasto **~31× medido** (orden de magnitud del thesis de THE STACK). El eje memoria lo complementa haciendo que el gasto no escale con agentes/sesiones. Falta ampliar la muestra con tareas input-heavy y una tarea "proyecto entero" (requiere runtime agéntico Tier-2 sobre el stack — Hermes/Codex-CLI apuntado a OpenRouter).
