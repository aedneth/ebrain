---
type: architecture-note
project: ebrain
status: implemented
created: 2026-07-15
tags: [costs, tokens, openrouter, providers, tui]
---

# Cost Ledger v2

`ebrain cost` unifica telemetria de tokens y costo por uso para los proveedores y
agentes que la exponen. El objetivo es contestar con evidencia: que modelo consumio
tokens, cuanto, en que sesion/workflow y cual fue su costo por tokens cuando existe.

No se calcula ni se muestra costo de suscripciones. Una suscripcion no permite
atribuir un precio real a una ejecucion individual; presentarla como USD por modelo
seria inventar datos.

## Fuentes y estados

| Estado | Significado | USD |
| --- | --- | --- |
| `metered` | El provider devolvio costo por uso o el adapter lo recibio explicitamente. | Real o marcado estimado. |
| `token-only` | Hay conteo de entrada/salida, pero no precio verificable. | Nulo, nunca estimado por ebrain. |
| `untracked` | El adapter no expone tokens ni costo todavia. | Nulo. |

OpenRouter queda integrado automaticamente: `ebrain route` conserva el costo real
de `usage.cost`, tokens y modelo en el ledger existente. Si OpenRouter omite el
costo, el registro queda `estimated` y se identifica como tal.

OpenAI, Gemini y cualquier adapter pueden aportar eventos tokenizados al sidecar
local `~/.config/ebrain/cost.jsonl`. No hay scraping de dashboards, lectura de
credenciales ni conversion de cuotas a dinero.

## Contrato

```bash
ebrain cost --json
ebrain cost record --provider gemini --model gemini-2.5-flash \
  --tokens-in 1200 --tokens-out 300 --kind token-only --yes --json
ebrain cost record --provider openai --model gpt-4.1 \
  --tokens-in 1200 --tokens-out 300 --usd 0.0042 --yes --json
```

`cost record` escribe solo un evento local y exige `--yes`. Los campos de
atribucion son opcionales: `--agent`, `--session`, `--workflow` y `--cap`.
No acepta texto libre ni secretos. El directorio se mantiene `700` y el sidecar
`600`.

El reporte JSON contiene:

- `providers`: tokens, eventos, USD conocido y estado por provider.
- `agents`, `models`, `sessions`, `workflows`: los mismos agregados cuando el
  evento trae atribucion.
- `openrouter_mtd` y `remaining_openrouter`: el unico cap local existente; no
  se aplica falsamente a otros providers.
- `known_mtd`: suma de USD por uso conocido. `token-only` y `untracked` no
  suman ni se convierten a cero.

## Integracion diaria

En `ebrain ui`, abrir Routing (`5`) y presionar `c` para alternar al Cost Ledger.
La tabla principal enseña provider, estado, USD conocido y tokens; los paneles
laterales muestran gasto/token atribuido por workflow y sesion. `a` desde Memory
adjunta un workflow a Launch; si ese workflow termina en una ruta OpenRouter, su
ID queda registrado en el evento de costo.

## Limites actuales

- La telemetria depende de que el provider o adapter exponga tokens/costo. No se
  intenta estimar una cuota de Claude, Cursor u OpenCode.
- OpenAI/Gemini quedan `token-only` hasta que su adapter envie tokens/costo
  verificables al sidecar.
- El cap de `routing.yaml` sigue protegiendo OpenRouter. El ledger muestra el
  costo conocido total, pero no inventa un presupuesto global multi-provider.
