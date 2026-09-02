import React from 'react';

// Lista con scrollbar de caracteres: thumb \u2588 sobre track \u2591.
export function ScrollList({ items = [], selected = -1, height = 8, offset = 0, total, onSelect, renderItem, style }) {
  const count = total != null ? total : items.length;
  const visible = items.slice(offset, offset + height);
  const thumbLen = Math.max(1, Math.round((height / Math.max(count, 1)) * height));
  const maxOffset = Math.max(1, count - height);
  const thumbStart = Math.min(height - thumbLen, Math.round((offset / maxOffset) * (height - thumbLen)));
  const track = [];
  for (let i = 0; i < height; i++) track.push(i >= thumbStart && i < thumbStart + thumbLen && count > height ? '\u2588' : '\u2591');
  return (
    <div style={Object.assign({ display: 'flex', overflow: 'hidden' }, style)}>
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {visible.map(function (it, i) {
          const idx = offset + i;
          const sel = idx === selected;
          return (
            <div
              key={idx}
              onClick={onSelect ? function () { onSelect(idx); } : undefined}
              style={{ display: 'flex', whiteSpace: 'pre', overflow: 'hidden', background: sel ? 'var(--surface-2)' : 'transparent', cursor: onSelect ? 'pointer' : 'default' }}
            >
              <span style={{ color: 'var(--accent)', width: '2ch', flex: 'none' }}>{sel ? '\u25B8 ' : '  '}</span>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>{renderItem ? renderItem(it, idx, sel) : it}</div>
            </div>
          );
        })}
      </div>
      <div style={{ width: '1ch', flex: 'none', whiteSpace: 'pre' }}>
        {track.map(function (c, i) { return <div key={i} style={{ color: c === '\u2588' ? 'var(--text-3)' : 'var(--border-1)' }}>{c}</div>; })}
      </div>
    </div>
  );
}
