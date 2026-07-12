export interface GaugeProps {
  value?: number;
  max?: number;
  /** Ancho de la barra en celdas */
  width?: number;
  /** Texto a la izquierda (dim) */
  label?: string;
  /** Texto a la derecha, ej. "$2.1/$10" */
  suffix?: string;
  /** 'auto' colorea por umbral (>=75% warn, >=90% error); o un token: 'ok'|'warn'|'error'|'accent'|'memory' */
  tone?: 'auto' | 'ok' | 'warn' | 'error' | 'info' | 'accent' | 'memory' | 'text-2';
  style?: React.CSSProperties;
}
export declare function Gauge(props: GaugeProps): JSX.Element;
