---
name: ebrain-design
description: Use this skill to generate well-branded interfaces and assets for ebrain, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping. ebrain is a terminal user interface (TUI) for multi-provider agentic code orchestration — monospaced character grid, JetBrains Mono, box-drawing, no emoji, dark only.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

ebrain is a **TUI** — every design must live in a monospaced character grid (JetBrains Mono), ANSI truecolor, box-drawing glyphs (╭─╮│╰─╯, ┌─┐) and blocks (█ ▓ ▒ ░ ▀ ▄). Hard rules: **no emoji**, no gradients, no shadows, no real radius, no raster images, dark theme only. Hierarchy by weight/tone only, single font size. One strong teal moment per view; violet is memory-only.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view — link `styles.css` and mount components from the compiled bundle via `window.EbrainDesignSystem_04bce4`. If working on production code, copy assets and read the rules here to become an expert in designing with this brand.

Key files:
- `readme.md` — content + visual + iconography foundations, component index, manifest.
- `tokens/ebrain.tokens.json` — full palette (with xterm-256 fallbacks), spacing, type, glyph inventory (with ASCII fallback), states.
- `guidelines/*.html` — foundation specimen cards; `guidelines/micro-interactions.md` — motion spec.
- `components/` — reusable TUI primitives (Panel, Badge, Gauge, PromptBox, CommandPalette, SessionCard, …).
- `ui_kits/ebrain/` — interactive 7-view cockpit recreation.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.
