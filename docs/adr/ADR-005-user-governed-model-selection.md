---
type: adr
id: ADR-005
title: Seleccion de modelos gobernada por el usuario
status: accepted
decided_by: Eduardo + Codex
decided: 2026-07-15
program: F6.6 -- Orchestration UX
sprint_task: 6.6.1-6.6.6
related: [ADR-002-unified-harness.md, ADR-003-tui-stack.md, ../ROUTING.md, ../COST-LEDGER.md, ../SPRINT-ORCHESTRATION.md]
---

# ADR-005 -- Seleccion de modelos gobernada por el usuario

## Contexto

El primer `ebrain advise` clasificaba una tarea por keywords y devolvia un agente, modelo y
supuesto costo. Ese mecanismo tiene tres defectos incompatibles con una herramienta OSS:

1. Las capacidades y benchmarks de modelos cambian; un snapshot no permite afirmar cual es el
   "mejor" modelo para una tarea abierta.
2. Sus carriles incluian creditos y suscripciones personales. Esos datos no son portables ni son
   costo por tokens.
3. Una tarjeta que nombra un modelo no crea una sesion con ese modelo. Cada CLI tiene una
   superficie distinta; ebrain no debe fingir que todos soportan OpenRouter o seleccion de modelo.

La TUI debe ayudar a decidir y ejecutar sin reemplazar la preferencia del usuario con una
recomendacion opaca o desactualizada.

## Decision

Se retira el **advisor** como autoridad de eleccion y se lo reemplaza por cuatro contratos
separados:

1. **Task Profile.** Analiza una tarea en senales/capacidades explicables y editables por el
   usuario. Puede filtrar opciones compatibles, pero nunca ordena ni etiqueta un modelo como
   mejor. `ebrain advise` queda como alias de compatibilidad durante la migracion; la nueva
   superficie se llama `ebrain task-profile`.
2. **Execution profiles.** El usuario posee perfiles locales que declaran los modelos OpenRouter
   permitidos, su fallback y limites. El catalogo distribuido puede describir familia, contexto,
   tool-use, precio observado y `as_of`, pero no elige un perfil ni modifica uno automaticamente.
3. **Targets declarados por adapter.** Cada manifest declara si su CLI soporta seleccionar un
   modelo y como se pasa el argumento. Un target sin soporte se muestra como provider-managed;
   no acepta un modelo falso. OpenCode es el primer target OpenRouter porque su CLI instalada
   expone `--model provider/model`; los demas adapters se habilitan solo tras prueba y contrato.
4. **Telemetria factual.** El ledger registra tokens y USD solo cuando el proveedor los entrega o
   un adapter los declara. No existe reparto de suscripciones, creditos personales ni USD cero
   para una sesion que no reporto uso.

El Launch Wizard sera el unico lugar interactivo que compone una ejecucion: tarea, capability,
target, perfil/modelo, cwd y contexto. Todo queda previsualizado antes de crear tmux o llamar a
OpenRouter.

## Reglas de producto

- "Recomendado" significa solo una preferencia explicita del usuario dentro de su perfil, nunca
  superioridad objetiva. La UI usa `seleccionado`, `compatible` y `evidencia`.
- Benchmarks son artefactos opcionales, con fuente, fecha, version, tarea y resultados. Se muestran
  como evidencia; no se consumen para auto-rutear ni se actualizan en segundo plano.
- El catalogo de modelos es metadato con procedencia. Una actualizacion requiere una accion
  explicita del usuario y conserva `as_of`; ningun precio se presenta como billing real.
- Los perfiles no contienen secretos. Las credenciales siguen siendo responsabilidad del adapter
  y nunca se leen ni se muestran durante discovery, configuracion o telemetria.
- Los repositorios `brisas-del-golfo` y `dekko` nunca se ofrecen como proyecto/cwd. La validacion
  reutiliza el deny-list por `realpath` antes de lanzar.
- Un modelo frontier, un target con permisos altos o cualquier ruta con USD estimado requiere
  confirmacion explicita. Ninguno es el default silencioso.

## Contratos a construir

### Task Profile

Salida JSON prevista:

```json
{
  "task": "...",
  "signals": [{"capability": "coding", "matched": ["bug", "test"]}],
  "selected_capability": "coding",
  "compatible_targets": ["opencode-openrouter", "codex"],
  "disclaimer": "Signals classify the task; they do not rank models."
}
```

La capability se puede cambiar antes de ejecutar. No hay campos `agent`, `model`, `best`,
`rank`, creditos ni costo de suscripcion.

### Execution profile y target

Un perfil contiene IDs de modelo, orden de fallback, limite y metadata de evidencia. Un target
contiene `adapter`, `kind`, `model_selector` (`none` o argumento declarado), providers permitidos,
clase RAM y requisitos. El CLI construye los argumentos desde esos valores estructurados: nunca
concatena texto libre de la TUI en un comando shell.

### Preview de lanzamiento

Antes de confirmar, el wizard muestra el target real, cwd resuelto, modelo/perfil efectivo,
prompt inicial, normas, MCP/daemon, memoria, workflow adjunto, clase RAM y estado de costo. Para
OpenRouter declara estimacion solo si existe pricing fechado; para sesiones sin telemetria declara
`token-only` o `untracked`.

## Alternativas descartadas

- **Actualizar el advisor con benchmarks vivos.** No resuelve tareas abiertas, introduce scraping y
  seguiria escondiendo preferencias/fechas detras de una recomendacion.
- **Fijar un modelo chino como default universal.** Es util como perfil de ejemplo, no como una
  politica correcta para todos los usuarios.
- **Pasar `--model` a cada CLI.** Es inseguro y falso: la compatibilidad depende de cada adapter.
- **Inferir gasto desde planes o creditos.** No mide tokens ni gasto por ejecucion; contradice el
  contrato de `COST-LEDGER.md`.

## Consecuencias

- **Positiva:** el usuario controla su stack y puede reproducir su politica en otra maquina.
- **Positiva:** el lenguaje de la UI es honesto ante drift de benchmarks y providers.
- **Positiva:** OpenRouter pasa de one-shot visible a target agencial real donde el adapter lo
  soporte, conservando MCP, normas y memoria.
- **Costo:** se reemplaza una API/UI existente y se mantienen aliases de compatibilidad durante la
  migracion. Requiere contract tests, E2E con fake-agent y auditoria de la construccion de argv.

## Criterios de aceptacion

1. Ningun string de creditos, suscripciones o "mejor modelo" aparece en el Task Profile ni Launch.
2. Un usuario puede crear/seleccionar perfiles y lanzar una sesion OpenRouter con un modelo que el
   mismo eligio, cuando el target declara soporte.
3. Los targets sin selector de modelo no ofrecen uno; los modelos no soportados fallan antes de
   crear una sesion.
4. El preview y los tests prueban deny-list, contexto, confirmacion frontier y argv estructurado.
5. Costos siguen el contrato token/USD verificable; las suites CLI/TUI y los gates Opus/Fable pasan.
