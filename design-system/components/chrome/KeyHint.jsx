import React from 'react';

// Tecla resaltada + accion dim. La unidad atomica de la hint bar.
export function KeyHint({ k, label, disabled = false, style }) {
  return (
    <span style={Object.assign({ whiteSpace: 'pre' }, style)}>
      <span style={{ color: disabled ? 'var(--text-3)' : 'var(--text-1)', fontWeight: 700 }}>{k}</span>
      <span style={{ color: 'var(--text-3)' }}>{' ' + label}</span>
    </span>
  );
}
