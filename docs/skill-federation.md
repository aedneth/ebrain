---
type: design
project: ebrain
sprint: "3.9 (nuevo — Eduardo)"
created: 2026-07-11
status: designed
related: [overlay/gstack-ckis/00-ckis-overlay-map.md, graphify-integration.md, SPRINT.md]
---

# Federación de skills — ebrain como capa de skills unificada, opcional, agent-agnostic

> **Eduardo (2026-07-11):** *"no solo integrar las skills de gbrain, sino TODAS las canónicas que uso a diario — las ckis-skills, las del Company Brain — y ver cómo skillificar workflows completos que repito en sesiones con Claude Code, Codex, etc. Y que sean opcionales en el ebrain."*

## El problema

Hoy las skills viven fragmentadas y atadas a Claude Code:
- **gstack** (54 en `~/.claude/skills/`): dev-loop (/autoplan, /review, /ship, /qa, /learn…).
- **ckis-skills** (35 en `vault/.claude/ckis-skills/`): braindump, process-inbox, daily-brief, weekly-review, knowledge-synthesis, korvex-design, ultraplan-bootstrap, url/youtube-processor…
- **Company Brain** (14 en `company-brain/.claude/skills/`): subconjunto con overlap (agent-browser, process-inbox, korvex-design, client-onboarding…).

Solapan (agent-browser, process-inbox, korvex-design aparecen 2-3 veces) y **solo las descubre Claude Code** (formato SKILL.md). Codex/gemini/otros no las ven.

## El mecanismo: gbrain brain-resident skillpack (nativo)

gbrain YA resuelve esto — no hay que construirlo:
- **`list_skills` / `get_skill` / `list_brain_skillpack`** (ops MCP, F0 §mcp): un brain **publica** skills como prose instruction-sets, descubribles por CUALQUIER cliente MCP.
- Gated por `mcp.publish_skills` → **opcional** (el agente las consulta cuando quiere; no fuerza nada).
- Vía MCP = **agent-agnostic**: Claude Code, Codex, gemini-cli, cualquier runtime que hable MCP hace `list_skills` y las recibe.

→ **ebrain publica un skillpack federado** que cataloga/referencia las canónicas. Un agente en cualquier repo llama `mcp__ebrain__list_skills` y ve el catálogo unificado, deduplicado, opcional.

## Diseño de la federación

1. **Registro canónico** (`overlay/skills/registry.yaml`): una entrada por skill canónica — `name`, `source` (gstack|ckis|company|skillified), `path`, `trigger`, `one_line`, `hosts` (claude|codex|…|all), `optional: true`. Dedup por nombre canónico (la versión más completa gana; las otras se marcan alias).
2. **Publicación**: un script `scripts/skills-publish` lee el registro y hace `mcp__ebrain__put` de cada skill como página tipo `skill` en un source `skills` (o las registra vía el skillpack de gbrain). `mcp.publish_skills=true`.
3. **Descubrimiento**: agentes → `list_skills`/`get_skill`. Opcional: el bloque `## ebrain Search + Code Guidance` (F2.5) gana una línea "para el catálogo de skills: `mcp__ebrain__list_skills`".
4. **Agent-agnostic**: como los SKILL.md son prose, cualquier agente los ejecuta. La adaptación de FORMATO por host (Claude/Codex tienen dirs distintos) la maneja el mismo patrón de adaptadores de **2.6b** (F4) — este diseño y 2.6b convergen.

## Skillify: convertir un workflow repetido en skill

Patrón (ya existe la semilla en la ckis-skill `workflow-extend-pattern-a`):
1. **Detectar** el workflow repetido (p.ej. "process inbox", "aplica el pipeline de dev", "onboard cliente") — señal: lo tecleas/dictas seguido en sesiones.
2. **Destilar** a un SKILL.md agnóstico: `name`, `trigger`, pasos numerados, gates, prohibiciones. Prosa, no código atado a un runtime.
3. **Registrar** en `registry.yaml` con `source: skillified`.
4. **Publicar** vía el skillpack → disponible en todos los agentes, opcional.

Los SOPs de Eduardo (development-pipeline-pattern-sop, ultraplan-cloud-execution) YA son skillifiables casi directo: tienen trigger + pasos + gates. El overlay CKIS↔gstack (F3.3/3.4) es el primer ejemplo: mapea el SOP a un loop ejecutable por skills.

## Por qué "opcional en ebrain" importa

- No se fuerza ninguna skill en ninguna sesión. El agente **pide** el catálogo (`list_skills`) cuando lo necesita.
- Un repo cliente (deny) no expone skills personales; el scoping de sources/token de F2 aplica igual al skillpack.
- Cero peso: publicar es barato (páginas prose); descubrir es una llamada MCP.

## Estado / tarea

Nueva tarea **SPRINT 3.9** (diseñada aquí; implementación tras cerrar 3.7/3.8):
- [ ] 3.9a `overlay/skills/registry.yaml` — catálogo dedup de las ~60 skills (gstack + 35 ckis + 14 company).
- [ ] 3.9b `scripts/skills-publish` — publica el skillpack vía MCP (`mcp.publish_skills=true`).
- [ ] 3.9c Validar `mcp__ebrain__list_skills` devuelve el catálogo unificado desde una sesión.
- [ ] 3.9d Patrón `skillify` documentado + 1 ejemplo (el SOP dev-pipeline → skill del loop). Convergencia con 2.6b (adaptadores por host).
