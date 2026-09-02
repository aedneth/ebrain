# ebrain — Design System

**ebrain** es una **TUI (terminal user interface) de orquestación agéntica multi-proveedor**: el cockpit de terminal desde donde un ingeniero lanza, observa y promptea sesiones de Claude Code / Codex / Gemini CLI / OpenCode / Cursor, consulta su memoria agéntica permanente (**CKIS**) y vigila el routing de modelos y el gasto.

- **Audiencia:** power-user técnico (founder/ingeniero) que vive en la terminal 8+ h/día, hardware modesto. Daily driver, no demo.
- **Plataforma:** terminal, retícula monoespaciada. Mínimo **80×24**, diseño base **120×32**.
- **Canon estético:** TUIs agénticas — la home de OpenCode y la sobriedad de Claude Code. Dark void, disciplinado, denso-pero-respirado, hacker-sobrio, cero ornamento, high-signal.
- **Solo dark.** No hay light theme.

> Este NO es una web app. **Todo es representable en una retícula monoespaciada de caracteres** (JetBrains Mono), colores ANSI truecolor, cajas box-drawing (╭─╮│╰─╯, ┌─┐) y bloques (█ ▓ ▒ ░ ▀ ▄).

## Fuentes
Diseñado desde el brief del producto (no se adjuntó codebase ni Figma). No se proporcionó logo: el wordmark **ebrain** se construye tipográficamente con medios bloques (ver `components/brand/Wordmark`). No se inventó ninguna marca externa.

---

## CONTENT FUNDAMENTALS

**Idioma:** español técnico neutro, con términos de dominio en inglés sin traducir (*sessions, spend, fleet, attach, launch, routing, fallback, floor, frontier, peek, remember*).

**Casing:** minúsculas casi siempre. Nombres de vista, tabs, labels de panel, comandos y hints van en minúscula (`sessions`, `spend hoy`, `kill session`). Mayúsculas reservadas para estados enfáticos de una palabra (`UP`, `DOWN`) y siglas (`CKIS`, `RAM`, `MCP`, `API`).

**Voz:** imperativa y telegráfica, orientada a la acción. Sin sujeto, sin cortesías. "terminar ebr-claude-korvex?", "requiere confirmación — nunca auto-escala", "enrutar a claude". Ni "yo" ni "tú": el sistema informa, el usuario actúa.

**Densidad:** cada carácter gana su lugar por información. Nada de texto de relleno, ni descripciones largas. Metadatos y explicaciones van en dim (`--text-3`) y en una línea.

**Números:** costos con `$` y 2 decimales (`$2.14`), gauges con fracción (`3.1/4G`), scores de memoria a 2 decimales (`0.94`), tiempos `mm:ss` o `HH:MM`.

**Emoji:** **prohibido (política dura).** Los únicos "iconos" son box-drawing, bloques, braille y unos pocos símbolos Unicode (● ▸ ▾ → ✓ ✗ !), todos con fallback ASCII documentado.

Ejemplos de copy:
- `brain UP · CKIS · 128 learnings`
- `frontier requiere confirmación — nunca auto-escala`
- `deepseek down — fallback a claude`
- `terminar ebr-claude-korvex? El agente pierde su contexto.`

---

## VISUAL FOUNDATIONS

**Color.** Fondo void `#0B0E14`; superficies por tono: `#11151F` (panel) → `#1A2030` (elevada/selección); hairline `#232B3D`. Texto en tres niveles: `#E6EAF2` / `#8B94A7` / `#565F73`. **La profundidad es solo tono de superficie — no hay sombras.** Acento **teal `#2DD4BF`**: un único momento teal fuerte por vista (foco, acción, wordmark, borde del prompt); si aparecería un segundo, se degrada a `--accent-dim`. **Violeta `#A78BFA`** es exclusivo del dominio memoria (embeddings, citas, scores, `think`). Semánticos: ok `#4ADE80`, warn `#FBBF24`, error `#F87171`, info `#60A5FA`. **Paleta categórica de 8 agentes** refinada para separación perceptual sobre void: claude `#D97757`, codex `#9AA5B8`, gemini `#5B8DEF`, opencode `#E5B567`, cursor `#C678DD`, route `#FF6B6B`, generic `#A3E635`, free `#67E8F9`. Cada token lleva su aproximación **xterm-256** en `tokens/ebrain.tokens.json`.

**Tipografía.** **JetBrains Mono**, familia única (es una terminal). **Un solo tamaño.** Jerarquía únicamente por **peso y tono**: bold (títulos de panel, tab activa, valores clave, teclas), normal (cuerpo, datos), dim (= `--text-3` a peso normal: hints, metadatos, disabled, chrome pasivo). Ligaduras desactivadas. Único elemento multi-tamaño permitido: el wordmark pixel-block.

**Retícula y spacing.** Todo alinea a celdas de carácter. Spacing horizontal en celdas (1, 2, 4 → `--sp-1/2/4`), vertical en filas completas. Nada "entre celdas", nada más chico que un carácter. `line-height` calibrado a **1.2** para que el box-drawing conecte; los bloques del wordmark usan **1.0**.

**Bordes y forma.** Paneles con esquinas redondeadas box-drawing `╭─╮│╰─╯`; diálogos modales con esquinas rectas `┌─┐`. Hairlines de 1 celda. El PromptBox lleva borde izquierdo grueso `┃` en teal (estilo OpenCode). **Sin radius real, sin sombras, sin gradientes, sin blur.**

**Fondos.** Void plano. Sin imágenes rasterizadas, sin texturas, sin gradientes. Los overlays usan un scrim de `--bg-void` al 60% de opacidad — la única transparencia del sistema.

**Estados.** focus = borde `--accent` + título bold; blur = borde `--border-1` + título `--text-2`; selected = fondo `--surface-2` (+ marcador ▸ teal en listas); disabled = `--text-3`, nunca oculto.

**Animación / hover / press.** Sin animación decorativa: los cambios ocurren en frames enteros de celda (ver `guidelines/micro-interactions.md`). Hover/selección se comunican por tono + peso + fondo, no por movimiento. El único movimiento real es el spinner braille durante operaciones en curso.

---

## ICONOGRAPHY

No hay icon font ni SVGs ni PNGs. **Los "iconos" son caracteres de la retícula:**
- **Box-drawing** para estructura: `╭ ─ ╮ │ ╰ ╯` (paneles), `┌ ─ ┐ └ ┘` (diálogos), `┃` (prompt).
- **Bloques** para gráficos: `█ ▓ ▒ ░ ▀ ▄` (gauges, wordmark, sparks).
- **Braille** para el spinner: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`.
- **Símbolos puntuales:** `●` (badge/estado), `▸ ▾` (selección/colapsable), `→ ↑ ↓` (cadenas/nav), `✓ ✗ !` (checks), `·` (separador), `▌` (caret), `›` (prompt de palette).

**Emoji: nunca.** Todo glifo tiene fallback ASCII anotado (`| - + # = > *`) en `tokens/ebrain.tokens.json → glyphs`. Inventario visual en `guidelines/glyphs.html`.

---

## Componentes

Namespace del bundle: `window.EbrainDesignSystem_04bce4`.

**brand/**
- **Wordmark** — wordmark pixel-block bicolor ("e" teal, "brain" blanco) + variante compacta 1-línea + fallback ASCII; matriz exacta exportada (`WORDMARK_MATRIX`, `wordmarkHalfBlocks`).

**chrome/** (el chrome constante de toda vista)
- **StatusBar** (+ **StatusSep**) — barra superior: identidad izquierda, telemetría derecha.
- **TabBar** — 6 tabs numeradas, activa bold sobre superficie elevada.
- **HintBar** — barra de atajos ("tab paneles / palette ? ayuda").
- **KeyHint** — tecla resaltada + acción dim (unidad atómica de la hint bar).
- **Footer** — cwd:branch izquierda · versión derecha.

**layout/**
- **Panel** — caja box-drawing con título en el borde; focus/blur/dialog. Contenedor base.
- **TerminalPeek** — frame de output ajeno (peek tmux), borde siempre dim.

**core/**
- **Badge** (+ `AGENT_COLORS`) — punto de color + label; 8 agentes o tono semántico; solid/disabled.
- **Gauge** — gauge horizontal de caracteres (█▓░) para RAM y spend; auto-color por umbral.
- **Spinner** — spinner braille (fallback ASCII) para operaciones en curso.
- **Toast** — mensaje de una línea, borde recto en color de tono (ok/warn/error).

**data/**
- **Table** — tabla TUI: header dim, separador hairline, filas planas, selección elevada.
- **ScrollList** — lista con marcador ▸ y scrollbar de caracteres.
- **SessionCard** — fila de sesión: badge categórico + nombre + uptime + estado.

**input/**
- **PromptBox** — prompt con borde izquierdo teal (estilo OpenCode), caret ▌.
- **CommandPalette** — overlay centrado con fuzzy filter (matches en teal bold).
- **ConfirmDialog** — modal de confirmación (danger), acciones como teclas.
- **RememberForm** — formulario multiline para guardar memoria (dominio violeta).

Cada componente tiene `.jsx` + `.d.ts` + `.prompt.md`; cada directorio tiene una card `@dsCard`.

---

## Índice del proyecto (manifest)

- `styles.css` — entry global; solo `@import`.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `base.css`, `fonts.css`, y `ebrain.tokens.json` (export JSON con fallback xterm-256, spacing, tipografía, glifos, estados).
- `components/` — brand · chrome · layout · core · data · input (ver arriba).
- `guidelines/` — foundation cards (`color-*`, `type-*`, `spacing-*`, `glyphs`, `states`, `wordmark-matrix`) + `micro-interactions.md`.
- `ui_kits/ebrain/` — cockpit interactivo: 7 vistas (home, sessions, launch, memory, routing, doctor) + overlays. Entry `index.html`.
- `SKILL.md` — invocación como Agent Skill.

### Checklist del brief — estado
✓ Wordmark reproducible con caracteres reales (matriz exportada). ✓ 8 categóricos separados (test de vecindad en `color-agents.html` y en Sessions). ✓ Retícula respetada. ✓ Cero emoji, glifos con fallback ASCII. ✓ Tokens JSON con xterm-256. ✓ Un momento teal por vista. ✓ HintBar + Footer en todas las vistas.

**Pendiente / caveat:** las variantes recortadas a **80×24** de Home y Sessions están especificadas (la información crítica cabe: se pierden las memorias recientes y los detalles de segunda línea) pero no se entregaron como mockup HTML separado — el cockpit escala la retícula 120×32 completa. Ver la sección de caveats al final del turno.
