/* @ds-bundle: {"format":4,"namespace":"EbrainDesignSystem_04bce4","components":[{"name":"WORDMARK_MATRIX","sourcePath":"components/brand/Wordmark.jsx"},{"name":"Wordmark","sourcePath":"components/brand/Wordmark.jsx"},{"name":"Footer","sourcePath":"components/chrome/Footer.jsx"},{"name":"HintBar","sourcePath":"components/chrome/HintBar.jsx"},{"name":"KeyHint","sourcePath":"components/chrome/KeyHint.jsx"},{"name":"StatusBar","sourcePath":"components/chrome/StatusBar.jsx"},{"name":"StatusSep","sourcePath":"components/chrome/StatusBar.jsx"},{"name":"TabBar","sourcePath":"components/chrome/TabBar.jsx"},{"name":"AGENT_COLORS","sourcePath":"components/core/Badge.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Gauge","sourcePath":"components/core/Gauge.jsx"},{"name":"Spinner","sourcePath":"components/core/Spinner.jsx"},{"name":"Toast","sourcePath":"components/core/Toast.jsx"},{"name":"ScrollList","sourcePath":"components/data/ScrollList.jsx"},{"name":"SessionCard","sourcePath":"components/data/SessionCard.jsx"},{"name":"Table","sourcePath":"components/data/Table.jsx"},{"name":"CommandPalette","sourcePath":"components/input/CommandPalette.jsx"},{"name":"ConfirmDialog","sourcePath":"components/input/ConfirmDialog.jsx"},{"name":"PromptBox","sourcePath":"components/input/PromptBox.jsx"},{"name":"RememberForm","sourcePath":"components/input/RememberForm.jsx"},{"name":"Panel","sourcePath":"components/layout/Panel.jsx"},{"name":"TerminalPeek","sourcePath":"components/layout/TerminalPeek.jsx"}],"sourceHashes":{"components/brand/Wordmark.jsx":"d3c6ac7ccc8c","components/chrome/Footer.jsx":"e1bed84aa1f8","components/chrome/HintBar.jsx":"52435f0bf796","components/chrome/KeyHint.jsx":"0fe0d890d57c","components/chrome/StatusBar.jsx":"3736b9300b3e","components/chrome/TabBar.jsx":"f56f51a85a96","components/core/Badge.jsx":"35c226861749","components/core/Gauge.jsx":"596d365aa572","components/core/Spinner.jsx":"e8cd9fea1764","components/core/Toast.jsx":"6098bc8f405c","components/data/ScrollList.jsx":"ad2b7ed88107","components/data/SessionCard.jsx":"12aa6ebd020c","components/data/Table.jsx":"94f68ffcd7ee","components/input/CommandPalette.jsx":"1bed84f95570","components/input/ConfirmDialog.jsx":"ebfcbed0fea2","components/input/PromptBox.jsx":"ba2765a33b52","components/input/RememberForm.jsx":"00f03e5e6a90","components/layout/Panel.jsx":"5640c88a3c8d","components/layout/TerminalPeek.jsx":"ed3cac790361","ui_kits/ebrain/screens-a.jsx":"cdc339391b12","ui_kits/ebrain/screens-b.jsx":"6e909964c8db","ui_kits/ebrain/shell.jsx":"21d88745f97b"},"inlinedExternals":[],"unexposedExports":[{"name":"wordmarkHalfBlocks","sourcePath":"components/brand/Wordmark.jsx"}]} */

(() => {

const __ds_ns = (window.EbrainDesignSystem_04bce4 = window.EbrainDesignSystem_04bce4 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/Wordmark.jsx
try { (() => {
// Matriz exacta del wordmark: 5 filas de pixel por letra ('#' = lleno, '.' = vacio).
// Se renderiza con medios bloques: par de filas (sup,inf) -> ambos=block, sup=upper, inf=lower.
const WORDMARK_MATRIX = {
  e: ['.###', '#..#', '####', '#...', '.###'],
  b: ['#...', '#...', '###.', '#..#', '###.'],
  r: ['....', '#.##', '##..', '#...', '#...'],
  a: ['.###', '#..#', '####', '#..#', '#..#'],
  i: ['#', '.', '#', '#', '#'],
  n: ['....', '#.#.', '##.#', '#..#', '#..#']
};
function wordmarkHalfBlocks(rows) {
  const w = Math.max.apply(null, rows.map(function (r) {
    return r.length;
  }));
  const R = rows.map(function (r) {
    return r.padEnd(w, '.');
  }).concat(['.'.repeat(w)]);
  const out = [];
  for (let y = 0; y < R.length - 1; y += 2) {
    let line = '';
    for (let x = 0; x < w; x++) {
      const t = R[y][x] === '#',
        b = R[y + 1][x] === '#';
      line += t && b ? '\u2588' : t ? '\u2580' : b ? '\u2584' : ' ';
    }
    out.push(line);
  }
  return out;
}
function Wordmark({
  variant = 'block',
  ascii = false,
  style
}) {
  if (variant === 'compact') {
    return /*#__PURE__*/React.createElement("span", {
      style: Object.assign({
        fontWeight: 700
      }, style)
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--accent)'
      }
    }, "e"), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-1)'
      }
    }, "brain"));
  }
  const letters = 'ebrain'.split('');
  const rendered = letters.map(function (l) {
    const m = WORDMARK_MATRIX[l];
    return ascii ? m.map(function (r) {
      return r.replace(/\./g, ' ');
    }) : wordmarkHalfBlocks(m);
  });
  const nLines = ascii ? 5 : 3;
  const lines = [];
  for (let i = 0; i < nLines; i++) {
    lines.push(/*#__PURE__*/React.createElement("div", {
      key: i
    }, rendered.map(function (L, j) {
      return /*#__PURE__*/React.createElement("span", {
        key: j,
        style: {
          color: j === 0 ? 'var(--accent)' : 'var(--text-1)'
        }
      }, L[i], j < rendered.length - 1 ? ' ' : '');
    })));
  }
  return /*#__PURE__*/React.createElement("pre", {
    style: Object.assign({
      margin: 0,
      lineHeight: 'var(--line-block, 1)',
      fontFamily: 'var(--font-mono)',
      whiteSpace: 'pre'
    }, style)
  }, lines);
}
Object.assign(__ds_scope, { WORDMARK_MATRIX, wordmarkHalfBlocks, Wordmark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Wordmark.jsx", error: String((e && e.message) || e) }); }

// components/chrome/Footer.jsx
try { (() => {
// Footer constante: cwd:branch a la izquierda, version a la derecha. Todo dim.
function Footer({
  cwd,
  branch,
  right,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      display: 'flex',
      padding: '0 1ch',
      color: 'var(--text-3)',
      whiteSpace: 'pre',
      overflow: 'hidden'
    }, style)
  }, /*#__PURE__*/React.createElement("span", null, cwd, branch != null && /*#__PURE__*/React.createElement("span", null, ':', /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)'
    }
  }, branch))), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto'
    }
  }, right));
}
Object.assign(__ds_scope, { Footer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chrome/Footer.jsx", error: String((e && e.message) || e) }); }

// components/chrome/KeyHint.jsx
try { (() => {
// Tecla resaltada + accion dim. La unidad atomica de la hint bar.
function KeyHint({
  k,
  label,
  disabled = false,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: Object.assign({
      whiteSpace: 'pre'
    }, style)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: disabled ? 'var(--text-3)' : 'var(--text-1)',
      fontWeight: 700
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, ' ' + label));
}
Object.assign(__ds_scope, { KeyHint });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chrome/KeyHint.jsx", error: String((e && e.message) || e) }); }

// components/chrome/HintBar.jsx
try { (() => {
// Barra de atajos: "tab paneles  / palette  ? ayuda". Chrome constante de toda vista.
function HintBar({
  hints = [],
  right,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      display: 'flex',
      gap: '2ch',
      padding: '0 1ch',
      whiteSpace: 'pre',
      overflow: 'hidden'
    }, style)
  }, hints.map(function (h, i) {
    return /*#__PURE__*/React.createElement(__ds_scope.KeyHint, {
      key: i,
      k: h.k,
      label: h.label,
      disabled: h.disabled
    });
  }), right != null && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      color: 'var(--text-3)'
    }
  }, right));
}
Object.assign(__ds_scope, { HintBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chrome/HintBar.jsx", error: String((e && e.message) || e) }); }

// components/chrome/StatusBar.jsx
try { (() => {
// Barra superior: identidad a la izquierda, telemetria del sistema a la derecha.
function StatusBar({
  left,
  right,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      display: 'flex',
      alignItems: 'baseline',
      background: 'var(--surface-1)',
      padding: '0 1ch',
      whiteSpace: 'pre',
      overflow: 'hidden'
    }, style)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '2ch',
      minWidth: 0
    }
  }, left), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '2ch',
      marginLeft: 'auto',
      color: 'var(--text-2)'
    }
  }, right));
}

// Separador de items: punto medio dim.
function StatusSep() {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, ' \u00B7 ');
}
Object.assign(__ds_scope, { StatusBar, StatusSep });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chrome/StatusBar.jsx", error: String((e && e.message) || e) }); }

// components/chrome/TabBar.jsx
try { (() => {
// TabBar numerada (1..n). Activa: bold sobre superficie elevada. Inactivas: dim.
function TabBar({
  tabs = [],
  active = 0,
  onSelect,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      display: 'flex',
      gap: '1ch',
      padding: '0 1ch',
      whiteSpace: 'pre',
      overflow: 'hidden'
    }, style)
  }, tabs.map(function (t, i) {
    const sel = i === active;
    return /*#__PURE__*/React.createElement("span", {
      key: i,
      onClick: onSelect ? function () {
        onSelect(i);
      } : undefined,
      style: {
        cursor: onSelect ? 'pointer' : 'default',
        background: sel ? 'var(--surface-2)' : 'transparent',
        color: sel ? 'var(--text-1)' : 'var(--text-3)',
        fontWeight: sel ? 700 : 400
      }
    }, ' ' + (i + 1) + ':' + t + ' ');
  }));
}
Object.assign(__ds_scope, { TabBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chrome/TabBar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
const AGENT_COLORS = {
  claude: 'var(--agent-claude)',
  codex: 'var(--agent-codex)',
  gemini: 'var(--agent-gemini)',
  opencode: 'var(--agent-opencode)',
  cursor: 'var(--agent-cursor)',
  route: 'var(--agent-route)',
  generic: 'var(--agent-generic)',
  free: 'var(--agent-free)'
};
const TONES = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  error: 'var(--error)',
  info: 'var(--info)',
  memory: 'var(--memory)',
  accent: 'var(--accent)'
};

// Badge de agente o de tono semantico: punto de color + label.
function Badge({
  agent,
  tone,
  label,
  solid = false,
  disabled = false,
  style
}) {
  const color = disabled ? 'var(--text-3)' : agent ? AGENT_COLORS[agent] : tone ? TONES[tone] : 'var(--text-2)';
  const text = label != null ? label : agent || tone || '';
  if (solid) {
    return /*#__PURE__*/React.createElement("span", {
      style: Object.assign({
        background: color,
        color: 'var(--bg-void)',
        fontWeight: 700,
        whiteSpace: 'pre'
      }, style)
    }, ' ' + text + ' ');
  }
  return /*#__PURE__*/React.createElement("span", {
    style: Object.assign({
      color: color,
      whiteSpace: 'pre'
    }, style)
  }, '\u25CF ' + text);
}
Object.assign(__ds_scope, { AGENT_COLORS, Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Gauge.jsx
try { (() => {
// Gauge horizontal de caracteres: lleno \u2588, parcial \u2593, vacio \u2591.
function Gauge({
  value = 0,
  max = 1,
  width = 20,
  label,
  suffix,
  tone = 'auto',
  style
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const exact = ratio * width;
  const full = Math.floor(exact);
  const part = exact - full >= 0.5 && full < width ? 1 : 0;
  const empty = width - full - part;
  let color = 'var(--text-2)';
  if (tone === 'auto') color = ratio >= 0.9 ? 'var(--error)' : ratio >= 0.75 ? 'var(--warn)' : 'var(--text-2)';else if (tone) color = 'var(--' + tone + ')';
  const bar = '\u2588'.repeat(full) + '\u2593'.repeat(part) + '\u2591'.repeat(empty);
  return /*#__PURE__*/React.createElement("span", {
    style: Object.assign({
      whiteSpace: 'pre'
    }, style)
  }, label != null && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)'
    }
  }, label + ' '), /*#__PURE__*/React.createElement("span", {
    style: {
      color: color
    }
  }, bar), suffix != null && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)'
    }
  }, ' ' + suffix));
}
Object.assign(__ds_scope, { Gauge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Gauge.jsx", error: String((e && e.message) || e) }); }

// components/core/Spinner.jsx
try { (() => {
const FRAMES = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];
const ASCII_FRAMES = ['|', '/', '-', '\\\\'];

// Spinner braille (fallback ASCII) para operaciones en curso.
function Spinner({
  label,
  active = true,
  ascii = false,
  color = 'var(--accent)',
  style
}) {
  const [i, setI] = React.useState(0);
  React.useEffect(function () {
    if (!active) return undefined;
    const id = setInterval(function () {
      setI(function (n) {
        return n + 1;
      });
    }, 80);
    return function () {
      clearInterval(id);
    };
  }, [active]);
  const frames = ascii ? ASCII_FRAMES : FRAMES;
  return /*#__PURE__*/React.createElement("span", {
    style: Object.assign({
      whiteSpace: 'pre'
    }, style)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: color
    }
  }, active ? frames[i % frames.length] : '\u00B7'), label != null && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)'
    }
  }, ' ' + label));
}
Object.assign(__ds_scope, { Spinner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Spinner.jsx", error: String((e && e.message) || e) }); }

// components/data/ScrollList.jsx
try { (() => {
// Lista con scrollbar de caracteres: thumb \u2588 sobre track \u2591.
function ScrollList({
  items = [],
  selected = -1,
  height = 8,
  offset = 0,
  total,
  onSelect,
  renderItem,
  style
}) {
  const count = total != null ? total : items.length;
  const visible = items.slice(offset, offset + height);
  const thumbLen = Math.max(1, Math.round(height / Math.max(count, 1) * height));
  const maxOffset = Math.max(1, count - height);
  const thumbStart = Math.min(height - thumbLen, Math.round(offset / maxOffset * (height - thumbLen)));
  const track = [];
  for (let i = 0; i < height; i++) track.push(i >= thumbStart && i < thumbStart + thumbLen && count > height ? '\u2588' : '\u2591');
  return /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      display: 'flex',
      overflow: 'hidden'
    }, style)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      overflow: 'hidden'
    }
  }, visible.map(function (it, i) {
    const idx = offset + i;
    const sel = idx === selected;
    return /*#__PURE__*/React.createElement("div", {
      key: idx,
      onClick: onSelect ? function () {
        onSelect(idx);
      } : undefined,
      style: {
        display: 'flex',
        whiteSpace: 'pre',
        overflow: 'hidden',
        background: sel ? 'var(--surface-2)' : 'transparent',
        cursor: onSelect ? 'pointer' : 'default'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--accent)',
        width: '2ch',
        flex: 'none'
      }
    }, sel ? '\u25B8 ' : '  '), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0,
        overflow: 'hidden'
      }
    }, renderItem ? renderItem(it, idx, sel) : it));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '1ch',
      flex: 'none',
      whiteSpace: 'pre'
    }
  }, track.map(function (c, i) {
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        color: c === '\u2588' ? 'var(--text-3)' : 'var(--border-1)'
      }
    }, c);
  })));
}
Object.assign(__ds_scope, { ScrollList });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ScrollList.jsx", error: String((e && e.message) || e) }); }

// components/data/SessionCard.jsx
try { (() => {
const STATE = {
  running: {
    color: 'var(--ok)',
    label: 'running'
  },
  waiting: {
    color: 'var(--warn)',
    label: 'waiting'
  },
  idle: {
    color: 'var(--text-3)',
    label: 'idle'
  },
  error: {
    color: 'var(--error)',
    label: 'error'
  },
  done: {
    color: 'var(--text-2)',
    label: 'done'
  }
};

// Fila de sesion: badge de agente + nombre + uptime + estado.
function SessionCard({
  agent,
  name,
  uptime,
  state = 'running',
  detail,
  selected = false,
  style
}) {
  const st = STATE[state] || STATE.running;
  return /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      whiteSpace: 'pre',
      overflow: 'hidden',
      background: selected ? 'var(--surface-2)' : 'transparent'
    }, style)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: '11ch',
      flex: 'none',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    agent: agent
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      overflow: 'hidden',
      color: selected ? 'var(--text-1)' : 'var(--text-2)',
      fontWeight: selected ? 700 : 400
    }
  }, name), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      paddingLeft: '2ch'
    }
  }, uptime), /*#__PURE__*/React.createElement("span", {
    style: {
      color: st.color,
      width: '9ch',
      textAlign: 'right',
      flex: 'none'
    }
  }, st.label)), detail != null && /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-3)',
      paddingLeft: '11ch',
      overflow: 'hidden'
    }
  }, detail));
}
Object.assign(__ds_scope, { SessionCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/SessionCard.jsx", error: String((e && e.message) || e) }); }

// components/data/Table.jsx
try { (() => {
// Tabla TUI: header dim, separador hairline, filas planas. Anchos en celdas.
function Table({
  columns = [],
  rows = [],
  selected = -1,
  onSelect,
  style
}) {
  function cell(col, content) {
    return /*#__PURE__*/React.createElement("span", {
      key: col.key,
      style: {
        width: col.width != null ? col.width + 'ch' : undefined,
        flex: col.width != null ? 'none' : 1,
        overflow: 'hidden',
        textAlign: col.align || 'left',
        whiteSpace: 'pre',
        paddingRight: '2ch'
      }
    }, content);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      whiteSpace: 'pre',
      overflow: 'hidden'
    }, style)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      color: 'var(--text-3)'
    }
  }, columns.map(function (c) {
    return cell(c, c.label);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--border-1)',
      overflow: 'hidden',
      height: 'var(--row-h)'
    }
  }, '\u2500'.repeat(400)), rows.map(function (r, i) {
    const sel = i === selected;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      onClick: onSelect ? function () {
        onSelect(i);
      } : undefined,
      style: {
        display: 'flex',
        background: sel ? 'var(--surface-2)' : 'transparent',
        color: sel ? 'var(--text-1)' : 'var(--text-2)',
        cursor: onSelect ? 'pointer' : 'default'
      }
    }, columns.map(function (c) {
      return cell(c, r[c.key]);
    }));
  }));
}
Object.assign(__ds_scope, { Table });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Table.jsx", error: String((e && e.message) || e) }); }

// components/input/PromptBox.jsx
try { (() => {
// Caja de prompt estilo OpenCode: borde izquierdo grueso \u2503 en teal, fondo superficie.
function PromptBox({
  value = '',
  placeholder = 'describe la tarea\u2026',
  focus = true,
  rows = 1,
  hint,
  style
}) {
  const bars = [];
  for (let i = 0; i < rows; i++) bars.push('\u2503');
  const empty = value.length === 0;
  return /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      display: 'flex'
    }, style)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '1ch',
      flex: 'none',
      color: focus ? 'var(--accent)' : 'var(--border-1)',
      whiteSpace: 'pre'
    }
  }, bars.join('\n')), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      background: 'var(--surface-1)',
      padding: '0 1ch',
      whiteSpace: 'pre-wrap',
      overflow: 'hidden',
      height: rows > 1 ? 'calc(var(--row-h) * ' + rows + ')' : undefined
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: empty ? 'var(--text-3)' : 'var(--text-1)'
    }
  }, empty ? placeholder : value), focus && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--accent)'
    }
  }, '\u258C'), hint != null && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      float: 'right'
    }
  }, hint)));
}
Object.assign(__ds_scope, { PromptBox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/input/PromptBox.jsx", error: String((e && e.message) || e) }); }

// components/layout/Panel.jsx
try { (() => {
const HFILL = '\u2500'.repeat(600);
const VFILL = Array.from({
  length: 400
}, function () {
  return '\u2502';
}).join('\n');

// Panel con borde box-drawing y titulo en el borde.
// focus: borde teal + titulo bold (transicion dim->teal). dialog: esquinas rectas.
function Panel({
  title,
  focus = false,
  dialog = false,
  borderColor,
  titleColor,
  width,
  height,
  pad = 1,
  bg,
  style,
  children
}) {
  const bc = borderColor || (focus ? 'var(--accent)' : 'var(--border-1)');
  const tc = titleColor || (focus ? 'var(--text-1)' : 'var(--text-2)');
  const corners = dialog ? ['\u250C', '\u2510', '\u2514', '\u2518'] : ['\u256D', '\u256E', '\u2570', '\u256F'];
  const edge = {
    color: bc,
    whiteSpace: 'pre',
    overflow: 'hidden'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      display: 'flex',
      flexDirection: 'column',
      width: width,
      height: height,
      minHeight: 0,
      background: bg
    }, style)
  }, /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      display: 'flex',
      flex: 'none'
    }, edge)
  }, /*#__PURE__*/React.createElement("span", null, corners[0] + '\u2500'), title != null && /*#__PURE__*/React.createElement("span", {
    style: {
      color: tc,
      fontWeight: focus ? 700 : 400,
      flex: 'none'
    }
  }, ' ' + title + ' '), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      overflow: 'hidden'
    }
  }, HFILL), /*#__PURE__*/React.createElement("span", null, corners[1])), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flex: 1,
      minHeight: 0,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: '1ch'
    }, edge)
  }, VFILL), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      overflow: 'hidden',
      padding: '0 ' + (pad || 1) + 'ch',
      margin: '0 1ch'
    }
  }, children), /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: '1ch'
    }, edge)
  }, VFILL)), /*#__PURE__*/React.createElement("div", {
    style: Object.assign({
      display: 'flex',
      flex: 'none'
    }, edge)
  }, /*#__PURE__*/React.createElement("span", null, corners[2]), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      overflow: 'hidden'
    }
  }, HFILL), /*#__PURE__*/React.createElement("span", null, corners[3])));
}
Object.assign(__ds_scope, { Panel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/Panel.jsx", error: String((e && e.message) || e) }); }

// components/core/Toast.jsx
try { (() => {
const TONE = {
  ok: {
    color: 'var(--ok)',
    glyph: '\u2713',
    label: 'ok'
  },
  warn: {
    color: 'var(--warn)',
    glyph: '!',
    label: 'warn'
  },
  error: {
    color: 'var(--error)',
    glyph: '\u2717',
    label: 'error'
  }
};

// Toast de una linea con borde recto en el color del tono.
function Toast({
  tone = 'ok',
  children,
  width = '48ch',
  style
}) {
  const t = TONE[tone] || TONE.ok;
  return /*#__PURE__*/React.createElement(__ds_scope.Panel, {
    dialog: true,
    borderColor: t.color,
    width: width,
    bg: "var(--surface-2)",
    style: style
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      whiteSpace: 'pre',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: t.color,
      fontWeight: 700
    }
  }, t.glyph + ' '), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-1)'
    }
  }, children)));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Toast.jsx", error: String((e && e.message) || e) }); }

// components/input/CommandPalette.jsx
try { (() => {
function fuzzyMark(label, query) {
  if (!query) return label;
  const out = [];
  let qi = 0;
  for (let i = 0; i < label.length; i++) {
    const ch = label[i];
    if (qi < query.length && ch.toLowerCase() === query[qi].toLowerCase()) {
      out.push(/*#__PURE__*/React.createElement("span", {
        key: i,
        style: {
          color: 'var(--accent)',
          fontWeight: 700
        }
      }, ch));
      qi++;
    } else {
      out.push(/*#__PURE__*/React.createElement("span", {
        key: i
      }, ch));
    }
  }
  return out;
}

// Command palette: overlay centrado con fuzzy filter. El borde teal es el momento de acento.
function CommandPalette({
  query = '',
  items = [],
  selected = 0,
  width = '64ch',
  style
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Panel, {
    focus: true,
    width: width,
    bg: "var(--surface-1)",
    style: style,
    pad: 0
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      padding: '0 1ch',
      whiteSpace: 'pre'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--accent)',
      fontWeight: 700
    }
  }, '\u203A '), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-1)'
    }
  }, query), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--accent)'
    }
  }, '\u258C')), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--border-1)',
      overflow: 'hidden',
      height: 'var(--row-h)',
      whiteSpace: 'pre'
    }
  }, '\u2500'.repeat(300)), items.map(function (it, i) {
    const sel = i === selected;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: 'flex',
        padding: '0 1ch',
        whiteSpace: 'pre',
        background: sel ? 'var(--surface-2)' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: sel ? 'var(--text-1)' : 'var(--text-2)',
        fontWeight: sel ? 700 : 400,
        flex: 1,
        minWidth: 0,
        overflow: 'hidden'
      }
    }, fuzzyMark(it.label, query)), it.hint != null && /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-3)'
      }
    }, it.hint));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 1ch',
      color: 'var(--text-3)',
      whiteSpace: 'pre'
    }
  }, '\u2191\u2193 navegar \u00B7 enter ejecutar \u00B7 esc cerrar'));
}
Object.assign(__ds_scope, { CommandPalette });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/input/CommandPalette.jsx", error: String((e && e.message) || e) }); }

// components/input/ConfirmDialog.jsx
try { (() => {
// Dialogo modal de confirmacion: esquinas rectas, superficie elevada.
function ConfirmDialog({
  title = 'confirmar',
  message,
  danger = false,
  confirmKey = 'y',
  confirmLabel = 'confirmar',
  cancelKey = 'n',
  cancelLabel = 'cancelar',
  width = '52ch',
  style
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Panel, {
    dialog: true,
    title: title,
    borderColor: danger ? 'var(--error)' : 'var(--text-3)',
    titleColor: "var(--text-1)",
    width: width,
    bg: "var(--surface-2)",
    style: style
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      whiteSpace: 'pre-wrap',
      color: 'var(--text-1)',
      padding: 'var(--row-h) 0'
    }
  }, message), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '4ch',
      paddingBottom: 'var(--row-h)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: 'pre'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: danger ? 'var(--error)' : 'var(--accent)',
      fontWeight: 700
    }
  }, '[' + confirmKey + ']'), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-1)'
    }
  }, ' ' + confirmLabel)), /*#__PURE__*/React.createElement(__ds_scope.KeyHint, {
    k: '[' + cancelKey + ']',
    label: cancelLabel
  })));
}
Object.assign(__ds_scope, { ConfirmDialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/input/ConfirmDialog.jsx", error: String((e && e.message) || e) }); }

// components/input/RememberForm.jsx
try { (() => {
// Formulario multiline para guardar memoria ("remember"). Dominio memoria -> violeta.
function RememberForm({
  value = '',
  placeholder = 'que hay que recordar\u2026',
  tags = '',
  rows = 3,
  focus = false,
  width,
  style
}) {
  const empty = value.length === 0;
  return /*#__PURE__*/React.createElement(__ds_scope.Panel, {
    title: "remember",
    borderColor: focus ? 'var(--memory)' : 'var(--border-1)',
    titleColor: focus ? 'var(--memory)' : 'var(--text-2)',
    width: width,
    style: style
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '1ch',
      flex: 'none',
      color: focus ? 'var(--memory)' : 'var(--border-1)',
      whiteSpace: 'pre'
    }
  }, Array.from({
    length: rows
  }, function () {
    return '\u2503';
  }).join('\n')), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      background: 'var(--surface-1)',
      padding: '0 1ch',
      whiteSpace: 'pre-wrap',
      height: 'calc(var(--row-h) * ' + rows + ')',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: empty ? 'var(--text-3)' : 'var(--text-1)'
    }
  }, empty ? placeholder : value), focus && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--memory)'
    }
  }, '\u258C'))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      whiteSpace: 'pre'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, 'tags: '), /*#__PURE__*/React.createElement("span", {
    style: {
      color: tags ? 'var(--memory)' : 'var(--text-3)'
    }
  }, tags || '\u2014'), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      color: 'var(--text-3)'
    }
  }, 'ctrl+s guardar \u00B7 esc cancelar')));
}
Object.assign(__ds_scope, { RememberForm });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/input/RememberForm.jsx", error: String((e && e.message) || e) }); }

// components/layout/TerminalPeek.jsx
try { (() => {
// Frame de output ajeno (peek de una sesion tmux): borde dim, contenido secundario.
function TerminalPeek({
  title,
  live = false,
  height,
  width,
  style,
  children
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Panel, {
    title: live ? title + ' \u00B7 live' : title,
    borderColor: "var(--border-1)",
    titleColor: live ? 'var(--text-2)' : 'var(--text-3)',
    height: height,
    width: width,
    style: style
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-2)',
      whiteSpace: 'pre',
      overflow: 'hidden',
      height: '100%'
    }
  }, children));
}
Object.assign(__ds_scope, { TerminalPeek });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/TerminalPeek.jsx", error: String((e && e.message) || e) }); }

// ui_kits/ebrain/screens-a.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// ebrain screens: HOME, SESSIONS, LAUNCH
const SESSIONS = [{
  agent: 'claude',
  name: 'ebr-claude-korvex',
  uptime: '02:41',
  state: 'running',
  detail: 'sonnet-4 \u00b7 refactor router de modelos'
}, {
  agent: 'gemini',
  name: 'ebr-gem-web',
  uptime: '00:12',
  state: 'waiting',
  detail: 'esperando confirmacion frontier'
}, {
  agent: 'codex',
  name: 'ebr-codex-tests',
  uptime: '01:03',
  state: 'running',
  detail: 'o4-mini \u00b7 generando specs'
}, {
  agent: 'opencode',
  name: 'ebr-oc-docs',
  uptime: '00:48',
  state: 'idle',
  detail: 'qwen-2.5 \u00b7 sin actividad 4m'
}, {
  agent: 'cursor',
  name: 'ebr-cursor-ui',
  uptime: '03:19',
  state: 'running',
  detail: 'composer \u00b7 editando Panel.tsx'
}, {
  agent: 'free',
  name: 'ebr-free-scratch',
  uptime: '00:05',
  state: 'done',
  detail: 'deepseek \u00b7 completado'
}];
function HomeScreen() {
  return /*#__PURE__*/React.createElement(window.Screen, {
    tab: "home",
    hints: [{
      k: '1-6',
      label: 'vistas'
    }, {
      k: '/',
      label: 'palette'
    }, {
      k: 'l',
      label: 'launch'
    }, {
      k: '?',
      label: 'ayuda'
    }]
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      flex: 'none',
      paddingBottom: 'var(--row-h)'
    }
  }, /*#__PURE__*/React.createElement(window.Wordmark, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '2ch',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: "sistema",
    width: "46ch",
    bg: "var(--surface-1)"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      whiteSpace: 'pre'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      display: 'inline-block',
      width: '12ch'
    }
  }, "brain"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ok)',
      fontWeight: 700
    }
  }, "UP"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, "  CKIS \\u00b7 128 learnings")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--row-h)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      display: 'inline-block',
      width: '12ch'
    }
  }, "spend hoy"), /*#__PURE__*/React.createElement(window.Gauge, {
    value: 2.14,
    max: 10,
    width: 16,
    suffix: "$2.14/$10"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      display: 'inline-block',
      width: '12ch'
    }
  }, "ram"), /*#__PURE__*/React.createElement(window.Gauge, {
    value: 3.1,
    max: 4,
    width: 16,
    suffix: "3.1/4G",
    tone: "auto"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--row-h)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      display: 'inline-block',
      width: '12ch'
    }
  }, "fleet"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-1)'
    }
  }, "6/6 "), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ok)'
    }
  }, "online")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      display: 'inline-block',
      width: '12ch'
    }
  }, "routing"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-1)'
    }
  }, "6 caps "), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, "\\u00b7 0 fallbacks")))), /*#__PURE__*/React.createElement(window.Panel, {
    title: "sesiones activas",
    focus: true,
    bg: "var(--surface-1)",
    style: {
      flex: 1,
      minWidth: 0
    }
  }, SESSIONS.slice(0, 4).map((s, i) => /*#__PURE__*/React.createElement(window.SessionCard, _extends({
    key: i
  }, s, {
    detail: undefined,
    selected: i === 0
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 'none',
      paddingTop: 'var(--row-h)'
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: "ultimas memorias",
    bg: "var(--surface-1)"
  }, [['deepseek v3 falla con tool-use paralelo; enrutar a claude', '0.94', 'routing'], ['korvex usa pnpm, no npm \u2014 nunca sugerir npm install', '0.91', 'korvex'], ['frontier siempre requiere confirmacion manual del usuario', '0.88', 'policy']].map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      whiteSpace: 'pre'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--memory)'
    }
  }, '\u25cf '), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-1)',
      flex: 1,
      minWidth: 0,
      overflow: 'hidden'
    }
  }, m[0]), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--memory)',
      paddingLeft: '2ch'
    }
  }, m[1]), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      paddingLeft: '2ch',
      width: '10ch',
      textAlign: 'right'
    }
  }, m[2])))))));
}
function SessionsScreen({
  selected = 0,
  onSelect
}) {
  const s = SESSIONS[selected];
  const peekBody = {
    'ebr-claude-korvex': '$ claude --resume korvex\n\u203a analizando src/router/models.ts\n  encontradas 3 funciones a refactorizar:\n  - resolveCap()   \u2713 hecho\n  - pickModel()    \u25b8 en progreso\n  - fallbackChain()  pendiente\n\n> aplicando cambios a pickModel()...\n  + 24 lineas  - 11 lineas'
  };
  return /*#__PURE__*/React.createElement(window.Screen, {
    tab: "sessions",
    hints: [{
      k: '\u2191\u2193',
      label: 'navegar'
    }, {
      k: 'a',
      label: 'attach'
    }, {
      k: 'k',
      label: 'kill'
    }, {
      k: 'p',
      label: 'prompt'
    }]
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '2ch',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: "fleet \\u00b7 6 sesiones",
    focus: true,
    width: "46ch",
    bg: "var(--surface-1)"
  }, /*#__PURE__*/React.createElement(window.ScrollList, {
    items: SESSIONS,
    selected: selected,
    height: 9,
    onSelect: onSelect,
    renderItem: (it, idx, sel) => /*#__PURE__*/React.createElement("div", {
      style: {
        whiteSpace: 'pre',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: '11ch',
        flex: 'none'
      }
    }, /*#__PURE__*/React.createElement(window.Badge, {
      agent: it.agent
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        color: sel ? 'var(--text-1)' : 'var(--text-2)',
        fontWeight: sel ? 700 : 400
      }
    }, it.name), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-3)',
        paddingLeft: '1ch'
      }
    }, it.uptime)))
  })), /*#__PURE__*/React.createElement(window.TerminalPeek, {
    title: 'peek \u00b7 ' + s.name,
    live: true,
    style: {
      flex: 1,
      minWidth: 0
    }
  }, peekBody[s.name] || '$ ' + s.agent + ' \u2014 ' + s.detail + '\n\u203a sesion ' + s.state + '\n  uptime ' + s.uptime)));
}
const AGENTS8 = ['claude', 'codex', 'gemini', 'opencode', 'cursor', 'route', 'generic', 'free'];
function LaunchScreen({
  agent = 'claude'
}) {
  return /*#__PURE__*/React.createElement(window.Screen, {
    tab: "launch",
    hints: [{
      k: 'tab',
      label: 'agente'
    }, {
      k: 'c',
      label: 'contexto'
    }, {
      k: 'enter',
      label: 'lanzar'
    }]
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--row-h)',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement(window.PromptBox, {
    value: "refactor completo del router de modelos: extraer fallbackChain a su propio modulo con tests",
    rows: 2,
    hint: "enter lanzar \\u00b7 esc cancelar"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '2ch',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: "advisor",
    focus: true,
    width: "56ch",
    bg: "var(--surface-1)"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      whiteSpace: 'pre'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      display: 'inline-block',
      width: '12ch'
    }
  }, "carril"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--accent)',
      fontWeight: 700
    }
  }, "coding")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      display: 'inline-block',
      width: '12ch'
    }
  }, "modelo"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-1)'
    }
  }, "claude-sonnet-4")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      display: 'inline-block',
      width: '12ch'
    }
  }, "costo est."), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-1)'
    }
  }, "~$0.38")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--row-h)',
      color: 'var(--text-3)'
    }
  }, "razon:"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-2)',
      whiteSpace: 'pre-wrap'
    }
  }, "tarea multi-archivo con tests \\u2192 requiere razonamiento de codigo fuerte y ventana amplia."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--row-h)',
      color: 'var(--text-3)'
    }
  }, "alternativas:"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-3)'
    }
  }, "o4-mini ($0.09) \\u00b7 deepseek-v3 ($0.02, tool-use inestable)"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--row-h)',
      display: 'flex',
      whiteSpace: 'pre'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--warn)',
      fontWeight: 700
    }
  }, '! '), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--warn)'
    }
  }, "frontier requiere confirmacion \\u2014 nunca auto-escala")))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--row-h)'
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: "agente",
    bg: "var(--surface-1)"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '2px 2ch'
    }
  }, AGENTS8.map(a => /*#__PURE__*/React.createElement("div", {
    key: a,
    style: {
      background: a === agent ? 'var(--surface-2)' : 'transparent',
      whiteSpace: 'pre'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--accent)'
    }
  }, a === agent ? '\u25b8 ' : '  '), /*#__PURE__*/React.createElement(window.Badge, {
    agent: a
  }))))), /*#__PURE__*/React.createElement(window.Panel, {
    title: "contexto a inyectar  [\\u25be]",
    bg: "var(--surface-1)",
    style: {
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      whiteSpace: 'pre'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ok)'
    }
  }, '\u2713 '), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)'
    }
  }, "norms/korvex.md"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, "  2.1k")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--memory)'
    }
  }, '\u2713 '), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)'
    }
  }, "memoria: 8 learnings relevantes")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ok)'
    }
  }, '\u2713 '), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)'
    }
  }, "mcp: filesystem, git"))))))));
}
Object.assign(window, {
  HomeScreen,
  SessionsScreen,
  LaunchScreen,
  SESSIONS,
  AGENTS8
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/ebrain/screens-a.jsx", error: String((e && e.message) || e) }); }

// ui_kits/ebrain/screens-b.jsx
try { (() => {
// ebrain screens: MEMORY, ROUTING, DOCTOR
function MemoryScreen() {
  const results = [['deepseek v3 falla con tool-use paralelo; enrutar a claude', '0.94', 'session-log 04-12'], ['korvex usa pnpm, no npm \u2014 nunca sugerir npm install', '0.91', 'norms/korvex'], ['router: fallbackChain debe ser puro, sin side-effects', '0.87', 'session-log 04-09'], ['frontier siempre requiere confirmacion manual', '0.85', 'policy']];
  const logs = [['04-12 14:32', 'claude', 'refactor router'], ['04-12 11:08', 'codex', 'specs de tests'], ['04-11 18:44', 'gemini', 'research MCP'], ['04-11 09:20', 'cursor', 'ui Panel'], ['04-10 16:03', 'opencode', 'docs pnpm']];
  return /*#__PURE__*/React.createElement(window.Screen, {
    tab: "memory",
    hints: [{
      k: '\u2191\u2193',
      label: 'resultados'
    }, {
      k: 'r',
      label: 'remember'
    }, {
      k: 'enter',
      label: 'abrir'
    }],
    right: /*#__PURE__*/React.createElement("span", null, "CKIS ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--memory)'
      }
    }, "128"), " learnings", /*#__PURE__*/React.createElement(window.StatusSep, null), "embeddings ok")
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--row-h)',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement(window.PromptBox, {
    focus: false,
    value: "por que falla deepseek con tools",
    hint: "busqueda semantica"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '2ch',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: "resultados  \\u00b7 violeta = memoria",
    focus: true,
    bg: "var(--surface-1)",
    style: {
      flex: 1,
      minWidth: 0
    }
  }, results.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      whiteSpace: 'pre',
      overflow: 'hidden',
      marginBottom: '2px',
      background: i === 0 ? 'var(--surface-2)' : 'transparent'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--memory)',
      width: '2ch',
      flex: 'none'
    }
  }, '\u25cf'), /*#__PURE__*/React.createElement("span", {
    style: {
      color: i === 0 ? 'var(--text-1)' : 'var(--text-2)',
      flex: 1,
      minWidth: 0,
      overflow: 'hidden'
    }
  }, r[0]), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--memory)',
      fontWeight: 700,
      paddingLeft: '2ch'
    }
  }, r[1])), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-3)',
      paddingLeft: '2ch'
    }
  }, r[2])))), /*#__PURE__*/React.createElement(window.Panel, {
    title: "session-logs",
    width: "34ch",
    bg: "var(--surface-1)"
  }, logs.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      whiteSpace: 'pre',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, l[0])), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingLeft: '1ch'
    }
  }, /*#__PURE__*/React.createElement(window.Badge, {
    agent: l[1],
    label: l[2]
  })))))), /*#__PURE__*/React.createElement(window.RememberForm, {
    rows: 2,
    value: "deepseek v3 falla con tool-use paralelo; enrutar a claude para tareas con >2 tools",
    tags: "routing, deepseek"
  })));
}
function RoutingScreen() {
  const caps = [['coding', 3.9, 5, 'claude-sonnet-4'], ['agentic', 1.2, 3, 'gpt-4o'], ['web', 0.4, 2, 'gemini-flash'], ['long-context', 2.1, 4, 'gemini-1.5-pro'], ['terminal', 0.1, 1, 'qwen-2.5'], ['general', 0.6, 2, 'deepseek-v3']];
  return /*#__PURE__*/React.createElement(window.Screen, {
    tab: "routing",
    hints: [{
      k: '\u2191\u2193',
      label: 'caps'
    }, {
      k: 'e',
      label: 'editar cadena'
    }, {
      k: 'enter',
      label: 'detalle'
    }],
    right: /*#__PURE__*/React.createElement("span", null, "spend ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--warn)'
      }
    }, "$2.14"), "/$10", /*#__PURE__*/React.createElement(window.StatusSep, null), "6 caps")
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '2ch',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: "caps \\u00b7 gasto por carril",
    focus: true,
    width: "60ch",
    bg: "var(--surface-1)"
  }, caps.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      whiteSpace: 'pre',
      display: 'flex',
      marginBottom: '2px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)',
      width: '15ch',
      flex: 'none'
    }
  }, c[0]), /*#__PURE__*/React.createElement(window.Gauge, {
    value: c[1],
    max: c[2],
    width: 18,
    tone: "auto"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      paddingLeft: '2ch'
    }
  }, '$' + c[1].toFixed(1)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--row-h)',
      color: 'var(--text-3)',
      whiteSpace: 'pre'
    }
  }, "total hoy  ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--warn)'
    }
  }, "$2.14"), " / $10.00")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--row-h)'
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: "cadena \\u00b7 coding",
    bg: "var(--surface-1)"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      whiteSpace: 'pre'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--accent)',
      fontWeight: 700
    }
  }, "claude-sonnet-4"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, "  ganador")), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-3)'
    }
  }, '  \u2193 fallback'), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-1)'
    }
  }, "o4-mini"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, "  si 429 / timeout")), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-3)'
    }
  }, '  \u2193 floor'), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)'
    }
  }, "deepseek-v3"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, "  ultimo recurso")))), /*#__PURE__*/React.createElement(window.Panel, {
    title: "ledger reciente",
    bg: "var(--surface-1)",
    style: {
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(window.Table, {
    columns: [{
      key: 'h',
      label: 'hora',
      width: 7
    }, {
      key: 'a',
      label: 'agente',
      width: 12
    }, {
      key: 'c',
      label: 'cap'
    }, {
      key: '$',
      label: 'costo',
      width: 7,
      align: 'right'
    }],
    rows: [{
      h: '14:32',
      a: /*#__PURE__*/React.createElement(window.Badge, {
        agent: "claude"
      }),
      c: 'coding',
      $: '$0.42'
    }, {
      h: '14:28',
      a: /*#__PURE__*/React.createElement(window.Badge, {
        agent: "gemini"
      }),
      c: 'web',
      $: '$0.03'
    }, {
      h: '14:19',
      a: /*#__PURE__*/React.createElement(window.Badge, {
        agent: "route"
      }),
      c: 'agentic',
      $: '$0.11'
    }, {
      h: '14:02',
      a: /*#__PURE__*/React.createElement(window.Badge, {
        agent: "codex"
      }),
      c: 'coding',
      $: '$0.09'
    }]
  })))));
}
function DoctorScreen({
  running = false
}) {
  const checks = [['ok', 'tmux server', '5 sesiones activas'], ['ok', 'CKIS / embeddings', '128 learnings, index fresco'], ['ok', 'anthropic api', 'claude-sonnet-4 alcanzable'], ['warn', 'openai api', 'latencia alta 2.4s'], ['ok', 'google api', 'gemini ok'], ['fail', 'deepseek api', 'tool-use paralelo inestable'], ['ok', 'mcp: filesystem', 'montado'], ['ok', 'mcp: git', 'montado']];
  const TONE = {
    ok: ['var(--ok)', '\u2713'],
    warn: ['var(--warn)', '!'],
    fail: ['var(--error)', '\u2717']
  };
  const AG = [['claude', 'online'], ['codex', 'online'], ['gemini', 'online'], ['opencode', 'online'], ['cursor', 'online'], ['free', 'online']];
  return /*#__PURE__*/React.createElement(window.Screen, {
    tab: "doctor",
    hints: [{
      k: 'r',
      label: 're-run'
    }, {
      k: '\u2191\u2193',
      label: 'checks'
    }, {
      k: 'enter',
      label: 'detalle'
    }]
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '2ch',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement(window.Panel, {
    title: running ? 'diagnostico' : 'diagnostico \u00b7 ultimo 14:31',
    focus: true,
    style: {
      flex: 1,
      minWidth: 0
    },
    bg: "var(--surface-1)"
  }, running && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 'var(--row-h)'
    }
  }, /*#__PURE__*/React.createElement(window.Spinner, {
    label: "re-ejecutando checks..."
  })), checks.map((c, i) => {
    const t = TONE[c[0]];
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        whiteSpace: 'pre',
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: t[0],
        fontWeight: 700,
        width: '3ch',
        flex: 'none'
      }
    }, t[1]), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-1)',
        width: '22ch',
        flex: 'none',
        overflow: 'hidden'
      }
    }, c[1]), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-3)',
        flex: 1,
        minWidth: 0,
        overflow: 'hidden'
      }
    }, c[2]));
  })), /*#__PURE__*/React.createElement(window.Panel, {
    title: "fleet 6/6",
    width: "34ch",
    bg: "var(--surface-1)"
  }, AG.map((a, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      whiteSpace: 'pre',
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(window.Badge, {
    agent: a[0]
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ok)'
    }
  }, a[1]))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--row-h)',
      color: 'var(--text-3)',
      whiteSpace: 'pre'
    }
  }, "1 warn \\u00b7 1 fail", /*#__PURE__*/React.createElement("br", null), "ver deepseek \\u2192 routing"))));
}
Object.assign(window, {
  MemoryScreen,
  RoutingScreen,
  DoctorScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/ebrain/screens-b.jsx", error: String((e && e.message) || e) }); }

// ui_kits/ebrain/shell.jsx
try { (() => {
// ebrain UI kit — shell (StatusBar/TabBar/HintBar/Footer chrome) + primitives glue.
const {
  Wordmark,
  StatusBar,
  StatusSep,
  TabBar,
  HintBar,
  Footer,
  Badge,
  Gauge,
  Spinner,
  Toast,
  Panel,
  TerminalPeek,
  Table,
  ScrollList,
  SessionCard,
  PromptBox,
  ConfirmDialog,
  CommandPalette,
  RememberForm,
  KeyHint
} = window.EbrainDesignSystem_04bce4;
const COLS = 120,
  ROWS = 32;

// A fixed-grid terminal frame that letterboxes/scales to fit its host.
function TermFrame({
  children,
  cols = COLS,
  rows = ROWS
}) {
  const ref = React.useRef(null);
  const [scale, setScale] = React.useState(1);
  React.useLayoutEffect(function () {
    function fit() {
      const el = ref.current;
      if (!el) return;
      const host = el.parentElement;
      const w = el.scrollWidth,
        h = el.scrollHeight;
      const s = Math.min(host.clientWidth / w, host.clientHeight / h);
      setScale(s > 0 ? s : 1);
    }
    fit();
    window.addEventListener('resize', fit);
    return function () {
      window.removeEventListener('resize', fit);
    };
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-void)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      width: cols + 'ch',
      height: 'calc(var(--row-h) * ' + rows + ')',
      transform: 'scale(' + scale + ')',
      transformOrigin: 'center center',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-void)',
      color: 'var(--text-1)',
      fontFamily: 'var(--font-mono)',
      fontSize: '15px',
      lineHeight: '1.2',
      overflow: 'hidden',
      fontVariantLigatures: 'none'
    }
  }, children));
}
const TABS = ['home', 'sessions', 'launch', 'memory', 'routing', 'doctor'];

// Full screen scaffold: statusbar + tabbar + content + hintbar + footer.
function Screen({
  tab,
  hints,
  children,
  right
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(StatusBar, {
    style: {
      flex: 'none'
    },
    left: /*#__PURE__*/React.createElement(Wordmark, {
      variant: "compact"
    }),
    right: right || /*#__PURE__*/React.createElement("span", null, "brain ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ok)'
      }
    }, "UP"), /*#__PURE__*/React.createElement(StatusSep, null), "fleet 6/6", /*#__PURE__*/React.createElement(StatusSep, null), "$2.14/$10")
  }), /*#__PURE__*/React.createElement(TabBar, {
    style: {
      flex: 'none'
    },
    tabs: TABS,
    active: TABS.indexOf(tab)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 'none',
      color: 'var(--border-1)',
      whiteSpace: 'pre',
      overflow: 'hidden',
      padding: '0 1ch'
    }
  }, '\u2500'.repeat(COLS)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      overflow: 'hidden',
      padding: 'var(--row-h) 1ch'
    }
  }, children), /*#__PURE__*/React.createElement(HintBar, {
    style: {
      flex: 'none'
    },
    hints: hints,
    right: "ctrl+c salir"
  }), /*#__PURE__*/React.createElement(Footer, {
    style: {
      flex: 'none'
    },
    cwd: "~/code/korvex",
    branch: "main",
    right: "ebrain 0.4.2"
  }));
}
Object.assign(window, {
  TermFrame,
  Screen,
  TABS,
  COLS,
  ROWS,
  Wordmark,
  StatusBar,
  StatusSep,
  TabBar,
  HintBar,
  Footer,
  Badge,
  Gauge,
  Spinner,
  Toast,
  Panel,
  TerminalPeek,
  Table,
  ScrollList,
  SessionCard,
  PromptBox,
  ConfirmDialog,
  CommandPalette,
  RememberForm,
  KeyHint
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/ebrain/shell.jsx", error: String((e && e.message) || e) }); }

__ds_ns.WORDMARK_MATRIX = __ds_scope.WORDMARK_MATRIX;

__ds_ns.Wordmark = __ds_scope.Wordmark;

__ds_ns.Footer = __ds_scope.Footer;

__ds_ns.HintBar = __ds_scope.HintBar;

__ds_ns.KeyHint = __ds_scope.KeyHint;

__ds_ns.StatusBar = __ds_scope.StatusBar;

__ds_ns.StatusSep = __ds_scope.StatusSep;

__ds_ns.TabBar = __ds_scope.TabBar;

__ds_ns.AGENT_COLORS = __ds_scope.AGENT_COLORS;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Gauge = __ds_scope.Gauge;

__ds_ns.Spinner = __ds_scope.Spinner;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.ScrollList = __ds_scope.ScrollList;

__ds_ns.SessionCard = __ds_scope.SessionCard;

__ds_ns.Table = __ds_scope.Table;

__ds_ns.CommandPalette = __ds_scope.CommandPalette;

__ds_ns.ConfirmDialog = __ds_scope.ConfirmDialog;

__ds_ns.PromptBox = __ds_scope.PromptBox;

__ds_ns.RememberForm = __ds_scope.RememberForm;

__ds_ns.Panel = __ds_scope.Panel;

__ds_ns.TerminalPeek = __ds_scope.TerminalPeek;

})();
