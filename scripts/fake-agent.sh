#!/usr/bin/env bash
# scripts/fake-agent.sh — fixture agent ESTÁNDAR del programa F6 (SPRINT-TUI 6.4.2).
#
# Reemplaza a un agente real (claude/codex/…) en los E2E de `ebrain sessions` y del panel
# Sessions de la TUI (6.4.3): banner de arranque, salida periódica timestamped (para que el
# peek en vivo tenga algo que mostrar), eco de stdin (para probar `send`), y CIERRE LIMPIO ante
# señal (para probar `kill` y el gobernador RAM). Diseñado para sobrevivir indefinidamente bajo
# tmux (60s+ trivial: el loop no tiene salida salvo señal) sin quemar CPU (bloquea en `read -t`).
#
# Env que inyecta el adapter/launch flow: AGENT_NAME. No requiere nada más.
set -u

AGENT_NAME="${AGENT_NAME:-desconocido}"
tick=0

# Cierre limpio: imprime una marca observable (el peek/E2E la puede assert-ear) y sale 0.
cleanup() {
  echo "[fake-agent ${AGENT_NAME}] señal recibida — cerrando limpio (ticks=${tick})"
  exit 0
}
trap cleanup TERM INT HUP

echo "fake-agent: listo (AGENT_NAME=${AGENT_NAME}, pid=$$)"
echo "fake-agent: escribí algo y enter para eco; kill/ctrl-c para cerrar limpio."

while true; do
  tick=$((tick + 1))
  echo "[fake-agent ${AGENT_NAME} $(date -u +%H:%M:%S)] tick ${tick}"
  # Bloquea hasta 2s esperando stdin — sin busy-loop. Timeout => sigue al próximo tick.
  if IFS= read -r -t 2 line; then
    if [ -n "${line}" ]; then
      # Formato estable (lo asserta cli/sessions.test.ts 6.1.6): "fake-agent: recibí: <line>".
      echo "fake-agent: recibí: ${line}"
    fi
  fi
done
