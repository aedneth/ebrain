---
type: integration-design
project: ebrain
sprint: "2.6"
created: 2026-07-11
status: decided
related: [ADR-001-brain-topology.md, SPRINT.md, GUARDRAILS.md, discovery/02-gbrain-federation.md]
---

# graphify ↔ ebrain — Integración (SPRINT 2.6)

> **Redirect de Eduardo (2026-07-11):** *"el propósito del Dev Brain es el cerebro autónomo que los agentes construyen en cada sesión… graphify ya construye el grafo de código y brain lo reconstruye automáticamente… en lugar de embeber todo Dev Brain, integrar graphify del per-project brain para queries de código."*

## Contexto verificado (2026-07-11)

graphify (`~/.claude/skills/graphify/SKILL.md`) es un motor completo: extrae grafo (AST estructural gratis + semántico LLM), **se auto-reconstruye** (`--update`/`--watch`; cambios solo-código NO gastan LLM), tiene **su propio motor de query** (BFS/DFS sobre `graph.json`), **su propio MCP server** (`query_graph`, `get_neighbors`, `shortest_path`, `god_nodes`, …), y emite Obsidian/wiki/GRAPH_REPORT.

**Arquitectura de 3 capas ya desplegada** (per-project `.brain/` + Dev Brain + CKIS):

| Capa | Qué es | Cómo crece |
|---|---|---|
| `.brain/` (por-repo) | sessions, decisions, bugs, graph, `_CONTEXT.md`, `config.sh`, `scripts/` | git hooks (agnósticos) + hooks Claude Code |
| Dev Brain (`~/Documents/Dev Brain`) | `code-graph/<proj>/`, `wiki/<proj>.md`, `sessions/`, `compacts/`, `projects.json` | auto vía graphify + Stop/post-commit hooks |
| CKIS (Second Brain) | conocimiento, decisiones, estrategia | agentes + skills CKIS |

**Tamaños medidos (Dev Brain):** `wiki/` 12 `.md`/32KB · `sessions/` 348/5.6MB · `code-graph/`: korvex 408, korvex-crm 230, **brisas 190, dekko 157** (clientes).

**Frontera crítica:** el Dev Brain **co-mezcla** conocimiento propio y de CLIENTE en TODAS sus capas — `wiki/brisas-del-golfo.md`, `wiki/dekko-floors.md`, `code-graph/brisas-del-golfo/`, `code-graph/dekko-floors/`. brisas-del-golfo y **dekko-floors** son repos de cliente **presentes** en la máquina (`aedneth/brisas-del-golfo`, `aedneth/dekko-floors`) → **deny** (GUARDRAILS §2/§3). korvex-web/korvex-crm presentes → read-only.

## Decisión: dos carriles de recuperación (bridge, no embed)

**No se embebe el Dev Brain en gbrain.** Se mantienen dos carriles ortogonales:

### Carril 1 — Conocimiento semántico (ebrain / gbrain) — YA VIVO
- Sources: `second-brain` + `company-brain` (embeddings). Responde *qué / por qué / decisiones / estrategia*.

### Carril 2 — Estructura de código (graphify) — SE MANTIENE, NO SE DUPLICA
- graphify sigue siendo el motor de grafo de código, **auto-reconstruido por sus hooks**. Responde *dónde está X / qué llama a Y / flujo de pago / god nodes*.
- **Integración (no duplicación):**
  1. **Registrar el MCP de graphify** junto al de ebrain (SPRINT 2.4) → un agente en cualquier sesión tiene AMBOS toolsets: `mcp__ebrain__query` (semántico) + `mcp__graphify__query_graph`/`get_neighbors`/`shortest_path` (estructura). Se puentea el motor existente; no se re-embebe.
  2. **Bloque `## Code Structure Guidance`** en los CLAUDE.md (análogo al `## GBrain Search Guidance` de gstack): instruye al agente a rutear preguntas de estructura a graphify / Dev Brain, y preguntas semánticas a ebrain.
  3. **Interfaz Dev Brain como fallback CLI** (ya existe, agnóstica): `query-all.sh` (cross-proyecto), `wiki/<proj>.md` (digest), `code-graph/<proj>/` (un `.md` por símbolo), `sessions/index.md`.

**Por qué bridge-no-embed:**
- Honra el redirect exacto de Eduardo (graphify ya lo construye y reconstruye — no duplicar).
- **Cero código de cliente entra a los embeddings de gbrain** — resuelve de raíz el problema de exclusión brisas/dekko (no hay nada que excluir si no se embebe).
- El carril de código queda vivo por los hooks de graphify; ebrain no asume mantenimiento del grafo.
- Escalable: proyecto nuevo con `.brain/` → aparece en Dev Brain y en graphify sin tocar ebrain.

**Frontera de cliente en el ruteo:** el router/guidance NUNCA dirige una query al grafo de un proyecto cliente (brisas, dekko) salvo que Eduardo lo scopee explícitamente con alcance definido. Los clientes no se federan ni se rutean por defecto.

### Enhancement opt-in (posterior, NO ahora)
Federar SOLO los digests `wiki/<proyecto-propio>.md` (excluyendo clientes) como un mini-source `dev-wiki` para que la búsqueda unificada de ebrain también "descubra" conocimiento de código propio y luego el agente profundice en graphify. Requiere un export wiki own-projects-only limpio (graphify no lo separa hoy). Diferido hasta que exista ese export; no vale la complejidad de excluir 2 archivos hermanos por ahora.

## Hallazgo B — Auditoría multi-agente / multi-proveedor (insumo F4)

Eduardo: *"todos los principios del Dev Brain, .brain, hooks, scripts deben ser multi-agentes… auditoría y adaptarlo a multiproveedor para model-routing."*

**Estado actual (pin 2026-07-11, sobre `recmp3-cli/.brain`):**

- **Dos capas de hooks:**
  - **git hooks** (`post-commit.brain`, `pre-commit.security`, `post-checkout`) → **YA agnósticos**: corren en cualquier commit sin importar qué agente lo hizo. ✅
  - **hooks de Claude Code** (`SessionStart`→`assemble-context.sh`, `Stop`→`log-session.sh`, `PostToolUse`→`log-tool-event.sh`, `UserPromptSubmit`→compacts) → **atados a Claude**: parsean el shape de JSON de los hooks de Claude Code y asumen su ciclo de vida. ⚠ **Este es el gap multi-agente.**
- Los scripts en sí son **bash agnóstico**; lo Claude-específico es (a) el *wiring* (qué evento los dispara) y (b) el *shape* del JSON que consumen por stdin.
- **`OPUS_BOOTSTRAP.md` está fuertemente acoplado a Anthropic:** `claude-opus-4-8`, `/model`, "Opus orchestrator / Sonnet workers", `claude --resume`, "Agent tool". Es el artefacto que más adaptación necesita para multi-proveedor.
- **Sin lectura de keys de proveedor en los scripts** (no hay `ANTHROPIC_API_KEY` hardcoded) → la adaptación es de *protocolo de eventos*, no de credenciales.

**Plan de adaptación (ejecuta en fase de model-routing, F4):**
1. **Capa de adaptadores de eventos**: un `hook-adapter` que normalice los eventos de cada agente (Claude Code Stop/PostToolUse/SessionStart; Codex; Cursor; gemini-cli; genéricos sin hooks → fallback git-hook + wrapper CLI) a un contrato interno único que los scripts `.brain/` consumen. Los scripts no cambian; cambia quién los invoca y con qué shape.
2. **`BOOTSTRAP.md` agnóstico**: reescribir `OPUS_BOOTSTRAP.md` → `ORCHESTRATOR_BOOTSTRAP.md` con rol/modelo parametrizados (`$ORCHESTRATOR_MODEL`, `$WORKER_MODEL`) resueltos por el routing de F4 (DeepSeek/GLM/Kimi/… o Claude), no hardcodeados.
3. **Fallback sin-hooks**: para agentes sin sistema de hooks, apoyar TODO en los git hooks (ya agnósticos) + un wrapper CLI `brain log-session` que el agente llama explícitamente al cerrar.

## Hallazgo C — Pipeline de bootstrap de proyecto (recurrente)

Eduardo: *"siempre que empiezo un proyecto nuevo debo indicarle la pipeline al agente: instala el per-project brain, conecta el Dev Brain, aplica graphify, deja hooks/scripts listos."* → planear, implementar, ejecutar como pipeline **agent-agnostic**, one-shot.

**Activos existentes:** `~/bootstrap-cli-suite.sh` (instalador, revisar alcance), `register-to-dev-brain.sh` (conecta `.brain`→Dev Brain, idempotente), la plantilla `.brain/` completa en cada CLI.

**Diseño objetivo — `brain-init` (script idempotente, `--dry-run`):**
```
brain-init [--client] [--orchestrator-model M] [--no-graphify]
  1. Copia la plantilla .brain/ (scripts, config.sh, dirs) al repo
  2. Rellena config.sh con PROJECT_SLUG/NAME + paths CKIS correctos (03-projects)
  3. Instala git hooks (post-commit.brain, pre-commit.security) — agnósticos
  4. Instala hooks del agente detectado (Claude Code settings.json; o fallback CLI)
  5. Corre graphify una vez (grafo inicial) salvo --no-graphify
  6. register-to-dev-brain.sh (idempotente)
  7. --client → fija trust=deny en gbrain-repo-policy (brisas/dekko pattern) y NO federa
  8. Escribe ORCHESTRATOR_BOOTSTRAP.md parametrizado
  9. Verifica: doctor (hooks vivos, grafo generado, registrado en Dev Brain)
```
- **`--client` es la salvaguarda clave:** un proyecto de cliente se marca deny y jamás entra a ebrain ni al ruteo por defecto.
- Vive como skill CKIS + script en `scripts/` de ebrain (o global). Agent-agnostic: el paso 4 detecta el agente; el resto es git/bash puro.

## Bugs / drift detectados (arreglar en la adaptación)
- **`config.sh` apunta a `02-projects/`** (numeración vieja) — el vault ya usa `03-projects/`. Drift en TODOS los `.brain` desplegados. Corregir en la plantilla + los desplegados.
- `AGENT_README.md` y OPUS_BOOTSTRAP citan `02-projects/` también.

## Criterios de aceptación 2.6
1. MCP de graphify registrado junto al de ebrain; un agente puede llamar ambos toolsets. (→ con 2.4)
2. Bloque `## Code Structure Guidance` en al menos un CLAUDE.md propio (no cliente). (→ con 2.5)
3. Cero código de cliente (brisas/dekko) en gbrain — verificado por diseño (no se embebe Dev Brain).
4. Plan B (multi-proveedor) y Plan C (bootstrap) escritos → ejecución en F4 / tarea dedicada.
