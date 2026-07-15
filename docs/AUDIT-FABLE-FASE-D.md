---
type: audit
project: ebrain
phase: FASE D — daemon HTTP-MCP compartido (ADR-004)
auditor: Fable 5 (segundo checker, maker=Codex, primer checker=Opus)
created: 2026-07-15
verdict: FABLE_AUDIT_PASS
---

# AUDITORÍA INDEPENDIENTE FASE D — Fable 5 (segundo checker)

> Re-verificación independiente del `[AUDIT_PASS]` de Opus (2026-07-14) sobre el daemon
> HTTP-MCP. Toda la evidencia de abajo es propia (comandos corridos 2026-07-15), no
> re-cita de la auditoría de Opus. Metodología read-only: cero commits, cero restart del
> daemon, swarm de clientes curl (no sesiones de agente), token siempre redactado.

━━━

## VEREDICTO: `[FABLE_AUDIT_PASS]`

**Confirmo el `[AUDIT_PASS]` de Opus sobre los 4 gates GO del ADR-004**, con evidencia
propia e independiente. Los findings F-D1 y F-D2 de Opus se **confirman** (F-D1 con
severidad ajustada al alza, F-D2 con un detalle que Opus no reportó). Encontré **un
finding nuevo de severidad media (F-F1)** que NO bloquea los gates tal como están
definidos (son sobre el canal MCP de agentes, que funciona), pero que degrada
silenciosamente la superficie CLI/write-back en el estado estable del daemon y **debe
entrar al backlog como tarea de cierre junto a D.5.4**. Además, F-F1 invalida el valor
probatorio de una pieza de evidencia que usaron tanto el maker como Opus (F-F2).

━━━

## 1. D.6 — CONFIRMADO (evidencia propia)

Estado previo verificado por mí:
- `ps -eo pid,cmd | grep '[c]li\.ts serve'` → **UN** solo proceso: PID 132434,
  `bun run ~/eBrain/vendor/gbrain/src/cli.ts serve --http --port 8541 --bind 127.0.0.1`.
- `ss -ltnp | grep 8541` → `LISTEN 127.0.0.1:8541` (**loopback-only**), dueño `bun` pid 132434.
- pidfile `~/.config/ebrain/ebrain-brain.pid` = 132434 = PID real del serve (consistente).

**Mi swarm (más agresivo que el de Opus): 8 clientes MCP `tools/list` concurrentes**
contra `http://127.0.0.1:8541/mcp` con bearer (cargado a env desde el store, nunca impreso):
- **8/8 = HTTP 200 en 0.163s** total (elapsed medido con `date +%s.%N`).
- Conteo exacto parseando el SSE: **94 tools** (coincide con el número de Opus).
- serve count **antes=1, después=1** — un solo dueño del lock durante todo el swarm.
- Probes de auth negativos: sin bearer → **401**; bearer inválido → **401**.
- `claude mcp list` (comando CLI corto, no sesión) → `ebrain: http://127.0.0.1:8541/mcp (HTTP) - ✔ Connected` con el serve intacto (count=1).
- `codex mcp list` → registrado con **indirección env-var** (`EBRAIN_MCP_TOKEN`), **cero token literal** en su salida (verificado con grep de patrón sin imprimir contenido; la columna "Auth" dice literalmente "Bearer token", no un valor).

**Idempotencia (corrida por mí):** `ebrain up` ×2 → idéntico, rc=0, smoke 94 tools,
onboard 5/5 `ok`, serve=1. `ebrain onboard --all` ×2 → 5/5 `ok`, sin duplicados
(`claude mcp list` = exactamente 1 entrada ebrain).

**D.6 = PASS confirmado.**

━━━

## 2. D.7 — los 4 gates GO, uno por uno

| # | Gate | Veredicto Fable | Evidencia propia |
|---|------|-----------------|------------------|
| 1 | ≥2 agentes concurrentes sin colgarse | **CONFIRMADO** | 8 clientes MCP simultáneos, 8/8×200 en 0.163s, serve=1 sostenido |
| 2 | serve HTTP auth + loopback | **CONFIRMADO** | `ss` = bind 127.0.0.1 only; 401 sin/mal bearer; lectura de `cli/mcp-token.ts` y `scripts/ebrain-brain` consistente con la auditoría D.2.3 de Opus (no re-audité el interior de serve-http.ts del vendor) |
| 3 | RAM viable | **CONFIRMADO** | RSS live del host = **238 MB** sirviendo, VmHWM 350 MB, **1694 MB available**, swap sano — dentro del presupuesto D.1; governor un-heavy intacto |
| 4 | aislamiento cliente con test | **CONFIRMADO con caveats (F-D1 ajustado + F-F2)** | `cli/isolation.test.ts` corre en la suite (135/0); plano-sesión SÍ enforced en runtime (`cli/sessions.ts:209-210` deniega cwd cliente); plano-source solo CI-test (ver F-D1); el probe vivo `ebrain q` resultó vacuo (ver F-F2) |

━━━

## 3. F-D1 — CONFIRMADO, severidad ajustada al alza: **media** (Opus dijo media/baja)

**Confirmación técnica:** grep sobre `cli/ scripts/ harness/ tui/` (excluyendo
`*.test.ts`): **cero** llamadas runtime a `assertNoClientSources` / `isClientSource` /
`federatedSources`. Solo las ejerce `cli/isolation.test.ts`. La corrección de docs de
Opus (D.5.3 + docstring de `cli/isolation.ts`) es **fiel** a la realidad del código, y
la tarea D.5.4 describe bien el fix (preflight en `scripts/ebrain-brain`, hard-fail
pre-serve, verify con source inyectado).

**Por qué subo la severidad:** Opus citó 3 capas compensatorias. Verifiqué cada una y
dos están más débiles de lo que la auditoría transmite **en el estado estable del daemon**:

1. **CI test** — activa. ✔
2. **Filtro default-deny de `ebrain-q`** (`scripts/ebrain-q:20`) — el filtro existe,
   pero `ebrain-q` entero está **funcionalmente muerto** con el daemon arriba (ver F-F1):
   una capa que no corre no compensa nada.
3. **Fail-check vivo de doctor** (`harness/core/doctor.sh:108-118`) — solo corre "cuando
   el lock está libre". Con la arquitectura daemon, el host tiene el lock **24/7 por
   diseño** → `pgrep -f 'cli\.ts serve'` siempre matchea → el check queda
   **estructuralmente dormido** (warn permanente `sources:isolation diferido`). Antes
   del daemon había ventanas de lock libre; ahora no hay ninguna salvo parada manual.

Es decir: en régimen daemon, la única capa activa es el CI test (que valida el código,
no el estado vivo del engine). **No hay leak activo** (los sources reales del engine no
incluyen cliente, y el plano-sesión sí está enforced en runtime), pero la defensa viva
del plano-source es más delgada de lo que el texto del PASS sugiere. **D.5.4 pasa de
"defensa en profundidad" a "la única enforcement viva del plano-source" → prioridad alta
para el maker.** Sugerencia adicional: doctor debería aprender a chequear sources **vía
el daemon HTTP** en vez de diferir cuando hay serve vivo.

━━━

## 4. F-D2 — CONFIRMADO + un detalle que Opus no reportó. Severidad: **baja** (defendible), con un fix barato inmediato

Verificado por conteo de patrón (sin imprimir contenido) + `stat`:

| Config | Token literal at rest | Permisos |
|---|---|---|
| `~/.claude.json` | sí (1) | 600 |
| `~/.gemini/settings.json` | sí (1) | **664 — world-readable** |
| `~/.cursor/mcp.json` | sí (1) | 600 |
| `~/.config/opencode/opencode.json` | sí (1) | 600 |
| `~/.codex/config.toml` | **no (0)** — indirección env-var ✔ | 600 |

**Lo que Opus no dijo:**
1. **`~/.gemini/settings.json` está en 664 (legible por cualquier usuario local)** con el
   bearer literal adentro. En esta laptop single-user el riesgo práctico es bajo, pero es
   la peor instancia del finding y el fix es gratis: `chmod 600` post-onboard (una línea
   en `cli/up.ts` tras el registro de gemini, análogo al `writeJsonObject` de cursor que
   ya fuerza 600).
2. **Exposición transitoria por argv:** `commandForAgent()` (`cli/up.ts:92-124`) marca
   `tokenInArgv: true` para claude/gemini/opencode — durante el `mcp add` el token viaja
   en `/proc/<pid>/cmdline` (visible en `ps` para cualquier proceso local durante ~1s).
   Transitorio y loopback-local; aceptable hoy, pero es un argumento más para la
   indirección env-var universal pre-release.

La calificación "baja para loopback P1" de Opus es **defendible** (el atacante que puede
leer 664 en esta máquina ya puede mucho más), pero el ítem gemini-664 debería cerrarse
ya, no esperar al hardening pre-release.

━━━

## 5. FINDINGS NUEVOS (Fable)

### F-F1 (media) — La superficie CLI/write-back queda silenciosamente rota en el estado estable del daemon

El daemon posee el lock PGLite 24/7 (por diseño). Todo lo que sigue usando el **engine
local** (`~/.config/ebrain/ebrain-run` → `vendor/gbrain/src/cli.ts` sin `--http`) muere
contra el lock, y varios callers se tragan el error:

- **`ebrain q` devuelve vacío para TODO — silent-success (rc=0).** Probé el control
  positivo: `ebrain q "korvex" 2` → **cero output**; `ebrain q "daemon lock PGLite
  single-writer" 2` → cero output. Causa raíz: `scripts/ebrain-q:30-31` — `"$RUN" query …
  2>/dev/null | grep … || true`; abajo, `ebrain-run sources list` = "connect timed out
  (default 10000ms)"; con `--timeout=45000` = **"GBrain: Timed out waiting for PGLite
  lock"**. El buscador semántico primario de terminal (el que CLAUDE.md del Second Brain
  documenta como primario) está muerto mientras el daemon corre — que es siempre.
- **`ebrain remember` degrada, con ~31s de castigo:** el paso `sync --source
  agent-memory` (`harness/core/remember.sh:118-125`) falla contra el lock tras **31.1s
  medidos** (rc=1) y cae a "(sync diferido — quedará en el próximo sweep)". No cuelga
  (bien), pero…
- **…"el próximo sweep" nunca llega:** `scripts/dream-cycle:33-34` **difiere siempre
  que haya un `cli.ts serve` vivo** → con el daemon residente queda **permanentemente
  diferido**. `scripts/sessions-federate:52` falla igual contra el lock. Consecuencia
  neta: **los learnings nuevos se escriben a disco pero no se embeben ni son buscables**
  mientras el daemon corra; la consolidación nocturna no corre nunca.
- **`~/.gbrain/config.json` NO tiene bloque `remote_mcp`** (verificado por conteo: 0).
  El propio HANDOFF dice "el modo thin-client (`callRemoteTool`) sirve para ops de CLI" —
  esa mitad del cutover **no se hizo**: se rewirearon los agentes (MCP-HTTP ✔) pero no
  las ops de CLI (siguen intentando abrir PGLite local).

**Qué NO está afectado (verificado):** el canal MCP de agentes (objetivo de la fase)
funciona perfecto; `harness/core/inject-context.sh` solo instruye usar los tools MCP (no
shellea al CLI); `log-session.sh` no toca el engine. Por eso F-F1 **no bloquea los 4
gates** — pero rompe el loop memoria-escribible→buscable del harness en régimen daemon,
y lo rompe **en silencio** (el enemigo declarado: "silent-success is the enemy").

**Fix sugerido (tarea nueva para el maker, mismo rango que D.5.4):** (a) rutear las ops
CLI (`ebrain q`, sync de remember/federate) por el daemon — thin-client `remote_mcp` o
llamadas MCP-HTTP con el bearer del store; (b) hacer `dream-cycle` y el check
`sources:isolation` de doctor **daemon-aware** (distinguir "serve stdio de agente" de
"nuestro host HTTP" — el pidfile ya permite distinguirlo, como hace `ebrain-daemon`);
(c) mientras tanto, que `ebrain q` **falle ruidoso** si el engine no responde, en vez de
devolver vacío con rc=0.

### F-F2 (baja) — Evidencia vacua en las auditorías previas

Tanto el preflight del maker (`ebrain q "ebrain daemon HTTP MCP" 3` → "no devolvió
resultados para ese término") como el probe de aislamiento de Opus (`ebrain q "brisas
dekko cliente" 3` = "cero contenido de cliente") se corrieron **sin control positivo**.
Como `ebrain q` devuelve vacío para cualquier término bajo el daemon (F-F1), "cero
contenido de cliente" era un resultado garantizado que no probaba aislamiento. La
conclusión de aislamiento sigue en pie por las otras patas (CI test + sources reales del
engine sin cliente + plano-sesión enforced), pero esa línea de evidencia debe
descartarse de ambos registros. Lección de proceso: **todo probe negativo necesita su
control positivo.**

━━━

## 6. Verificaciones adicionales (lo que Opus podía haber pasado por alto — chequeado)

- **GUARD del lock en `ebrain-daemon`:** correcto. `stdio_serve_alive()` excluye el PID
  propio vía pidfile y rehúsa `start` con puntero al runbook (no cuelga). El `setsid` +
  `echo $! > PIDFILE` es correcto en este contexto (shell no-interactivo sin job
  control → setsid no forkea, y el `exec` final del launcher conserva el PID): pidfile
  132434 == PID real del serve, verificado en vivo. `ebrain daemon status` = UP healthy.
- **Manifests / no-revert a stdio:** los 5 manifests declaran `register: "ebrain onboard
  <agent>"` (generic = null) y `harness/core/install.sh:91` los `eval`ea con `--mcp` →
  no hay camino de revert a stdio por `harness install --mcp`. Confirmado.
- **Symlinks compat:** `~/.config/ebrain/gbrain-run → ebrain-run`, `gbrain-mcp →
  ebrain-mcp` presentes; launchers instalados con modo 700.
- **Inyección de token a sesiones tmux:** `cli/sessions.ts:233-234` lee el store y setea
  `EBRAIN_MCP_TOKEN` si no está — código presente y testeado en suite.
- **Secret-safety (crítico) — LIMPIO:**
  - `git grep` de patrón token en tracked (excl. vendor) = **0 archivos**.
  - `~/.config/ebrain/daemon.log` = **0** ocurrencias de patrón token y **0** de
    authorization/bearer (conteos, sin imprimir).
  - Store `mcp-token.env` = **600**, dueño correcto, fuera del repo; `.env` = 600.
  - Ninguna corrida mía de `ebrain up`/`onboard`/`daemon status` imprimió un token
    (toda salida pasada por sed de redacción por si acaso; nada que redactar apareció
    salvo la falsa alarma "Bearer token" literal de la columna Auth de codex).
  - `redactSecrets` (`cli/mcp-token.ts:92-100`) cubre known-secrets exactos, patrón
    `gbrain_…{20,}`, `Bearer \S+` y `Authorization[:=]…` — cobertura adecuada. Nit
    menor, no-bloqueante: el `\b` final del patrón gbrain puede dejar 1-2 chars finales
    sin redactar si el token termina en `-`/`/` (el grueso queda redactado igual).
- **RAM live:** host 238 MB RSS sirviendo mi swarm, HWM 350 MB, 1694 MB available —
  mejor que el presupuesto D.1.

━━━

## 7. Tests corridos (por mí, 2026-07-15)

- `bun test ./cli/` → **135 pass / 0 fail** (323 asserts, 10 archivos, incluye
  `isolation.test.ts`).
- `bun test ./tui/test/` → **360 pass / 0 fail** (1472 asserts, 33 archivos).

Coincide con maker y Opus. Árbol git limpio antes y después de mi auditoría (este
reporte es el único archivo nuevo; sin commit, lo integra Opus).

━━━

## 8. Discrepancias con la auditoría de Opus

1. **F-D1: severidad media, no media/baja.** Dos de las tres capas compensatorias que
   Opus citó están dormidas en régimen daemon (doctor-live-check diferido para siempre;
   ebrain-q muerto). D.5.4 es la única enforcement viva futura del plano-source → subir
   su prioridad.
2. **F-D2 incompleto:** faltó `~/.gemini/settings.json` en **664 world-readable** con el
   token literal (peor instancia, fix de una línea) y la exposición transitoria del token
   por argv en claude/gemini/opencode durante el `mcp add`.
3. **Evidencia vacua (F-F2):** el probe `ebrain q "brisas dekko cliente"` que Opus usó
   como "aislamiento vivo por el canal compartido" no probaba nada — `ebrain q` devuelve
   vacío para todo término bajo el daemon. Retirar esa línea de evidencia del registro.
4. **F-F1 (nuevo, no visto por Opus ni por el maker):** la regresión silenciosa de la
   superficie CLI/write-back/consolidación bajo el daemon residente (sección 5). El
   maker incluso la registró sin reconocerla ("no devolvió resultados para ese término").

Ninguna de estas discrepancias invalida los 4 gates GO tal como están definidos en el
ADR-004 → **confirmo el PASS**, con el backlog de cierre: **D.5.4 (subida de prioridad)
+ F-F1(a/b/c) + gemini chmod 600**.

━━━

*Fable 5 — segundo checker independiente · read-only · 2026-07-15*
