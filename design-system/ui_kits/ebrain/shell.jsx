// ebrain UI kit — shell (StatusBar/TabBar/HintBar/Footer chrome) + primitives glue.
const { Wordmark, StatusBar, StatusSep, TabBar, HintBar, Footer, Badge, Gauge, Spinner, Toast,
        Panel, TerminalPeek, Table, ScrollList, SessionCard, PromptBox, ConfirmDialog,
        CommandPalette, RememberForm, KeyHint } = window.EbrainDesignSystem_04bce4;

const COLS = 120, ROWS = 32;

// A fixed-grid terminal frame that letterboxes/scales to fit its host.
function TermFrame({ children, cols = COLS, rows = ROWS }) {
  const ref = React.useRef(null);
  const [scale, setScale] = React.useState(1);
  React.useLayoutEffect(function () {
    function fit() {
      const el = ref.current; if (!el) return;
      const host = el.parentElement;
      const w = el.scrollWidth, h = el.scrollHeight;
      const s = Math.min(host.clientWidth / w, host.clientHeight / h);
      setScale(s > 0 ? s : 1);
    }
    fit();
    window.addEventListener('resize', fit);
    return function () { window.removeEventListener('resize', fit); };
  }, []);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-void)' }}>
      <div ref={ref} style={{
        width: cols + 'ch', height: 'calc(var(--row-h) * ' + rows + ')',
        transform: 'scale(' + scale + ')', transformOrigin: 'center center',
        display: 'flex', flexDirection: 'column', background: 'var(--bg-void)',
        color: 'var(--text-1)', fontFamily: 'var(--font-mono)', fontSize: '15px', lineHeight: '1.2',
        overflow: 'hidden', fontVariantLigatures: 'none',
      }}>
        {children}
      </div>
    </div>
  );
}

const TABS = ['home', 'sessions', 'launch', 'memory', 'routing', 'doctor'];

// Full screen scaffold: statusbar + tabbar + content + hintbar + footer.
function Screen({ tab, hints, children, right }) {
  return (
    <React.Fragment>
      <StatusBar style={{ flex: 'none' }}
        left={<Wordmark variant="compact" />}
        right={right || <span>brain <span style={{ color: 'var(--ok)' }}>UP</span><StatusSep />fleet 6/6<StatusSep />$2.14/$10</span>} />
      <TabBar style={{ flex: 'none' }} tabs={TABS} active={TABS.indexOf(tab)} />
      <div style={{ flex: 'none', color: 'var(--border-1)', whiteSpace: 'pre', overflow: 'hidden', padding: '0 1ch' }}>{'\u2500'.repeat(COLS)}</div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: 'var(--row-h) 1ch' }}>{children}</div>
      <HintBar style={{ flex: 'none' }} hints={hints} right="ctrl+c salir" />
      <Footer style={{ flex: 'none' }} cwd="~/code/korvex" branch="main" right="ebrain 0.4.2" />
    </React.Fragment>
  );
}

Object.assign(window, { TermFrame, Screen, TABS, COLS, ROWS,
  Wordmark, StatusBar, StatusSep, TabBar, HintBar, Footer, Badge, Gauge, Spinner, Toast,
  Panel, TerminalPeek, Table, ScrollList, SessionCard, PromptBox, ConfirmDialog,
  CommandPalette, RememberForm, KeyHint });
