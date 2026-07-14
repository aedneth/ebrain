/**
 * tui/src/sessions/peek.ts — pure helpers for the Sessions panel (SPRINT-TUI 6.4.3).
 *
 * These exist so the impure loop stays thin and the two load-bearing behaviours are
 * DETERMINISTICALLY testable without a TTY or a real clock:
 *   - shouldCapture(): the ≤1 Hz peek throttle (spec 6.4.3 "no más de 1 capture/s").
 *   - uptimeFromIso(): uptime string computed OUTSIDE buildFrame (which must stay pure —
 *     no Date.now()), so the loop stamps it onto each row at refresh time.
 *   - tailLines(): show the most-recent N lines of a (already-scrubbed) pane capture.
 */

/**
 * Peek throttle: true only if at least `minIntervalMs` has elapsed since the last
 * capture (or there was none). The Sessions loop gates every capture-pane through
 * this so a real tmux session is polled at most once per second. Pure — the caller
 * supplies `nowMs`, so a test can prove two calls 500ms apart yield true then false.
 */
export function shouldCapture(nowMs: number, lastMs: number | null, minIntervalMs = 1000): boolean {
  if (lastMs == null) return true;
  return nowMs - lastMs >= minIntervalMs;
}

/** The last `n` lines of `text` (trailing newline ignored) — the freshest output. */
export function tailLines(text: string, n: number): string[] {
  if (n <= 0) return [];
  const lines = text.replace(/\n+$/, "").split("\n");
  return lines.length <= n ? lines : lines.slice(lines.length - n);
}

/** HH:MM:SS (or MM:SS under an hour) for a non-negative millisecond duration. */
export function fmtUptime(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return hh > 0 ? `${p(hh)}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}

/** Uptime string for a session created at ISO `iso`, as of `nowMs`. "--:--" if unparseable. */
export function uptimeFromIso(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "--:--";
  return fmtUptime(nowMs - t);
}
