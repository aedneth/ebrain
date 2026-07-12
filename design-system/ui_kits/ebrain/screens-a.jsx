// ebrain screens: HOME, SESSIONS, LAUNCH
const SESSIONS = [
  { agent: 'claude', name: 'ebr-claude-korvex', uptime: '02:41', state: 'running', detail: 'sonnet-4 \u00b7 refactor router de modelos' },
  { agent: 'gemini', name: 'ebr-gem-web', uptime: '00:12', state: 'waiting', detail: 'esperando confirmacion frontier' },
  { agent: 'codex', name: 'ebr-codex-tests', uptime: '01:03', state: 'running', detail: 'o4-mini \u00b7 generando specs' },
  { agent: 'opencode', name: 'ebr-oc-docs', uptime: '00:48', state: 'idle', detail: 'qwen-2.5 \u00b7 sin actividad 4m' },
  { agent: 'cursor', name: 'ebr-cursor-ui', uptime: '03:19', state: 'running', detail: 'composer \u00b7 editando Panel.tsx' },
  { agent: 'free', name: 'ebr-free-scratch', uptime: '00:05', state: 'done', detail: 'deepseek \u00b7 completado' },
];

function HomeScreen() {
  return (
    <window.Screen tab="home" hints={[{k:'1-6',label:'vistas'},{k:'/',label:'palette'},{k:'l',label:'launch'},{k:'?',label:'ayuda'}]}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'center', flex: 'none', paddingBottom: 'var(--row-h)' }}>
          <window.Wordmark />
        </div>
        <div style={{ display: 'flex', gap: '2ch', flex: 1, minHeight: 0 }}>
          <window.Panel title="sistema" width="46ch" bg="var(--surface-1)">
            <div style={{ whiteSpace: 'pre' }}>
              <div><span style={{color:'var(--text-3)',display:'inline-block',width:'12ch'}}>brain</span><span style={{color:'var(--ok)',fontWeight:700}}>UP</span><span style={{color:'var(--text-3)'}}>  CKIS \u00b7 128 learnings</span></div>
              <div style={{marginTop:'var(--row-h)'}}><span style={{color:'var(--text-3)',display:'inline-block',width:'12ch'}}>spend hoy</span><window.Gauge value={2.14} max={10} width={16} suffix="$2.14/$10" /></div>
              <div><span style={{color:'var(--text-3)',display:'inline-block',width:'12ch'}}>ram</span><window.Gauge value={3.1} max={4} width={16} suffix="3.1/4G" tone="auto" /></div>
              <div style={{marginTop:'var(--row-h)'}}><span style={{color:'var(--text-3)',display:'inline-block',width:'12ch'}}>fleet</span><span style={{color:'var(--text-1)'}}>6/6 </span><span style={{color:'var(--ok)'}}>online</span></div>
              <div><span style={{color:'var(--text-3)',display:'inline-block',width:'12ch'}}>routing</span><span style={{color:'var(--text-1)'}}>6 caps </span><span style={{color:'var(--text-3)'}}>\u00b7 0 fallbacks</span></div>
            </div>
          </window.Panel>
          <window.Panel title="sesiones activas" focus bg="var(--surface-1)" style={{flex:1,minWidth:0}}>
            {SESSIONS.slice(0,4).map((s,i)=><window.SessionCard key={i} {...s} detail={undefined} selected={i===0} />)}
          </window.Panel>
        </div>
        <div style={{ flex: 'none', paddingTop: 'var(--row-h)' }}>
          <window.Panel title="ultimas memorias" bg="var(--surface-1)">
            {[['deepseek v3 falla con tool-use paralelo; enrutar a claude','0.94','routing'],
              ['korvex usa pnpm, no npm \u2014 nunca sugerir npm install','0.91','korvex'],
              ['frontier siempre requiere confirmacion manual del usuario','0.88','policy']].map((m,i)=>(
              <div key={i} style={{display:'flex',whiteSpace:'pre'}}>
                <span style={{color:'var(--memory)'}}>{'\u25cf '}</span>
                <span style={{color:'var(--text-1)',flex:1,minWidth:0,overflow:'hidden'}}>{m[0]}</span>
                <span style={{color:'var(--memory)',paddingLeft:'2ch'}}>{m[1]}</span>
                <span style={{color:'var(--text-3)',paddingLeft:'2ch',width:'10ch',textAlign:'right'}}>{m[2]}</span>
              </div>
            ))}
          </window.Panel>
        </div>
      </div>
    </window.Screen>
  );
}

function SessionsScreen({ selected = 0, onSelect }) {
  const s = SESSIONS[selected];
  const peekBody = {
    'ebr-claude-korvex': '$ claude --resume korvex\n\u203a analizando src/router/models.ts\n  encontradas 3 funciones a refactorizar:\n  - resolveCap()   \u2713 hecho\n  - pickModel()    \u25b8 en progreso\n  - fallbackChain()  pendiente\n\n> aplicando cambios a pickModel()...\n  + 24 lineas  - 11 lineas',
  };
  return (
    <window.Screen tab="sessions" hints={[{k:'\u2191\u2193',label:'navegar'},{k:'a',label:'attach'},{k:'k',label:'kill'},{k:'p',label:'prompt'}]}>
      <div style={{ display: 'flex', gap: '2ch', height: '100%' }}>
        <window.Panel title="fleet \u00b7 6 sesiones" focus width="46ch" bg="var(--surface-1)">
          <window.ScrollList items={SESSIONS} selected={selected} height={9} onSelect={onSelect}
            renderItem={(it,idx,sel)=>(
              <div style={{whiteSpace:'pre',overflow:'hidden'}}>
                <div style={{display:'flex'}}>
                  <span style={{width:'11ch',flex:'none'}}><window.Badge agent={it.agent} /></span>
                  <span style={{flex:1,minWidth:0,overflow:'hidden',color:sel?'var(--text-1)':'var(--text-2)',fontWeight:sel?700:400}}>{it.name}</span>
                  <span style={{color:'var(--text-3)',paddingLeft:'1ch'}}>{it.uptime}</span>
                </div>
              </div>
            )} />
        </window.Panel>
        <window.TerminalPeek title={'peek \u00b7 ' + s.name} live style={{flex:1,minWidth:0}}>
{(peekBody[s.name] || ('$ ' + s.agent + ' \u2014 ' + s.detail + '\n\u203a sesion ' + s.state + '\n  uptime ' + s.uptime))}
        </window.TerminalPeek>
      </div>
    </window.Screen>
  );
}

const AGENTS8 = ['claude','codex','gemini','opencode','cursor','route','generic','free'];
function LaunchScreen({ agent = 'claude' }) {
  return (
    <window.Screen tab="launch" hints={[{k:'tab',label:'agente'},{k:'c',label:'contexto'},{k:'enter',label:'lanzar'}]}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--row-h)', height: '100%' }}>
        <window.PromptBox value="refactor completo del router de modelos: extraer fallbackChain a su propio modulo con tests" rows={2} hint="enter lanzar \u00b7 esc cancelar" />
        <div style={{ display: 'flex', gap: '2ch', flex: 1, minHeight: 0 }}>
          <window.Panel title="advisor" focus width="56ch" bg="var(--surface-1)">
            <div style={{whiteSpace:'pre'}}>
              <div><span style={{color:'var(--text-3)',display:'inline-block',width:'12ch'}}>carril</span><span style={{color:'var(--accent)',fontWeight:700}}>coding</span></div>
              <div><span style={{color:'var(--text-3)',display:'inline-block',width:'12ch'}}>modelo</span><span style={{color:'var(--text-1)'}}>claude-sonnet-4</span></div>
              <div><span style={{color:'var(--text-3)',display:'inline-block',width:'12ch'}}>costo est.</span><span style={{color:'var(--text-1)'}}>~$0.38</span></div>
              <div style={{marginTop:'var(--row-h)',color:'var(--text-3)'}}>razon:</div>
              <div style={{color:'var(--text-2)',whiteSpace:'pre-wrap'}}>tarea multi-archivo con tests \u2192 requiere razonamiento de codigo fuerte y ventana amplia.</div>
              <div style={{marginTop:'var(--row-h)',color:'var(--text-3)'}}>alternativas:</div>
              <div style={{color:'var(--text-3)'}}>o4-mini ($0.09) \u00b7 deepseek-v3 ($0.02, tool-use inestable)</div>
              <div style={{marginTop:'var(--row-h)',display:'flex',whiteSpace:'pre'}}>
                <span style={{color:'var(--warn)',fontWeight:700}}>{'! '}</span>
                <span style={{color:'var(--warn)'}}>frontier requiere confirmacion \u2014 nunca auto-escala</span>
              </div>
            </div>
          </window.Panel>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--row-h)' }}>
            <window.Panel title="agente" bg="var(--surface-1)">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'2px 2ch'}}>
                {AGENTS8.map(a=>(
                  <div key={a} style={{background:a===agent?'var(--surface-2)':'transparent',whiteSpace:'pre'}}>
                    <span style={{color:'var(--accent)'}}>{a===agent?'\u25b8 ':'  '}</span><window.Badge agent={a} />
                  </div>
                ))}
              </div>
            </window.Panel>
            <window.Panel title="contexto a inyectar  [\u25be]" bg="var(--surface-1)" style={{flex:1,minHeight:0}}>
              <div style={{whiteSpace:'pre'}}>
                <div><span style={{color:'var(--ok)'}}>{'\u2713 '}</span><span style={{color:'var(--text-2)'}}>norms/korvex.md</span><span style={{color:'var(--text-3)'}}>  2.1k</span></div>
                <div><span style={{color:'var(--memory)'}}>{'\u2713 '}</span><span style={{color:'var(--text-2)'}}>memoria: 8 learnings relevantes</span></div>
                <div><span style={{color:'var(--ok)'}}>{'\u2713 '}</span><span style={{color:'var(--text-2)'}}>mcp: filesystem, git</span></div>
              </div>
            </window.Panel>
          </div>
        </div>
      </div>
    </window.Screen>
  );
}

Object.assign(window, { HomeScreen, SessionsScreen, LaunchScreen, SESSIONS, AGENTS8 });
