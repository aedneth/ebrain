/**
 * Ported from FlowClock (~/flowclock-cli/test/tui.test.ts) — layout.ts
 * coverage only (splitV/splitH). Adapted from vitest to bun:test and
 * repointed to ebrain's vendored kit at ../../src/kit/layout.js.
 */
import { describe, it, expect } from "bun:test";

import { splitV, splitH } from "../../src/kit/layout.js";
import type { Rect } from "../../src/kit/layout.js";

// ---------------------------------------------------------------------------
// layout.ts — splitV
// ---------------------------------------------------------------------------

describe("splitV", () => {
  const root: Rect = { top: 0, left: 0, width: 80, height: 24 };

  it("returns empty array for empty specs", () => {
    expect(splitV(root, [])).toEqual([]);
  });

  it("single fixed child fills the rect height", () => {
    const [child] = splitV(root, [24]);
    expect(child?.height).toBe(24);
    expect(child?.top).toBe(0);
    expect(child?.left).toBe(0);
    expect(child?.width).toBe(80);
  });

  it("two fixed children stack vertically", () => {
    const [top, bottom] = splitV(root, [10, 14]);
    expect(top?.top).toBe(0);
    expect(top?.height).toBe(10);
    expect(bottom?.top).toBe(10);
    expect(bottom?.height).toBe(14);
  });

  it("flex children share remaining space proportionally", () => {
    const [a, b] = splitV(root, [{ flex: 1 }, { flex: 1 }]);
    expect(a?.height).toBe(12);
    expect(b?.height).toBe(12);
  });

  it("flex children with 2:1 ratio", () => {
    const [a, b] = splitV(root, [{ flex: 2 }, { flex: 1 }]);
    expect((a?.height ?? 0) + (b?.height ?? 0)).toBe(24);
    expect(a?.height).toBe(16);
    expect(b?.height).toBe(8);
  });

  it("mixed fixed + flex: fixed reserves space, flex gets rest", () => {
    const [fixed, flex] = splitV(root, [4, { flex: 1 }]);
    expect(fixed?.height).toBe(4);
    expect(flex?.height).toBe(20);
  });

  it("children tile exactly (sum of heights = parent height, no gap)", () => {
    const rects = splitV(root, [{ flex: 1 }, { flex: 2 }, { flex: 1 }]);
    const total = rects.reduce((s, r) => s + r.height, 0);
    expect(total).toBe(root.height);
  });

  it("children tile exactly with gap (sum + gaps = parent height)", () => {
    const rects = splitV(root, [{ flex: 1 }, { flex: 1 }], 2);
    const total = rects.reduce((s, r) => s + r.height, 0);
    expect(total).toBe(root.height - 2); // 2 = 1 gap of 2 rows
  });

  it("preserves parent left and width", () => {
    const rects = splitV(root, [10, { flex: 1 }]);
    for (const r of rects) {
      expect(r.left).toBe(root.left);
      expect(r.width).toBe(root.width);
    }
  });

  it("top positions are contiguous", () => {
    const rects = splitV(root, [5, 10, 9]);
    expect(rects[0]?.top).toBe(0);
    expect(rects[1]?.top).toBe(5);
    expect(rects[2]?.top).toBe(15);
  });

  it("top positions include gap", () => {
    const rects = splitV(root, [5, 5], 4);
    expect(rects[0]?.top).toBe(0);
    expect(rects[1]?.top).toBe(9); // 5 + 4
  });

  it("no overlap between consecutive children (bottom edge <= next top)", () => {
    const rects = splitV(root, [5, { flex: 1 }, 3], 1);
    for (let i = 0; i < rects.length - 1; i++) {
      const cur = rects[i]!;
      const next = rects[i + 1]!;
      expect(cur.top + cur.height).toBeLessThanOrEqual(next.top);
    }
  });
});

// ---------------------------------------------------------------------------
// layout.ts — splitH
// ---------------------------------------------------------------------------

describe("splitH", () => {
  const root: Rect = { top: 0, left: 0, width: 80, height: 24 };

  it("returns empty array for empty specs", () => {
    expect(splitH(root, [])).toEqual([]);
  });

  it("single fixed child fills the rect width", () => {
    const [child] = splitH(root, [80]);
    expect(child?.width).toBe(80);
    expect(child?.left).toBe(0);
    expect(child?.top).toBe(0);
    expect(child?.height).toBe(24);
  });

  it("two fixed children sit side by side", () => {
    const [left, right] = splitH(root, [30, 50]);
    expect(left?.left).toBe(0);
    expect(left?.width).toBe(30);
    expect(right?.left).toBe(30);
    expect(right?.width).toBe(50);
  });

  it("flex children share remaining width proportionally", () => {
    const [a, b] = splitH(root, [{ flex: 1 }, { flex: 1 }]);
    expect(a?.width).toBe(40);
    expect(b?.width).toBe(40);
  });

  it("flex with 3:1 ratio", () => {
    const [a, b] = splitH(root, [{ flex: 3 }, { flex: 1 }]);
    expect((a?.width ?? 0) + (b?.width ?? 0)).toBe(80);
    expect(a?.width).toBe(60);
    expect(b?.width).toBe(20);
  });

  it("mixed fixed + flex", () => {
    const [fixed, flex] = splitH(root, [20, { flex: 1 }]);
    expect(fixed?.width).toBe(20);
    expect(flex?.width).toBe(60);
  });

  it("children tile exactly (sum of widths = parent width)", () => {
    const rects = splitH(root, [{ flex: 1 }, { flex: 2 }, { flex: 1 }]);
    const total = rects.reduce((s, r) => s + r.width, 0);
    expect(total).toBe(root.width);
  });

  it("children tile exactly with gap", () => {
    const rects = splitH(root, [{ flex: 1 }, { flex: 1 }], 2);
    const total = rects.reduce((s, r) => s + r.width, 0);
    expect(total).toBe(root.width - 2);
  });

  it("preserves parent top and height", () => {
    const rects = splitH(root, [20, { flex: 1 }]);
    for (const r of rects) {
      expect(r.top).toBe(root.top);
      expect(r.height).toBe(root.height);
    }
  });

  it("left positions are contiguous", () => {
    const rects = splitH(root, [10, 20, 50]);
    expect(rects[0]?.left).toBe(0);
    expect(rects[1]?.left).toBe(10);
    expect(rects[2]?.left).toBe(30);
  });

  it("left positions include gap", () => {
    const rects = splitH(root, [10, 10], 5);
    expect(rects[0]?.left).toBe(0);
    expect(rects[1]?.left).toBe(15); // 10 + 5
  });

  it("no overlap between consecutive children (right edge <= next left)", () => {
    const rects = splitH(root, [5, { flex: 1 }, 3], 1);
    for (let i = 0; i < rects.length - 1; i++) {
      const cur = rects[i]!;
      const next = rects[i + 1]!;
      expect(cur.left + cur.width).toBeLessThanOrEqual(next.left);
    }
  });
});
