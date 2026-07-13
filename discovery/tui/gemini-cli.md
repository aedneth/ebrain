---
type: discovery
project: ebrain
program: F6 — TUI
subject: gemini-cli TUI reverse-engineering (Ink/React)
created: 2026-07-12
vendor: google-gemini/gemini-cli @ f354eeb (v0.52.0-nightly)
tags: [ebrain, tui, reverse-engineering, gemini-cli, ink, react]
related: ["../../docs/adr/ADR-003-tui-stack.md", "../../docs/SPRINT-TUI.md"]
---

# gemini-cli TUI reverse-engineering (Ink/React)

Target: `~/eBrain/vendor/gemini-cli` @ `f354eeb` (v0.52.0-nightly), read-only. UI code root:
`packages/cli/src/ui/`. All paths below are relative to that repo unless stated otherwise.

━━━

## (a) Anatomía de layout

Layout is a tree of nested Ink `<Box>` components, not fixed regions:

- **`App.tsx:16-38`** — top-level switch: quitting-state / screen-reader-mode / `DefaultAppLayout`, all wrapped in a `StreamingContext.Provider`.
- **`AppContainer.tsx`** (2867 lines) — the real "app shell." It is a single giant component that wires ~25 hooks (`useHistory`, `useMemoryMonitor`, `useThemeCommand`, `useAuthCommand`, `useQuotaAndFallback`, `useSlashCommandProcessor`, `useGeminiStream`, `useAgentStream`, `useFolderTrust`, `useIdeTrustListener`, `useMessageQueue`, `useMcpStatus`, etc. — imports at `AppContainer.tsx:1-150`) into ~10 React Context providers (`UIStateContext`, `UIActionsContext`, `ConfigContext`, `QuotaContext`, `ToolActionsContext`, `MouseContext`, `ScrollProvider`...). Everything downstream reads state via `useUIState()`/`useInputState()` instead of props.
- **`layouts/DefaultAppLayout.tsx:22-87`** — composes `MainContent` (history/scrollback) → conditional `BackgroundTaskDisplay` → a `mainControlsRef` box holding `Notifications` + `CopyModeWarning` + (`DialogManager` | `Composer`) + `ExitWarning`.
- **Header/wordmark** — `components/Header.tsx:21-59`: picks one of three hardcoded ASCII logos (`shortAsciiLogo`/`longAsciiLogo`/`tinyAsciiLogo`, defined in `components/AsciiArt.ts:7-59`, including block-drawing "CompactText" variants) based on measured terminal width (`getAsciiArtWidth`), then renders it through **`ThemedGradient.tsx:12-37`**, which wraps the separate `ink-gradient` npm package (`Gradient` component, itself backed by `tinygradient`) — falling back to a flat `theme.text.accent` color if the active theme defines <2 gradient stops. `components/Banner.tsx:12-42,50-71` reuses the same gradient-on-first-line pattern for warning/info banners in a bordered `Box`.
- **Input prompt** — `components/Composer.tsx:144-176` renders `InputPrompt` (a single 1933-line component, `components/InputPrompt.tsx`) with a placeholder that switches between vim/shell/normal text (`Composer.tsx:162-169`). The prompt box itself has two independent zero-height `<Box borderStyle="round">` strips for top/bottom border (`InputPrompt.tsx:1799-1811` and `1916-1929`) plus a `HalfLinePaddedBox` for background-color mode — i.e. two different rendering paths (border-line vs background-color) depending on terminal capability.
- **Footer/status row** — `components/Footer.tsx:179-543` is a responsive, column-priority-based status bar: it builds a list of `FooterColumn` candidates (workspace, git-branch, sandbox, model-name, context-used, quota, memory-usage, session-id, hostname, auth, code-changes, token-count — switch at `Footer.tsx:279-461`), then greedily fits them into `terminalWidth` (`Footer.tsx:476-536`), dropping low-priority columns and appending an `…` ellipsis when they don't fit. `components/StatusRow.tsx:158-455` is a second, denser status area (loading indicator / hooks / tips / mode indicators / context %) that uses **`ResizeObserver`** (from Ink, `StatusRow.tsx:9,78-106,189-211`) to measure its own rendered width and avoid a tip-vs-status collision (`LAYOUT.COLLISION_GAP`, `StatusRow.tsx:33-43,240-245`).
- **Tips/hints** — `components/Tips.tsx:16-41`, a static first-run block; `StatusRow.tsx` also renders a rotating "Tip: …" / "press tab twice for more" hint line when there's spare width.

## (b) Modelo de input

- **`contexts/KeypressContext.tsx`** (902 lines) is a hand-rolled ANSI-escape-sequence parser layered *on top of* Ink's `useStdin` (`KeypressContext.tsx:7-8`) — Ink itself only provides raw-mode toggling and a raw data stream; all cursor-key/function-key/paste-marker decoding is bespoke (`KEY_INFO_MAP` table, `KeypressContext.tsx:40-120`, covering `\x1b[A`, kitty-protocol variants, SS3 sequences, shift/ctrl modifiers, `paste-start`/`paste-end` markers for bracketed paste).
- **Priority-based pub/sub dispatch**: `enum KeypressPriority { Low=-100, Normal=0, High=100, Critical=200 }` (`KeypressContext.tsx:32-37`); `subscribe`/`unsubscribe`/`broadcast` use a `MultiMap` (mnemonist) keyed by priority with a cached, sorted priority list (`KeypressContext.tsx:781-853`) — within a priority tier, the **last-subscribed handler runs first**, and any handler returning `true` stops propagation (`KeypressContext.tsx:843-849`). This is effectively a small modal-input-stack router (dialogs subscribe at `High`/`Critical` to intercept keys before the composer sees them).
- **`hooks/useKeypress.ts`** (44 lines) is a thin wrapper: `subscribe(onKeypress, priority)` on mount if `isActive`, `unsubscribe` on unmount/dep-change.
- **Declarative keybinding table**: `key/keyBindings.ts` defines `enum Command` with **82** semantically-namespaced actions (`RETURN='basic.confirm'`, `MOVE_WORD_LEFT='cursor.wordLeft'`, `KILL_LINE_RIGHT='edit.deleteRightAll'`, `HISTORY_UP='history.previous'`, `REVERSE_SEARCH='history.search.start'`, `DIALOG_NAVIGATION_UP='nav.dialog.up'`, `ACCEPT_SUGGESTION='suggest.accept'`, etc. — `keyBindings.ts:17-77+`), resolved from raw `Key` via `key/keyMatchers.ts`. This decouples "what the user pressed" from "what it means," independent of Ink.
- **Modes coexisting in one input component** (`components/InputPrompt.tsx`, 1933 lines): normal text entry (`useTextBuffer`), shell mode (`!` prefix), reverse-history-search (`(r:)` prefix), command-search, vim NORMAL/INSERT (`hooks/vim.ts`, wired through `Composer.tsx:156-158`), and voice-mode dictation (mic glyph / `ListeningIndicator`, `InputPrompt.tsx:1818-1823`).
- **Mouse support**: `contexts/MouseContext.tsx` + `hooks/useMouse.ts`/`useMouseClick.ts` — full click/drag/scroll handling is implemented on top of raw terminal mouse-tracking sequences, a layer most TUIs skip entirely.
- **Kitty keyboard protocol**: `hooks/useKittyKeyboardProtocol.ts` — detects/enables the Kitty terminal's enhanced keyboard protocol so shift+enter and other otherwise-unreportable combos work on terminals that support it; `utils/terminalCapabilityManager` (referenced `KeypressContext.tsx:24,856`) gates this per-terminal.

## (c) Slash commands

- **Contract**: `commands/types.ts:193-257` — `SlashCommand { name, altNames?, description, hidden?, suggestionGroup?, kind: CommandKind, autoExecute?, isSafeConcurrent?, action?, completion?, showCompletionLoading?, takesArgs?, subCommands? }`. `CommandKind` (`types.ts:182-190`) distinguishes origin: `BUILT_IN | USER_FILE | WORKSPACE_FILE | EXTENSION_FILE | MCP_PROMPT | AGENT | SKILL`.
- **Dispatch outcomes are typed**: an action can return `QuitActionReturn`, `OpenDialogActionReturn` (dialog ∈ help/auth/theme/editor/privacy/settings/sessionBrowser/model/voice-model/agentConfig/permissions), `ConfirmShellCommandsActionReturn`, `ConfirmActionReturn`, `OpenCustomDialogActionReturn`, `LogoutActionReturn`, or plain history items (`types.ts:107-180`) — a clean discriminated union the UI switches on to decide what to render/do next.
- **One file per command**: ~60 files under `commands/` (`aboutCommand.ts`, `agentsCommand.ts`, `authCommand.ts`, `bugCommand.ts`, `chatCommand.ts`, `clearCommand.ts`, `compressCommand.ts`, `editorCommand.ts`, `helpCommand.ts`, `mcpCommand.ts`, `modelCommand.ts`, `resumeCommand.ts`, `themeCommand.ts`, `vimCommand.ts`, `voiceCommand.ts`, `profileCommand.ts`, …), each exporting an object of the shape above.
- **Runtime assembly**: `hooks/slashCommandProcessor.ts:332-346` — `CommandService.create(...)` merges built-ins with user-file/workspace-file/extension/MCP-prompt/agent/skill commands at startup; `setCommands(commandService.getCommands())` feeds the merged, flat list to the UI's slash-suggestion popup.
- **Async arg completion**: `SlashCommand.completion(context, partialArg)` (`types.ts:236-239`) supports e.g. `/resume <tag>` autocompleting session tags; `showCompletionLoading` controls whether a spinner shows while it resolves (avoids flicker for fast completions).

## (d) Theming/tokens

- **19 built-in themes**: 11 dark (`themes/builtin/dark/`: ansi-dark, atom-one-dark, ayu-dark, default-dark, dracula-dark, github-dark(-colorblind), holiday-dark, shades-of-purple-dark, solarized-dark, tokyonight-dark) + 8 light (`themes/builtin/light/`: ansi-light, ayu-light, default-light, github-light(-colorblind), googlecode-light, solarized-light, xcode-light), plus a dedicated **`themes/builtin/no-color.ts`** whose `ColorsTheme.type = 'ansi'` and every color field is an empty string — an explicit no-color/ANSI-only degradation theme, not just "skip chalk."
- **Semantic token layer**: `themes/semantic-tokens.ts:9-43` defines `interface SemanticColors { text: {primary,secondary,link,accent,response}, background: {primary,message,input,focus,diff:{added,removed}}, border: {default}, ui: {comment,symbol,active,dark,focus,gradient[]}, status: {error,success,warning} }`. Each theme populates this via `lightSemanticColors`/`darkSemanticColors` objects (`themes/theme.ts:45-115`) mapping raw palette → named tokens — component code never touches a raw hex, only `theme.text.primary` etc.
- **Live proxy objects**: `semantic-colors.ts:10-26` exports `theme: SemanticColors` as an object of **getters** that call `themeManager.getSemanticColors()` on every access — so a theme switch takes effect everywhere without re-importing or re-rendering plumbing; `colors.ts:10-65` does the same for the legacy raw-palette `Colors` object.
- **Color pipeline / contrast tooling**: `themes/theme.ts:20-59` maintains `INK_SUPPORTED_NAMES` (Ink's built-in ANSI name set) vs `CSS_NAME_TO_HEX_MAP` (from `tinycolor2`'s CSS name table, excluding Ink's names) vs `INK_NAME_TO_HEX_MAP` (bright-ANSI hex fallbacks), plus `getLuminance()` (WCAG relative luminance via `tinycolor2`) and `resolveColor()` for turning arbitrary user-supplied color strings into Ink-safe values.
- **`ThemeManager` class** (`themes/theme-manager.ts:55-70+`) caches computed colors (`cachedColors`/`cachedSemanticColors`/`lastCacheKey`) to avoid recomputation, and resolves themes from three separate sources (`settingsThemes`, `extensionThemes`, `fileThemes` maps) plus a detected `terminalBackground` — i.e. it can react to the terminal's actual reported background color, not just user setting.
- **Truecolor/256 degradation itself is NOT implemented in this codebase** — it's delegated to `chalk` (a *dependency of the forked Ink*, not of gemini-cli directly: `chalk: ^5.6.0` under `node_modules/ink` in `package-lock.json:10007`), which auto-downsamples hex colors to 256/16-color ANSI based on detected terminal capability.
- **Syntax highlighting is theme-scoped**: every theme (including `NoColorTheme`, `themes/builtin/no-color.ts:31-119`) carries a full `highlight.js`-token CSS-in-JS map (`hljs-keyword`, `hljs-string`, `hljs-comment`, etc.), consumed via `highlight.js`/`lowlight` (`packages/cli/package.json` deps) for rendered code blocks.

## (e) Sesiones/tabs

- **No multi-session/tabs-within-one-process model.** One gemini-cli process = one active conversation. There is no "session switcher while running" the way tmux panes/windows work.
- **`components/SessionBrowser.tsx`** (741 lines) is a *picker dialog*, not a live multiplexer: it lists past saved sessions from disk (`SessionInfo[]` via `utils/sessionUtils.getSessionFiles`) with search/sort/pagination state (`SessionBrowserState`, `SessionBrowser.tsx:40-90`) and lets the user resume-or-delete one — opening it replaces the current dialog, it doesn't run two sessions side by side.
- **`hooks/useSessionResume.ts:37-60`** loads a *previously saved* session's history into the *current* process at startup/resume (`convertSessionToClientHistory`/`convertSessionToHistoryFormats`) — sequential, not concurrent.
- **`hooks/useTabbedNavigation.ts`** (250 lines) is a generic keyboard-navigation hook for **dialog tabs** (e.g. paging through Settings-dialog sections: `tabCount`, `currentIndex`, `goToNextTab`/`goToPrevTab`, `wrapAround` — `useTabbedNavigation.ts:15-50`), unrelated to agent/session tabs.
- **`contexts/SessionContext.tsx`** (281 lines) tracks in-memory stats (tokens, cost, per-model usage) for the **one current session only**.
- **Implication for ebrain**: gemini-cli has no answer at all to "see and orchestrate N live agent sessions," which is exactly the gap ADR-003's tmux-as-data-plane / TUI-as-control-plane split is designed to fill — nothing to borrow here except "a session picker/resume dialog is a good idea to have."

## (f) Stack de render y por qué — FOCO EXTRA: evidencia de costo CPU/RAM

**Render pipeline**: React `19.2.4` + a **forked** Ink — `packages/cli/package.json` declares `"ink": "npm:@jrichman/ink@6.6.9"`, i.e. NOT the stock `ink` package but a third-party fork aliased as `ink` (confirmed in `package-lock.json:9997-10032`, `"node_modules/ink": {"name": "@jrichman/ink", "version": "6.6.9", ...}`). Even Google's own team needed to run off-upstream Ink.

**Dependency weight (verified against `package-lock.json`, no install performed)**:
- Ink itself pulls **23 direct dependencies** (`package-lock.json:10003-10028`): `ansi-escapes, ansi-styles, auto-bind, chalk, cli-boxes, cli-cursor, cli-truncate, code-excerpt, es-toolkit, indent-string, is-fullwidth-code-point, is-in-ci, mnemonist, patch-console, react-reconciler, signal-exit, slice-ansi, stack-utils, string-width, type-fest, wrap-ansi, ws, yargs, yoga-layout`.
- **`react-reconciler@0.32.0`** (`package-lock.json:13724-13734`, its own `scheduler@^0.26.0`, `package-lock.json:14409-14414`) — a *second*, independent copy of React's reconciler/scheduler machinery, separate from `react-dom`'s own reconciler+scheduler which is also in the lockfile (`react-dom/node_modules/scheduler`) — this is the literal "runtime React + reconciler" ADR-003 flagged.
- **`yoga-layout@3.2.1`** (`package-lock.json:17946-17951`) — Facebook's Yoga, a compiled (WASM/native) flexbox layout engine, pulled in just to compute box positions for terminal text.
- `packages/cli/package.json` itself declares **40 direct dependencies + 12 devDependencies** (measured programmatically) — a much larger direct surface than a zero-dep string-buffer kit needs by construction.

**Six in-repo, in-code confessions of render-model cost** (this is the strongest ADR-003 evidence):

1. **`<Static>`-splitting to fight flicker** — `hooks/useGeminiStream.ts:1100-1118`: streamed model output is deliberately chunked at safe split points so "everything but the last message is treated as static in order to prevent re-rendering an entire message history multiple times per-second (as streaming occurs). Prior to this change you'd see heavy flickering of the terminal." `components/MainContent.tsx:310-319` renders history through Ink's `<Static>` (append-only, never re-diffed) specifically to control this cost; `hooks/useHistoryManager.ts:131-136` even deprecates direct history mutation ("we are currently rendering all history items in `<Static />` for performance reasons").
2. **A dedicated flicker detector** — `hooks/useFlickerDetector.ts:21-43` measures the rendered tree's height (`measureElement`) against `terminalHeight` on every render and emits telemetry (`recordFlickerFrame`, `AppEvent.Flicker`) when Ink's layout overflows the screen.
3. **A home-grown FPS/idle-frame profiler shipped in production** — `components/DebugProfiler.tsx` (full file) implements ring-buffer (`FixedDeque`) tracking of frame vs. action timestamps, counts `totalIdleFrames`/`totalFlickerFrames`, and logs: *"N frames rendered while the app was idle in the past second. This likely indicates severe infinite loop React state management bugs."* (`DebugProfiler.tsx:113-117`), surfaced via a hidden `/profile` dev command (`commands/profileCommand.ts:10`).
4. **A 7 GB RSS warning threshold** — `hooks/useMemoryMonitor.ts:11-40`: `MEMORY_WARNING_THRESHOLD = 7 * 1024 * 1024 * 1024` polled every 60s (`MEMORY_CHECK_INTERVAL`), warning the user to file a bug report if RSS exceeds it. **This single constant is the sharpest data point in the whole codebase**: gemini-cli's own team treats multi-GB RSS as a normal (if high) operating condition worth a soft warning, not a hard failure — on hardware where ebrain's *entire* budget is a 4 GB Celeron laptop with ~150–350 MB free with one agent alive (per ADR-003).
5. **Heavy `useMemo`/`useCallback` discipline as a tax, not a choice** — `AppContainer.tsx` alone (2867 lines) contains **14 `useMemo`** and **31 `useCallback`** call sites (grep-counted) purely to hand-tune re-render boundaries against React's default behavior.
6. **Two coexisting render strategies for scrollback** — `components/MainContent.tsx:260-322` branches between a classic `<Static>` history list and a newer virtualized `ScrollableList`/`<StaticRender>` path (`components/shared/VirtualizedList.tsx:109`) gated by `config.getUseTerminalBuffer()` — evidence that the original Static-only model didn't fully scale and a second, more complex virtualization layer had to be added later without removing the first.

**Net assessment**: every one of the six items above is a runtime workaround for costs *inherent* to "React reconciler + Yoga flexbox engine, diffed and blitted to a terminal up to 60×/sec during streaming." None would exist under a direct string-buffer render model (FlowClock's kit). This is concrete, first-party evidence supporting ADR-003's rejection of Ink/React for a 4 GB-RAM target.

**What Ink does well (fairness check)**: the `ResizeObserver` API (`StatusRow.tsx`, `Footer.tsx` via `measureElement`) gives real per-node measured-width layout feedback that a hand-rolled kit must reimplement from scratch; the declarative `<Box flexDirection/flexGrow/flexShrink>` model made the very complex responsive Footer/StatusRow column-fitting logic (see (a)) *readable* despite being intricate; and `<Static>` — despite forcing the buffer-splitting workaround above — is a genuinely elegant idea (an append-only render region that costs nothing to keep around) worth re-deriving conceptually even without Ink.

## (g) Qué robar / qué evitar

**Robar (independiente del stack de render):**
- **Semantic-token indirection** (`themes/semantic-tokens.ts` + live-getter `theme` proxy in `semantic-colors.ts:10-26`): components reference `theme.text.primary`, never a raw hex; the *manager* resolves per active theme. ebrain's `tui/src/theme.ts` (already planned per ADR-003 §"Estética") should adopt exactly this shape — named tokens resolved through one singleton, swappable without touching call sites.
- **Namespaced `Command` enum** (`key/keyBindings.ts`, e.g. `'cursor.home'`, `'edit.deleteLeft'`, `'history.search.start'`) decoupling raw keys from semantic actions — clean and stack-agnostic.
- **`SlashCommand` contract** (`commands/types.ts:193-257`): `kind` enum for origin (built-in/user-file/workspace/extension/mcp-prompt/agent/skill), `completion()` for async arg-completion, `autoExecute` vs. autocomplete-into-buffer distinction, recursive `subCommands` — directly reusable for ebrain's own `/` palette regardless of render stack.
- **Priority-tiered keypress dispatch** (`KeypressContext.tsx:833-853`): `Low/Normal/High/Critical` tiers, last-subscribed-wins within a tier, handler-returns-`true`-stops-propagation — a clean, small modal-input-stack router portable to a plain event emitter (no Ink/React required).
- **Column-priority responsive Footer** (`Footer.tsx:240-536`): candidate columns tagged `isHighPriority` + measured width, greedily fit into `terminalWidth`, drop lowest-priority + ellipsis when tight — a genuinely good "degrade gracefully in a narrow terminal" algorithm worth reimplementing directly atop FlowClock's kit.
- **Self-instrumentation as a practice**: build a minimal flicker/idle-frame counter into ebrain's TUI from day one (even though the *specific* bug class — React reconciler overflow — won't apply to a string-buffer renderer, "detect when I'm rendering more/wastefully than I should" is a good habit `DebugProfiler.tsx` demonstrates).
- **Session-picker/resume dialog** as a UX pattern (`SessionBrowser.tsx`) — useful even though ebrain's actual session model is tmux, not in-process history.

**Evitar:**
- **React + forked Ink + react-reconciler + yoga-layout as the render substrate** — confirmed heavy (23 direct deps under Ink alone, a second reconciler+scheduler pair, a compiled flexbox engine) and the direct cause of ≥4 distinct in-repo perf firefights (Static-splitting, flicker detection, idle-frame profiler, 7 GB RSS warning). This is the exact risk ADR-003 rejected Option A for.
- **The 2867-line "God container" pattern** (`AppContainer.tsx`) coordinating 20+ hooks through ~10 Context providers — a maintainability anti-pattern independent of the render stack; don't replicate the structure even while stealing individual ideas from it.
- **A 1933-line mega input component** (`InputPrompt.tsx`) merging text-buffer editing, vim mode, shell mode, reverse-search, voice dictation, and mouse handling into one file/component — keep ebrain's input-mode variants composable and separate.
- **Two coexisting rendering strategies for the same concern** (`MainContent.tsx`'s `<Static>` history vs. newer terminal-buffer/virtualized `ScrollableList`, switched by a config flag) — a sign that changing the render model after shipping was expensive. Settle ebrain's scrollback strategy once, before writing app code (which is precisely what GATE F6.0 is for).

━━━

## ADR-003 evidence summary (Ink cost)

| Evidence | Location | What it shows |
|---|---|---|
| Ink is a **fork**, not upstream | `package.json` (`"ink": "npm:@jrichman/ink@6.6.9"`), `package-lock.json:9997-10032` | Off-the-shelf Ink wasn't sufficient even for Google's own team |
| 23 direct deps under Ink alone | `package-lock.json:10003-10028` | Large transitive surface for "just render text to a terminal" |
| Separate `react-reconciler` + `scheduler` | `package-lock.json:13724-13734, 14409-14414` | A second full reconciler/scheduler pair distinct from react-dom's |
| `yoga-layout` (compiled flexbox engine) | `package-lock.json:17946-17951` | Full flexbox engine just to lay out terminal boxes |
| `<Static>`-splitting to stop flicker | `hooks/useGeminiStream.ts:1100-1118` | In-code confession: naive re-render "heavily flickers the terminal" |
| Runtime flicker detector | `hooks/useFlickerDetector.ts:21-43` | Had to build instrumentation to catch their own layout overflowing |
| Built-in FPS/idle-frame profiler + `/profile` | `components/DebugProfiler.tsx`, `commands/profileCommand.ts:10` | "Likely indicates severe infinite loop React state management bugs" — shipped as a standing risk class |
| **7 GB RSS warning threshold** | `hooks/useMemoryMonitor.ts:11` | Multi-GB RSS treated as normal-if-high, not fatal — on a target where ebrain's *whole* budget is 4 GB |
| 14 `useMemo` + 31 `useCallback` in one file | `AppContainer.tsx` (grep-counted) | Manual re-render tuning as an ongoing tax against React defaults |
| Two coexisting scrollback render paths | `components/MainContent.tsx:260-322`, `components/shared/VirtualizedList.tsx:109` | Original `<Static>` model didn't fully scale; a second virtualization layer had to be bolted on |

**Conclusion**: the evidence corroborates ADR-003's rejection of Ink/React. Every mitigation above (Static-splitting, flicker detection, idle-frame profiling, the 7 GB threshold, heavy memoization) is a cost that a direct string-buffer renderer (FlowClock's tui-kit) does not incur by construction. Nothing found here challenges the ADR; several *component-decomposition and theming ideas* (semantic tokens, priority-tiered input dispatch, column-priority footer, slash-command contract) are worth reimplementing on top of the chosen stack regardless.

## Top takeaways for ebrain

1. **Ratify ADR-003 Option D as-is** — the Ink cost evidence here (forked dependency, dual reconciler, compiled flexbox engine, 4 distinct perf firefights, 7 GB RSS warning) is concrete and unambiguous for a 4 GB target.
2. **Port the semantic-token pattern** (`theme.ts` getter-proxy over a `ThemeManager` singleton) into `tui/src/theme.ts` verbatim in spirit — it's the single most reusable idea in this codebase and is completely render-stack-agnostic.
3. **Port the `SlashCommand` contract shape** (kind/origin enum, `completion()`, `autoExecute`, `subCommands`) for ebrain's `/` palette over the CLI-first `--json` commands.
4. **Port the priority-tiered keypress dispatcher** for ebrain's dialog/modal stack (tmux attach/detach, confirmation prompts) — small, self-contained, no Ink needed.
5. **Port the column-priority responsive Footer algorithm** for ebrain's own footer (cwd:branch + version + hint bar, per ADR-003's "Estética" section) — directly implementable against FlowClock's layout primitives.
6. **Do not** copy the "God container" (`AppContainer.tsx`) or "mega input component" (`InputPrompt.tsx`) structures, and treat "two coexisting render strategies for the same concern" as an anti-pattern to actively design away from at GATE F6.0.
