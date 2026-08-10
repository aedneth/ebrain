#!/usr/bin/env bash
# contract-test.sh — corre los fixtures del contrato contra el guard canónico y, opcionalmente,
# hace TEST DE PARIDAD contra otro guard (p.ej. el viejo block-env-read.sh) para probar equivalencia
# de comportamiento ANTES de reemplazarlo por un wrapper. Corre en `ebrain doctor` (alarma de drift).
#
# También corre el contrato JSON unificado (SPRINT-TUI 6.1.8): `bun test cli/contract.test.ts`
# (zod) valida el schema de los `--json` contractuales (status/doctor/spend/routing/fleet/memory/...) contra
# FIXTURES — nunca spawns en vivo de los scripts reales. Por qué fixtures y no vivo: doctor.sh
# invoca ESTE script; un spawn en vivo de `doctor.sh --json` desde el suite sería un ciclo
# (doctor→contract-test→bun test→doctor→…). Ver el header de cli/contract.test.ts para el detalle.
#
# Uso: contract-test.sh [guard] [guard_paridad_opcional]
#
# RUN-ONCE por árbol de proceso (SPRINT-TUI 6.1.8, perf): el contrato (guard fixtures + JSON zod)
# es un chequeo GLOBAL, no per-adapter. `ebrain doctor` y `ebrain fleet` invocan `install.sh
# --doctor` para los 6 adapters, y cada install.sh corre ESTE script → el contrato corría 6-7×
# por comando (≈2s c/u ⇒ fleet 28s, doctor 31s). Con EBRAIN_CONTRACT_TESTED=1 en el entorno, este
# script hace short-circuit (exit 0) — quien lo corrió una vez arriba en el árbol setea la var para
# sus hijos. Un `ebrain harness doctor <agent>` suelto (var sin setear) lo corre una vez, como antes.
# NO cambia semántica de rc: skip = "ya verificado como verde en este árbol" (exit 0).
set -uo pipefail

if [ "${EBRAIN_CONTRACT_TESTED:-}" = "1" ]; then
  echo "contract-test: skipped (ya corrió en este árbol de proceso · EBRAIN_CONTRACT_TESTED=1)"
  exit 0
fi

HARNESS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$(dirname -- "${BASH_SOURCE[0]}")/ebrain-home.sh"
EBRAIN_HOME="$(ebrain_resolve_home "${BASH_SOURCE[0]}")"
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

# ── contrato JSON (zod) — no bloquea si bun no está disponible (WARN, no FAIL) ──────────────────
json_ok=1
JSON_TEST="$EBRAIN_HOME/cli/contract.test.ts"
BUN="${BUN:-$HOME/.bun/bin/bun}"; command -v bun >/dev/null 2>&1 && BUN=bun
if [ -f "$JSON_TEST" ]; then
  if command -v "$BUN" >/dev/null 2>&1; then
    jt="$(mktemp)"
    if "$BUN" test "$JSON_TEST" >"$jt" 2>&1; then
      json_ok=1
    else
      json_ok=0
      echo "  ✗ contrato JSON (zod) FALLÓ — $(tail -3 "$jt" | tr '\n' ' ')"
    fi
    rm -f "$jt"
  else
    echo "  ⚠ bun no disponible — salteo contrato JSON (zod) ($JSON_TEST)"
  fi
fi

echo "contract-test: $pass ok, $fail fallidos$([ -n "$PARITY" ] && echo " · paridad: $parity_fail divergencias") · JSON(zod): $([ "$json_ok" = 1 ] && echo ok || echo FAIL)"
[ "$fail" = 0 ] && [ "$parity_fail" = 0 ] && [ "$json_ok" = 1 ]
