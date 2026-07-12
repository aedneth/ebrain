import React from 'react';

// Footer constante: cwd:branch a la izquierda, version a la derecha. Todo dim.
export function Footer({ cwd, branch, right, style }) {
  return (
    <div style={Object.assign({ display: 'flex', padding: '0 1ch', color: 'var(--text-3)', whiteSpace: 'pre', overflow: 'hidden' }, style)}>
      <span>
        {cwd}
        {branch != null && <span>{':'}<span style={{ color: 'var(--text-2)' }}>{branch}</span></span>}
      </span>
      <span style={{ marginLeft: 'auto' }}>{right}</span>
    </div>
  );
}
