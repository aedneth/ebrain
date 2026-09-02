export interface ToastProps {
  tone?: 'ok' | 'warn' | 'error';
  width?: string | number;
  style?: React.CSSProperties;
  /** Mensaje de una linea */
  children?: React.ReactNode;
}
export declare function Toast(props: ToastProps): JSX.Element;
