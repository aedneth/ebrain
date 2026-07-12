export interface PanelProps {
  /** Titulo incrustado en el borde superior */
  title?: string;
  /** Borde teal + titulo bold. Un solo panel con foco por vista. */
  focus?: boolean;
  /** Esquinas rectas (dialogos modales) en vez de redondeadas */
  dialog?: boolean;
  borderColor?: string;
  titleColor?: string;
  width?: string | number;
  height?: string | number;
  /** Padding horizontal interior en celdas (default 1) */
  pad?: number;
  bg?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export declare function Panel(props: PanelProps): JSX.Element;
