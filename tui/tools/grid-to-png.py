#!/usr/bin/env python3
"""tui/tools/grid-to-png.py — rasterise a captured cell grid.

`tui/tools/capture.ts` writes an SVG, which is the right artifact for the repository and for a
documentation page. It is the wrong artifact for a reviewer who wants to look at the interface the
way a user sees it, and for a tool that reads images rather than markup.

This turns the `.grid.json` that capture.ts already produced into a PNG on an exact monospace grid,
so the parsed cells are rendered once, the same way, whichever output you asked for. It is optional
and stands apart from the Bun toolchain on purpose: it needs Pillow and a monospace TTF, and the
capture itself must not depend on either.

    python3 tui/tools/grid-to-png.py shots/home.grid.json shots/home.png

Options: --scale for a larger raster, --font to point at a specific TTF.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover - environment guidance, not logic
    sys.exit("Pillow is required: pip install --user Pillow")

# The project's own typeface first; the rest are what a Linux box is likely to already have.
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf",
]
BOLD_SUFFIXES = {"-Regular.ttf": "-Bold.ttf", "SansMono.ttf": "SansMono-Bold.ttf"}

DEFAULT_BG = "#0b0e14"
DEFAULT_FG = "#e6edf3"


def find_font(explicit: str | None) -> str:
    if explicit:
        return explicit
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return path
    sys.exit("no monospace TTF found; pass --font /path/to/Mono.ttf")


def bold_variant(regular: str) -> str:
    for suffix, bold in BOLD_SUFFIXES.items():
        if regular.endswith(suffix):
            candidate = regular[: -len(suffix)] + bold
            if Path(candidate).exists():
                return candidate
    return regular


def parse_colour(value: str | None, fallback: str) -> str:
    return value if value else fallback


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("grid", help="the .grid.json written by capture.ts")
    ap.add_argument("out", help="PNG to write")
    ap.add_argument("--scale", type=int, default=2, help="pixel scale (default 2, for legibility)")
    ap.add_argument("--font", default=None)
    ap.add_argument("--font-size", type=int, default=16)
    args = ap.parse_args()

    data = json.loads(Path(args.grid).read_text())
    grid = data["grid"]
    if not grid:
        sys.exit("grid is empty")

    regular_path = find_font(args.font)
    size = args.font_size * args.scale
    regular = ImageFont.truetype(regular_path, size)
    bold = ImageFont.truetype(bold_variant(regular_path), size)

    # Measure the cell from the font itself: a hardcoded advance drifts apart from the glyphs and
    # the render slowly skews across a 120-column row.
    cell_w = round(regular.getlength("M"))
    ascent, descent = regular.getmetrics()
    cell_h = ascent + descent

    cols = max(len(row) for row in grid)
    width, height = cols * cell_w, len(grid) * cell_h
    image = Image.new("RGB", (width, height), DEFAULT_BG)
    draw = ImageDraw.Draw(image)

    # Backgrounds as runs, then glyphs — same order as the SVG renderer, same result.
    for y, row in enumerate(grid):
        start = 0
        while start < len(row):
            colour = row[start].get("bg")
            end = start
            while end < len(row) and row[end].get("bg") == colour:
                end += 1
            if colour:
                draw.rectangle([start * cell_w, y * cell_h, end * cell_w - 1, (y + 1) * cell_h - 1], fill=colour)
            start = end

    for y, row in enumerate(grid):
        for x, cell in enumerate(row):
            ch = cell.get("ch", " ")
            if not ch.strip():
                continue
            fill = parse_colour(cell.get("fg"), DEFAULT_FG)
            if cell.get("dim"):
                # Dim is an alpha in a terminal; approximate it by blending toward the background.
                r, g, b = Image.new("RGB", (1, 1), fill).getpixel((0, 0))
                br, bg_, bb = Image.new("RGB", (1, 1), DEFAULT_BG).getpixel((0, 0))
                fill = (round(r * 0.55 + br * 0.45), round(g * 0.55 + bg_ * 0.45), round(b * 0.55 + bb * 0.45))
            draw.text((x * cell_w, y * cell_h), ch, font=bold if cell.get("bold") else regular, fill=fill)

    image.save(args.out)
    print(f"{args.out}  {width}x{height}  ({cols}x{len(grid)} cells, {cell_w}x{cell_h}px)")


if __name__ == "__main__":
    main()
