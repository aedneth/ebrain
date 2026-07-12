import React from 'react';
import { Panel } from '../layout/Panel';
import { KeyHint } from '../chrome/KeyHint';

// Dialogo modal de confirmacion: esquinas rectas, superficie elevada.
export function ConfirmDialog({ title = 'confirmar', message, danger = false, confirmKey = 'y', confirmLabel = 'confirmar', cancelKey = 'n', cancelLabel = 'cancelar', width = '52ch', style }) {
  return (
    <Panel dialog title={title} borderColor={danger ? 'var(--error)' : 'var(--text-3)'} titleColor="var(--text-1)" width={width} bg="var(--surface-2)" style={style}>
      <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-1)', padding: 'var(--row-h) 0' }}>{message}</div>
      <div style={{ display: 'flex', gap: '4ch', paddingBottom: 'var(--row-h)' }}>
        <span style={{ whiteSpace: 'pre' }}>
          <span style={{ color: danger ? 'var(--error)' : 'var(--accent)', fontWeight: 700 }}>{'[' + confirmKey + ']'}</span>
          <span style={{ color: 'var(--text-1)' }}>{' ' + confirmLabel}</span>
        </span>
        <KeyHint k={'[' + cancelKey + ']'} label={cancelLabel} />
      </div>
    </Panel>
  );
}
