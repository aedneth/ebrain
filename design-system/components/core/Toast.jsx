import React from 'react';
import { Panel } from '../layout/Panel';

const TONE = {
  ok: { color: 'var(--ok)', glyph: '\u2713', label: 'ok' },
  warn: { color: 'var(--warn)', glyph: '!', label: 'warn' },
  error: { color: 'var(--error)', glyph: '\u2717', label: 'error' },
};

// Toast de una linea con borde recto en el color del tono.
export function Toast({ tone = 'ok', children, width = '48ch', style }) {
  const t = TONE[tone] || TONE.ok;
  return (
    <Panel dialog borderColor={t.color} width={width} bg="var(--surface-2)" style={style}>
      <div style={{ whiteSpace: 'pre', overflow: 'hidden' }}>
        <span style={{ color: t.color, fontWeight: 700 }}>{t.glyph + ' '}</span>
        <span style={{ color: 'var(--text-1)' }}>{children}</span>
      </div>
    </Panel>
  );
}
