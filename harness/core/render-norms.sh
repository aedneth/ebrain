#!/usr/bin/env bash
# harness/core/render-norms.sh — renderiza NORMS.md (fuente única) dentro de un BLOQUE GESTIONADO
# en un archivo destino (CLAUDE.md / AGENTS.md / …), delimitado por marcadores. Idempotente:
# correrlo dos veces no cambia el archivo. Preserva TODO lo que está fuera del bloque (secciones a mano,
# canary, etc.). Hace backup antes de tocar. Así las normas viven una vez y no divergen entre agentes.
#
# Uso:  render-norms.sh [--source <NORMS.md>] <archivo-destino>
set -uo pipefail

. "$(dirname -- "${BASH_SOURCE[0]}")/ebrain-home.sh"
EBRAIN_HOME="$(ebrain_resolve_home "${BASH_SOURCE[0]}")"

BEGIN_MARK="<!-- ebrain-norms:begin -->"
END_MARK="<!-- ebrain-norms:end -->"
NOTE="<!-- gestionado por 'ebrain norms render' — editá harness/core/NORMS.md, NO este bloque -->"
SRC="$EBRAIN_HOME/harness/core/NORMS.md"
TARGET=""

while [ $# -gt 0 ]; do
  case "$1" in
    --source) SRC="${2:-}"; shift 2 ;;
    -*) echo "render-norms: flag desconocido '$1'" >&2; exit 2 ;;
    *) TARGET="$1"; shift ;;
  esac
done

[ -n "$TARGET" ] || { echo "render-norms: uso: render-norms.sh [--source NORMS.md] <archivo-destino>" >&2; exit 2; }
[ -f "$SRC" ] || { echo "render-norms: falta la fuente '$SRC'" >&2; exit 1; }

NORMS="$(cat "$SRC")"

# Backup del destino (si existe) antes de modificar.
if [ -f "$TARGET" ]; then
  BK="$EBRAIN_HOME/harness/.backups"; mkdir -p "$BK" 2>/dev/null || true
  cp "$TARGET" "$BK/$(basename "$TARGET").$(date +%Y%m%d-%H%M%S).bak" 2>/dev/null || true
fi

# 1) Quitar cualquier bloque gestionado previo (begin..end inclusive).
STRIPPED=""
if [ -f "$TARGET" ]; then
  STRIPPED="$(awk -v b="$BEGIN_MARK" -v e="$END_MARK" '
    BEGIN{skip=0}
    index($0,b){skip=1}
    skip==0{print}
    index($0,e){skip=0}
  ' "$TARGET")"
fi

# 2) Recortar líneas en blanco al final (determinismo → idempotencia exacta).
CORE="$(awk '{a[NR]=$0} END{last=NR; while(last>0 && a[last] ~ /^[[:space:]]*$/) last--; for(i=1;i<=last;i++) print a[i]}' <<<"$STRIPPED")"

# 3) Re-emitir: contenido preservado + una línea en blanco + bloque fresco.
TMP="$(mktemp "${TMPDIR:-/tmp}/ebrain-norms.XXXXXX")" || { echo "render-norms: no pude crear temp" >&2; exit 1; }
{
  if [ -n "$CORE" ]; then printf '%s\n\n' "$CORE"; fi
  printf '%s\n' "$BEGIN_MARK"
  printf '%s\n' "$NOTE"
  printf '%s\n' "$NORMS"
  printf '%s\n' "$END_MARK"
} > "$TMP"

mv "$TMP" "$TARGET" || { echo "render-norms: no pude escribir '$TARGET'" >&2; rm -f "$TMP"; exit 1; }
echo "render-norms ✓ → $TARGET (bloque gestionado; fuente: $SRC)"
