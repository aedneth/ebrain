---
type: discovery
project: ebrain
program: F6 — TUI
subject: codex TUI reverse-engineering (Rust/ratatui)
created: 2026-07-12
vendor: openai/codex @ c888e8e
tags: [ebrain, tui, reverse-engineering, codex, ratatui]
related: ["../../docs/adr/ADR-003-tui-stack.md", "../../docs/SPRINT-TUI.md"]
---

# codex TUI reverse-engineering (Rust / ratatui)

Scope note up front: `codex-rs/tui/src/` is **not** a minimal reference TUI — it's
a production app with ~280 source files (`app/` alone has ~35 submodules;
`chatwidget/` ~55; `bottom_pane/` ~35). This RE reads the load-bearing modules for
each rubric item and cites file:line for every structural claim. It does not
enumerate every module.

━━━

## (a) Anatomía de layout — banner, bottom pane, status line, footer

**Overall frame shape.** Codex does **not** run a classic full-screen ratatui app
(no `EnterAlternateScreen` full-repaint loop for normal operation). It runs an
**inline viewport**: a small ratatui-rendered region pinned to the bottom of the
terminal (composer + status + streaming tail), while finalized conversation
history is pushed into the **real terminal scrollback** via raw ANSI escapes
(detailed in §f). This is the single most important layout fact and shapes
everything else.

- Top-level render entry: `App::render_chat_widget_frame` computes
  `desired_height` from terminal width, then calls
  `tui.draw_with_resize_reflow(desired_height, |frame| { self.chat_widget.render(area, frame.buffer); ... })`
  — `app.rs:1349-1362`. Cursor position/style are pulled from the widget after
  render (`app.rs:1356-1359`).
- `ChatWidget` is the root `Renderable` for that bottom viewport. Its doc
  comment states the model directly: committed transcript cells are finalized
  `HistoryCell`s (pushed to scrollback), plus one **in-flight `active_cell`**
  that mutates in place while streaming — `chatwidget.rs:1-30`.
- **Banner / ASCII animation**: `AsciiAnimation` (`ascii_animation.rs:12-96`) is a
  generic driver — holds `variants: &'static [&'static [&'static str]]`
  (frame-sets), a `variant_idx`, and a `frame_tick: Duration`
  (`FRAME_TICK_DEFAULT`, `frames.rs`/`ascii_animation.rs:8`). `current_frame()`
  indexes into the frame array using `elapsed_ms / tick_ms` modulo frame count
  (`ascii_animation.rs:65-77`) — i.e. **time-based frame selection**, not a
  ticked counter; any redraw at any time picks the mathematically-correct
  frame. `schedule_next_frame()` computes the exact remaining ms to the next
  tick boundary and calls `FrameRequester::schedule_frame_in` so the frame
  scheduler wakes exactly when the animation needs to advance
  (`ascii_animation.rs:44-63`) — no polling loop. Frame content itself is
  **compile-time embedded** per variant (`default`, `codex`, `openai`, `blocks`,
  `dots`, `hash`, `hbars`, `vbars`, `shapes`, `slug` — `frames.rs:1-58`, 36
  frames each via `include_str!("../frames/<dir>/frame_N.txt")`) — literal
  ASCII-art text files baked into the binary, not generated at runtime.
- **Bottom pane** (`bottom_pane/mod.rs`): `BottomPane` (struct at
  `bottom_pane/mod.rs:208`, doc comment `bottom_pane/mod.rs:203-206`) owns a
  `ChatComposer` (always retained, even under a modal) plus a
  `view_stack: Vec<Box<dyn BottomPaneView>>` for popups/modals — command popup,
  approval overlays, selection lists, etc. all push onto this stack rather
  than replacing the composer. It also owns `status: Option<StatusIndicatorWidget>`
  (spinner shown while a task runs), `pending_input_preview`,
  `pending_thread_approvals`, and `context_window_percent/used_tokens` for the
  footer — `bottom_pane/mod.rs:208-244`.
- **Status/footer line**: `bottom_pane/footer.rs` (2082 lines) computes footer
  height (`footer_height`, `footer.rs:230`), a single-line adaptive layout that
  right-aligns a context line and left-aligns hints/mode indicators
  (`single_line_footer_layout`, `footer.rs:362`; `left_fits`/`right_aligned_x`/
  `max_left_width_for_right`, `footer.rs:297,610,633` — classic "does the right
  side fit, else drop the left" responsive footer). `context_window_line`
  (`footer.rs:1008`) renders the `% left / tokens used` indicator;
  `mode_indicator_line`/`goal_status_indicator_line` (`footer.rs:533,540`) show
  collaboration-mode and goal-tracking chips.
- Key hints in the footer come from a declarative `ShortcutDescriptor` /
  `ShortcutBinding` table with `DisplayCondition` gating (`footer.rs:1041-1080`)
  — i.e. hints are data, filtered by current app state, not hand-assembled
  strings per screen.

## (b) Modelo de input — key handling, modes, ratatui key capture

- **Key capture at the terminal layer**: `crossterm::event::EventStream` is the
  single source of truth for input; wrapped in `EventBroker`
  (`tui/event_stream.rs:51-115`) so it can be **paused and dropped**
  (releasing stdin entirely, e.g. handing control to `$EDITOR` or a suspended
  shell) and **resumed** by recreating the stream — comment block at
  `tui/event_stream.rs:1-18` explains this is required because crossterm's
  `EventStream` keeps reading from stdin even while not polled, which would
  steal input from a foreground child process otherwise.
- `TuiEventStream` fair-polls two sources round-robin (`poll_draw_first` flip)
  so draw notifications and key/paste/resize events never starve each other
  (`tui/event_stream.rs:274-300`).
- Crossterm `Event` → app-level `TuiEvent` mapping happens once, centrally
  (`map_crossterm_event`, `tui/event_stream.rs:237-269`): `Key`, `Resize`,
  `Paste`, `FocusGained/Lost` (used to re-query terminal default colors on
  focus regain — `tui/event_stream.rs:260`), everything else (mouse, etc.)
  dropped.
- **Global key routing** happens in `App::handle_key_event`
  (`app/input.rs:92-255`), *before* the key ever reaches `ChatWidget`: agent
  fast-switch (Alt+Left/Right, with a fallback to Option+b/f word-motion keys
  detected only when the composer is empty and enhanced keyboard protocol
  isn't supported — `app/input.rs:98-138`), then a **user-remappable keymap**
  check (`self.keymap.app.*.is_pressed(key_event)` for vim-mode toggle,
  fast-mode toggle, raw-output toggle, transcript overlay, external editor —
  `app/input.rs:147-190`), then a special-cased `Esc` handler for the
  "backtrack" (jump to an earlier user turn) state machine
  (`app/input.rs:192-207`), then falls through to `chat_widget.handle_key_event`.
  Only when no modal/overlay is active are keymap shortcuts even considered
  (`app_keymap_shortcuts_available`, `app/input.rs:277-279`) — this is the
  **modal-stack precedence** pattern: popups get first refusal on keys.
- User-remappable keymap: `keymap.rs` (2947 lines) — `RuntimeKeymap::from_config`
  parses `tui.keymap` from config into typed `KeyBinding`s consumed via
  `.is_pressed(key_event)`; invalid config produces one hard error at startup
  (`app.rs:1007-1013`) rather than silent fallback.
- **Text editing** (`bottom_pane/chat_composer.rs`, 11.8k lines — the single
  largest file in the crate) wraps a custom `TextArea`
  (`bottom_pane/textarea.rs`, imported at `chat_composer.rs:257`) rather than
  ratatui's own widget set — multi-line editing, mention (`@file`) tokenization
  (`current_at_token`, `is_mention_name_char*`, `chat_composer.rs:2320-3995`),
  paste-burst coalescing (`bottom_pane/paste_burst.rs`), and Vim mode are all
  layered on top.

## (c) Slash commands — definition and dispatch

- **Single source of truth**: `SlashCommand` is a `strum` enum
  (`slash_command.rs:8-79`) — deliberately **not alpha-sorted**; comment at
  `slash_command.rs:13` says enum order **is** popup presentation order, so
  more-used commands are declared first. `#[strum(serialize = "...")]`
  attributes give kebab-case names and aliases (e.g. `Stop` serializes to
  `"stop"` but also parses `"clean"`; `AutoReview` → `"approve"`;
  `slash_command.rs:20-78`).
- Each command carries **declarative capability flags** as enum methods rather
  than scattered booleans: `description()` (`slash_command.rs:83-144`),
  `supports_inline_args()` (`:153-171`, e.g. `/review <text>`,
  `/rename <name>`), `available_in_side_conversation()` (`:174-185`),
  `available_during_task()` (`:188-244`, a big match deciding what's safe to
  run mid-turn), `is_visible()` (`:246-254`, platform gating — e.g.
  `SandboxReadRoot` only visible on Windows, `Rollout`/`TestApproval` only in
  debug builds).
- `built_in_slash_commands()` (`slash_command.rs:258-263`) just filters
  `SlashCommand::iter()` by `is_visible()` — the popup and the parser both
  derive from this one list, so there's no separate registration step.
- **Popup / fuzzy filter**: `CommandPopup` (`bottom_pane/command_popup.rs:36-40`)
  holds `commands: Vec<CommandItem>` (built-in or dynamic `ServiceTier`
  commands) and a scroll state. `on_composer_text_change`
  (`command_popup.rs:97-127`) extracts the first whitespace-delimited token
  after `/` on the first line as the filter — typing `/clear something` still
  resolves to `/clear`. Matching (`filtered`, `command_popup.rs:146-194`) does
  **exact match first, then prefix match**, both case-insensitive, preserving
  declared enum order within each bucket — no full fuzzy/Levenshtein scoring,
  just a two-tier priority sort.
- **Dispatch**: `chatwidget/slash_dispatch.rs` (1150 lines) is one big
  `match cmd { SlashCommand::X => { ... } }` inside `ChatWidget` — one arm per
  command (`slash_dispatch.rs:160-503` for the immediate-dispatch table, a
  second match at `:670-895` for commands that additionally parse trailing
  inline args like `/rename <name>` or `/goal pause`). A later match
  (`slash_dispatch.rs:1043-1069`) classifies commands by `QueueDrain` policy
  (whether the command should flush a queued-message backlog or not) — i.e.
  slash commands interact directly with the input-queueing state machine, not
  just with turn submission.

## (d) Theming / tokens — `color.rs`, truecolor vs 256, styling model

- `color.rs` (75 lines) is a **pure math** module, not a theme registry: `is_light(bg)`
  (perceptual luminance threshold, `color.rs:1-5`), `blend(fg, bg, alpha)` (linear
  RGB alpha blend, `color.rs:7-12`), and `perceptual_distance` — full sRGB→linear→
  XYZ→CIE-Lab conversion then Euclidean ΔE in Lab space (`color.rs:14-75`) used
  to find the closest displayable color when quantizing to a limited palette.
- **Color-depth detection** lives in `terminal_palette.rs`. `stdout_color_level()`
  (`terminal_palette.rs:14-21`) delegates to the `supports-color` crate
  (`has_16m` → TrueColor, `has_256` → Ansi256, else Ansi16/Unknown).
  `effective_stdout_color_level()` (`:43-50`) then **overrides** that raw
  detection for known-lying terminals: Windows Terminal reports Ansi16 over
  legacy conpty but actually renders truecolor correctly, detected via
  `WT_SESSION` env var or `TerminalName::WindowsTerminal`
  (`stdout_color_level_for_terminal`, `:52-70`) — a concrete example of "trust
  but verify" terminal capability detection rather than trusting one signal.
- `best_color(target_rgb)` (`terminal_palette.rs:34-41,72-84`) is the
  degrade-gracefully primitive: TrueColor passes RGB straight through;
  Ansi256 does a nearest-neighbor search over the xterm 256-color table using
  `perceptual_distance` (not naive Euclidean RGB distance); Ansi16/Unknown
  falls back to `Color::default()` (foreground-only, no synthesized background).
- **Default terminal fg/bg query**: `default_colors()` queries the real
  terminal's configured foreground/background via OSC 10/11
  (`crossterm::style::query_foreground_color/query_background_color`,
  `terminal_palette.rs:118-157`) and **caches** the result (`Cache<T>` with an
  `attempted` flag so a failed query isn't retried every frame,
  `:124-146`), re-queried only on `FocusGained` (`requery_default_colors`,
  wired at `tui/event_stream.rs:260`).
- **Styling model on top of ratatui**: `style.rs` composes semantic styles
  (`user_message_style`, `proposed_plan_style`, `accent_style`,
  `table_separator_style`) from the *actual* terminal bg/fg rather than fixed
  constants — e.g. `accent_style_for` picks a darker cyan on light backgrounds,
  bright cyan otherwise (`style.rs:51-57`); `user_message_bg` blends white/black
  into the terminal's real background at low alpha (4%/12%) to get a subtle
  tint that always contrasts correctly regardless of the user's theme
  (`style.rs:76-83`). Ratatui `Style`/`Color`/`Modifier` remain the leaf
  primitives; everything above is Codex-authored color science.
- **Diff-specific theming** (`diff_render.rs:56-101`) hardcodes truecolor RGB
  and 256-index fallback palettes *per color depth* for add/delete
  line-backgrounds and gutter — dark theme (`#213A2B`/`#4A221D`) vs light theme
  (GitHub-style `#dafbe1`/`#ffebe9`) chosen once via `diff_theme()` from the
  probed terminal background (`diff_render.rs:1037-1058`), with the syntax
  theme's own scope colors (`markup.inserted`/`markup.deleted`) allowed to
  **override** the hardcoded fallback when the color depth is rich enough
  (`resolve_diff_backgrounds_for`, `diff_render.rs:234-253`) — themes compose
  instead of being all-or-nothing.
- **Theme picker**: `theme_picker.rs` (657 lines) lists bundled themes plus any
  custom `.tmTheme` files under `{CODEX_HOME}/themes/` (doc comment
  `theme_picker.rs:1-19`), with **live preview** (swaps the runtime syntax
  theme as you navigate the list, previewing an actual diff snippet rendered
  with `diff_render.rs` helpers — `theme_picker.rs:23-40`), **cancel-restore**
  (Esc reverts to the snapshot taken when the picker opened), and
  **persist-on-confirm** (writes `[tui] theme = "..."` to `config.toml` via
  `ConfigEditsBuilder`).

## (e) Sesiones / tabs — session and conversation model

- Codex's TUI is fundamentally **multi-thread, not single-conversation**: each
  independent conversation is a `ThreadId` (`codex_protocol::ThreadId`), and the
  TUI can hold many threads live at once (primary + spawned sub-agents + "side"
  ephemeral forks), switched between via keyboard shortcuts — there is no
  literal "tab bar" widget; thread switching is a fast-switch shortcut
  (Alt+Left/Right, `previous_agent_shortcut`/`next_agent_shortcut`,
  `multi_agents.rs:105-133`) plus a picker (`/agent`, `/subagents`).
- `ThreadSessionState` (`session_state.rs:29-58`) is the canonical per-thread
  snapshot: model, model_provider_id, approval_policy, permission_profile,
  cwd + `runtime_workspace_roots`, reasoning_effort, collaboration_mode,
  personality, rollout_path, etc. `App` tracks
  `primary_thread_id: Option<ThreadId>`, `active_thread_id`,
  `side_threads: HashMap<ThreadId, SideThreadState>`, and per-thread event
  channels (`thread_event_channels: HashMap<ThreadId, ThreadEventChannel>`,
  `app.rs:568-577`) — i.e. each thread has its own buffered event channel and
  the app polls whichever is "active."
- **Sub-agents / collab agents**: `multi_agents.rs` renders spawn/interaction/
  wait/close lifecycle events as history cells (`spawn_begin/end`,
  `interaction_end`, `waiting_begin/end`, `close_end`,
  `multi_agents.rs:331-455`) keyed by `ThreadId`, with per-thread status dots
  (`agent_picker_status_dot_spans`, `:75-83`) and activity summaries.
- **Side conversations** (`/side`, `/btw`): an "ephemeral fork" thread used for
  a quick detour without polluting the primary thread's context
  (`slash_command.rs:124-126`); only a whitelisted subset of commands remain
  available inside one (`available_in_side_conversation`,
  `slash_command.rs:174-185`).
- **Resume / fork / archive / delete**: `SessionSelection` enum
  (`StartFresh | Resume(target) | Fork(target) | Exit`, referenced throughout
  `app.rs:889-1000`) drives startup — resuming re-hydrates a `ThreadSessionState`
  from a rollout file (`app_server.resume_thread`, `app.rs:927-931`), forking
  clones history into a new `ThreadId` (`app_server.fork_thread`,
  `app.rs:966-970`). `resume_picker.rs` (6.3k lines) is the interactive
  session/thread browser for `/resume`.
- **Workspace command execution is session-scoped, not host-scoped**:
  `WorkspaceCommandExecutor` (`workspace_command.rs:137-149`) abstracts "run
  this argv in the active workspace" so the same TUI code path works whether
  the app-server backing the session is local (embedded) or remote — callers
  never branch on that (`workspace_command.rs:1-11, 164-215`).

## (f) Stack de render y por qué + FOCO EXTRA: streaming & diff

### The render stack, top to bottom

This is the architecturally interesting part. Codex is **not** "ratatui redraws
the whole screen every frame." It's a hybrid:

1. **Finalized history → real terminal scrollback**, written via raw ANSI
   escapes, *not* through ratatui's buffer diffing at all.
   `insert_history.rs` states this explicitly: *"Codex uses the terminal
   scrollback itself for finalized chat history, so inserting a history cell is
   an escape-sequence operation rather than a normal ratatui render."*
   (`insert_history.rs:1-4`). Mechanism (`insert_history_lines_with_mode_and_wrap_policy`,
   `insert_history.rs:87-249`, `InsertHistoryMode::Standard` path
   `:193-245`): it sets a **terminal scroll region** confined to the rows above
   the live viewport (`SetScrollRegion(1..area.top())`, `:231`), moves the
   cursor to the bottom of that region, and `Print`s the new lines with
   `\r\n` — the terminal's own scrolling shoves older content up and off into
   native scrollback (so the user's terminal-native "scroll up" / search /
   copy still works on old output), then the scroll region is reset and the
   cursor restored to its last known position (`:243-244`) so the operation is
   cursor-neutral from ratatui's point of view. There's a second path,
   `InsertHistoryMode::ZellijRaw` (`:163-192`), worked around because Zellij
   doesn't respect scroll-region-constrained soft-wrap the same way — a nice
   example of "one clean abstraction, one ugly multiplexer-specific escape
   hatch behind a flag."
2. **The live viewport** (composer + status/footer + the *in-flight* streaming
   cell) is the only thing ratatui actually diffs and repaints each frame.
   `custom_terminal.rs` is a **fork of `ratatui::Terminal`** (license header,
   `custom_terminal.rs:1-23`) modified for this inline-viewport model:
   `viewport_area: Rect` tracks just that bottom region
   (`custom_terminal.rs:159-168`), and `diff_buffers` (`:585-648`) is the
   classic ratatui double-buffer diff — but with an added optimization: for
   each row it finds the **rightmost non-blank column** and, if the rest of
   the row is all-spaces/no-modifier, emits one `ClearToEnd` command instead of
   per-cell space `Put`s (`:590-619`), explicitly commented as "a perf win"
   over naive cell-by-cell diffing. It also special-cases wide (CJK)
   characters so a diff never targets the second half of a wide glyph
   (`display_width`, OSC-hyperlink-aware, `:57-80`).
3. **Draw scheduling is push-based, not a fixed tick.** `FrameRequester`
   (`tui/frame_requester.rs:31-68`) is a cloneable handle any widget/background
   task can call `schedule_frame()` / `schedule_frame_in(dur)` on. A single
   `FrameScheduler` actor (`:76-128`) coalesces every request into the
   **earliest pending deadline** and fires one broadcast `draw` notification —
   so three separate `schedule_frame()` calls in the same tick produce exactly
   one repaint, and a rate limiter clamps output to 120fps
   (`FrameRateLimiter`/`MIN_FRAME_INTERVAL`, tested at
   `tui/frame_requester.rs:234-263`). This is the actor pattern from "Actors
   with Tokio," cited directly in the module doc comment
   (`tui/frame_requester.rs:11-13`).
4. **Renderable composition** is a small custom trait system
   (`render/renderable.rs`), not ratatui `Widget` directly:
   `trait Renderable { fn render(...); fn desired_height(width) -> u16; fn cursor_pos(...); }`
   (`render/renderable.rs:14-23`). `ColumnRenderable` (`:174-225`) and
   `FlexRenderable` (`:252-377`, an explicit Flutter-`Flex`-inspired two-pass
   flex layout — non-flex children sized first, remaining space divided
   proportionally among flex children, last child absorbs rounding, comment
   cites the Flutter source line — `:272-274`) build layouts by composing
   `Box<dyn Renderable>` trees, each node reporting its own `desired_height`
   given a width before any painting happens — an intrinsic-sizing pass
   distinct from ratatui's own `Layout`/`Constraint` system, presumably
   because ratatui's constraint solver doesn't naturally support "give me
   exactly the rows this dynamic content needs."

### Streaming (the highest-value pattern)

Token-by-token model output goes through `streaming/` (`mod.rs`, `controller.rs`,
`chunking.rs`, `commit_tick.rs`, `table_holdback.rs`) — a genuinely
sophisticated pipeline, worth reading in full for a TS port:

- **Stable region vs. tail region.** `StreamCore` (`streaming/controller.rs:73-92`)
  re-renders the *entire* accumulated markdown source on every delta
  (`recompute_streaming_render`, `:289-291` — deliberately simple: no
  incremental markdown diffing) but partitions the result into a **stable
  prefix** (already committed / queued for commit to scrollback) and a
  **mutable tail** (still allowed to reshape, shown only in the live
  `active_cell`). The invariant is spelled out in the module doc comment:
  `emitted_stable_len <= enqueued_stable_len <= rendered_lines.len()`
  (`streaming/controller.rs:32`).
- **Table holdback**: markdown tables are the one case where a full-reflow
  re-render is *visually* unsafe mid-stream (a new row can reshape every
  column's width, so any row committed to the stable/scrollback region before
  the table is known to be finished would visibly “jump”). `TableHoldbackScanner`
  detects header+delimiter patterns and the whole table is kept in the mutable
  tail until it's structurally confirmed complete
  (`active_tail_budget_lines`, `streaming/controller.rs:373-401`); everything
  before the table can still stream to stable independently
  (`streaming/controller.rs:doc comment 1-36`). This is a targeted exception to
  an otherwise simple rule, not a general incremental-diff system.
- **Adaptive two-gear pacing** (`streaming/chunking.rs`) is the actual "typing
  speed" controller and is delightfully explicit about *why*: `Smooth` mode
  drains exactly one queued line per baseline commit tick (steady, readable
  typing effect); `CatchUp` mode drains the *entire* backlog in one tick when
  queue depth ≥ 8 lines or the oldest queued line's age ≥ 120ms
  (`ENTER_QUEUE_DEPTH_LINES`/`ENTER_OLDEST_AGE`, `chunking.rs:82-90`) — so a
  burst of buffered model output doesn't visibly lag behind real time. Exit
  from CatchUp requires **hysteresis** (pressure must stay low for a full
  250ms hold, `EXIT_HOLD`, `:103`) and even after exiting there's a 250ms
  re-entry cooldown (`REENTER_CATCH_UP_HOLD`) unless the new backlog is
  "severe" (≥64 lines or ≥300ms old, bypasses the cooldown,
  `chunking.rs:105-116`) — this is a two-threshold-plus-cooldown state machine
  specifically to prevent visible "gear flapping" at the boundary. Baseline
  tick interval is one ratatui frame (`COMMIT_ANIMATION_TICK = tui::TARGET_FRAME_INTERVAL`,
  `app.rs:396`).
- **Resize handling mid-stream** (`StreamCore::set_width`, `controller.rs:224-265`):
  re-renders once at the new width, then re-derives which lines are still
  "stable" vs. "tail" from scratch, with an explicit off-by-one guard so a
  wrapped remainder that happens to compress into fewer lines at the new width
  never silently drops pending content (`controller.rs:246-255`).
- **Two thin wrappers, one shared core**: `StreamController` (chat prose) and
  `PlanStreamController` (the "Proposed Plan" block) both delegate all
  bookkeeping to `StreamCore` and differ only in their `emit()` styling — a
  bullet-point header for the first stream chunk, extra indentation/background
  tint for plans (`controller.rs:459-728`). Good evidence that the
  hard part (stable/tail partitioning, pacing, resize, table holdback) is
  content-agnostic and worth extracting as its own reusable primitive.

### Diff rendering — how a code diff becomes a character grid

`diff_render.rs` (2551 lines) turns a `FileChange` (`diff_model.rs:10-21`:
`Add{content}` / `Delete{content}` / `Update{unified_diff, move_path}`, parsed
with the `diffy` crate) into `Vec<ratatui::text::Line>`:

- **Per-line structure**: every diff row is `[right-aligned line number][single-space][gutter sign +/-/space][content]`,
  with a **fixed-width gutter** computed once from the diff's max line number
  (`line_number_width`, `diff_render.rs:1028-1036`) so numbers stay
  column-aligned across the whole block regardless of digit count.
  `push_wrapped_diff_line_inner_with_theme_and_color_level`
  (`diff_render.rs:841-941`) builds each row: first physical line gets
  `gutter + sign + content`; wrapped continuation lines get blank gutter +
  2-space indent instead (`:904-913`) — visually distinguishing "this is still
  the same logical diff line, just wrapped" from a new line.
- **Hunk-level syntax highlighting, not line-level**: for `Update` diffs, each
  hunk's lines are concatenated into one block and highlighted as a unit
  (`highlight_code_to_styled_spans(&hunk_text, language)`,
  `diff_render.rs:610-624`) specifically so the `syntect` highlighter's parser
  state (open block comments, multi-line strings) carries across consecutive
  lines within a hunk — doc comment explicitly says cross-*hunk* state is
  intentionally *not* preserved because hunks are visually separated anyway
  (`diff_render.rs:23-28`). Large diffs skip highlighting entirely
  (`exceeds_highlight_limits`, `:587-591`) to avoid thousands of parser
  initializations stalling the render.
- **Style-preserving wrap**: `wrap_styled_spans` (`diff_render.rs:954+`) walks
  styled spans character-by-character using true Unicode display width (tabs
  expanded, CJK counted as 2), flushing to a new physical line when a
  character would overflow — critically, span *styles* survive the split so
  wrapped syntax-highlighted text never loses color mid-token.
  Single-character-wider-than-remaining-space is force-broken *before* the
  character so wrapping always makes progress (never infinite-loops on a wide
  glyph at end of line) — doc comment `diff_render.rs:948-953`.
- **Theme resolution happens once per render pass, not per line**:
  `current_diff_render_style_context()` (`diff_render.rs:217-226`) snapshots
  theme + color depth + resolved add/del background colors into a
  `DiffRenderStyleContext` struct threaded through every line call in that
  frame — explicitly to keep the diff palette internally consistent even if
  the user is live-previewing a theme swap mid-render (`:208-216`).
- **Multi-hunk files** get a `⋮` (vertical ellipsis) separator line between
  hunks, right-padded to the gutter width, styled with the context gutter
  color — a small but real signal that hunks in the same file are
  non-contiguous (`diff_render.rs:596-607`).

## (g) Qué robar / qué evitar

**Steal (patterns, since the Rust code itself can't port to TypeScript):**

1. **Stable/tail split for streaming** (`streaming/controller.rs`). This is the
   single best idea in the whole crate for ebrain's TUI: don't try to
   incrementally diff a growing markdown/text stream token-by-token. Instead,
   *always* re-render the full accumulated source on each delta (cheap enough
   at ebrain's scale), then decide how many of the resulting lines are "safe to
   commit" (append to a scrollback/output log) vs. "must stay mutable" (still
   in the live pane) using one clear rule: hold back anything after the start
   of an unresolved multi-line structure (a table). Port the *invariant*
   (`emitted <= enqueued <= rendered.len()`), not the byte-offset bookkeeping.
2. **Two-gear adaptive pacing with hysteresis** (`streaming/chunking.rs`). A
   plain "type one line per tick" streaming renderer looks choppy/laggy the
   moment the upstream agent bursts output (tool calls returning large JSON,
   etc). The enter/exit-threshold-plus-cooldown state machine is small (~150
   LOC), fully unit-testable in isolation (pure function of queue depth +
   oldest-age), and directly portable to TS as-is — this is worth lifting
   almost verbatim into `tui-kit`.
3. **Terminal-native scrollback for history, ratatui-diffed buffer only for the
   live pane** (`insert_history.rs`). This is the architecture decision that
   makes a chat-style TUI feel "native" — the user's terminal's own scrollback,
   search, and copy/paste continue to work on old turns, and there's no need to
   re-render potentially thousands of historical lines every frame. For a bun
   + tui-kit stack: the ANSI scroll-region trick
   (`\x1b[<top>;<bottom>r` + reverse-index `\x1bM`) is portable to any raw
   terminal writer; ratatui isn't required for it. This is probably the
   highest-leverage single thing to emulate for ebrain's TUI given it's meant
   to show long agent transcripts.
4. **Frame-request coalescing actor** (`tui/frame_requester.rs`). Push-based
   "something changed, please redraw eventually" instead of a fixed render
   tick, with automatic coalescing of N requests into 1 draw and a hard FPS
   ceiling. Directly applicable in Node/Bun with a timer + a single pending
   deadline variable — no need for the actor/channel machinery, a simple
   class with `scheduleFrame()`/`scheduleFrameIn(ms)` reproduces the same
   contract.
5. **Declarative, order-matters command registry** (`slash_command.rs`). One
   enum (in TS: one array of command objects) is simultaneously the popup
   list, the parser, and the capability matrix (visible? available mid-task?
   supports inline args? available in a sub-context?) via small pure
   predicate functions. Exact-match-then-prefix-match fuzzy filter is enough;
   don't build a scoring fuzzy-matcher for a command palette this size.
6. **Terminal-capability detection with explicit lying-terminal overrides**
   (`terminal_palette.rs`). Trust the primary signal (`supports-color` /
   equivalent Node lib) but keep a small override table for terminals known to
   misreport (Windows Terminal was the concrete example here) — worth doing
   the same for whatever Node color-detection lib ebrain's `tui-kit` uses.
7. **Hunk-scoped (not file-scoped, not line-scoped) syntax highlighting for
   diffs** — the right granularity for preserving highlighter parser state
   without paying for cross-hunk re-parsing, and with an explicit byte/line
   size cutoff that disables highlighting for huge diffs rather than hanging.
8. **Intrinsic-height layout composition** (`render/renderable.rs`'s
   `Renderable`/`ColumnRenderable`/`FlexRenderable`). If `tui-kit`'s own layout
   primitives don't already support "ask each child its desired height at a
   given width, then flex-allocate remaining space," this Flutter-`Flex`-style
   two-pass algorithm (non-flex sized first, flex children get proportional
   share of what's left, last flex child absorbs rounding) is a clean, tested
   reference to copy the *algorithm* from.

**Avoid / don't bother emulating:**

1. **The sheer module count and cross-cutting state** (`App` struct alone has
   ~40 fields; `chatwidget/` has 55 files). This is the accumulated surface
   area of a shipped, multi-year commercial product (plugins, MCP, hooks,
   multi-agent collab, Windows sandbox nuances, IDE integration, feedback
   upload, etc.) — none of that complexity is inherent to "render an agentic
   terminal cockpit." Don't use file/module count as a target; use the handful
   of algorithms above.
2. **The custom-`Terminal`-fork-of-ratatui + raw-ANSI-scrollback-writer combo
   is a Rust/crossterm-specific hack** around a mismatch between ratatui's
   full-buffer-diff model and "I want native terminal scrollback." If
   ebrain's `tui-kit` is built for a different terminal-diffing library in
   Node (e.g. something with its own scrollback-aware primitives), don't
   blindly reimplement the scroll-region trick — check whether the chosen TS
   library already has an equivalent "append above viewport" primitive first.
3. **`diffy`-based unified-diff parsing + hand-rolled hunk model.** Any decent
   TS diff library (or calling out to `git diff`) gets you the same hunks;
   don't hand-port `diffy`'s patch parser. Port the *rendering* decisions
   (gutter width, hunk-scoped highlight, style-preserving wrap), not the
   parsing.
4. **ANSI-16 color-only fallback path complexity** in `diff_render.rs`
   (`RichDiffColorLevel`, `ResolvedDiffBackgrounds` all-`None` branches). Given
   ebrain's TUI targets a curated set of modern terminals (not legacy
   ANSI-16-only), it's reasonable to just require 256-color minimum and skip
   this entire code path's complexity.
5. **The full slash-command capability matrix granularity** (per-command
   `available_during_task` / `available_in_side_conversation` / inline-args
   flags) is only worth it once ebrain's TUI has >~15 commands and multiple
   concurrent modes (task-running, side-conversation, etc.). For an initial
   cut, a flat command list with a single `enabled: boolean` is enough; don't
   pre-build the full matrix before there's a second mode that needs it.

---

## Top takeaways for ebrain (patterns to port to TS)

1. **Stream via full-source re-render + stable/tail split**, not incremental
   token diffing — re-render everything on each delta, then decide how many of
   the resulting lines are safe to freeze vs. must stay mutable (hold back only
   around genuinely reflow-unsafe structures like tables).
2. **Two-gear adaptive pacing with hysteresis** (`Smooth` 1-line/tick,
   `CatchUp` full-drain above a depth/age threshold, with an exit-hold and a
   re-entry cooldown) is a ~150-line, fully unit-testable state machine worth
   copying near-verbatim for typing-speed feel.
3. **Write finalized history straight into the terminal's native scrollback**
   (scroll-region + reverse-index escapes) and reserve the diffed/redrawn
   render surface for just the live composer/status/streaming-tail region —
   this is the single biggest lever for both performance and "feels native"
   on long agent transcripts.
4. **Push-based, coalesced frame scheduling** (`scheduleFrame()` /
   `scheduleFrameIn(ms)` collapsing to one redraw at the earliest deadline,
   capped to a max FPS) beats a fixed render tick for both battery/CPU and
   correctness of time-based animations (the ASCII banner computes its frame
   index from elapsed time, not a counter, so it's always correct regardless
   of when a redraw happens).
5. **Diff rendering**: fixed-width right-aligned gutter, hunk-scoped (not
   line- or file-scoped) syntax highlighting so highlighter state survives
   within a hunk, and character-width-aware wrapping that preserves span
   styles across the wrap boundary — copy this algorithm, not the `diffy`
   parsing layer underneath it.
