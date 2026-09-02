import React from 'react';

// Tabla TUI: header dim, separador hairline, filas planas. Anchos en celdas.
export function Table({ columns = [], rows = [], selected = -1, onSelect, style }) {
  function cell(col, content) {
    return (
      <span
        key={col.key}
        style={{
          width: col.width != null ? col.width + 'ch' : undefined,
          flex: col.width != null ? 'none' : 1,
          overflow: 'hidden',
          textAlign: col.align || 'left',
          whiteSpace: 'pre',
          paddingRight: '2ch',
        }}
      >
        {content}
      </span>
    );
  }
  return (
    <div style={Object.assign({ whiteSpace: 'pre', overflow: 'hidden' }, style)}>
      <div style={{ display: 'flex', color: 'var(--text-3)' }}>
        {columns.map(function (c) { return cell(c, c.label); })}
      </div>
      <div style={{ color: 'var(--border-1)', overflow: 'hidden', height: 'var(--row-h)' }}>{'\u2500'.repeat(400)}</div>
      {rows.map(function (r, i) {
        const sel = i === selected;
        return (
          <div
            key={i}
            onClick={onSelect ? function () { onSelect(i); } : undefined}
            style={{ display: 'flex', background: sel ? 'var(--surface-2)' : 'transparent', color: sel ? 'var(--text-1)' : 'var(--text-2)', cursor: onSelect ? 'pointer' : 'default' }}
          >
            {columns.map(function (c) { return cell(c, r[c.key]); })}
          </div>
        );
      })}
    </div>
  );
}
