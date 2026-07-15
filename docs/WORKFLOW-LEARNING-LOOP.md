---
type: architecture-note
project: ebrain
status: implemented
created: 2026-07-15
tags: [workflows, skills, memory, hermes, safety]
---

# Workflow Learning Loop

ebrain convierte experiencia repetida en procedimientos locales y revisables. La
adaptacion toma del patron de aprendizaje de Hermes la progresion de memoria hacia
procedimientos, pero conserva las reglas del harness: una observacion no se vuelve
autonomia sin evidencia ni aprobacion humana.

## Ciclo

```text
session / agent / provider
          |
          v
ebrain remember (learning durable)
          |
          v
ebrain workflows capture (solo propone candidatos repetidos)
          |
          v
SOP/workflow Markdown privado -> ebrain workflows ingest (version local + redactada)
          |
          +--> Memory UI: browse -> Enter materializa prompt -> a lo adjunta a Launch
          |
          v
ebrain workflows skillify <id> --yes (SKILL.md local, aprobado explicitamente)
          |
          v
skillpack/MCP: list_skills + get_skill para cualquier agente conectado
```

## Contrato operativo

- `ebrain workflows ingest --json` descubre Markdown en los roots configurados de
  Second Brain y Company Brain. El contenido normalizado queda solo en
  `~/.config/ebrain/workflows` con directorio `700` y registros `600`.
- Cada workflow tiene `id`, hash de contenido, version monotonica, trigger, pasos y
  gates. Un ingest identico no incrementa la version.
- `list`, `search`, `show` y `run` son lecturas. `run` devuelve un prompt/checklist;
  no ejecuta shell, proveedor, agente ni workflow.
- `capture` usa learnings y session summaries para proponer un candidato solo cuando
  aparece al menos dos veces. No crea un workflow ni una skill.
- `skillify` genera `~/.config/ebrain/skills/<workflow>/SKILL.md` solo con `--yes`.
  El directorio ya forma parte del skillpack local publicado por MCP, por lo que el
  skill puede consultarse con `list_skills` y `get_skill` sin copiar secretos a una
  configuracion de agente.

## Guardrails

- Los cuerpos ingeridos y los candidatos de captura pasan por el scrubber de secretos
  antes de almacenarse, mostrarse o convertirse en skill.
- No se recorren paths deny-list de `brisas-del-golfo` ni `dekko`; los workflows nunca
  se registran ni se ejecutan desde esos repositorios.
- Los paths privados no se exponen en `list` ni en la TUI. El repositorio open-source
  solo contiene el contrato y esta documentacion, no SOPs de Eduardo.
- La TUI requiere una accion separada para cada frontera: Enter solo previsualiza;
  `a` adjunta texto a Launch; Launch decide el advisor, proveedor o sesion; cualquier
  skillificacion pide `--yes` en CLI.
- Un workflow no sustituye maker != checker. Los gates siguen exigiendo verify y
  auditoria externa cuando el cambio es de alto riesgo.

## Uso diario

```bash
ebrain workflows ingest --json
ebrain workflows search "structured agentic development" --json
ebrain workflows run <workflow-id> --json
ebrain workflows capture --json
ebrain workflows skillify <workflow-id> --yes --json
```

En `ebrain ui`, abrir Memory (`4`), usar Tab para enfocar `workflows`, Enter para
materializar el prompt o `a` para adjuntarlo a Launch. Desde Launch, `r` pide consejo;
ningun proveedor se invoca por el solo hecho de consultar o adjuntar un workflow.

## Limites actuales

- Capture propone; la curacion de un nuevo SOP sigue siendo humana.
- `skillify` genera un `SKILL.md` autocontenido. Assets y scripts especificos se
  agregan deliberadamente despues de revisar el skill, no por inferencia automatica.
- El ledger de costo por workflow es F6.6E: esta fase conserva el identificador del
  workflow para que ese ledger pueda atribuir ejecuciones sin cambiar el contrato.
