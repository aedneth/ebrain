export interface TableColumn {
  key: string;
  label: string;
  /** Ancho en celdas; sin width = flex */
  width?: number;
  align?: 'left' | 'right';
}
export interface TableProps {
  columns?: TableColumn[];
  /** Cada fila: { [key]: ReactNode } */
  rows?: Array<Record<string, React.ReactNode>>;
  selected?: number;
  onSelect?: (index: number) => void;
  style?: React.CSSProperties;
}
export declare function Table(props: TableProps): JSX.Element;
