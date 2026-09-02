export interface HintBarProps {
  hints?: Array<{ k: string; label: string; disabled?: boolean }>;
  /** Texto dim alineado a la derecha */
  right?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function HintBar(props: HintBarProps): JSX.Element;
