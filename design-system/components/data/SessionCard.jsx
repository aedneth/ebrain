import React from 'react';
import { Badge } from '../core/Badge';

const STATE = {
  running: { color: 'var(--ok)', label: 'running' },
  waiting: { color: 'var(--warn)', label: 'waiting' },
  idle: { color: 'var(--text-3)', label: 'idle' },
  error: { color: 'var(--error)', label: 'error' },
  done: { color: 'var(--text-2)', label: 'done' },
};

// Fila de sesion: badge de agente + nombre + uptime + estado.
export function SessionCard({ agent, name, uptime, state = 'running', detail, selected = false, style }) {
  const st = STATE[state] || STATE.running;
  return (
    <div style={Object.assign({ whiteSpace: 'pre', overflow: 'hidden', background: selected ? 'var(--surface-2)' : 'transparent' }, style)}>
      <div style={{ display: 'flex' }}>
        <span style={{ width: '11ch', flex: 'none', overflow: 'hidden' }}><Badge agent={agent} /></span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', color: selected ? 'var(--text-1)' : 'var(--text-2)', fontWeight: selected ? 700 : 400 }}>{name}</span>
        <span style={{ color: 'var(--text-3)', paddingLeft: '2ch' }}>{uptime}</span>
        <span style={{ color: st.color, width: '9ch', textAlign: 'right', flex: 'none' }}>{st.label}</span>
      </div>
      {detail != null && <div style={{ color: 'var(--text-3)', paddingLeft: '11ch', overflow: 'hidden' }}>{detail}</div>}
    </div>
  );
}
