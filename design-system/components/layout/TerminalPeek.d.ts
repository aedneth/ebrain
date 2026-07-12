export interface TerminalPeekProps {
  /** ej. "peek \u00B7 ebr-claude-korvex" */
  title: string;
  /** Anexa "\u00B7 live" al titulo */
  live?: boolean;
  height?: string | number;
  width?: string | number;
  style?: React.CSSProperties;
  /** Lineas de output (texto pre) */
  children?: React.ReactNode;
}
export declare function TerminalPeek(props: TerminalPeekProps): JSX.Element;
