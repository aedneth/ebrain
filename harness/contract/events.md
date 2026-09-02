---
type: contract
project: ebrain
component: harness
created: 2026-07-11
status: frozen-v1
---

# ebrain harness — contrato de hooks (spec propia, congelada)

> Los hook systems de Claude Code y Codex convergieron en este contrato. Lo **adoptamos como spec
> propia de ebrain** (no dependemos de que un vendor lo mantenga). Los adaptadores por-agente mapean
> este contrato al formato nativo del agente. Los fixtures de `contract/fixtures/` + `core/contract-test.sh`
> corren en `ebrain doctor` → si un agente diverge, el doctor se pone **rojo** (alarma de drift), no falla en silencio.

## Eventos canónicos (snake_case)

| Evento | Cuándo | Uso en el harness |
|---|---|---|
| `session_start` | arranque de sesión | `inject-context.sh` → inyecta contexto ebrain (additionalContext) |
| `pre_tool_use` | antes de ejecutar un tool | `guard-secrets.sh` → deny lecturas de secretos |
| `post_tool_use` | después de un tool | (reservado) |
| `user_prompt_submit` | usuario envía prompt | (reservado) |
| `stop` | fin de sesión (agente completa) | `log-session.sh` → write-back de la sesión |
| `subagent_stop` | fin de subagente | `log-session.sh` (fallback si no hay `stop`) |
| `pre_compact` / `post_compact` | compactación de contexto | (reservado) |

## Input (stdin, JSON) — campos que el harness consume

```json
{
  "session_id": "…",
  "cwd": "/abs/path",
  "hook_event_name": "pre_tool_use",
  "tool_name": "shell",
  "tool_input": { "command": "cat foo" },
  "permission_mode": "…",
  "transcript_path": "…"
}
```

- El comando de shell se lee de `.tool_input.command` (fallback `.tool_input.cmd`). Tools no-shell → sin `command` → los hooks se auto-descartan (exit 0).
- `cwd` determina el repo → usado por `log-session.sh` (a qué `.brain/` escribir) y por trust-policy.

## Output — cómo señaliza un hook

**Denegar (pre_tool_use):** dual — ambos válidos simultáneamente:
- stdout: `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"},"decision":"deny","reason":"…"}`
- stderr + **exit 2**

**Inyectar contexto (session_start):** stdout JSON `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}`; fallback texto plano por stdout. exit 0.

**Permitir / no-op:** exit 0, sin salida.

**FAIL-OPEN:** cualquier error interno de un hook → exit 0. Un bug del harness nunca bloquea trabajo legítimo (la seguridad se garantiza por los contract-tests en doctor, no por fail-closed).

## Matcher

Los adaptadores registran los hooks con matcher vacío (`""` = match-all); cada script canónico se
auto-descarta si el evento/tool no le aplica. Así no dependemos del nombre exacto del tool-shell por agente.
