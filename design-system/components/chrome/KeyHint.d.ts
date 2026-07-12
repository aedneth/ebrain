export interface KeyHintProps {
  /** La tecla, ej. "tab", "/", "?", "ctrl+k" */
  k: string;
  /** La accion, ej. "paneles" */
  label: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}
export declare function KeyHint(props: KeyHintProps): JSX.Element;
