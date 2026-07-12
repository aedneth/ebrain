export interface TabBarProps {
  /** Labels, ej. ['home','sessions','launch','memory','routing','doctor'] */
  tabs?: string[];
  /** Indice activo (0-based) */
  active?: number;
  onSelect?: (index: number) => void;
  style?: React.CSSProperties;
}
export declare function TabBar(props: TabBarProps): JSX.Element;
