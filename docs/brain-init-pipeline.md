---
type: pipeline-design
project: ebrain
sprint: "2.6c"
created: 2026-07-11
status: implemented
related: [graphify-integration.md, SPRINT.md, GUARDRAILS.md]
---

# brain-init — Pipeline de bootstrap de proyecto (SPRINT 2.6c)

> **Dolor recurrente de Eduardo:** *"siempre que empiezo un proyecto nuevo debo indicarle la pipeline al agente: instala el per-project brain, conecta el Dev Brain, aplica graphify, deja hooks/scripts listos."* → un instalador **idempotente y agent-agnostic**, one-shot.

## Qué es

`~/eBrain/scripts/brain-init` — deja cualquier repo git listo con las 3 capas de memoria (per-project `.brain/` + Dev Brain + CKIS) y todos los hooks cableados. Idempotente, `--dry-run`, seguro de re-correr.

```bash
brain-init [PROJECT_DIR] [--slug S] [--name "N"] [--client]
           [--orchestrator-model M] [--worker-model M]
           [--no-register] [--force] [--dry-run]
```

## Qué hace (verificado end-to-end 2026-07-11)

| Paso | Acción | Idempotencia |
|---|---|---|
| 1 | `.brain/` skeleton + `scripts/` (assemble-context, log-session, log-tool-event, log-compact, register, sync-*) | scripts se refrescan; `sessions/decisions/bugs/graph` no se pisan |
| 2 | Render `config.sh` desde `config.sh.tmpl` — **rutas correctas `03-projects`/`05-knowledge`** (arregla el drift) + slug/name/models/trust | no pisa sin `--force` |
| 3 | git hooks → `.git/hooks/` (post-commit wrapper → `.graphify`+`.brain`; pre-commit → `.security`; post-checkout) | copia, siempre |
| 4 | Merge de hooks Claude Code en `.claude/settings.json` (SessionStart/Stop/PostToolUse/UserPromptSubmit/PreToolUse) | **no-destructivo**: preserva hooks de usuario existentes |
| 5 | `ORCHESTRATOR_BOOTSTRAP.md` parametrizado (provider-agnostic, `$ORCHESTRATOR_MODEL`/`$WORKER_MODEL`) | render |
| 6 | `.gitignore` += `graphify-out/` | idempotente |
| 7 | `register-to-dev-brain.sh` (conecta al Dev Brain) | idempotente; `--no-register` lo omite |
| 8 | `--client` → `deny` en `gstack-gbrain-repo-policy` (keyed por remote normalizado) → **nunca federa a ebrain** | — |
| 9 | doctor (config, hooks git, hooks Claude, scripts) + NEXT step | — |

## Frontera de cliente (GUARDRAILS §2/§3)

`--client` es la salvaguarda: marca `BRAIN_TRUST=client` en config.sh **y** fija `deny` en la trust policy de gstack (por remote git). brisas-del-golfo y dekko-floors se instalan/actualizan con `--client` → su `.brain` funciona local pero **jamás entra a ebrain** ni al ruteo por defecto.

## El paso graphify es de agente (honesto)

La extracción **semántica** de graphify dispara subagentes (necesita un runtime de agente) → NO se puede invocar de forma no-interactiva desde bash. `brain-init` deja todo lo determinista listo y emite el NEXT: `cd <repo> && /graphify .` para el grafo inicial. La reconstrucción incremental posterior (solo-código = sin LLM) la maneja el hook `post-commit.graphify` que graphify instala; el wrapper `post-commit` ya lo tolera presente/ausente. **Volver este paso multi-proveedor = SPRINT 2.6b** (capa de adaptadores).

## Template canónico

`~/eBrain/templates/brain/` — fuente de verdad versionada: `scripts/` (+ `lib/`), `githooks/`, `config.sh.tmpl`, `claude-settings.hooks.json`, `ORCHESTRATOR_BOOTSTRAP.md.tmpl`. Editar aquí propaga a futuros `brain-init`.

## Follow-up: drift en `.brain` YA desplegados

Los ~10 repos con `.brain` existente tienen el bug `02-projects`/`03-knowledge` en `config.sh` + `sync-graph-to-vault.sh`. El template ya está corregido (nuevos despliegues OK). Arreglar los desplegados = `brain-init <repo> --force` por repo PROPIO (korvex-* = commit local sin push; **clientes NO se tocan**). Batch pendiente, con cuidado de fronteras de repo.
