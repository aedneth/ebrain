import React from 'react';

// Barra superior: identidad a la izquierda, telemetria del sistema a la derecha.
export function StatusBar({ left, right, style }) {
  return (
    <div style={Object.assign({ display: 'flex', alignItems: 'baseline', background: 'var(--surface-1)', padding: '0 1ch', whiteSpace: 'pre', overflow: 'hidden' }, style)}>
      <div style={{ display: 'flex', gap: '2ch', minWidth: 0 }}>{left}</div>
      <div style={{ display: 'flex', gap: '2ch', marginLeft: 'auto', color: 'var(--text-2)' }}>{right}</div>
    </div>
  );
}

// Separador de items: punto medio dim.
export function StatusSep() {
  return <span style={{ color: 'var(--text-3)' }}>{' \u00B7 '}</span>;
}
