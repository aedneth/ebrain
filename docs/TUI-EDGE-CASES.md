# TUI Edge Cases

F6.7.1 defines the degraded behavior expected from `ebrain ui`. A failure must remain
visible, bounded, and recoverable; it must never present stale data as live or leave the
terminal in an alternate-screen state.

| Condition | Guard / behavior | Evidence |
|---|---|---|
| tmux absent | Sessions renders an explicit environment message | `tui/test/sessions/panel.test.ts` |
| tmux server absent | Sessions offers launch guidance, not an error spinner | `tui/test/sessions/panel.test.ts` |
| tmux dies after list, before peek | stale pane is cleared and a visible error replaces it | `failSessionPeek` regression in `tui/test/sessions/panel.test.ts` |
| PGLite lock / daemon-owned brain | CLI contracts return cached data or a typed error; panels render cache/error state | `tui/test/knowledge/{contracts,panels}.test.ts` |
| network or CLI timeout | `knowledge/run.ts` kills the subprocess at a bounded timeout and returns a typed error | `tui/src/knowledge/run.ts` + panel error states |
| terminal below 80x24 | a fixed-size guidance frame replaces the shell | `tui/test/app.test.ts` |
| no truecolor / non-UTF-8 terminal | xterm-256 and ASCII fallbacks are selected by `theme.ts` | `tui/test/theme.test.ts` |
| quit, signal, uncaught exception | reader/timers/listeners are cleaned and `Screen.exit()` restores cursor + main screen | `runUi` lifecycle in `tui/src/app.ts`; manual checklist remains required |

Residual privacy tradeoff, stated precisely. `peekSession` captures a bounded window
(`capture-pane -S -200`, anchored at the live bottom), so a private key can straddle either edge.
Three of the four possible positions carry a PEM marker and are redacted: the complete block, a
base64 run terminating at an `END` footer (the window cut above the header), and a `BEGIN` header
plus the run following it (the window cut below the footer). Each rule requires physical adjacency
to a literal marker, so a JWT, a hash, a base64 diff hunk and a public `CERTIFICATE` block all pass
through untouched — which matters beyond `peek`, because `scrubSecrets(text) !== text` is also used
as an input validator in `cli/episodes.ts` and `cli/context.ts`.

The one position that remains undecidable is a window containing **only** body lines, with both
markers scrolled out. That needs a key body longer than the whole 200-line window (roughly 12 KB),
and closing it would require redacting arbitrary base64 — which would both gut `peek` and start
rejecting legitimate episode text. It is left open deliberately, behind `guard-secrets.sh`.
