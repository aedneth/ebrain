/**
 * ConfirmDialog — TUI mirror of design-system/components/input/ConfirmDialog.{d.ts,prompt.md,jsx}.
 *
 * Confirmation modal: straight box (dialogBorder) on background.raised, bold title
 * in the top border, a message body, and an actions row of keys
 * (e.g. `[y] kill   [esc] cancel`). `danger` → border + [confirmKey] in semantic.error.
 * Returns the box rows ONLY (caller centers + draws the scrim; key handling is later).
 */
import type { Theme } from "../../theme.js";
import { responsiveDialog, type ResponsiveDialogResult } from "./responsive.js";

export interface ConfirmProps {
  title?: string;
  message?: string;
  /** true: border + confirm key in error color (destructive actions). */
  danger?: boolean;
  confirmKey?: string;
  confirmLabel?: string;
  cancelKey?: string;
  cancelLabel?: string;
  /** Total box width in cells. */
  width?: number;
  /** Total dialog height cap, including borders. Omit for the historic unbounded widget API. */
  maxHeight?: number;
  /** Current semantic-content scroll offset. */
  scroll?: number;
}

/** Responsive variant used by the app. It keeps the legacy `confirm()` wrapper below so existing
 * widget callers can retain their `string[]` contract while overlays gain wrapping and scrolling. */
export function confirmLayout(props: ConfirmProps, theme: Theme): ResponsiveDialogResult {
  const {
    title = "confirm",
    message = "",
    danger = false,
    confirmKey = "y",
    confirmLabel = "confirm",
    cancelKey = "n",
    cancelLabel = "cancel",
    width = 52,
  } = props;
  return responsiveDialog({
    title,
    width,
    maxHeight: props.maxHeight,
    scroll: props.scroll,
    borderColor: danger ? "semantic.error" : "text.muted",
    titleColor: "text.primary",
    blocks: [
      { kind: "spacer" },
      { kind: "paragraph", text: message || " ", tone: "text.primary" },
      { kind: "spacer" },
      { kind: "actions", items: [
        { key: confirmKey, label: confirmLabel, tone: danger ? "semantic.error" : "accent.teal" },
        { key: cancelKey, label: cancelLabel, tone: "text.primary", labelTone: "text.muted" },
      ] },
    ],
  }, theme);
}

export function confirm(props: ConfirmProps, theme: Theme): string[] {
  return confirmLayout(props, theme).rows;
}
