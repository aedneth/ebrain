import React from 'react';

const HFILL = '\u2500'.repeat(600);
const VFILL = Array.from({ length: 400 }, function () { return '\u2502'; }).join('\n');

// Panel con borde box-drawing y titulo en el borde.
// focus: borde teal + titulo bold (transicion dim->teal). dialog: esquinas rectas.
export function Panel({ title, focus = false, dialog = false, borderColor, titleColor, width, height, pad = 1, bg, style, children }) {
  const bc = borderColor || (focus ? 'var(--accent)' : 'var(--border-1)');
  const tc = titleColor || (focus ? 'var(--text-1)' : 'var(--text-2)');
  const corners = dialog ? ['\u250C', '\u2510', '\u2514', '\u2518'] : ['\u256D', '\u256E', '\u2570', '\u256F'];
  const edge = { color: bc, whiteSpace: 'pre', overflow: 'hidden' };
  return (
    <div style={Object.assign({ display: 'flex', flexDirection: 'column', width: width, height: height, minHeight: 0, background: bg }, style)}>
      <div style={Object.assign({ display: 'flex', flex: 'none' }, edge)}>
        <span>{corners[0] + '\u2500'}</span>
        {title != null && (
          <span style={{ color: tc, fontWeight: focus ? 700 : 400, flex: 'none' }}>{' ' + title + ' '}</span>
        )}
        <span style={{ flex: 1, overflow: 'hidden' }}>{HFILL}</span>
        <span>{corners[1]}</span>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        <div style={Object.assign({ position: 'absolute', left: 0, top: 0, bottom: 0, width: '1ch' }, edge)}>{VFILL}</div>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', padding: '0 ' + (pad || 1) + 'ch', margin: '0 1ch' }}>{children}</div>
        <div style={Object.assign({ position: 'absolute', right: 0, top: 0, bottom: 0, width: '1ch' }, edge)}>{VFILL}</div>
      </div>
      <div style={Object.assign({ display: 'flex', flex: 'none' }, edge)}>
        <span>{corners[2]}</span>
        <span style={{ flex: 1, overflow: 'hidden' }}>{HFILL}</span>
        <span>{corners[3]}</span>
      </div>
    </div>
  );
}
