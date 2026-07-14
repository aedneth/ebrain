---
type: handoff
project: ebrain
from: Opus (Claude Code, orquestador/auditor)
to: Codex (maker/constructor)
created: 2026-07-14
audit_by: Opus + Fable 5
status: active
---

# HANDOFF — ebrain → Codex (terminar de construir ebrain)

> Codex: sos el **maker/constructor**. Opus (Claude Code) es el **auditor/checker**; Fable 5 audita en los gates.
> **maker ≠ checker** — lo que construyas, Opus lo audita antes de merge; nadie se auto-aprueba en cambios de
> alto riesgo. Al final de tu sesión producís un **HANDOFF-BACK.md** (mismo rigor que este) para que Opus + Fable
> auditen. Leé primero §0 (docs clave), después §5 (cómo trabajamos), después el backlog §4.

━━━

## 0. Documentos clave que DEBÉS leer antes de tocar nada

Corré esto primero para cargar contexto (en orden):

```bash
cd ~/eBrain
cat AGENTS.md                              # tus normas (bloque ebrain-norms, cross-agente) — LEY
cat docs/SPRINT-DAEMON.md                  # la fase ACTUAL: daemon HTTP-MCP compartido (D.0–D.7)
cat docs/adr/ADR-004-shared-brain-daemon.md   # por qué el daemon (lock single-writer) + los 4 gates
cat docs/adr/ADR-001-brain-topology.md     # federación default-deny + frontera brisas/dekko (aislamiento)
cat docs/adr/ADR-002-unified-harness.md    # el harness unificado (adapters/hooks/normas)
cat docs/adr/ADR-003-tui-stack.md          # el stack de la TUI + corolario del lock
sed -n '1,80p' CHANGELOG.md                # qué se hizo, más reciente arriba (canon de "qué cambió")
cat docs/SPRINT-TUI.md                     # la TUI (F6) — fases y estado
cat cli/isolation.ts                       # el gate de aislamiento (criterio 4) — invariantes puros
ls harness/adapters/*/manifest.yaml        # los 6 adapters (claude/codex/gemini/cursor/opencode/generic)
cat scripts/ebrain-brain scripts/ebrain-daemon   # el host daemon + su control
```

También:
- **`~/Documents/Second Brain/`** — CKIS, el segundo cerebro de Eduardo (instancia personal, público en github.com/aedneth/ckis). ebrain es su **evolución productizable**. Su `CLAUDE.md` + `01-systems/ckis/CHANGELOG.md` tienen el meta-contexto.
- **`~/Documents/Dev Brain/AGENT_README.md`** — índice de código agent-queryable (graphify). `graphify query "<pregunta>"` para estructura de código.
- **El motor:** `vendor/gbrain/` = **garrytan/gbrain** (upstream de tercero, v0.42.58). NO lo forkees. ebrain es una CAPA que lo envuelve (ver §2 rename policy).

━━━

## 1. Qué ES ebrain (la tesis)

**ebrain = la consolidación de UN harness agéntico de memoria permanente, multiproveedor, provider-agnostic.**
Resuelve los problemas del desarrollo agéntico: contexto, memoria permanente, multi-provider (claude/codex/gemini/
cursor/opencode), múltiples sesiones concurrentes, costos de LLM. El **valor central y el moat** es esa consolidación:
**un solo cerebro que TODOS tus agentes comparten** — no hacks de memoria por-agente.

**North star (crítico, ver memoria `project_ebrain_open_source_plug_and_play`):** ebrain se **libera open-source, público**
como CKIS. Por eso DEBE ser **plug-and-play** — nada de OAuth/tokens/locks/curl a la vista del usuario. La fricción mata
la adopción. El objetivo: `curl -fsSL … | sh` → `ebrain up` → listo, todos tus agentes comparten un cerebro.

━━━

## 2. Arquitectura (estado LIVE hoy 2026-07-14)

**Modelo de capas:** `ebrain` (CLI/harness/TUI, tu capa) **envuelve** el motor `gbrain` (garrytan/gbrain: PGLite,
embeddings vía API OpenAI 3-large, tools MCP, search). ebrain delega al motor; no lo reimplementa.

**Rename policy (superficie, decidido por Eduardo):** hacemos que la capa ebrain hable 100% "ebrain"; el motor queda
`gbrain` interno. **SE RENOMBRA:** launchers wrapper, strings de output, artefactos nuevos (nacen ebrain-native).
**SE QUEDA (interfaz del motor):** env `GBRAIN_*`, `~/.gbrain/`, `vendor/gbrain/`, el ancla de parseo `GBrain Health Check`,
el campo de contrato `gbrain_untracked`, check-IDs estables. Ver §Rename policy en SPRINT-DAEMON.md.

**El daemon (FASE D, ADR-004 = GO) — LIVE:**
- Un solo **host** `gbrain serve --http --port 8541 --bind 127.0.0.1` (loopback), **dueño único del lock single-writer
  de PGLite**. Launcher: `scripts/ebrain-brain`; control: `ebrain daemon {start|stop|status|restart}`.
- Los **agentes** conectan por **MCP-HTTP** al host (`http://localhost:8541/mcp`) con **bearer token** — reemplaza el
  `gbrain-mcp` stdio. claude `--transport http --header`, codex `--url --bearer-token-env-var`, etc.
- **Auth:** OAuth2.1 en el host; el token de agente se acuña con `gbrain auth create "<name>"` (bearer long-lived,
  validado: `/mcp` con bearer → HTTP 200, sin bearer → 401). El bootstrap admin token (`GBRAIN_ADMIN_BOOTSTRAP_TOKEN`
  en `~/.config/ebrain/.env`) es solo para `/admin`.

**Sustrato de sesiones:** **tmux** es el data-plane (las sesiones sobreviven a la TUI). `ebrain sessions new <agent> <slug>`
lanza el agente en una sesión tmux con el env del harness. La **TUI** (`ebrain ui`) es el cockpit/control-plane.

━━━

## 3. Estado actual — qué está hecho

- **FASE D (daemon):** D.0 (spec) ✅, D.1 (RAM gate=PASS: host ~9MB idle / ~600MB pico al servir, RSS live 317MB) ✅,
  D.2 (host launcher + `ebrain daemon` + auditoría auth crit.2=PASS) ✅, D.5 (isolation gate crit.4, `cli/isolation.ts`
  + 6 tests) ✅. **Host LIVE en :8541, auth 200 probada, ≥1 agente conectando.** Falta D.4 (rewire completo)/D.6/D.7.
- **FASE 6 (TUI):** 6.0–6.5 ✅ (home real + 5 vistas: sessions/launch/memory/routing/doctor sobre datos vivos vía
  `ebrain <sub> --json`), 6.6 focus model (Tab) ✅. Theming **contour-only** (cero relleno interior; el fondo es del
  usuario) + cursor de selección; **cero hex hardcodeado** (todo del design-system). 100% inglés.
- **Fixes recientes:** launch full-access de los 6 agentes (claude `--dangerously-skip-permissions`, codex
  `--dangerously-bypass-approvals-and-sandbox`, etc.); último español→inglés; attach env-aware (Ctrl-b d).
- **Suites:** TUI 360 + CLI 123 = verde. Cero-hex limpio.

━━━

## 4. Backlog — qué FALTA (priorizado)

### PRIORIDAD 1 — Plug-and-play onboarding (el objetivo open-source)
El cutover manual que hicimos = la **implementación de referencia**. Destilalo en comandos idempotentes:
- **`ebrain up`** (1 comando): detecta estado → si primer run: acuña bootstrap token + **acuña el token de agente
  DURANTE el boot, antes de bindear HTTP** (ahí ya tiene el lock — elimina el baile stop/mint/start que sufrimos) →
  arranca el host → **auto-registra** el MCP HTTP de todos los agentes detectados → verifica (health + smoke `tools/list`).
  Idempotente: en runs siguientes solo asegura host-up + registros. Maneja el **handoff del lock** (detecta un `serve`
  stdio vivo y migra con aviso, no se cuelga — ver el guard ya hecho en `ebrain-daemon`).
- **`ebrain onboard [--all|<agent>]`**: detecta claude/codex/gemini/cursor/opencode instalados y registra su MCP HTTP
  con el token (claude `--header`, codex `--bearer-token-env-var`, gemini/cursor/opencode por su config `url`).
  **El usuario nunca ve el token/OAuth/lock.** Guardá el token en un store seguro (no en dotfiles planos si se puede;
  un credential-helper o `~/.config/ebrain/.env` chmod 600 gitignored). Para sesiones tmux, inyectá `EBRAIN_MCP_TOKEN`
  en el env del harness (adapters).
- **Installer** `curl -fsSL … | sh`: instala bun + clona/pinea gbrain + ebrain + corre `ebrain up`.

### PRIORIDAD 2 — Terminar FASE D (cerrar el daemon)
- **D.4:** rewire de los 6 `mcp.register` de stdio→HTTP en los manifests; mantener stdio como fallback; **D.4.4** rename
  de launchers `gbrain-run`/`gbrain-mcp`→`ebrain-run`/`ebrain-mcp` con symlink compat (folded acá, toca el MCP vivo).
- **D.2.4:** integrar estado del daemon en `ebrain doctor` (up/down + health).
- **D.6:** registrar los agentes restantes + prueba ≥2 concurrentes (criterio 1). **D.7:** GATE `[AUDIT_PASS]` + Fable 5.
- **Enforce criterio 4:** el host corre `assertNoClientSources()` (de `cli/isolation.ts`) sobre su config de sources
  antes de exponer MCP.

### PRIORIDAD 3 — FASE 6.6/6.7 (TUI)
- 6.6.1 launch wizard (describe tarea → advisor sugiere carril → preview de contexto → confirmar → `sessions new`),
  6.6.2 advisor v1 (señales: memoria/RAM/spend), 6.6.3 prompt composer multiline. 6.7 hardening + ship.

━━━

## 5. CÓMO trabajamos (disciplina — NO negociable)

- **Pipeline spec-driven:** contexto → plan → implementar → review → gate → ship. Nada de código a ciegas; leé el spec
  de la fase, seguí sus tareas atómicas (una tarea = un resultado verificable con su comando de **verify**).
- **maker ≠ checker:** vos construís, **Opus audita** antes de merge. En cambios de alto riesgo (arquitectura,
  migraciones, releases) nadie se auto-aprueba. Fable 5 audita en los gates marcados.
- **Commit por fase** con mensaje descriptivo. **NUNCA** commitees `.brain/`, `.claude/`, backups ni secretos.
  Ojo: hay un auto-backup `ckis-backup` que barre commits — hacé tu commit descriptivo igual (queda el rastro).
- **CHANGELOG** (`~/eBrain/CHANGELOG.md`) después de cualquier cambio estructural (más reciente arriba). Rastro narrativo.
- **`ebrain remember "<learning>"`** cuando aprendas algo durable (un fix, un gotcha, un por qué). Memoria agéntica
  permanente cross-agente. Una cosa por llamada, auto-contenida. NO guardes secretos.
- **Gates:** `[AUDIT_PASS]` por gate antes de avanzar de fase. Toda tarea que gasta dinero declara costo ANTES.
- **Verificá siempre:** corré la suite (`bun test ./cli/` y `./tui/test/`), el cero-hex si tocás TUI, y probá en vivo
  cuando aplique. Reportá fallos con su output; no escondas un test roto.

### SEGURIDAD (regla dura, sin excepciones)
- **NUNCA** leas/muestres/`cat`/`grep` dotenv/`.env.*` ni credenciales (`*.pem`,`*.key`,`id_rsa`,`.npmrc`,`.netrc`).
  NUNCA dumpees el entorno pelado. NUNCA pongas API keys/tokens/secretos en logs/commits/PRs — referite por NOMBRE
  (`EBRAIN_MCP_TOKEN`, `GBRAIN_ADMIN_BOOTSTRAP_TOKEN`), nunca el valor. `git add <archivos>` específico, nunca `-A`.
- **REPOS DE CLIENTE:** `brisas-del-golfo` y `dekko` = **deny total**. NUNCA los exfiltres, NUNCA los cruces a la
  memoria/federación, NUNCA los uses como cwd. Ya hay guard (`cli/isolation.ts`, `isClientPath`/`isClientSource`).
- **RAM (Celeron 4GB):** **un agente heavy interactivo a la vez** (gobernador F6.4.6). No corras dos agentes vivos en paralelo.
- **Modelos:** nunca auto-escales a un modelo frontier; eso lo invoca Eduardo a mano.

━━━

## 6. Aprendizajes / gotchas destilados (multi-sesión)

- **Root cause del "MCP nunca carga":** PGLite es **single-writer**; cada `gbrain serve` de agente hacía polling del
  lock para siempre (probe: 2º `initialize` → exit 124). Fix = el daemon (un host dueño del lock, agentes por HTTP).
- **`gbrain serve` es host-only** (no existe thin-client-serve): los agentes NO corren un serve proxy → conectan por
  MCP-HTTP directo. El thin-client (`callRemoteTool`) es solo para ops de CLI.
- **Bootstrap admin token = solo `/admin`**; el bearer de agente se acuña con `gbrain auth create`. Insight para `ebrain up`:
  **acuñar el token durante el boot antes de bindear HTTP** evita el stop/mint/start.
- **tmux argv-splitea** un comando multi-palabra (`sleep 300`→`sleep`+`300`), por eso `launch: claude --flag` funciona.
- **Attach dentro de tmux:** `switch-client` secuestra el cliente (Ctrl-b d saca de todo); fuera de tmux `attach-session`
  (Ctrl-b d = detach). El guard ya declina dentro de tmux.
- **Theming terminal:** el fondo es del USUARIO — no rellenar interiores (bandea/se ve buggy). DS por **contornos** +
  cursor de selección. **Cero hex hardcodeado**, todo del design-system.
- **Auto-backup `ckis-backup`** barre commits cada ~15min con mensaje genérico; hacé tu commit descriptivo igual.
  El warning `.npmrc not found` en cada commit es advisory (NO crees ese archivo con forma de credencial).
- **RAM live:** host RSS 317MB sirviendo, 561MB libres. El daemon **consolida** N serves en 1 (más eficiente multi-agente).

━━━

## 7. Tu entregable al cerrar (OBLIGATORIO)

Al terminar tu sesión, generá **`docs/HANDOFF-BACK.md`** con el mismo rigor que este: qué construiste, decisiones y su
**por qué**, gotchas nuevos, qué tests corriste y su resultado, qué quedó pendiente, y qué debe auditar Opus + Fable.
Además: entrada en el **CHANGELOG** y un **`ebrain remember`** por cada aprendizaje reutilizable. Sin rastro no hay merge.

**Empezá por PRIORIDAD 1 (plug-and-play `ebrain up`)** salvo que Eduardo indique otra cosa — es el camino al open-source,
que es el objetivo. Cuando tengas dudas de alcance o toques algo irreversible/hacia afuera: pará y preguntá a Eduardo.
