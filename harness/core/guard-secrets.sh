#!/usr/bin/env bash
# guard-secrets.sh — GUARD CANÓNICO de secretos del ebrain harness (fuente única).
# Merge de ~/.claude/hooks/block-env-read.sh (Claude) + overlay/codex-harness/.../block-secret-read.sh
# (Codex). Provider-agnostic: consume el contrato de hook compartido (stdin JSON con
# .tool_input.command) y emite DUAL-output válido para ambos runtimes:
#   • JSON hookSpecificOutput.permissionDecision=deny en stdout   (Codex / Claude JSON mode)
#   • mensaje en stderr + exit 2                                   (Claude exit-code mode)
# FAIL-OPEN por diseño: cualquier error propio → exit 0 (un bug del guard nunca bloquea trabajo
# legítimo). Solo bloquea LECTORES apuntados a un archivo de secretos; escribir/`source` se permiten.
#
# Este archivo es EL canon. Los guards por-agente (~/.claude/hooks/, ~/.codex/hooks/) son wrappers
# de una línea que ejecutan este script. Cambiá el regex UNA vez, acá.
set -uo pipefail

payload="$(cat 2>/dev/null)" || exit 0
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // .tool_input.cmd // empty' 2>/dev/null)" || exit 0
[ -z "$cmd" ] && exit 0   # no es comando de shell (otro tool) → no aplica

# Programas lectores cuyo stdout aterriza en el contexto del modelo.
readers='cat|bat|less|more|head|tail|nl|xxd|od|hexdump|strings|tac|rev|nano|vim|vi|view|emacs|jq|yq|grep|egrep|fgrep|rg|ag|ack|awk|sed'
# Formas de archivo de secretos: .env, *.env, .env.local, secrets.*, *.pem, *.key, id_rsa, credentials, .npmrc, .netrc
secret='(\.env([./]|$|[[:space:]"'\''])|\.env\b|[[:alnum:]_-]+\.env\b|secrets?\.[[:alnum:]]+|\.pem\b|[[:alnum:]_-]+\.key\b|id_rsa|/credentials\b|\.npmrc\b|\.netrc\b)'

deny() {
  local reason="$1"
  # stdout: JSON (Codex + Claude JSON mode). jq -R -s . escapa de forma segura.
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s},"decision":"deny","reason":%s}\n' \
    "$(printf '%s' "$reason" | jq -R -s . 2>/dev/null)" "$(printf '%s' "$reason" | jq -R -s . 2>/dev/null)" 2>/dev/null
  # stderr + exit 2 (Claude exit-code mode)
  printf '%s\n' "$reason" >&2
  exit 2
}

if printf '%s' "$cmd" | grep -Eq "($readers)" && printf '%s' "$cmd" | grep -Eq "$secret"; then
  deny "BLOCKED (ebrain harness): este comando parece leer un archivo de secretos/.env al contexto — se enviaría al proveedor del modelo. Usá la variable en runtime, nunca imprimas su valor."
fi

# Dumps completos del entorno (printenv / env pelado) que listarían secretos cargados.
if printf '%s' "$cmd" | grep -Eq '(^|[|;&]|&&|\|\|)[[:space:]]*(printenv|env)[[:space:]]*($|[|;&<>])'; then
  deny "BLOCKED (ebrain harness): volcar el entorno completo puede filtrar secretos al contexto. Consultá una variable no-secreta específica si la necesitás."
fi

exit 0
