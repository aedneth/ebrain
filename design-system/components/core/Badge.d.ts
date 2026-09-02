export interface BadgeProps {
  /** Color categorico de agente */
  agent?: 'claude' | 'codex' | 'gemini' | 'opencode' | 'cursor' | 'route' | 'generic' | 'free';
  /** Tono semantico (si no hay agent) */
  tone?: 'ok' | 'warn' | 'error' | 'info' | 'memory' | 'accent';
  /** Texto; por defecto el nombre del agente/tono */
  label?: string;
  /** Bloque invertido (fondo de color, texto void) para enfasis maximo */
  solid?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}
export declare function Badge(props: BadgeProps): JSX.Element;
export declare const AGENT_COLORS: Record<string, string>;
