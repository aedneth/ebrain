export interface SessionCardProps {
  agent: 'claude' | 'codex' | 'gemini' | 'opencode' | 'cursor' | 'route' | 'generic' | 'free';
  /** ej. "ebr-claude-korvex" */
  name: string;
  /** ej. "02:41" */
  uptime?: string;
  state?: 'running' | 'waiting' | 'idle' | 'error' | 'done';
  /** Segunda linea dim opcional (modelo, ultima accion) */
  detail?: React.ReactNode;
  selected?: boolean;
  style?: React.CSSProperties;
}
export declare function SessionCard(props: SessionCardProps): JSX.Element;
