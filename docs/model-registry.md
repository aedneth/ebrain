---
type: model-registry
project: ebrain
created: 2026-07-11
modified: 2026-07-11
status: verified-live
sprint: "4.1"
sources-verified: 2026-07-11 (openrouter.ai/api/v1/models — 345 modelos listados)
related: [ROUTING.md, SPRINT.md]
---

# Model Registry — verificación en vivo OpenRouter (SPRINT 4.1)

> Fuente: `GET https://openrouter.ai/api/v1/models` el **2026-07-11** (345 modelos). Precios en **$/M tokens** (input / output). Los slugs de `ROUTING.md §3.1` eran especulativos (post-cutoff ene-2026) → **todos verificados vivos**. Este archivo es la verdad de slugs+precios que consume `routing.yaml` (4.4).

## 1. Ganadores por capacidad — TODOS existen vivos ✅

| Capacidad | Modelo | Slug (verificado) | in $/M | out $/M | ctx | Δ vs spec |
|---|---|---|---|---|---|---|
| `coding` | DeepSeek V4 Pro | `deepseek/deepseek-v4-pro` | **0.435** | 0.87 | 1.05M | spec ~$0.28 → **+56% in** |
| `agentic` | Kimi K2.6 | `moonshotai/kimi-k2.6` | 0.66 | **3.41** | 262k | in ✓; **out caro** (riesgo loops) |
| `web_design` | GLM-5.2 | `z-ai/glm-5.2` | **0.35** | 1.10 | 1.05M | spec ~$1.40 → **−75% in** 🎉 + 1M ctx |
| `long_context` | MiniMax M3 | `minimax/minimax-m3` | 0.30 | 1.20 | 1.05M | **exacto**; 1M ctx confirmado |
| `terminal`/`general` | Qwen3.7 Max | `qwen/qwen3.7-max` | **1.25** | **3.75** | 1M | in ✓; **el más caro del set** |

## 2. Fallbacks (open, mid-tier, confiables — nunca frontier)

| Para | Modelo | Slug | in $/M | out $/M | ctx |
|---|---|---|---|---|---|
| coding | DeepSeek V4 Flash | `deepseek/deepseek-v4-flash` | 0.077 | 0.154 | 1.05M |
| agentic | Qwen3 Coder Plus | `qwen/qwen3-coder-plus` | 0.65 | 3.25 | 1M |
| web_design | GLM-4.7 | `z-ai/glm-4.7` | 0.40 | 1.75 | 203k |
| long_context | Qwen3.5 Plus (2026-04) | `qwen/qwen3.5-plus-20260420` | 0.30 | 1.80 | 1M |
| terminal/general | Qwen3.7 Plus | `qwen/qwen3.7-plus` | 0.32 | 1.28 | 1M |

## 3. Floors — el más barato confiable + **cero-costo real** (lo que Eduardo pidió: multi-proveedor $0)

| Tipo | Modelo | Slug | in $/M | out $/M | ctx |
|---|---|---|---|---|---|
| coding floor | Qwen3 Coder Flash | `qwen/qwen3-coder-flash` | 0.195 | 0.975 | 1M |
| general floor | Qwen3.5 Flash | `qwen/qwen3.5-flash-02-23` | 0.065 | 0.26 | 1M |
| **FREE coding** | Qwen3 Coder (free) | `qwen/qwen3-coder:free` | **0** | **0** | 1.05M |
| **FREE general** | Qwen3 Next 80B (free) | `qwen/qwen3-next-80b-a3b-instruct:free` | **0** | **0** | 262k |

> Los `:free` son floors de gasto-cero (rate-limited, sin SLA) → ideales como último eslabón de la cadena para tareas desechables/batch. Es el carril "multi-proveedor cero-costo" del mandato de Eduardo, nativo en OpenRouter sin código extra.

## 4. Cadenas `[ganador, fallback, floor]` para routing.yaml (4.4)

```
coding:       [deepseek/deepseek-v4-pro,  deepseek/deepseek-v4-flash,   qwen/qwen3-coder:free]
agentic:      [moonshotai/kimi-k2.6,      qwen/qwen3-coder-plus,        qwen/qwen3-coder-flash]
web_design:   [z-ai/glm-5.2,              z-ai/glm-4.7,                 z-ai/glm-4.7-flash]
long_context: [minimax/minimax-m3,        qwen/qwen3.5-plus-20260420,   qwen/qwen3.5-flash-02-23]
terminal:     [qwen/qwen3.7-max,          qwen/qwen3.7-plus,            qwen/qwen3.5-flash-02-23]
general:      [qwen/qwen3.7-max,          qwen/qwen3.7-plus,            qwen/qwen3-next-80b-a3b-instruct:free]
```

## 5. Notas para 4.4/4.5

- **Disputadas (4.5 benchmark, sin cambio de plan):** web/design GLM-5.2 vs Kimi; reasoning MiniMax M3 vs DeepSeek V4; contexto masivo MiniMax(1M) vs GLM-5.2(ahora también 1M). El abaratamiento de GLM-5.2 (−75%) y su salto a 1M ctx cambian el cálculo costo/beneficio → benchmark real lo resuelve.
- **Riesgo de gasto:** el `out` de Kimi K2.6 ($3.41/M) y Qwen3.7-Max ($3.75/M) son los vectores de drenaje silencioso en loops largos → `:floor` en batch + `max_price` por request + cap local $10.
- **`:floor` batch profile** (dream cycle, judges, resúmenes): usar `minimax/minimax-m3` o directamente los `:free` → costo casi nulo.
- Embeddings siguen por OpenAI directo (OpenRouter no tiene embeddings API) — **no** tocan estos $5.
