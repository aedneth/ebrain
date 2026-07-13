#!/usr/bin/env bash
# scripts/fake-agent.sh — fixture agent MÍNIMO para el E2E de `ebrain sessions` (SPRINT-TUI 6.1.6).
# A propósito chico: banner + salida periódica timestamped + eco de stdin. La versión completa
# (señal de cierre limpia, robustez 60s+ bajo tmux, la fixture estándar del programa) es 6.4.2 —
# este script solo necesita sobrevivir el E2E corto new→list→peek→send→kill de este chunk.
set -u

echo "fake-agent: listo (AGENT_NAME=${AGENT_NAME:-desconocido})"

while true; do
  echo "[fake-agent $(date -u +%H:%M:%S)] tick"
  if IFS= read -r -t 1 line; then
    echo "fake-agent: recibí: ${line}"
  fi
done
