---
type: discovery
project: ebrain
program: F6 — TUI
subject: OpenCode TUI reverse-engineering
created: 2026-07-12
vendor: sst/opencode @ cf75036
tags: [ebrain, tui, reverse-engineering, opencode]
related: ["../../docs/adr/ADR-003-tui-stack.md", "../../docs/SPRINT-TUI.md"]
---

# OpenCode TUI — Reverse Engineering Report

Repo cloned read-only at `~/eBrain/vendor/opencode` (SHA `cf75036`, matches HEAD's own commit
timestamp `2026-07-12 21:13:21 +0000`). Confirmed: **zero `.go` files anywhere in the repo.**
The historical Go/bubbletea TUI is gone. Everything below is sourced from
`packages/tui/`, `packages/ui/`, `packages/session-ui/`, plus `bun.lock` / `package.json` for
dependency provenance.

---

## (f) Render stack and why — the definitive answer

**OpenCode's TUI is TypeScript + Bun, rendered via `@opentui/core` (native terminal renderer,
version-pinned) with `@opentui/solid` (SolidJS reconciler targeting the terminal) and
`@opentui/keymap` (keybinding/command engine). There is no React, no Ink, no bubbletea/Go.**

Evidence:
- `packages/tui/package.json:29-31` — dependencies: `"@opentui/core": "catalog:"`, `"@opentui/keymap": "catalog:"`, `"@opentui/solid": "catalog:"`, plus `"solid-js": "catalog:"`.
- `bun.lock:2041` pins `@opentui/core@0.4.3` with **native optional deps per platform**:
  `@opentui/core-darwin-arm64`, `-darwin-x64`, `-linux-arm64`, `-linux-arm64-musl`, `-linux-x64`,
  `-linux-x64-musl`, `-win32-arm64`, `-win32-x64` (`bun.lock:2043-2057`) — i.e. `@opentui/core` ships
  prebuilt native binaries per OS/arch/libc, loaded via `bun-ffi-structs` (`bun.lock:2041`
  dependency list). This is a genuine native rendering core, not a pure-JS terminal painter.
  It also declares a **peerDependency on `web-tree-sitter@0.25.10`** (`bun.lock:2041`) — syntax
  highlighting/parsing is tree-sitter based, in-process.
- `packages/tui/src/app.tsx:12` imports `createCliRenderer` from `@opentui/core` and calls it with
  `targetFps: 60, gatherStats: false, useKittyKeyboard: {}, useMouse: …` (`app.tsx:194-206`) — a
  classic fixed-framerate render-loop renderer, not print-and-forget like a plain CLI script.
- `packages/tui/src/app.tsx:1` imports `render` from `@opentui/solid` — this is literally
  SolidJS's `render()` entry point retargeted at a terminal renderer instead of the DOM. The
  whole app is authored in JSX (`<box>`, `<text>`, `<scrollbox>`, `<textarea>`, `<markdown>`,
  `<code>`, `<spinner>` are all custom terminal-native JSX intrinsics) with Solid's fine-grained
  reactivity (`createSignal`, `createMemo`, `createEffect`, `createStore`) — confirmed directly by
  the JSX pragma comment in `packages/tui/src/feature-plugins/system/which-key.tsx:1`:
  `/** @jsxImportSource @opentui/solid */`.
- `packages/tui/src/keymap.tsx:1-15` imports from `@opentui/keymap` (core), `@opentui/keymap/addons/opentui`,
  `@opentui/keymap/extras`, and `@opentui/keymap/solid` — a whole separate keybinding-engine package
  (mode stacks, leader-key sequences, command dispatch, binding formatting) that OpenCode wires up
  but does not implement itself.
- `packages/opencode/src/cli/tui/layer.ts:1` — the actual CLI (`packages/opencode`) imports
  `run as runTui` **from `@opencode-ai/tui`**, i.e. the TUI is a separate workspace package invoked
  by the CLI entrypoint, not inlined in the CLI.
- Runtime: `bun run --conditions=browser src/index.ts` (`packages/opencode/package.json:15`,
  root `package.json:9`) — dev mode runs directly under Bun with no separate bundling step; a
  release build goes through `packages/opencode/script/build.ts`. `packages/tui/bunfig.toml:1-3`
  preloads `@opentui/solid/preload` (both for normal runs and `bun test`), which almost certainly
  wires the custom JSX/Solid babel transform into Bun's loader.
- Provenance: `script/upgrade-opentui.ts` is a first-class repo maintenance script whose entire
  job is bumping `@opentui/core|keymap|solid` versions across every `package.json` + `bun.lock`
  (`upgrade-opentui.ts:39,98-193`) — opentui is versioned and upgraded like any other pinned
  external dependency, not vendored/forked code. It is a **separate `sst`-org project** (same
  publisher prefix as `@opentui/*`), i.e. OpenCode's TUI rewrite and "opentui" the framework were
  built together but opentui is reusable infrastructure, not opencode-internal.

**Render loop / perf model:** `createCliRenderer` is a stateful renderer object with an
`isDestroyed` flag, `requestRender()` (called manually after out-of-band mutations, e.g.
`prompt/index.tsx:246` `renderer.requestRender()` after `input.insertText`), `toggleDebugOverlay()`,
`console.toggle()`, `suspend()/resume()` (SIGTSTP handling, `app.tsx:868-878`), and a `destroy`
event used for clean shutdown (`app.tsx:236`, `util/renderer.ts:1-7`). `targetFps: 60` plus
`gatherStats: false` (stats collection is opt-in, presumably for perf debugging — `openConsoleOnError: false` also suggests an internal dev console exists, toggled via `app.console` command, `app.tsx:845-852`). Solid's own fine-grained reactivity means most updates are **surgical DOM(-equivalent)
patches**, not full-tree re-renders — this is the actual performance argument for Solid over React
in a terminal context (no VDOM diffing, direct signal-to-node subscriptions).

---

## (a) Anatomía de layout

**Wordmark / logo** — `packages/tui/src/logo.ts:1-11` is a literal 4-line-tall bitmap encoded as
plain strings using block-drawing glyphs `█ ▀ ▄` plus marker characters (`_ ^ ~ ,`) that get
swapped for shadow/bevel treatment:
```
export const logo = {
  left: ["                   ", "█▀▀█ █▀▀█ █▀▀█ █▀▀▄", "█__█ █__█ █^^^ █__█", "▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀~~▀"],
  right: ["             ▄     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"],
}
```
`packages/tui/src/component/logo.tsx:9-46` renders it **character by character**: each glyph
becomes its own `<text>` element; marker chars are replaced by ` `/`▀`/`▄` with a computed
"shadow" color (`tint(theme.background, fg, 0.25)`, `logo.tsx:10`) painted as either `fg` or `bg`
per cell — i.e. a manual per-pixel bevel/shading effect built out of half-block glyphs and two-tone
coloring, not an image or font. The left half of the wordmark uses `theme.textMuted`, the right
half `theme.text` + bold (`logo.tsx:54-55`), so the two words of "opencode" are visually split into
a muted/bright pair. There's also an alternate small `go` mark (`logo.ts:6-9`) for a compact
context (likely a branding badge, not the home screen). Home screen composition:
`packages/tui/src/routes/home.tsx:70-95` — centered flex column: spacer → Logo (via a plugin slot
`home_logo`, replaceable) → spacer → Prompt (in a `maxWidth` box, via slot `home_prompt`) → `home_bottom`
slot → spacer → Toast, then a full-width `home_footer` slot below everything.

**Prompt box, accent left border** — `packages/tui/src/component/prompt/index.tsx:1349-1358`:
```tsx
<box width="100%" border={["left"]} borderColor={borderHighlight()}
     customBorderChars={{ ...SplitBorder.customBorderChars, bottomLeft: "╹" }}>
```
`border={["left"]}` restricts the box border to a single vertical rule on the left edge — this
*is* the "accent-colored left border" Eduardo noticed. Its color, `borderHighlight()`
(`prompt/index.tsx:1308`), is `tint(theme.border, highlight(), agentMetaAlpha())` — a fade-in tint
from neutral `theme.border` toward a semantic color chosen by `highlight()` (`prompt/index.tsx:1287-1293`):
leader-key active → `theme.border` (neutral); shell mode → `theme.primary`; otherwise the **current
agent's own color** (`local.agent.color(agent.name)`). So the left-border accent color is agent-
identity-coded and animates in via alpha fade (`createFadeIn`, `prompt/index.tsx:1302`) rather than
snapping. The vertical bar glyph itself comes from `SplitBorder` (`packages/tui/src/ui/border.ts:15-21`):
`{ border: ["left","right"], customBorderChars: { ...EmptyBorder, vertical: "┃" } }` — heavy
box-drawing vertical bar `┃`, with `EmptyBorder` (`ui/border.ts:1-13`) blanking every other border
glyph so only the requested side renders content.

**Hint bar** ("tab agents · ctrl+p commands" equivalent) — `prompt/index.tsx:1668-1677`:
```tsx
<text fg={theme.text}>{agentShortcut()} <span style={{fg: theme.textMuted}}>agents</span></text>
<text fg={theme.text}>{paletteShortcut()} <span style={{fg: theme.textMuted}}>commands</span></text>
```
`agentShortcut()`/`paletteShortcut()` come from `useCommandShortcut("agent.cycle")` /
`useCommandShortcut("command.palette.show")` (`prompt/index.tsx:167-168`), which resolve the
**live, user-configurable keybinding** for those commands and format it as a display string
(`keymap.tsx:250-258`, `formatKeySequence`) — the hint bar is not hardcoded text, it's generated
from the actual active keymap, so it stays correct if the user rebinds keys. Default binding for
agent cycle is `tab` (`config/keybind.ts:130`, `agent_cycle: keybind("tab", …)`), for command
palette `ctrl+p` (`config/keybind.ts:57`, `command_list: keybind("ctrl+p", …)`).

**Status bar** — the same bottom row of the prompt box switches between several `Match` states
(`prompt/index.tsx:1510-1687`): busy/spinner + "esc interrupt" while a session is running, a retry
countdown banner on provider throttling, workspace-creation notices, or (default) the cwd label
plus the hint bar and context/cost usage (`{item().context, item().cost}`, `prompt/index.tsx:1662-1667`
— shows tokens-used-as-%-of-context-window and running dollar cost, computed in `usage()`
memo at `prompt/index.tsx:263-281`).

**Footer** (cwd:branch · version) — `packages/tui/src/feature-plugins/home/footer.tsx` is a
self-contained plugin registered against slot `home_footer`
(`footer.tsx:84-93`, `api.slots.register({ order: 100, slots: { home_footer() {...} } })`). Its
`Directory` component (`footer.tsx:10-25`) computes `abbreviateHome(directory, home) + ":" + branch`
(only appending `:branch` if the destination matches the actual cwd — `footer.tsx:18-20`), an `Mcp`
component shows connected-MCP count with a colored dot (`footer.tsx:27-52`, green/error/muted glyph
`⊙`), and `Version` right-aligns `props.api.app.version` (`footer.tsx:54-62`). Layout is a single
`flexDirection="row"` box with `flexGrow={1}` spacer between the left cluster and the version
(`footer.tsx:64-82`) — i.e. cwd/branch/MCP left, version right, classic status-bar layout. Home
uses `home_footer` in `mode="single_winner"` (`routes/home.tsx:91`) meaning only one plugin can own
that slot at a time (see (e)/(g) below on the slot system). The `abbreviateHome` helper
(`packages/tui/src/runtime.tsx:3-9`) is the `~`-collapsing logic (`path.relative` against `$HOME`,
falls back to the literal path if it would escape home via `..`).

---

## (b) Modelo de input

Input is governed by `@opentui/keymap`, an external, general-purpose terminal keybinding engine
(imported wholesale, not built by OpenCode — `keymap.tsx:1-15`). OpenCode's own
`packages/tui/src/keymap.tsx` and `packages/tui/src/config/keybind.ts` are a thin domain layer on
top of it:

- **Modes.** A single stack-based "mode" concept (`keymap.tsx:53-100`,
  `createOpencodeModeStack`) with one base mode `OPENCODE_BASE_MODE = "base"`
  (`keymap.tsx:21`) and a `"modal"` mode pushed whenever a dialog is open
  (`ui/dialog.tsx:79-85`, `modeStack.push("modal")` on dialog stack non-empty). Layers register
  bindings scoped to a `mode`, and `keymap.registerLayerFields({ mode(value, ctx) { ctx.require(...) } })`
  (`keymap.tsx:56-60`) gates which bindings are reachable given the current mode — this is how a
  dialog can suppress the base app's global keys while it's open.
- **Leader key.** A vim-style leader (`config/keybind.ts:41`, `LeaderDefault = "ctrl+x"`), timed
  (`registerTimedLeader`, `keymap.tsx:221-226`, timeout configurable via `config.leader_timeout`).
  Almost every "session_*" default binding is `<leader>X` (e.g. `session_new: "<leader>n"`,
  `session_list: "<leader>l"`, quick-switch slots `<leader>1`..`<leader>9` — `config/keybind.ts:89-116`).
  `useLeaderActive()` (`keymap.tsx:246-248`) exposes whether the leader sequence is currently
  pending, used e.g. to dim the prompt border/text while waiting for the second keystroke
  (`prompt/index.tsx:1288`, `1372-1373`).
- **Commands are the single source of truth for keys, slash names, and the palette.** A "command"
  object (`{ name, title, category, slashName, slashAliases, hidden, suggested, enabled, run }`)
  is registered once via `useBindings(() => ({ commands: [...] }))` (pervasive pattern, e.g.
  `app.tsx:962-964`, `prompt/index.tsx:561-563`, `routes/session/index.tsx:1094-1096`) and that
  single registration simultaneously feeds: the keybinding table, the command palette list, and
  (if `slashName` present) the `/slash` autocomplete — see (c).
- **Command palette** — `packages/tui/src/component/command-palette.tsx`. It queries the live
  keymap for all commands in the `"palette"` namespace that are currently *reachable*
  (`command-palette.tsx:29-37`, `keymap.getCommandEntries({ namespace: "palette", visibility: "reachable", filter: isVisiblePaletteCommand })`),
  resolves each command's live keybinding for display (`registeredBindings`, `command-palette.tsx:38-46`),
  and renders through a generic `DialogSelect` list widget (`command-palette.tsx:78`) — the palette
  is not a bespoke UI, it's the generic dialog-select component fed by keymap introspection. It also
  auto-promotes `suggested` commands into a synthetic "Suggested" category at the top when the user
  hasn't typed a filter yet (`command-palette.tsx:64-76`).
- **Which-key panel** — `packages/tui/src/feature-plugins/system/which-key.tsx` is a Neovim-style
  "show me what's bindable from here" discoverability overlay (`ctrl+alt+k` toggles,
  `config/keybind.ts:229`), with dock/overlay layout modes, tab/column layout constants
  (`which-key.tsx:24-47`) and its own scroll/paging command set — a second, always-available
  alternative to the command palette for *browsing* rather than *searching* commands.
- **Text input primitives**: raw editing (cursor move/select/word/delete/undo/redo, ~40 commands,
  `config/keybind.ts:161-198`) is a distinct `"input"` namespace layered only onto the focused
  textarea (`registerManagedTextareaLayer`, `keymap.tsx:229-232`, gated by
  `hasManagedTextareaFocus`, `keymap.tsx:175-178`) — so plain typing/navigation doesn't fight with
  app-level command bindings.
- **Legacy plugin command shim** — `packages/tui/src/plugin/command-shim.ts` bridges an older
  `api.command.register/trigger/show` plugin API onto the new keymap-native
  `api.keymap.registerLayer({ commands, bindings })` (`command-shim.ts:92-107`), printing a one-time
  deprecation warning per API surface (`command-shim.ts:14-17,43-47`) — evidence OpenCode already
  went through one internal API-versioning cycle for this exact subsystem.

---

## (c) Slash commands

There is **no separate slash-command registry** — slash commands are a projection of the same
command/keymap objects described in (b), plus a second, server-sourced list, merged at the
autocomplete layer:

1. **Local/built-in commands** carry an optional `slashName` (+ `slashAliases`) field right on the
   command object (e.g. `app.tsx:634` `slashName: "models"`, `app.tsx:681` `slashName: "agents"`,
   `routes/session/index.tsx:465-467` `slash: { name: "share" }` mapped to
   `slashName: "share"` at `routes/session/index.tsx:1088-1089`). `useCommandSlashes()`
   (`keymap.tsx:260-290`) walks all *reachable* `"palette"`-namespace commands, keeps only ones
   with a `slashName`, and returns `{ display: "/"+slashName, description, aliases, onSelect }` —
   selecting one just calls `keymap.dispatchCommand(entry.command.name)` (`keymap.tsx:286`), i.e.
   the exact same dispatch path as pressing the bound key or picking it from the palette.
2. **Server-defined custom commands** (opencode's own user-authored slash commands / skills /
   MCP-exposed commands) come from `sync.data.command` (a synced server-side list) and are merged
   in at `component/prompt/autocomplete.tsx:447-464`: for each `serverCommand` not sourced from
   `"skill"`, it's pushed into the same autocomplete option list as `/name` (tagging MCP-sourced
   ones with a `:mcp` suffix, `autocomplete.tsx:452`), with `onSelect` directly mutating the
   textarea buffer to insert `"/"+name+" "` (`autocomplete.tsx:456-462`) rather than dispatching a
   keymap command — these are data, not code, so there's nothing to "run" until submitted.
3. **Dispatch on submit**: `component/prompt/index.tsx:1070-1090` — when the prompt's input starts
   with `/` and matches a name in `sync.data.command`, submit calls
   `sdk.client.session.command({ sessionID, command, arguments, agent, model, variant, parts })`
   (`prompt/index.tsx:1082-1090`) instead of `session.prompt(...)` — i.e. slash-command execution
   for *server* commands is a distinct SDK call path, separate from normal chat prompt submission,
   decided by a plain string-prefix check at submit time (not by the keymap).
4. Both lists are combined, alphabetized, and column-aligned for display in one autocomplete menu
   (`autocomplete.tsx:447-474`, `results.sort(...)`, pad to max display width).

Net shape: **slash commands are just a display alias on top of the command/keymap system for
client-side commands, and a thin textarea-insertion + special-cased submit branch for
server-side/user-defined commands.** There's no independent slash-command parser/router beyond a
`startsWith("/")` + name-lookup check at submit time.

---

## (d) Theming / tokens

**Theme shape** — `packages/tui/src/theme/index.ts:36-91` defines a flat `Theme` type: semantic
roles only (`primary, secondary, accent, error, warning, success, info, text, textMuted,
background, backgroundPanel, backgroundElement, backgroundMenu, border, borderActive,
borderSubtle`), diff-specific colors (`diffAdded/Removed/Context/HunkHeader/HighlightAdded/…`,
9 fields), markdown-specific colors (11 fields), syntax-highlighting colors (9 fields,
`syntaxComment/Keyword/Function/Variable/String/Number/Type/Operator/Punctuation`), plus one
non-color field `thinkingOpacity: number`. All color fields are `RGBA` (an `@opentui/core` value
type, not raw hex strings) — resolution to `RGBA` happens once, at load time.

**Theme JSON structure** — `theme/assets/opencode.json` (the built-in default/reference theme) is
the pattern every theme follows: a `defs` block of **named color primitives** per light/dark
variant (e.g. `"darkStep1": "#0a0a0a"` … `"darkStep12"`, plus semantic accents like `darkAccent`,
`darkRed` — `opencode.json:3-42`), then a `theme` block where every semantic key is a
`{ "dark": "<ref-or-hex>", "light": "<ref-or-hex>" }` pair (`opencode.json:43-244`) referencing
those defs by name (indirection layer: change one `defs` entry, every consumer updates). This is a
numbered-step scale (step1..step12, light-to-dark ramp) exactly like Radix/Tailwind gray scales —
a good starting point for a design-system-token mapping.
- Resolution engine: `theme/index.ts:241-299` `resolveTheme(themeJson, mode)` — recursively
  resolves a `ColorValue` which may be a literal `RGBA`, a `"#hex"` string, a **named reference**
  into `defs` or another theme key (with circular-reference detection, `theme/index.ts:250-251`),
  a raw ANSI color-cube index (`typeof c === "number"`, `theme/index.ts:260-261`,
  `ansiToRgba`, `theme/index.ts:301-344` — implements the standard 16-color + 6×6×6 cube + 24-step
  grayscale xterm-256 mapping), or a `{dark, light}` variant object resolved recursively by
  `mode` (`theme/index.ts:263`). Two fields have soft-fallback defaults if omitted:
  `selectedListItemText` falls back to `background` (`theme/index.ts:279-281`), `backgroundMenu`
  falls back to `backgroundElement` (`theme/index.ts:286-288`).
- 32 built-in themes ship as JSON assets (`theme/index.ts:2-34`, `theme/assets/*.json` —
  catppuccin ×3 variants, dracula, gruvbox, nord, tokyonight, solarized, monokai, vercel,
  matrix, etc.), all statically imported `with { type: "json" }` (`theme/index.ts:2` etc., Bun's
  native JSON-import attribute syntax).
- **Runtime theme sources are layered and mergeable**: `listThemes()` (`theme/index.ts:171-183`)
  composes `DEFAULT_THEMES < pluginThemes < customThemes < generatedSystemTheme` (comment at
  `theme/index.ts:172`, "Priority: defaults < plugin installs < custom files < generated system"),
  with plugin-contributed (`addTheme`/`upsertTheme`, `theme/index.ts:220-239`) and user-custom-file
  themes both possible, and change notification via a simple listener-set pub/sub
  (`theme/index.ts:169,185-188,200-203`).
- **True-color-first, with a generated ANSI-derived fallback**: `generateSystem(colors, mode)`
  (`theme/index.ts:360-469`) synthesizes an entire `Theme` from just the terminal's reported ANSI
  palette + default fg/bg (`TerminalColors`) when no explicit theme is picked — i.e. there IS a
  256-color/basic-ANSI degradation path, but it's generative (compute a full semantic theme from 16
  ANSI colors + a derived grayscale ramp, `generateGrayScale`/`generateMutedTextColor`,
  `theme/index.ts:471-554`) rather than a hand-authored fallback theme. `terminalMode()`
  (`theme/index.ts:353-358`) infers light/dark from perceived luminance of the terminal's own
  background color.
- **Runtime color math helper**: `tint(base, overlay, alpha)` (`theme/index.ts:346-351`) — linear
  RGB interpolation used pervasively for hover/fade/emphasis states (agent-color prompt border,
  diff backgrounds, logo shadow bevel, etc.) rather than baking every hover variant into the theme
  file.
- **Glyph / box-drawing usage**: heavy-weight vertical bar `┃` for left-accent borders
  (`ui/border.ts:20`), half-block `▀`/`▄` for the wordmark bevel and for "melted" border corners
  like `bottomLeft: "╹"` (`prompt/index.tsx:1357`, `ui/border.ts` `EmptyBorder`), full block `█` in
  the raw wordmark bitmap (`logo.ts:2-3`), a filled circle `⊙` for MCP status dot
  (`feature-plugins/home/footer.tsx:40,43`), filled square `▣` as an agent/mode marker in the
  session transcript (`routes/session/index.tsx:1546`). No Nerd Font icon glyphs found in the core
  chrome — box-drawing/block characters only, which keeps it portable across terminals without a
  patched font (icon-font glyphs do appear in `packages/ui` for the web/desktop client's file/app
  icon sprites, but that's the browser-based companion UI, not the terminal one).

---

## (e) Sesiones / tabs

OpenCode's TUI has **no multi-pane/tab-strip concept** — it is strictly single-focus, one Route at
a time:

- **Routing model**: `packages/tui/src/context/route.tsx:6-23` — a `Route` union of exactly three
  variants: `HomeRoute | SessionRoute | PluginRoute`. State is one `createStore<Route>` and
  `navigate(route)` does a full `reconcile(route)` swap (`route.tsx:29-41`) — there is one current
  screen, full stop. No tab list, no split view, no background sessions kept mounted.
- **"Sessions" are a parent/child tree, not tabs.** A session can have a `parentID` (subagent
  sessions spawned by a `task` tool call). `routes/session/index.tsx:207-212` computes `children()`
  as all sessions sharing the same top-level parent. Navigating between them is tree traversal, not
  tab-cycling: `session.parent` (`up`), `session.child.first` (`<leader>down`), `session.child.next` /
  `session.child.previous` (`right`/`left`) — `config/keybind.ts:103-106`, handlers at
  `routes/session/index.tsx:425-448`. A subagent session renders a `SubagentFooter` instead of the
  normal prompt (`routes/session/index.tsx:1295-1297`) and is fully non-interactive from its own
  screen except via that tree navigation.
  - **Quick-switch slots** (`<leader>1`..`<leader>9`, `config/keybind.ts:108-116`) are the closest
    thing to "tabs with hotkeys" — `local.session.quickSwitch(i+1)` (`app.tsx:620-627`) — but they're
    a flat 9-slot jump table, not a visible persistent tab strip; there is no chrome anywhere
    showing "which slot is open" the way a tmux/terminal tab bar would.
  - **Session switcher UI** is a full-screen `DialogSessionList` modal (dispatched via
    `session.list`, `<leader>l`, or `/sessions`), not an always-visible strip — see `app.tsx:571-580`.
- **Sidebar** (`packages/tui/src/routes/session/sidebar.tsx`) is a per-session detail panel (title,
  workspace label, share URL, plugin-contributed content via `sidebar_content`/`sidebar_footer`
  slots) auto-shown when the terminal is wide (`wide() = dimensions().width > 120`,
  `routes/session/index.tsx:263`) or toggled manually (`session.sidebar.toggle`, `<leader>b`) — it
  describes the *current* session, it is not a session list/switcher.
- **Workspaces** (a separate, experimental concept, `Flag.OPENCODE_EXPERIMENTAL_WORKSPACES`,
  `dialog-workspace-list.tsx`, `context/project.tsx`) model *directories/worktrees* a session can
  run in, orthogonal to the session tree — not relevant to a tabs/multiplexing question directly,
  but worth knowing it exists as a second axis of "where is this running."

**Conclusion for ebrain**: OpenCode's own TUI never had to solve "N concurrently running agent
processes visible at once" — it solves "one agent conversation, with occasional subagent branches,
navigated by full-screen replace." **ebrain's TUI (driving multiple tmux-backed sessions
simultaneously as a cockpit) is a strictly harder UI problem than anything in this codebase — there
is no tab-strip/pane-model pattern here to copy.** The pane-scaffolding for the cockpit will have to
come from tmux itself (or be built new); OpenCode is a poor source for that specific rubric.

---

## (g) Qué robar / qué evitar

**Robar (steal):**
1. **The single-registration command model** (b)/(c) — one object per command carries its title,
   category, enabled/suggested predicates, keybinding, AND optional `slashName` — feeding palette,
   which-key, and slash-autocomplete from one source of truth. Avoids the classic "three places to
   update when adding a command" bug class. Directly portable to an ebrain command layer.
2. **Token-scale theme JSON with `defs` + dark/light indirection** (d) — `defs` (named primitives,
   step-scale) → `theme` (semantic roles referencing `defs`, per-mode) is a clean, swappable
   two-layer structure. Good template for mapping ebrain's own design-system tokens into a
   `theme.ts`/`theme.json` — copy the *shape* (`ThemeJson` type at `theme/index.ts:120-128`,
   `resolveTheme` at `theme/index.ts:241-299`), not the specific palette.
3. **Generative ANSI-fallback theme** (`generateSystem`, `theme/index.ts:360-469`) — deriving a
   full usable theme from just the terminal's reported palette avoids maintaining a bespoke
   "256-color theme" by hand; worth the ~100 lines.
3b. **`tint()` linear-interpolation helper** (`theme/index.ts:346-351`) plus `createFadeIn`-style
   alpha animation (`prompt/index.tsx:1302-1307`) for state transitions (agent color fade-in,
   hover) instead of hardcoding a second color per state.
4. **The accent-left-border pattern** (`border={["left"]}` + `SplitBorder`/`EmptyBorder` custom
   glyph maps, (a)) is a cheap, elegant way to color-code identity (agent/session) on any panel
   without a full box outline — reuse directly for the ebrain cockpit's per-pane/per-agent
   identity coding.
5. **Manual pixel-block wordmark technique** (`logo.ts` + `logo.tsx`) — plain-string bitmap +
   marker-char substitution + computed shadow tint per glyph. Cheap to author a bespoke "ebrain"
   wordmark this way without needing figlet/an image.
6. **Live-keybinding-driven hint text** (`useCommandShortcut`, hint bar (a)) — never hardcode
   "ctrl+p commands" as a string; format it from the live keymap so rebinding stays correct.
7. **Mode-stack + leader-key architecture** (b) from `@opentui/keymap` — vim-style modal layering
   (base/modal + leader sequences) generalizes well to a cockpit with many simultaneous contexts
   (global vs. per-pane vs. dialog-open).
8. **Slot/plugin system** (`plugin/slots.tsx`, `plugin/runtime.tsx`) — note this primitive
   (`createSlot`, `createSolidSlotRegistry`) actually **ships inside `@opentui/solid` itself**
   (`plugin/slots.tsx:2`), not authored by OpenCode — meaning if ebrain adopts `@opentui/solid` per
   ADR-003, this composition/extension mechanism (named slots, `mode: "replace"|"single_winner"`,
   ordered plugin registration) comes for free and is worth designing the ebrain TUI's plugin
   surface around directly rather than re-inventing.

**Evitar (avoid):**
1. **Do not copy OpenCode's session model as a multi-pane/tab answer** — it doesn't have one (see
   (e)). Solve the "N live tmux sessions at once" problem independently; the closest OpenCode
   pattern (quick-switch slots, full-screen session-list dialog) assumes a human is only ever
   looking at one agent conversation at a time, which is explicitly not the ebrain cockpit's job.
2. **Native-binary dependency risk.** `@opentui/core` ships prebuilt native addons per
   OS/arch/libc (8 optional platform packages, `bun.lock:2043-2057`) via `bun-ffi-structs`, plus a
   peer dependency on `web-tree-sitter` (WASM). This is real supply-chain and cross-platform-build
   surface (glibc vs musl already split into separate packages) that a "zero-dependency tui-kit
   extracted from FlowClock" explicitly avoids per ADR-003 — confirm that tradeoff is understood
   and intentional, since it's the single biggest structural difference between "adopt opentui" and
   "extract our own kit."
3. **Two-tier slash-command dispatch is easy to get wrong.** The `inputText.startsWith("/") &&
   sync.data.command.some(...)` string check at submit time (`prompt/index.tsx:1070-1073`) is a
   simple hack that only works because it runs *after* the built-in keymap-dispatch commands have
   already had a chance to intercept `/`-prefixed text via autocomplete select. A from-scratch
   implementation should make this dispatch order explicit rather than relying on textarea-submit
   ordering.
4. **Legacy API-shim debt.** `plugin/command-shim.ts` exists purely to keep old plugins working
   after a breaking API change to the exact subsystem ebrain is about to design (command
   registration). Version the ebrain plugin/command API deliberately from day one to avoid needing
   an equivalent shim later.
5. **Don't assume terminal width ≥120 cols is rare** — OpenCode's own responsive breakpoint for
   showing the sidebar inline vs. as an overlay is exactly `dimensions().width > 120`
   (`routes/session/index.tsx:263`); a cockpit showing multiple agent panes will hit this
   constraint immediately and harder than a single-session TUI does.

---

## Appendix: file index (primary sources used)

- `packages/tui/package.json` — dependency manifest, confirms `@opentui/*` + `solid-js`.
- `packages/tui/bunfig.toml` — `@opentui/solid/preload` wiring.
- `bun.lock:2041-2061` — pinned opentui versions + native platform packages.
- `script/upgrade-opentui.ts` — opentui-as-external-dependency maintenance tooling.
- `packages/tui/src/app.tsx` — renderer bootstrap, provider tree, global commands.
- `packages/tui/src/runtime.tsx` — `abbreviateHome` helper.
- `packages/tui/src/logo.ts`, `packages/tui/src/component/logo.tsx` — wordmark.
- `packages/tui/src/component/prompt/index.tsx` — prompt box, accent border, hint/status bar.
- `packages/tui/src/routes/home.tsx` — home screen composition.
- `packages/tui/src/feature-plugins/home/footer.tsx` — footer (cwd:branch · MCP · version).
- `packages/tui/src/ui/border.ts` — box-drawing glyph maps.
- `packages/tui/src/theme/index.ts`, `packages/tui/src/theme/assets/opencode.json` — theming engine + reference theme.
- `packages/tui/src/keymap.tsx`, `packages/tui/src/config/keybind.ts` — keybinding/command engine and default bindings.
- `packages/tui/src/component/command-palette.tsx` — command palette.
- `packages/tui/src/component/prompt/autocomplete.tsx` — slash/@-mention autocomplete merge logic.
- `packages/tui/src/plugin/command-shim.ts`, `plugin/runtime.tsx`, `plugin/slots.tsx` — plugin/slot architecture.
- `packages/tui/src/context/route.tsx` — routing model.
- `packages/tui/src/routes/session/index.tsx`, `routes/session/sidebar.tsx` — session tree, sidebar.
- `packages/tui/src/feature-plugins/system/which-key.tsx` — which-key discoverability panel.
- `packages/tui/src/ui/dialog.tsx` — modal/dialog stack + mode-stack integration.
- `packages/tui/src/util/renderer.ts` — renderer teardown.
- `packages/opencode/src/cli/tui/layer.ts`, `packages/opencode/package.json` — CLI-to-TUI wiring, dev/run commands.
