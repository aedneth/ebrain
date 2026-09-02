export interface PromptBoxProps {
  value?: string;
  placeholder?: string;
  /** true: barra teal + caret \u258C; false: barra dim, sin caret */
  focus?: boolean;
  /** Altura en filas (multiline) */
  rows?: number;
  /** Hint dim alineado a la derecha, ej. "enter lanzar" */
  hint?: string;
  style?: React.CSSProperties;
}
export declare function PromptBox(props: PromptBoxProps): JSX.Element;
