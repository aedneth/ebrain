/**
 * tui/test/sessions/peek.test.ts — pure Sessions helpers (SPRINT-TUI 6.4.3).
 * The load-bearing one is shouldCapture: the ≤1Hz peek throttle ("no más de 1
 * capture/s"), proven deterministically without a TTY or a real tmux.
 *
 *   bun test ./tui/test/sessions/peek.test.ts
 */
import { test, expect, describe } from "bun:test";
import { shouldCapture, tailLines, fmtUptime, uptimeFromIso } from "../../src/sessions/peek.ts";

describe("shouldCapture — ≤1Hz peek throttle (spec 6.4.3)", () => {
  test("the first capture (no prior) is always allowed", () => {
    expect(shouldCapture(1000, null)).toBe(true);
  });

  test("a second capture <1s after the first is REFUSED", () => {
    expect(shouldCapture(1500, 1000)).toBe(false); // +500ms
    expect(shouldCapture(1999, 1000)).toBe(false); // +999ms
  });

  test("a capture ≥1s later is allowed", () => {
    expect(shouldCapture(2000, 1000)).toBe(true);
    expect(shouldCapture(2001, 1000)).toBe(true);
  });

  test("rapid-fire calls through one gate never exceed 1/s", () => {
    // 10 "arrow presses" in 300ms, all sharing a single lastAt gate.
    let last: number | null = null;
    let captures = 0;
    for (let t = 0; t < 300; t += 30) {
      if (shouldCapture(t, last)) {
        captures++;
        last = t;
      }
    }
    expect(captures).toBe(1); // only the very first fires
  });
});

describe("tailLines — freshest N lines", () => {
  test("last n lines, trailing newline ignored", () => {
    expect(tailLines("a\nb\nc\nd\n", 2)).toEqual(["c", "d"]);
  });
  test("fewer than n → all of them", () => {
    expect(tailLines("only", 5)).toEqual(["only"]);
  });
  test("n<=0 → empty", () => {
    expect(tailLines("a\nb", 0)).toEqual([]);
  });
});

describe("uptime formatting (computed OUTSIDE buildFrame — keeps it pure)", () => {
  test("fmtUptime: MM:SS under an hour, HH:MM:SS over, clamps negatives", () => {
    expect(fmtUptime(0)).toBe("00:00");
    expect(fmtUptime(61_000)).toBe("01:01");
    expect(fmtUptime(3_661_000)).toBe("01:01:01");
    expect(fmtUptime(-5)).toBe("00:00");
  });
  test("uptimeFromIso computes against `now`; unparseable → --:--", () => {
    const now = Date.parse("2026-07-13T00:02:00Z");
    expect(uptimeFromIso("2026-07-13T00:00:00Z", now)).toBe("02:00");
    expect(uptimeFromIso("not-a-date", now)).toBe("--:--");
  });
});
