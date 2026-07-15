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

Residual privacy tradeoff: a PEM block split outside the bounded tmux capture window can leave
base64 body lines without a visible header/footer to classify. `peekSession` still scrubs known
secrets and complete PEM blocks; broad redaction of arbitrary base64 would hide legitimate agent
output. The final audit must assess this low-severity tradeoff against the existing secret guard.
