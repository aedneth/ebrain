// ebrain screens: MEMORY, ROUTING, DOCTOR
function MemoryScreen() {
  const results = [
    ['deepseek v3 falla con tool-use paralelo; enrutar a claude', '0.94', 'session-log 04-12'],
    ['korvex usa pnpm, no npm \u2014 nunca sugerir npm install', '0.91', 'norms/korvex'],
    ['router: fallbackChain debe ser puro, sin side-effects', '0.87', 'session-log 04-09'],
    ['frontier siempre requiere confirmacion manual', '0.85', 'policy'],
  ];
  const logs = [
    ['04-12 14:32', 'claude', 'refactor router'],
    ['04-12 11:08', 'codex', 'specs de tests'],
    ['04-11 18:44', 'gemini', 'research MCP'],
    ['04-11 09:20', 'cursor', 'ui Panel'],
    ['04-10 16:03', 'opencode', 'docs pnpm'],
  ];
  return (
    <window.Screen tab="memory" hints={[{k:'\u2191\u2193',label:'resultados'},{k:'r',label:'remember'},{k:'enter',label:'abrir'}]}
      right={<span>CKIS <span style={{color:'var(--memory)'}}>128</span> learnings<window.StatusSep />embeddings ok</span>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--row-h)', height: '100%' }}>
        <window.PromptBox focus={false} value="por que falla deepseek con tools" hint="busqueda semantica" />
        <div style={{ display: 'flex', gap: '2ch', flex: 1, minHeight: 0 }}>
          <window.Panel title="resultados  \u00b7 violeta = memoria" focus bg="var(--surface-1)" style={{flex:1,minWidth:0}}>
            {results.map((r,i)=>(
              <div key={i} style={{whiteSpace:'pre',overflow:'hidden',marginBottom:'2px',background:i===0?'var(--surface-2)':'transparent'}}>
                <div style={{display:'flex'}}>
                  <span style={{color:'var(--memory)',width:'2ch',flex:'none'}}>{'\u25cf'}</span>
                  <span style={{color:i===0?'var(--text-1)':'var(--text-2)',flex:1,minWidth:0,overflow:'hidden'}}>{r[0]}</span>
                  <span style={{color:'var(--memory)',fontWeight:700,paddingLeft:'2ch'}}>{r[1]}</span>
                </div>
                <div style={{color:'var(--text-3)',paddingLeft:'2ch'}}>{r[2]}</div>
              </div>
            ))}
          </window.Panel>
          <window.Panel title="session-logs" width="34ch" bg="var(--surface-1)">
            {logs.map((l,i)=>(
              <div key={i} style={{whiteSpace:'pre',overflow:'hidden'}}>
                <div><span style={{color:'var(--text-3)'}}>{l[0]}</span></div>
                <div style={{paddingLeft:'1ch'}}><window.Badge agent={l[1]} label={l[2]} /></div>
              </div>
            ))}
          </window.Panel>
        </div>
        <window.RememberForm rows={2} value="deepseek v3 falla con tool-use paralelo; enrutar a claude para tareas con >2 tools" tags="routing, deepseek" />
      </div>
    </window.Screen>
  );
}

function RoutingScreen() {
  const caps = [
    ['coding', 3.9, 5, 'claude-sonnet-4'],
    ['agentic', 1.2, 3, 'gpt-4o'],
    ['web', 0.4, 2, 'gemini-flash'],
    ['long-context', 2.1, 4, 'gemini-1.5-pro'],
    ['terminal', 0.1, 1, 'qwen-2.5'],
    ['general', 0.6, 2, 'deepseek-v3'],
  ];
  return (
    <window.Screen tab="routing" hints={[{k:'\u2191\u2193',label:'caps'},{k:'e',label:'editar cadena'},{k:'enter',label:'detalle'}]}
      right={<span>spend <span style={{color:'var(--warn)'}}>$2.14</span>/$10<window.StatusSep />6 caps</span>}>
      <div style={{ display: 'flex', gap: '2ch', height: '100%' }}>
        <window.Panel title="caps \u00b7 gasto por carril" focus width="60ch" bg="var(--surface-1)">
          {caps.map((c,i)=>(
            <div key={i} style={{whiteSpace:'pre',display:'flex',marginBottom:'2px'}}>
              <span style={{color:'var(--text-2)',width:'15ch',flex:'none'}}>{c[0]}</span>
              <window.Gauge value={c[1]} max={c[2]} width={18} tone="auto" />
              <span style={{color:'var(--text-3)',paddingLeft:'2ch'}}>{'$'+c[1].toFixed(1)}</span>
            </div>
          ))}
          <div style={{marginTop:'var(--row-h)',color:'var(--text-3)',whiteSpace:'pre'}}>total hoy  <span style={{color:'var(--warn)'}}>$2.14</span> / $10.00</div>
        </window.Panel>
        <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:'var(--row-h)'}}>
          <window.Panel title="cadena \u00b7 coding" bg="var(--surface-1)">
            <div style={{whiteSpace:'pre'}}>
              <div><span style={{color:'var(--accent)',fontWeight:700}}>claude-sonnet-4</span><span style={{color:'var(--text-3)'}}>  ganador</span></div>
              <div style={{color:'var(--text-3)'}}>{'  \u2193 fallback'}</div>
              <div><span style={{color:'var(--text-1)'}}>o4-mini</span><span style={{color:'var(--text-3)'}}>  si 429 / timeout</span></div>
              <div style={{color:'var(--text-3)'}}>{'  \u2193 floor'}</div>
              <div><span style={{color:'var(--text-2)'}}>deepseek-v3</span><span style={{color:'var(--text-3)'}}>  ultimo recurso</span></div>
            </div>
          </window.Panel>
          <window.Panel title="ledger reciente" bg="var(--surface-1)" style={{flex:1,minHeight:0}}>
            <window.Table
              columns={[{key:'h',label:'hora',width:7},{key:'a',label:'agente',width:12},{key:'c',label:'cap'},{key:'$',label:'costo',width:7,align:'right'}]}
              rows={[
                {h:'14:32',a:<window.Badge agent="claude"/>,c:'coding',$:'$0.42'},
                {h:'14:28',a:<window.Badge agent="gemini"/>,c:'web',$:'$0.03'},
                {h:'14:19',a:<window.Badge agent="route"/>,c:'agentic',$:'$0.11'},
                {h:'14:02',a:<window.Badge agent="codex"/>,c:'coding',$:'$0.09'},
              ]} />
          </window.Panel>
        </div>
      </div>
    </window.Screen>
  );
}

function DoctorScreen({ running = false }) {
  const checks = [
    ['ok','tmux server','5 sesiones activas'],
    ['ok','CKIS / embeddings','128 learnings, index fresco'],
    ['ok','anthropic api','claude-sonnet-4 alcanzable'],
    ['warn','openai api','latencia alta 2.4s'],
    ['ok','google api','gemini ok'],
    ['fail','deepseek api','tool-use paralelo inestable'],
    ['ok','mcp: filesystem','montado'],
    ['ok','mcp: git','montado'],
  ];
  const TONE = { ok:['var(--ok)','\u2713'], warn:['var(--warn)','!'], fail:['var(--error)','\u2717'] };
  const AG = [['claude','online'],['codex','online'],['gemini','online'],['opencode','online'],['cursor','online'],['free','online']];
  return (
    <window.Screen tab="doctor" hints={[{k:'r',label:'re-run'},{k:'\u2191\u2193',label:'checks'},{k:'enter',label:'detalle'}]}>
      <div style={{ display: 'flex', gap: '2ch', height: '100%' }}>
        <window.Panel title={running ? 'diagnostico' : 'diagnostico \u00b7 ultimo 14:31'} focus style={{flex:1,minWidth:0}} bg="var(--surface-1)">
          {running && <div style={{marginBottom:'var(--row-h)'}}><window.Spinner label="re-ejecutando checks..." /></div>}
          {checks.map((c,i)=>{
            const t = TONE[c[0]];
            return (
              <div key={i} style={{whiteSpace:'pre',display:'flex'}}>
                <span style={{color:t[0],fontWeight:700,width:'3ch',flex:'none'}}>{t[1]}</span>
                <span style={{color:'var(--text-1)',width:'22ch',flex:'none',overflow:'hidden'}}>{c[1]}</span>
                <span style={{color:'var(--text-3)',flex:1,minWidth:0,overflow:'hidden'}}>{c[2]}</span>
              </div>
            );
          })}
        </window.Panel>
        <window.Panel title="fleet 6/6" width="34ch" bg="var(--surface-1)">
          {AG.map((a,i)=>(
            <div key={i} style={{whiteSpace:'pre',display:'flex'}}>
              <span style={{flex:1,minWidth:0}}><window.Badge agent={a[0]} /></span>
              <span style={{color:'var(--ok)'}}>{a[1]}</span>
            </div>
          ))}
          <div style={{marginTop:'var(--row-h)',color:'var(--text-3)',whiteSpace:'pre'}}>1 warn \u00b7 1 fail<br/>ver deepseek \u2192 routing</div>
        </window.Panel>
      </div>
    </window.Screen>
  );
}

Object.assign(window, { MemoryScreen, RoutingScreen, DoctorScreen });
