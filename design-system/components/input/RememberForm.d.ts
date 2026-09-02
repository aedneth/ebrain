export interface RememberFormProps {
  value?: string;
  placeholder?: string;
  /** ej. "routing, deepseek" */
  tags?: string;
  /** Filas del area de texto */
  rows?: number;
  /** Foco: barra, caret y titulo en violeta memoria */
  focus?: boolean;
  width?: string | number;
  style?: React.CSSProperties;
}
export declare function RememberForm(props: RememberFormProps): JSX.Element;
