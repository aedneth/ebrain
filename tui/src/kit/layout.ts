/**
 * Vendored from FlowClock (~/flowclock-cli/src/lib/tui/layout.ts), FlowClock v3.9.0.
 * Vendored into ebrain; diverges as ebrain's own kit — do not edit upstream, do not re-sync automatically.
 */

/**
 * Pure rect-splitting utilities for layout.
 *
 * `splitV` / `splitH` divide a parent Rect into child Rects using a mix of
 * fixed sizes and flex (proportional) sizes. Children exactly tile the
 * parent (accounting for optional gaps).
 */

// ---------------------------------------------------------------------------
// Rect
// ---------------------------------------------------------------------------

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Spec types
// ---------------------------------------------------------------------------

/** A fixed size in cells, or a flex weight for proportional sharing. */
export type SizeSpec = number | { flex: number };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a list of SizeSpecs against `totalAvailable` cells (after fixed
 * sizes and gaps are subtracted).
 *
 * Returns an array of integer sizes. Flex sizes share the remaining space
 * proportionally, with any remainder distributed to the first flex panes
 * (to ensure the total exactly matches `totalAvailable`).
 */
function resolveSizes(specs: SizeSpec[], totalAvailable: number, gap: number): number[] {
  const count = specs.length;
  if (count === 0) return [];

  const totalGap = gap * Math.max(0, count - 1);
  const spaceForContent = Math.max(0, totalAvailable - totalGap);

  // Sum fixed sizes
  let fixedTotal = 0;
  let flexWeightTotal = 0;
  for (const s of specs) {
    if (typeof s === "number") {
      fixedTotal += s;
    } else {
      flexWeightTotal += s.flex;
    }
  }

  const flexSpace = Math.max(0, spaceForContent - fixedTotal);

  // Compute raw flex sizes (floating point first, then distribute remainder)
  const rawFlex: number[] = specs.map((s) =>
    typeof s === "number" ? s : (s.flex / Math.max(flexWeightTotal, 1)) * flexSpace,
  );

  // Floor all values
  const floored: number[] = rawFlex.map(Math.floor);

  // Distribute remainder (integer pixels) to flex panes, in order
  let allocated = floored.reduce((a, b) => a + b, 0);
  const target = spaceForContent;
  let remainder = target - allocated;

  const result: number[] = floored.slice();
  for (let i = 0; i < specs.length && remainder > 0; i++) {
    if (typeof specs[i] !== "number") {
      const cur = result[i] ?? 0;
      result[i] = cur + 1;
      remainder--;
      allocated++;
    }
  }

  // Clamp negatives (can't have negative-sized pane)
  return result.map((s) => Math.max(0, s));
}

// ---------------------------------------------------------------------------
// splitV — split vertically (stacked rows)
// ---------------------------------------------------------------------------

/**
 * Split `rect` into stacked row Rects. Fixed heights are numbers; flex
 * weights share the remaining height. `gap` rows of space are inserted
 * between children (defaults to 0).
 *
 * The children exactly tile the parent (no overlap, no overflow).
 */
export function splitV(rect: Rect, specs: SizeSpec[], gap = 0): Rect[] {
  const sizes = resolveSizes(specs, rect.height, gap);
  const rects: Rect[] = [];
  let currentTop = rect.top;

  for (let i = 0; i < sizes.length; i++) {
    const h = sizes[i] ?? 0;
    rects.push({
      top: currentTop,
      left: rect.left,
      width: rect.width,
      height: h,
    });
    currentTop += h;
    if (i < sizes.length - 1) {
      currentTop += gap;
    }
  }

  return rects;
}

// ---------------------------------------------------------------------------
// splitH — split horizontally (side-by-side columns)
// ---------------------------------------------------------------------------

/**
 * Split `rect` into side-by-side column Rects. Fixed widths are numbers;
 * flex weights share the remaining width. `gap` columns of space are
 * inserted between children (defaults to 0).
 *
 * The children exactly tile the parent (no overlap, no overflow).
 */
export function splitH(rect: Rect, specs: SizeSpec[], gap = 0): Rect[] {
  const sizes = resolveSizes(specs, rect.width, gap);
  const rects: Rect[] = [];
  let currentLeft = rect.left;

  for (let i = 0; i < sizes.length; i++) {
    const w = sizes[i] ?? 0;
    rects.push({
      top: rect.top,
      left: currentLeft,
      width: w,
      height: rect.height,
    });
    currentLeft += w;
    if (i < sizes.length - 1) {
      currentLeft += gap;
    }
  }

  return rects;
}
