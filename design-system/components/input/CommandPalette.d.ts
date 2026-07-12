export interface CommandPaletteProps {
  query?: string;
  items?: Array<{ label: string; hint?: string }>;
  selected?: number;
  width?: string | number;
  style?: React.CSSProperties;
}
export declare function CommandPalette(props: CommandPaletteProps): JSX.Element;
