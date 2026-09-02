export interface FooterProps {
  /** ej. "~/code/korvex" */
  cwd?: string;
  /** ej. "main" */
  branch?: string;
  /** ej. "ebrain 0.4.2" */
  right?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Footer(props: FooterProps): JSX.Element;
