export interface ConfirmDialogProps {
  title?: string;
  message?: React.ReactNode;
  /** true: borde y tecla de confirmacion en error (acciones destructivas) */
  danger?: boolean;
  confirmKey?: string;
  confirmLabel?: string;
  cancelKey?: string;
  cancelLabel?: string;
  width?: string | number;
  style?: React.CSSProperties;
}
export declare function ConfirmDialog(props: ConfirmDialogProps): JSX.Element;
