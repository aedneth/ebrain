---
type: guide
project: ebrain
status: active
related: [adr/ADR-005-user-governed-model-selection.md, COST-LEDGER.md, BENCHMARK-EVIDENCE-PLAN.md]
---

# Execution Profiles

Un perfil de ejecucion describe **los modelos que un usuario eligio** para OpenRouter y el orden
de fallback por capability. No es una recomendacion de ebrain, no contiene credenciales y no
afirma que un modelo sea mejor.

## Inicio plug-and-play

1. Configura el routing OpenRouter habitual de ebrain.
2. Crea una sola vez un perfil local migrado, sin sobreescribir nada existente:

   ```bash
   ebrain profiles init --yes --json
   ```

   Esto crea `~/.config/ebrain/execution-profiles.json` con permisos `600` y el directorio con
   `700`. El perfil se llama `legacy-openrouter` para dejar claro que conserva una configuracion
   local previa, no una politica global.
3. Inspecciona y valida:

   ```bash
   ebrain profiles list --json
   ebrain profiles show legacy-openrouter --json
   ebrain profiles validate --json
   ```

## Elegir modelos propios

El catalogo exige procedencia y fecha antes de permitir un modelo en un perfil. Agregar metadata
no llama a ningun proveedor ni prueba el modelo:

```bash
ebrain profiles catalog-add \
  --id provider/model-id \
  --source https://source.example/models \
  --as-of 2026-07-15T00:00:00Z \
  --yes --json
```

Luego crea un perfil. Cada `--cap` conserva exactamente el orden que elegiste:

```bash
ebrain profiles create \
  --id my-stack \
  --label "My OpenRouter stack" \
  --cap coding=provider/model-a,provider/model-b \
  --cap terminal=provider/model-c \
  --yes --json
```

Los comandos mutantes exigen `--yes`. No hay un perfil default, no se modifican perfiles en
background y un modelo ausente del catalogo se rechaza antes de guardarlo.

## Limites de costo y evidencia

Los perfiles no llevan precios ni cuotas. `ebrain cost` solo muestra tokens y USD que un proveedor
reporta o que un adapter declara explicitamente. La evidencia de benchmarks sera una integracion
posterior opt-in; sus resultados tendran fuente, fecha, version, scope y costo de corrida, pero no
cambiaran el orden de un perfil.
