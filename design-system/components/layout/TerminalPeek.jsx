import React from 'react';
import { Panel } from './Panel';

// Frame de output ajeno (peek de una sesion tmux): borde dim, contenido secundario.
export function TerminalPeek({ title, live = false, height, width, style, children }) {
  return (
    <Panel
      title={live ? title + ' \u00B7 live' : title}
      borderColor="var(--border-1)"
      titleColor={live ? 'var(--text-2)' : 'var(--text-3)'}
      height={height}
      width={width}
      style={style}
    >
      <div style={{ color: 'var(--text-2)', whiteSpace: 'pre', overflow: 'hidden', height: '100%' }}>{children}</div>
    </Panel>
  );
}
