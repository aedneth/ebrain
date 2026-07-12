export interface ScrollListProps<T = any> {
  items?: T[];
  selected?: number;
  /** Filas visibles */
  height?: number;
  /** Primer indice visible */
  offset?: number;
  /** Total real (si items ya viene recortado) */
  total?: number;
  onSelect?: (index: number) => void;
  renderItem?: (item: T, index: number, selected: boolean) => React.ReactNode;
  style?: React.CSSProperties;
}
export declare function ScrollList(props: ScrollListProps): JSX.Element;
