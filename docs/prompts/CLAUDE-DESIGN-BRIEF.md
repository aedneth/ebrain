# Brief para Claude Design — ebrain TUI Design System

> **Cómo usarlo:** llená los campos del formulario de Claude Design con §1, pegá el prompt de §2
> como instrucción principal, generá, iterá con el checklist §3, exportá el zip → descomprimí en
> `design-system/` del repo eBrain → commit (vendored, read-only) → `scripts/design-sync-tui`
> mapea los tokens a `tui/src/theme.ts` (SPRINT-TUI 6.2). **Ojo: esto NO es una web app — es una
> TUI (interfaz de terminal en retícula monoespaciada).** Los mockups se entregan como HTML/web
> pero deben respetar las restricciones de terminal de §2. Referencias canónicas: la home de
> OpenCode (wordmark pixel-block bicolor) y la sobriedad de Claude Code.

---

## §1 — Parámetros exactos para los campos

| Campo | Valor |
|---|---|
| **Project name** | ebrain |
| **One-liner / description** | TUI de orquestación agéntica multi-proveedor: el cockpit de terminal desde donde un ingeniero lanza, observa y promptea sesiones de Claude Code / Codex / Gemini / OpenCode / Cursor, consulta su memoria agéntica permanente (CKIS) y vigila routing de modelos y gasto. |
| **Audience** | Un power-user técnico (founder/ingeniero) que vive en la terminal 8+ horas diarias; hardware modesto (laptop 4 GB); daily driver, no demo. |
| **Platform** | **TUI — terminal, retícula monoespaciada** (80×24 mínimo, diseño base 120×32). El design system se exporta como tokens + mockups HTML en grid de caracteres. |
| **Style keywords** | Agentic-terminal canon (Claude Code, OpenCode), dark void, disciplinado, denso-pero-respirado, hacker-sobrio, cero ornamento, high-signal. NO corporativo, NO juguetón, **NO emoji**. |
| **Color — background** | Void `#0B0E14` (fondo) · superficie `#11151F` · elevada `#1A2030` · borde `#232B3D` · borde-foco = acento |
| **Color — primary/accent** | **Teal ebrain `#2DD4BF`** (foco, acción, wordmark, borde del prompt box) — un solo momento teal fuerte por vista (disciplina Korvex) |
| **Color — memoria/semántica** | Violeta `#A78BFA` (todo lo que es memoria, embeddings, citas, `think`) |
| **Color — semánticos** | ok `#4ADE80` · warn `#FBBF24` · error `#F87171` · info `#60A5FA` |
| **Color — texto** | `#E6EAF2` primario · `#8B94A7` secundario · `#565F73` muted |
| **Paleta categórica de agentes (8)** | Distinguibles entre sí sobre `#0B0E14`, partiendo de: clay `#D97757` (claude) · gris-acero `#9AA5B8` (codex) · azul `#5B8DEF` (gemini) · ámbar `#F5A97F` (opencode) · violeta `#B48EFF` (cursor) · coral `#FF6B6B` (route/stack chino) · lima `#A3E635` (generic) · cian `#67E8F9` (free-lane). Refinar para máxima separación perceptual. |
| **Typography** | **JetBrains Mono** única (es una terminal). Jerarquía SOLO por peso/tono: bold, normal, dim — nada de tamaños múltiples salvo el wordmark pixel-block. |
| **Corner radius / vibe** | Bordes de caja de terminal: `╭─╮│╰─╯` (redondeado suave) para paneles, `┌─┐` para diálogos modales; hairlines de 1 celda; **sin sombras, sin gradientes, sin blur** — profundidad solo por tono de superficie. |
| **Dark/Light** | **Solo dark.** No generar light. |
| **Idioma del copy en mockups** | Español técnico neutro con términos de dominio en inglés (sessions, spend, fleet, attach). |
| **Prohibiciones** | Emoji (política dura) · gradientes · imágenes rasterizadas dentro de la UI · cualquier elemento no representable en una retícula de caracteres. |

## §2 — Prompt principal (pegar completo)

```
Diseña el design system completo y los mockups de "ebrain", una TUI (terminal user
interface) de orquestación de agentes de código. Es el cockpit diario de un ingeniero:
desde ahí lanza y observa sesiones de Claude Code, Codex, Gemini CLI, OpenCode y
Cursor, consulta su memoria agéntica permanente, y vigila el routing de modelos y el
gasto. El canon estético son las TUIs agénticas: la home de OpenCode y la sobriedad
de Claude Code. Esto NO es una web app: TODO debe ser representable en una retícula
monoespaciada de caracteres (JetBrains Mono), colores ANSI truecolor, cajas dibujadas
con box-drawing (╭─╮│╰─╯, ┌─┐), y bloques (█ ▓ ▒ ░ ▀ ▄) para gauges y wordmark.

RESTRICCIONES DE TERMINAL (duras):
- Retícula de caracteres: todo elemento alinea a celdas; spacing en celdas (1, 2, 4).
- Sin gradientes, sin sombras, sin radius real, sin imágenes, SIN EMOJI.
- Jerarquía tipográfica solo por peso (bold/normal/dim) y color — un solo tamaño.
- Cada mockup se renderiza como grid monoespaciado (base 120×32; validar que la
  información crítica sobrevive a 80×24).
- Paleta: fondo void #0B0E14, superficies #11151F/#1A2030, borde #232B3D, texto
  #E6EAF2/#8B94A7/#565F73, acento teal #2DD4BF (UN momento fuerte por vista),
  violeta memoria #A78BFA, semánticos ok #4ADE80 / warn #FBBF24 / error #F87171 /
  info #60A5FA, y paleta categórica de 8 colores para agentes (claude clay #D97757,
  codex #9AA5B8, gemini #5B8DEF, opencode #F5A97F, cursor #B48EFF, route-stack
  #FF6B6B, generic #A3E635, free #67E8F9 — refinar separación perceptual).

GENERAR:

1. TOKENS (export JSON): paleta completa con roles semánticos + los 8 categóricos
   (cada color con su aproximación xterm-256 como fallback), escala de spacing en
   celdas, jerarquía tipográfica (bold/normal/dim + usos), inventario de glifos
   box-drawing/bloques con fallback ASCII puro (| - + # = > *), estados
   (focus/blur/selected/disabled) definidos como combinaciones color+peso.

2. WORDMARK "ebrain" estilo pixel-block (como el de OpenCode): letras construidas
   con medios bloques (▀▄█) en retícula de ~5 filas, bicolor — "e" en teal #2DD4BF
   y "brain" en blanco #E6EAF2. Entregar: versión grande (home), versión compacta
   de 1 línea para la barra superior ("e·brain" o "ebrain" con la e teal), y la
   matriz exacta de celdas/caracteres para reproducirlo en código. Debe degradar
   a ASCII puro sin perder identidad.

3. COMPONENTES TUI (cada uno con estados focus/blur/selected/disabled, dibujados
   en grid): Panel/Box con título en el borde, TabBar (6 tabs), StatusBar, hint
   bar de atajos (estilo "tab paneles  / palette  ? ayuda"), footer (cwd:branch
   izquierda · versión derecha), PromptBox (borde izquierdo grueso en teal, como
   OpenCode), Table, ScrollList con scrollbar de caracteres, SessionCard (badge
   de agente con color categórico + nombre + uptime + estado), TerminalPeek
   (frame de output ajeno, borde dim), Gauge horizontal (█▓░ — para RAM y spend),
   Badge, Toast (ok/warn/error), ConfirmDialog modal, CommandPalette (overlay
   centrado con fuzzy filter), Spinner de caracteres (⠋⠙⠹ braille + fallback),
   KeyHint (tecla resaltada + acción), formulario multiline (para "remember").

4. MOCKUPS (7 pantallas, grid 120×32):
   a. HOME/Overview: wordmark pixel-block centrado arriba, debajo resumen del
      sistema (brain UP · spend gauge $2.1/$10 · fleet 6/6 · memoria 128
      learnings), sesiones activas con badges de color, últimas 3 memorias,
      hint bar y footer.
   b. SESSIONS: lista de sesiones tmux a la izquierda (badges categóricos),
      peek EN VIVO del output de la seleccionada a la derecha (borde dim,
      título "peek · ebr-claude-korvex"), acciones a/k/p en la hint bar.
   c. LAUNCH WIZARD: tarea descrita arriba, recomendación del advisor en card
      (carril, modelo, razón, costo estimado, alternativas dim), selección de
      agente con los 8 badges, advertencia ámbar si el carril es frontier
      ("requiere confirmación — nunca auto-escala"), preview del contexto a
      inyectar (norms + memoria + MCP) en panel colapsable.
   d. MEMORY: búsqueda semántica arriba (resultados con score y source en
      violeta), form "remember" abajo, browse de session-logs a la derecha.
   e. ROUTING/SPEND: gauges por cap (coding/agentic/web/long-context/terminal/
      general), ledger reciente en tabla, cadenas ganador→fallback→floor.
   f. DOCTOR/FLEET: checklist colorizado ok/warn/fail, estado de los 6 agentes.
   g. OVERLAYS (states sheet): command palette abierta, ConfirmDialog de kill,
      Toast de error, banner "brain locked by MCP — datos en caché 14:32".

5. MICRO-INTERACCIONES (spec escrita, sin animación real): transición de foco
   entre paneles (borde dim→teal), spinner durante doctor re-run, gauge que se
   llena, toast que entra y expira, palette que filtra al tipear.

TONO: instrumento de precisión, denso pero respirado, cero decoración — cada
carácter en pantalla gana su lugar por información. Exportar tokens como JSON
y los mockups como HTML monoespaciado fiel a la retícula.
```

## §3 — Checklist de iteración antes de exportar

- [ ] El wordmark pixel-block es reproducible con caracteres reales (▀▄█ + espacios) — pedir la matriz exacta, no solo la imagen
- [ ] Los 8 colores categóricos se distinguen entre sí sobre `#0B0E14` (probarlos juntos en la pantalla Sessions)
- [ ] Todo mockup respeta la retícula: nada "entre celdas", nada más chico que un carácter
- [ ] La información crítica de cada pantalla sobrevive a 80×24 (pedir variante recortada de Home y Sessions)
- [ ] Contraste AA de texto secundario `#8B94A7` sobre `#11151F`
- [ ] Cero emoji en todos los mockups (política dura); glifos = box-drawing/bloques/braille con fallback ASCII anotado
- [ ] Los tokens JSON incluyen el fallback xterm-256 de cada color
- [ ] Un solo momento teal fuerte por vista (si hay dos, degradar uno a dim)
- [ ] Hint bar + footer presentes en TODAS las pantallas (son el chrome constante)

## §4 — Integración post-export (detalle en SPRINT-TUI 6.2)

1. Zip → `~/eBrain/design-system/` (vendored, read-only), commit específico.
2. `scripts/design-sync-tui` genera `tui/src/theme.ts` desde los tokens JSON: roles semánticos, categóricos, truecolor + fallback 256, glifos con fallback ASCII, spacing en celdas. Idempotente.
3. La matriz del wordmark → `tui/src/kit/wordmark.ts` (render parametrizado por theme).
4. Los mockups son la **referencia de aceptación visual** de los gates 6.3–6.7: cada panel construido se compara contra su mockup antes del `[AUDIT_PASS]`.
