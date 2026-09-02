import React from 'react';

// Caja de prompt estilo OpenCode: borde izquierdo grueso \u2503 en teal, fondo superficie.
export function PromptBox({ value = '', placeholder = 'describe la tarea\u2026', focus = true, rows = 1, hint, style }) {
  const bars = [];
  for (let i = 0; i < rows; i++) bars.push('\u2503');
  const empty = value.length === 0;
  return (
    <div style={Object.assign({ display: 'flex' }, style)}>
      <div style={{ width: '1ch', flex: 'none', color: focus ? 'var(--accent)' : 'var(--border-1)', whiteSpace: 'pre' }}>
        {bars.join('\n')}
      </div>
      <div style={{ flex: 1, minWidth: 0, background: 'var(--surface-1)', padding: '0 1ch', whiteSpace: 'pre-wrap', overflow: 'hidden', height: rows > 1 ? 'calc(var(--row-h) * ' + rows + ')' : undefined }}>
        <span style={{ color: empty ? 'var(--text-3)' : 'var(--text-1)' }}>{empty ? placeholder : value}</span>
        {focus && <span style={{ color: 'var(--accent)' }}>{'\u258C'}</span>}
        {hint != null && <span style={{ color: 'var(--text-3)', float: 'right' }}>{hint}</span>}
      </div>
    </div>
  );
}
