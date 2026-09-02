import React from 'react';

// Matriz exacta del wordmark: 5 filas de pixel por letra ('#' = lleno, '.' = vacio).
// Se renderiza con medios bloques: par de filas (sup,inf) -> ambos=block, sup=upper, inf=lower.
export const WORDMARK_MATRIX = {
  e: ['.###', '#..#', '####', '#...', '.###'],
  b: ['#...', '#...', '###.', '#..#', '###.'],
  r: ['....', '#.##', '##..', '#...', '#...'],
  a: ['.###', '#..#', '####', '#..#', '#..#'],
  i: ['#', '.', '#', '#', '#'],
  n: ['....', '#.#.', '##.#', '#..#', '#..#'],
};

export function wordmarkHalfBlocks(rows) {
  const w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
  const R = rows.map(function (r) { return r.padEnd(w, '.'); }).concat(['.'.repeat(w)]);
  const out = [];
  for (let y = 0; y < R.length - 1; y += 2) {
    let line = '';
    for (let x = 0; x < w; x++) {
      const t = R[y][x] === '#', b = R[y + 1][x] === '#';
      line += t && b ? '\u2588' : t ? '\u2580' : b ? '\u2584' : ' ';
    }
    out.push(line);
  }
  return out;
}

export function Wordmark({ variant = 'block', ascii = false, style }) {
  if (variant === 'compact') {
    return (
      <span style={Object.assign({ fontWeight: 700 }, style)}>
        <span style={{ color: 'var(--accent)' }}>e</span>
        <span style={{ color: 'var(--text-1)' }}>brain</span>
      </span>
    );
  }
  const letters = 'ebrain'.split('');
  const rendered = letters.map(function (l) {
    const m = WORDMARK_MATRIX[l];
    return ascii
      ? m.map(function (r) { return r.replace(/\./g, ' '); })
      : wordmarkHalfBlocks(m);
  });
  const nLines = ascii ? 5 : 3;
  const lines = [];
  for (let i = 0; i < nLines; i++) {
    lines.push(
      <div key={i}>
        {rendered.map(function (L, j) {
          return (
            <span key={j} style={{ color: j === 0 ? 'var(--accent)' : 'var(--text-1)' }}>
              {L[i]}
              {j < rendered.length - 1 ? ' ' : ''}
            </span>
          );
        })}
      </div>
    );
  }
  return (
    <pre style={Object.assign({ margin: 0, lineHeight: 'var(--line-block, 1)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre' }, style)}>
      {lines}
    </pre>
  );
}
