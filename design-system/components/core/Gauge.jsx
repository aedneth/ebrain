import React from 'react';

// Gauge horizontal de caracteres: lleno \u2588, parcial \u2593, vacio \u2591.
export function Gauge({ value = 0, max = 1, width = 20, label, suffix, tone = 'auto', style }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const exact = ratio * width;
  const full = Math.floor(exact);
  const part = exact - full >= 0.5 && full < width ? 1 : 0;
  const empty = width - full - part;
  let color = 'var(--text-2)';
  if (tone === 'auto') color = ratio >= 0.9 ? 'var(--error)' : ratio >= 0.75 ? 'var(--warn)' : 'var(--text-2)';
  else if (tone) color = 'var(--' + tone + ')';
  const bar = '\u2588'.repeat(full) + '\u2593'.repeat(part) + '\u2591'.repeat(empty);
  return (
    <span style={Object.assign({ whiteSpace: 'pre' }, style)}>
      {label != null && <span style={{ color: 'var(--text-2)' }}>{label + ' '}</span>}
      <span style={{ color: color }}>{bar}</span>
      {suffix != null && <span style={{ color: 'var(--text-2)' }}>{' ' + suffix}</span>}
    </span>
  );
}
