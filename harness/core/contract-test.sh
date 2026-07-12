#!/usr/bin/env bash
# contract-test.sh — corre los fixtures del contrato contra el guard canónico y, opcionalmente,
# hace TEST DE PARIDAD contra otro guard (p.ej. el viejo block-env-read.sh) para probar equivalencia
# de comportamiento ANTES de reemplazarlo por un wrapper. Corre en `ebrain doctor` (alarma de drift).
# Uso: contract-test.sh [guard] [guard_paridad_opcional]
set -uo pipefail
HARNESS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUARD="${1:-$HARNESS/core/guard-secrets.sh}"
PARITY="${2:-}"
FIX="$HARNESS/contract/fixtures"

pass=0; fail=0; parity_fail=0
for f in "$FIX"/*.json; do
  name="$(basename "$f")"
  case "$name" in deny-*) want=2;; allow-*) want=0;; *) continue;; esac
  bash "$GUARD" < "$f" >/dev/null 2>&1; got=$?
  if [ "$got" = "$want" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "  ✗ $name: esperaba exit $want, dio $got"; fi
  if [ -n "$PARITY" ] && [ -f "$PARITY" ]; then
    bash "$PARITY" < "$f" >/dev/null 2>&1; pgot=$?
    [ "$pgot" != "$got" ] && { parity_fail=$((parity_fail+1)); echo "  ⚠ paridad $name: canónico=$got viejo=$pgot"; }
  fi
done
echo "contract-test: $pass ok, $fail fallidos$([ -n "$PARITY" ] && echo " · paridad: $parity_fail divergencias")"
[ "$fail" = 0 ] && [ "$parity_fail" = 0 ]
