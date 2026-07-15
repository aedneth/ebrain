---
type: integration-plan
project: ebrain
status: deferred
created: 2026-07-15
depends_on: [ADR-005-user-governed-model-selection.md, COST-LEDGER.md]
---

# Plan de integracion -- evidencia de benchmarks

## Decision de alcance

No se integra un ranking vivo durante F6.6/F6.7. Primero se termina la seleccion gobernada por
usuario, perfiles, targets y wizard. Un benchmark no puede decidir automaticamente el modelo:
las suites miden tareas y versiones acotadas, mientras que la preferencia, costo y restricciones
del usuario son locales.

La integracion futura sera **evidencia importable y fechada**, no un recomendador.

## Fuentes a evaluar

| Fuente | Senal | Uso posible | Limite |
|---|---|---|---|
| [OpenCompass](https://github.com/open-compass/opencompass) | Evaluacion reproducible en muchos datasets | Runner opt-in de subsets pequenos | Requiere runtime/model endpoint y costo por corrida |
| [LiveBench](https://github.com/livebench/livebench) | Calidad general reciente, preguntas renovadas | Importar release/resultados o correr subset API | No es tiempo real; agentic coding puede requerir Docker y mucho disco |
| [LMArena/FastChat](https://github.com/lm-sys/fastchat) | Preferencia humana conversacional | Importar snapshot de leaderboard como contexto | No mide un workflow de coding/terminal concreto |
| [SWE-bench](https://github.com/SWE-bench/sb-cli) | Resolucion de issues de software | Evidencia remota de agentes de coding | Pesado; no corre en el Celeron de 4 GB |
| [Terminal-Bench](https://github.com/harbor-framework/terminal-bench-challenges) | Trabajo agencial en terminal | Validar targets agenciales concretos | Contenedores y recursos altos; no es refresco diario |

## Contrato futuro

Un registro local de evidencia tendra, como minimo:

```json
{
  "source": "opencompass",
  "source_url": "https://...",
  "version": "...",
  "as_of": "2026-07-15T00:00:00Z",
  "task_scope": "coding",
  "model": "provider/model",
  "metric": "pass_at_1",
  "score": 0.0,
  "run_cost_usd": null,
  "reproducible": true
}
```

No contiene prompts privados, credenciales, cuotas, ni una etiqueta `best`. `run_cost_usd` es el
costo de ejecutar el benchmark si se conoce; no es precio de suscripcion ni costo estimado de una
sesion posterior.

## Fases post-ship

1. Definir schema/CLI `ebrain evidence import|list|validate --json`, con store local 700/600,
   contract tests y deduplicacion por fuente/version/modelo/fecha.
2. Implementar importadores read-only para snapshots exportados por el usuario. No scraping ni
   actualizacion en background.
3. Agregar runner opt-in de OpenCompass o LiveBench con `--dry-run`, presupuesto declarado y
   confirmacion explicita antes de cada llamada pagada.
4. Mostrar evidencia en Profiles/Launch con fuente, fecha, scope, metrica y costo de corrida. La
   UI permite filtrar, nunca reordena perfiles ni cambia la seleccion del usuario.
5. Evaluar ejecuciones remotas aisladas para SWE-bench/Terminal-Bench; el host local no recibe
   Docker pesado, modelos ni secretos de ese runner.

## Gate de adopcion

Antes de implementar un adaptador se exige licencia compatible, version/dataset accesible,
proveniencia verificable, mapeo exacto de IDs de modelo, costo/RAM documentados, fixture offline y
auditoria de que no escribe secretos ni modifica perfiles. Toda corrida externa es opt-in de
Eduardo/usuario.
