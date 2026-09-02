# scripts/ — launchers de ebrain (templates versionados)

> Copias de referencia, versionadas en git para reconstructibilidad (GUARDRAILS §5).
> **Los ejecutables VIVOS están en `~/.config/ebrain/`** (fuera de todo repo), junto al `.env` (chmod 600, **NUNCA** commiteado). Estos templates NO contienen secretos — solo *sourcean* la ruta del `.env`.

| Script | Qué hace |
|---|---|
| `ebrain-run` | Launcher ebrain-native del CLI del motor interno gbrain: `cd` a cwd neutral (evita que `bun` auto-cargue un `.env` ajeno) → sourcea la key → `bun run vendor/gbrain/src/cli.ts "$@"`. |
| `ebrain-mcp-bridge` | Bridge stdio seguro para adapters: el agente habla stdio local; el bridge lee el token store chmod 600 en runtime y proxya al daemon HTTP. Los configs de agentes no guardan bearer literal. |
| `ebrain-mcp` | Fallback stdio MCP launcher del motor interno: igual + `MCP_STDIO=1`. Puede tomar el lock local; post-FASE D queda solo para rollback/manual debug. |
| `gbrain-run` / `gbrain-mcp` | Wrappers de compat hacia los nombres `ebrain-*` para configs viejas. |
| `ebrain-q` | **Cross-source fan-out** (overlay): consulta cada source federado y mergea por score. Compensa la v1 limitation de gbrain (`all_sources`/`__all__` devuelven vacío). Ver ADR-001 §cross-source. |
| `ebrain-brain` | **Host del daemon compartido (FASE D)**: asegura `EBRAIN_MCP_TOKEN` antes de bindear HTTP y luego ejecuta `gbrain serve --http --port 8541 --bind 127.0.0.1` — UN server HTTP-MCP dueño del lock PGLite. |
| `ebrain-daemon` | Control del host: `start\|stop\|status\|restart\|ensure\|install-service\|uninstall-service`. Wrapper delgado sobre `cli/daemon-control.ts` (igual que `ebrain-up` → `cli/up.ts`); el protocolo — pidfile verificado por identidad, lock de arranque atómico, arranque validado contra `/health`, rotación de log y supervisión systemd/launchd — vive ahí, donde es testeable. Cableado como `ebrain daemon …`. |
| `ebrain-up` | Wrapper de `ebrain up`/`ebrain onboard`: carga el env privado sin imprimir secretos, asegura token, registra agentes vía bridge al daemon y corre smoke `tools/list`. |

## Reinstalar en una máquina nueva
```bash
mkdir -p ~/.config/ebrain/wd
cp scripts/ebrain-run scripts/ebrain-mcp-bridge scripts/ebrain-mcp scripts/gbrain-run scripts/gbrain-mcp scripts/ebrain-q scripts/ebrain-brain scripts/ebrain-daemon scripts/ebrain-up ~/.config/ebrain/
chmod 700 ~/.config/ebrain/ebrain-run ~/.config/ebrain/ebrain-mcp-bridge ~/.config/ebrain/ebrain-mcp ~/.config/ebrain/gbrain-run ~/.config/ebrain/gbrain-mcp ~/.config/ebrain/ebrain-q ~/.config/ebrain/ebrain-brain ~/.config/ebrain/ebrain-daemon ~/.config/ebrain/ebrain-up
# crear ~/.config/ebrain/.env (chmod 600) con OPENAI_API_KEY  ← manual, nunca en git
# luego: ebrain up
```
