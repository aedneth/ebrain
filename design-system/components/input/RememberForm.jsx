import React from 'react';
import { Panel } from '../layout/Panel';

// Formulario multiline para guardar memoria ("remember"). Dominio memoria -> violeta.
export function RememberForm({ value = '', placeholder = 'que hay que recordar\u2026', tags = '', rows = 3, focus = false, width, style }) {
  const empty = value.length === 0;
  return (
    <Panel title="remember" borderColor={focus ? 'var(--memory)' : 'var(--border-1)'} titleColor={focus ? 'var(--memory)' : 'var(--text-2)'} width={width} style={style}>
      <div style={{ display: 'flex' }}>
        <div style={{ width: '1ch', flex: 'none', color: focus ? 'var(--memory)' : 'var(--border-1)', whiteSpace: 'pre' }}>
          {Array.from({ length: rows }, function () { return '\u2503'; }).join('\n')}
        </div>
        <div style={{ flex: 1, minWidth: 0, background: 'var(--surface-1)', padding: '0 1ch', whiteSpace: 'pre-wrap', height: 'calc(var(--row-h) * ' + rows + ')', overflow: 'hidden' }}>
          <span style={{ color: empty ? 'var(--text-3)' : 'var(--text-1)' }}>{empty ? placeholder : value}</span>
          {focus && <span style={{ color: 'var(--memory)' }}>{'\u258C'}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', whiteSpace: 'pre' }}>
        <span style={{ color: 'var(--text-3)' }}>{'tags: '}</span>
        <span style={{ color: tags ? 'var(--memory)' : 'var(--text-3)' }}>{tags || '\u2014'}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-3)' }}>{'ctrl+s guardar \u00B7 esc cancelar'}</span>
      </div>
    </Panel>
  );
}
