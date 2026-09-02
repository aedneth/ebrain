import React from 'react';

const FRAMES = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];
const ASCII_FRAMES = ['|', '/', '-', '\\\\'];

// Spinner braille (fallback ASCII) para operaciones en curso.
export function Spinner({ label, active = true, ascii = false, color = 'var(--accent)', style }) {
  const [i, setI] = React.useState(0);
  React.useEffect(function () {
    if (!active) return undefined;
    const id = setInterval(function () { setI(function (n) { return n + 1; }); }, 80);
    return function () { clearInterval(id); };
  }, [active]);
  const frames = ascii ? ASCII_FRAMES : FRAMES;
  return (
    <span style={Object.assign({ whiteSpace: 'pre' }, style)}>
      <span style={{ color: color }}>{active ? frames[i % frames.length] : '\u00B7'}</span>
      {label != null && <span style={{ color: 'var(--text-2)' }}>{' ' + label}</span>}
    </span>
  );
}
