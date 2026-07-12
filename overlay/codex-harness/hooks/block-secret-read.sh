#!/usr/bin/env bash
# Codex PreToolUse guard — equivalente al block-env-read.sh de Claude Code.
# Bajo `--sandbox danger-full-access` NO hay gate de aprobación, así que este hook
# es el ÚNICO control técnico que impide que un comando imprima el contenido de un
# archivo de secretos al contexto del modelo (lo cual lo enviaría al proveedor).
#
# Contrato Codex (Claude-compatible): recibe JSON por stdin con .tool_input.command;
# para DENEGAR imprime hookSpecificOutput.permissionDecision=deny Y sale 2 (belt+suspenders).
# FAIL-OPEN ante cualquier error propio (exit 0) para no romper comandos legítimos.
# Solo bloquea LECTORES apuntados a un archivo de secretos; escribir/`source` se permiten.
set -uo pipefail

payload="$(cat 2>/dev/null)" || exit 0
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // .tool_input.cmd // empty' 2>/dev/null)" || exit 0
[ -z "$cmd" ] && exit 0   # no es un comando de shell (otro tool) → no aplica

# Programas lectores cuyo stdout aterriza en contexto.
readers='cat|bat|less|more|head|tail|nl|xxd|od|hexdump|strings|tac|rev|nano|vim|vi|view|emacs|jq|yq|grep|egrep|fgrep|rg|ag|ack|awk|sed'
# Formas de archivo de secretos.
secret='(\.env([./]|$|[[:space:]"'\''])|\.env\b|[[:alnum:]_-]+\.env\b|secrets?\.[[:alnum:]]+|\.pem\b|[[:alnum:]_-]+\.key\b|id_rsa|/credentials\b|\.npmrc\b|\.netrc\b)'

deny() {
  local reason="$1"
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s},"decision":"deny","reason":%s}\n' \
    "$(printf '%s' "$reason" | jq -R -s .)" "$(printf '%s' "$reason" | jq -R -s .)"
  exit 2
}

if printf '%s' "$cmd" | grep -Eq "($readers)" && printf '%s' "$cmd" | grep -Eq "$secret"; then
  deny "BLOCKED por política ebrain: este comando parece leer un archivo de secretos/.env al contexto. Usá la variable en runtime, nunca imprimas su valor. (~/.codex/hooks/block-secret-read.sh)"
fi

# Bloquear dumps completos del entorno (printenv / env pelado) que listarían secretos cargados.
if printf '%s' "$cmd" | grep -Eq '(^|[|;&]|&&|\|\|)[[:space:]]*(printenv|env)[[:space:]]*($|[|;&<>])'; then
  deny "BLOCKED por política ebrain: volcar el entorno completo puede filtrar secretos. Consultá una variable no-secreta específica si la necesitás."
fi

exit 0
