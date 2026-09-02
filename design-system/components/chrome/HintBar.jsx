import React from 'react';
import { KeyHint } from './KeyHint';

// Barra de atajos: "tab paneles  / palette  ? ayuda". Chrome constante de toda vista.
export function HintBar({ hints = [], right, style }) {
  return (
    <div style={Object.assign({ display: 'flex', gap: '2ch', padding: '0 1ch', whiteSpace: 'pre', overflow: 'hidden' }, style)}>
      {hints.map(function (h, i) { return <KeyHint key={i} k={h.k} label={h.label} disabled={h.disabled} />; })}
      {right != null && <span style={{ marginLeft: 'auto', color: 'var(--text-3)' }}>{right}</span>}
    </div>
  );
}
