export interface SpinnerProps {
  /** Texto dim a la derecha, ej. "re-ejecutando doctor..." */
  label?: string;
  /** false congela el spinner en \u00B7 */
  active?: boolean;
  /** Frames ASCII | / - \\ en vez de braille */
  ascii?: boolean;
  color?: string;
  style?: React.CSSProperties;
}
export declare function Spinner(props: SpinnerProps): JSX.Element;
