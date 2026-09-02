export interface WordmarkProps {
  /** 'block' = pixel-block grande (home); 'compact' = una linea para barra superior */
  variant?: 'block' | 'compact';
  /** true = degradacion ASCII pura (5 filas de '#') */
  ascii?: boolean;
  style?: React.CSSProperties;
}
export declare function Wordmark(props: WordmarkProps): JSX.Element;
export declare const WORDMARK_MATRIX: Record<string, string[]>;
export declare function wordmarkHalfBlocks(rows: string[]): string[];
