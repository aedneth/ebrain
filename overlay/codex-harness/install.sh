#!/usr/bin/env bash
# install.sh — instala el harness de Codex (hooks) de forma IDEMPOTENTE y NO-destructiva.
# Copia los scripts a ~/.codex/hooks/ y mergea ~/.codex/hooks/hooks.json preservando
# cualquier hook que Eduardo ya tenga. Valida con `codex doctor` al final.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DST="$HOME/.codex/hooks"
HJ="$DST/hooks.json"
mkdir -p "$DST"

# 1) scripts (copia + ejecutable)
for s in block-secret-read.sh session-context.sh; do
  cp "$SRC/hooks/$s" "$DST/$s"
  chmod +x "$DST/$s"
done

BLOCK="$DST/block-secret-read.sh"
SESS="$DST/session-context.sh"

# 2) merge no-destructivo del hooks.json (jq). Agrega nuestros handlers sin duplicar
#    (dedup por command path) y sin tocar handlers existentes.
tmp="$(mktemp)"
base='{}'
[ -f "$HJ" ] && base="$(cat "$HJ")"

echo "$base" | jq \
  --arg block "$BLOCK" --arg sess "$SESS" '
  def ensure(evt; cmd):
    (.[evt] //= [])
    | if any(.[evt][]?; .hooks[]?.command == cmd) then .
      else .[evt] += [ { "matcher": "", "hooks": [ { "type": "command", "command": cmd } ] } ] end;
  ensure("pre_tool_use"; $block)
  | ensure("session_start"; $sess)
' > "$tmp"

# validar que es JSON antes de instalar
jq -e . "$tmp" >/dev/null
mv "$tmp" "$HJ"

echo "✓ hooks instalados en $DST"
echo "  pre_tool_use  → block-secret-read.sh (guard de secretos, deny+exit2)"
echo "  session_start → session-context.sh (contexto ebrain/CKIS)"
echo ""
echo "hooks.json resultante:"
jq . "$HJ"
echo ""
echo "=== codex doctor (validación de config) ==="
codex doctor 2>&1 | grep -iE "hook|config|error|ok|healthy|warn" | head -20 || true
echo ""
echo "NOTA: Codex tiene 'hook trust' — la primera vez que corras codex puede pedirte"
echo "      confiar estos hooks (o corré con --dangerously-bypass-hook-trust en automatización)."
