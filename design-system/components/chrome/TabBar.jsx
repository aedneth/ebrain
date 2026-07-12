import React from 'react';

// TabBar numerada (1..n). Activa: bold sobre superficie elevada. Inactivas: dim.
export function TabBar({ tabs = [], active = 0, onSelect, style }) {
  return (
    <div style={Object.assign({ display: 'flex', gap: '1ch', padding: '0 1ch', whiteSpace: 'pre', overflow: 'hidden' }, style)}>
      {tabs.map(function (t, i) {
        const sel = i === active;
        return (
          <span
            key={i}
            onClick={onSelect ? function () { onSelect(i); } : undefined}
            style={{
              cursor: onSelect ? 'pointer' : 'default',
              background: sel ? 'var(--surface-2)' : 'transparent',
              color: sel ? 'var(--text-1)' : 'var(--text-3)',
              fontWeight: sel ? 700 : 400,
            }}
          >
            {' ' + (i + 1) + ':' + t + ' '}
          </span>
        );
      })}
    </div>
  );
}
