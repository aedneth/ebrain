/**
 * ResponsiveDialog -- semantic, word-wrapped modal layout.
 *
 * Dashboard panels intentionally truncate dense rows. Dialog copy is different: it must remain
 * readable at the supported 80x24 terminal size. This primitive receives plain semantic blocks,
 * wraps them before ANSI styling, and exposes a viewport/scroll contract for callers that need to
 * keep a dialog within the terminal frame.
 */
import type { ColorRole, Theme } from "../../theme.js";
import { displayWidth, padTo } from "../../kit/draw.js";
import { panel } from "../layout/panel.js";

const BOLD = "\x1b[1m";
const NOBOLD = "\x1b[22m";

export interface DialogText {
  text: string;
  tone?: ColorRole;
  bold?: boolean;
}

interface DialogAction {
  key: string;
  label: string;
  /** Color of the keyboard token, such as the destructive `y` in a kill dialog. */
  tone?: ColorRole;
  /** Keep secondary actions visually quieter without changing their key affordance. */
  labelTone?: ColorRole;
}

export type DialogBlock =
  | { kind: "paragraph"; text: string; tone?: ColorRole; bold?: boolean }
  | { kind: "line"; text: string; tone?: ColorRole; bold?: boolean }
  /** Preserve user-entered line breaks and spacing while wrapping at cell boundaries. */
  | { kind: "pre"; text: string; tone?: ColorRole; bold?: boolean }
  | { kind: "keyValue"; key: string; value: string; keyTone?: ColorRole; valueTone?: ColorRole }
  | { kind: "actions"; items: DialogAction[] }
  | { kind: "spacer" };

export interface ResponsiveDialogProps {
  title: string;
  width: number;
  /** Total box-height cap, including the two border rows. */
  maxHeight?: number;
  /** Scroll offset over semantic content lines. It is clamped by the renderer. */
  scroll?: number;
  focus?: boolean;
  borderColor?: ColorRole;
  titleColor?: ColorRole;
  blocks: DialogBlock[];
}

export interface ResponsiveDialogResult {
  rows: string[];
  scroll: number;
  maxScroll: number;
  totalLines: number;
  viewportLines: number;
}

/** Break a plain string at display-cell boundaries. Long unbroken paths/identifiers are split
 * rather than passed to `panel()` for silent truncation. Explicit line breaks are preserved. */
export function wrapDialogText(text: string, width: number): string[] {
  if (width <= 0) return [""];
  const output: string[] = [];
  for (const sourceLine of text.replace(/\r/g, "").split("\n")) {
    if (sourceLine.length === 0) {
      output.push("");
      continue;
    }
    const words = sourceLine.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      output.push("");
      continue;
    }
    let line = "";
    const pushWord = (word: string): void => {
      const glyphs = [...word];
      let chunk = "";
      for (const glyph of glyphs) {
        if (displayWidth(chunk) >= width) {
          if (line) output.push(line);
          line = chunk;
          chunk = "";
        }
        chunk += glyph;
      }
      if (!line) {
        line = chunk;
      } else if (displayWidth(line) + 1 + displayWidth(chunk) <= width) {
        line += " " + chunk;
      } else {
        output.push(line);
        line = chunk;
      }
    };
    for (const word of words) {
      if (!line) {
        // Start directly so a normal first word does not gain a leading space.
        if (displayWidth(word) <= width) line = word;
        else pushWord(word);
      } else if (displayWidth(line) + 1 + displayWidth(word) <= width) {
        line += " " + word;
      } else if (displayWidth(word) <= width) {
        output.push(line);
        line = word;
      } else {
        output.push(line);
        line = "";
        pushWord(word);
      }
    }
    if (line || output.length === 0) output.push(line);
  }
  return output.length > 0 ? output : [""];
}

export function wrapDialogPre(text: string, width: number): string[] {
  if (width <= 0) return [""];
  const lines: string[] = [];
  for (const sourceLine of text.replace(/\r/g, "").split("\n")) {
    if (sourceLine.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const glyph of sourceLine) {
      if (displayWidth(current) >= width) {
        lines.push(current);
        current = "";
      }
      current += glyph;
    }
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

function styled(text: string, theme: Theme, tone: ColorRole = "text.primary", bold = false): string {
  return theme.fg(tone) + (bold ? BOLD : "") + text + (bold ? NOBOLD : "") + theme.reset;
}

function textLines(text: string, width: number, theme: Theme, tone?: ColorRole, bold?: boolean): string[] {
  return wrapDialogText(text, width).map((line) => styled(line, theme, tone, bold));
}

function keyValueLines(block: Extract<DialogBlock, { kind: "keyValue" }>, width: number, theme: Theme): string[] {
  const prefix = `${block.key}  `;
  if (displayWidth(prefix) >= width) {
    return [
      ...textLines(block.key, width, theme, block.keyTone ?? "text.secondary"),
      ...textLines(block.value, width, theme, block.valueTone ?? "text.primary"),
    ];
  }
  const prefixWidth = displayWidth(prefix);
  const valueWidth = Math.max(1, width - prefixWidth);
  const values = wrapDialogText(block.value, valueWidth);
  return values.map((value, index) => {
    const key = index === 0 ? prefix : " ".repeat(prefixWidth);
    const keyPart = styled(key, theme, block.keyTone ?? "text.secondary");
    return keyPart + styled(value, theme, block.valueTone ?? "text.primary");
  });
}

function actionLines(items: DialogAction[], width: number, theme: Theme): string[] {
  if (items.length === 0) return [];
  const lines: string[] = [];
  let row: DialogAction[] = [];
  let used = 0;
  const renderItem = (item: DialogAction): string => {
    const key = theme.fg(item.tone ?? "accent.teal") + BOLD + `[${item.key}]` + NOBOLD + theme.reset;
    return key + " " + styled(item.label, theme, item.labelTone ?? "text.primary");
  };
  const flush = (): void => {
    if (row.length === 0) return;
    lines.push(row.map(renderItem).join("   "));
    row = [];
    used = 0;
  };
  for (const item of items) {
    const itemWidth = displayWidth(`[${item.key}] ${item.label}`);
    if (itemWidth > width) {
      flush();
      const prefix = `[${item.key}] `;
      const prefixWidth = displayWidth(prefix);
      const labelLines = wrapDialogText(item.label, Math.max(1, width - prefixWidth));
      const key = theme.fg(item.tone ?? "accent.teal") + BOLD + `[${item.key}]` + NOBOLD + theme.reset;
      lines.push(key + " " + styled(labelLines[0] ?? "", theme, item.labelTone ?? "text.primary"));
      for (const labelLine of labelLines.slice(1)) {
        lines.push(" ".repeat(prefixWidth) + styled(labelLine, theme, item.labelTone ?? "text.primary"));
      }
      continue;
    }
    const gap = used === 0 ? 0 : 3;
    if (used > 0 && used + gap + itemWidth > width) {
      flush();
      row = [item];
      used = itemWidth;
    } else {
      row.push(item);
      used += gap + itemWidth;
    }
  }
  flush();
  return lines;
}

function renderBlocks(blocks: DialogBlock[], width: number, theme: Theme): string[] {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.kind === "spacer") {
      lines.push("");
    } else if (block.kind === "paragraph" || block.kind === "line") {
      lines.push(...textLines(block.text, width, theme, block.tone, block.bold));
    } else if (block.kind === "pre") {
      lines.push(...wrapDialogPre(block.text, width).map((line) => styled(line, theme, block.tone, block.bold)));
    } else if (block.kind === "keyValue") {
      lines.push(...keyValueLines(block, width, theme));
    } else {
      lines.push(...actionLines(block.items, width, theme));
    }
  }
  return lines;
}

/** Render a square, contour-only dialog from semantic content. The returned `maxScroll` is the
 * only state a reducer needs to navigate a long read-only dialog; callers may clamp lazily. */
export function responsiveDialog(props: ResponsiveDialogProps, theme: Theme): ResponsiveDialogResult {
  const width = Math.max(4, props.width);
  const contentWidth = Math.max(1, width - 4); // panel borders + one-cell padding on both sides
  const lines = renderBlocks(props.blocks, contentWidth, theme);
  const maxHeight = Math.max(4, Math.floor(props.maxHeight ?? Number.MAX_SAFE_INTEGER));
  const bodyCapacity = Math.max(1, maxHeight - 2);
  const scrollable = lines.length > bodyCapacity;
  const viewportLines = scrollable ? Math.max(1, bodyCapacity - 1) : bodyCapacity;
  const maxScroll = Math.max(0, lines.length - viewportLines);
  const scroll = Math.min(Math.max(0, props.scroll ?? 0), maxScroll);
  const visible = lines.slice(scroll, scroll + viewportLines);
  if (scrollable) {
    const first = scroll + 1;
    const last = Math.min(lines.length, scroll + viewportLines);
    visible.push(styled(`[↑↓] scroll · ${first}-${last}/${lines.length}`, theme, "text.muted"));
  }
  const height = visible.length + 2;
  return {
    rows: panel({
      title: props.title,
      dialog: true,
      focus: props.focus,
      borderColor: props.borderColor,
      titleColor: props.titleColor,
      width,
      height,
      body: visible.map((line) => padTo(line, contentWidth)),
    }, theme),
    scroll,
    maxScroll,
    totalLines: lines.length,
    viewportLines,
  };
}
