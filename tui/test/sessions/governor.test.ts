/**
 * tui/test/sessions/governor.test.ts — RAM governor gate (SPRINT-TUI 6.4.6).
 * governLaunch() is pure, so the "2 heavy a la vez" policy is proven with fixtures,
 * no /proc and no tmux ("test con fleet fixture", 6.4.6 verify).
 *
 *   bun test ./tui/test/sessions/governor.test.ts
 */
import { test, expect, describe } from "bun:test";
import { governLaunch, parseAvailableMb, HEAVY_MIN_FREE_MB } from "../../src/sessions/governor.ts";

describe("governLaunch — the launch RAM gate (pure)", () => {
  test("light / unknown agents are never gated", () => {
    expect(governLaunch({ launchingClass: "light", liveHeavyCount: 5, availableMb: 100 }).decision).toBe("allow");
    expect(governLaunch({ launchingClass: "unknown", liveHeavyCount: 5, availableMb: 100 }).decision).toBe("allow");
  });

  test("first heavy with ample RAM → allow", () => {
    expect(governLaunch({ launchingClass: "heavy", liveHeavyCount: 0, availableMb: 2000 }).decision).toBe("allow");
  });

  test("SECOND heavy → confirm; reason names the count, free MB, and the norm", () => {
    const r = governLaunch({ launchingClass: "heavy", liveHeavyCount: 1, availableMb: 900 });
    expect(r.decision).toBe("confirm");
    expect(r.reason).toContain("900 MB");
    expect(r.reason).toContain("heavy");
  });

  test("first heavy but critically low RAM → confirm", () => {
    const r = governLaunch({ launchingClass: "heavy", liveHeavyCount: 0, availableMb: HEAVY_MIN_FREE_MB - 1 });
    expect(r.decision).toBe("confirm");
  });

  test("meminfo unknown (-1): no RAM block, but the 2nd-heavy rule still gates", () => {
    expect(governLaunch({ launchingClass: "heavy", liveHeavyCount: 0, availableMb: -1 }).decision).toBe("allow");
    expect(governLaunch({ launchingClass: "heavy", liveHeavyCount: 1, availableMb: -1 }).decision).toBe("confirm");
  });
});

describe("parseAvailableMb — /proc/meminfo", () => {
  test("extracts MemAvailable (kB) → MB", () => {
    const meminfo = "MemTotal:        4096000 kB\nMemFree:          200000 kB\nMemAvailable:    1048576 kB\n";
    expect(parseAvailableMb(meminfo)).toBe(1024);
  });
  test("missing MemAvailable → -1", () => {
    expect(parseAvailableMb("MemTotal: 4096000 kB\n")).toBe(-1);
  });
});
