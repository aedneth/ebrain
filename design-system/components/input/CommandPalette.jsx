import React from 'react';
import { Panel } from '../layout/Panel';

function fuzzyMark(label, query) {
  if (!query) return label;
  const out = [];
  let qi = 0;
  for (let i = 0; i < label.length; i++) {
    const ch = label[i];
    if (qi < query.length && ch.toLowerCase() === query[qi].toLowerCase()) {
      out.push(<span key={i} style={{ color: 'var(--accent)', fontWeight: 700 }}>{ch}</span>);
      qi++;
    } else {
      out.push(<span key={i}>{ch}</span>);
    }
  }
  return out;
}

// Command palette: overlay centrado con fuzzy filter. El borde teal es el momento de acento.
export function CommandPalette({ query = '', items = [], selected = 0, width = '64ch', style }) {
  return (
    <Panel focus width={width} bg="var(--surface-1)" style={style} pad={0}>
      <div style={{ display: 'flex', padding: '0 1ch', whiteSpace: 'pre' }}>
        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{'\u203A '}</span>
        <span style={{ color: 'var(--text-1)' }}>{query}</span>
        <span style={{ color: 'var(--accent)' }}>{'\u258C'}</span>
      </div>
      <div style={{ color: 'var(--border-1)', overflow: 'hidden', height: 'var(--row-h)', whiteSpace: 'pre' }}>{'\u2500'.repeat(300)}</div>
      {items.map(function (it, i) {
        const sel = i === selected;
        return (
          <div key={i} style={{ display: 'flex', padding: '0 1ch', whiteSpace: 'pre', background: sel ? 'var(--surface-2)' : 'transparent' }}>
            <span style={{ color: sel ? 'var(--text-1)' : 'var(--text-2)', fontWeight: sel ? 700 : 400, flex: 1, minWidth: 0, overflow: 'hidden' }}>
              {fuzzyMark(it.label, query)}
            </span>
            {it.hint != null && <span style={{ color: 'var(--text-3)' }}>{it.hint}</span>}
          </div>
        );
      })}
      <div style={{ padding: '0 1ch', color: 'var(--text-3)', whiteSpace: 'pre' }}>{'\u2191\u2193 navegar \u00B7 enter ejecutar \u00B7 esc cerrar'}</div>
    </Panel>
  );
}
