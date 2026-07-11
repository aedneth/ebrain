---
type: design
project: ebrain
created: 2026-07-08
modified: 2026-07-08
status: proposed
tags: [ebrain, diseño, cli, dx, design-system]
related: [ARCHITECTURE.md, ULTRAPLAN.md]
---

# DESIGN — ebrain

ebrain es una herramienta de terminal y una capa invisible. Su "diseño" es 90% experiencia de desarrollador (DX) y 10% superficie visual futura. Este documento gobierna ambas y define el hook al design system de Korvex si algún día ebrain gana superficie visual (dashboard, web, producto vendible).

## 1. Principios de diseño (heredados y propios)

1. **Business language at the surface, mechanism below** (regla Company Brain): los outputs hablan de brains, fuentes, decisiones y costos — no de HNSW ni RRF, salvo con `--explain`.
2. **Thin harness, fat knowledge** (ethos gbrain): el CLI es delgado; el valor está en markdown+grafo. Cada feature del wrapper debe justificar por qué no es un alias de gbrain/gstack.
3. **No black box** (regla THE STACK de Eduardo): toda config en archivos planos legibles (YAML/JSONL/markdown) que Eduardo puede abrir y editar. Cero estado opaco.
4. **Reject complexity early**: sin TUI, sin dashboard, sin daemon nuevo en el MVP. Texto plano, exit codes correctos, `--json` donde un agente lo consuma.
5. **Bilingüe por diseño**: el contenido del brain nunca se traduce (ES/EN se preserva); los mensajes del CLI en inglés (convención de tooling), la documentación del vault en español.

## 2. DX del CLI (la interfaz real)

**Gramática de comandos:** `ebrain <verbo> [objeto] [flags]` — verbos cortos, consistentes con gbrain para no crear un segundo vocabulario: `sync`, `doctor`, `status`, `route`, `backup`.

**Contrato de salida:**
- Éxito silencioso estilo Unix: una línea de resumen, exit 0.
- `status` y `doctor`: tabla compacta (≤80 cols — la laptop es pequeña), símbolos `✓ ✗ ⚠`, y SIEMPRE la acción correctiva paste-ready cuando algo falla (patrón gbrain doctor: el error te dice el comando exacto que lo arregla).
- `route`: al terminar imprime `model=<slug> cost=$0.00xx tokens=in/out` — el costo visible en cada corrida es una decisión de diseño, no un log.
- `--json` en todos los verbos para consumo por agentes.
- Errores: qué falló → por qué → qué hacer, en tres líneas máximo. Nunca stack trace pelado al usuario (a menos que `--debug`).

**Tiempos:** feedback <100 ms al invocar (aunque el trabajo tarde); operaciones largas muestran progreso por source, no spinner mudo (en una máquina lenta, el silencio parece cuelgue).

**Estado y config:**
- Config de usuario: `~/.config/ebrain/` (`routing.yaml`, `.env`, `spend.jsonl`). XDG-compliant, coherente con `~/.config/ckis/`.
- Nada en el repo del proyecto que sea estado de máquina.

## 3. Diseño documental (los .md son la UI del conocimiento)

- Frontmatter CKIS obligatorio en todo doc del proyecto que viva en el vault (`type, created, modified, tags, status, related`).
- Reportes de discovery y validación: encabezado con fecha + SHA analizado; citas archivo:línea; tablas antes que prosa; una sección "decisiones que esto cambia".
- ADRs en `docs/adr/ADR-NNN-<slug>.md` con: contexto, decisión, rationale, tradeoffs, implicaciones (formato del decision protocol CKIS).
- Diagramas: ASCII en los .md (portable, versionable, cero deps). Si se necesita algo publicable, `/diagram` de gstack genera mermaid+excalidraw+SVG offline.

## 4. Hook al Design System (superficie visual futura)

Hoy ebrain no tiene UI. Si mañana la tiene (dashboard de brains, visor de grafo, o la versión producto "Company Brain de Korvex" — instancia 0 de `services/company-brain.md`), estas reglas se activan:

1. **Fuente única de tokens:** el design system canónico vive en `korvex-web/design-system/` (migrado 2026-07-06; el directorio viejo está congelado). Cualquier UI de ebrain **importa** esos tokens (color, tipografía, spacing, radius) — jamás define paleta propia.
2. **Stack visual:** Next.js + Tailwind + shadcn/ui (stack Korvex estándar), componentes derivados del design system, no de defaults de shadcn.
3. **Proceso:** toda superficie visual pasa por el flujo del SOP `korvex-dev-best-practices-sop.md`: visual gate obligatorio a 1440×900 y 393×852 antes de ship, sweep de consistencia visual site-wide.
4. **Exploración:** `/design-consultation` y `/design-shotgun` de gstack son las herramientas de exploración, pero sus outputs se reconcilian contra el design system Korvex antes de implementarse (el shotgun propone; el sistema dispone).
5. **Identidad:** ebrain, como producto potencial, hereda la identidad visual Korvex (es "Korvex runs on Korvex" hecho software). Naming, logo o divergencia de marca = decisión de Eduardo, no de agentes.

## 5. Anti-slop (lo que ebrain NUNCA hace)

- Emojis decorativos en output de CLI o docs técnicos.
- Mensajes motivacionales, banners ASCII gigantes, colores arcoíris.
- Abstracciones especulativas ("por si acaso soportamos X"): YAGNI estricto.
- Renombrar conceptos de gbrain/gstack sin necesidad: si upstream lo llama `source`, ebrain lo llama `source`. Un solo vocabulario reduce la carga cognitiva y mantiene la documentación upstream utilizable.
