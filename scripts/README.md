# scripts/ — launchers de ebrain (templates versionados)

> Copias de referencia, versionadas en git para reconstructibilidad (GUARDRAILS §5).
> **Los ejecutables VIVOS están en `~/.config/ebrain/`** (fuera de todo repo), junto al `.env` (chmod 600, **NUNCA** commiteado). Estos templates NO contienen secretos — solo *sourcean* la ruta del `.env`.

| Script | Qué hace |
|---|---|
| `gbrain-run` | Launcher del CLI de gbrain: `cd` a cwd neutral (evita que `bun` auto-cargue un `.env` ajeno — root-cause del 400 en F1) → sourcea la key → `bun run vendor/gbrain/src/cli.ts "$@"`. |
| `gbrain-mcp` | Launcher del MCP server (stdio) para Claude Code: igual + `MCP_STDIO=1`. Registrado a user-scope (`claude mcp add ebrain --scope user -- ~/.config/ebrain/gbrain-mcp`). |
| `ebrain-q` | **Cross-source fan-out** (overlay): consulta cada source federado y mergea por score. Compensa la v1 limitation de gbrain (`all_sources`/`__all__` devuelven vacío). Ver ADR-001 §cross-source. |
| `ebrain-brain` | **Host del daemon compartido (FASE D)**: asegura `EBRAIN_MCP_TOKEN` antes de bindear HTTP y luego ejecuta `gbrain serve --http --port 8541 --bind 127.0.0.1` — UN server HTTP-MCP dueño del lock PGLite. |
| `ebrain-daemon` | Control del host: `start\|stop\|status\|restart` (pidfile + guard del lock single-writer). Cableado como `ebrain daemon …`. |
| `ebrain-up` | Wrapper de `ebrain up`/`ebrain onboard`: carga el env privado sin imprimir secretos, asegura token, registra agentes por HTTP-MCP y corre smoke `tools/list`. |

## Reinstalar en una máquina nueva
```bash
mkdir -p ~/.config/ebrain/wd
cp scripts/gbrain-run scripts/gbrain-mcp scripts/ebrain-q scripts/ebrain-brain scripts/ebrain-daemon scripts/ebrain-up ~/.config/ebrain/
chmod 700 ~/.config/ebrain/gbrain-run ~/.config/ebrain/gbrain-mcp ~/.config/ebrain/ebrain-q ~/.config/ebrain/ebrain-brain ~/.config/ebrain/ebrain-daemon ~/.config/ebrain/ebrain-up
# crear ~/.config/ebrain/.env (chmod 600) con OPENAI_API_KEY  ← manual, nunca en git
# luego: ebrain up
```
