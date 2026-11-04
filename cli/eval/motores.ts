/**
 * Motores de recuperación para la regresión (E1/E2). Cada motor devuelve los resultados en el orden en que los
 * entrega, con la ruta tal como la nombra y el texto que inyectaría (fragmento o chunk). La comparación con el árbol
 * del brain se hace fuera, normalizando la ruta (casos.ts: normalizar).
 *
 * Los motores de línea de comando se lanzan una vez por consulta y su pico de RAM sale de resourceUsage. Ninguno
 * imprime credenciales: los que necesitan una la leen de su propio entorno o configuración.
 */
import { readdirSync, readFileSync } from "node:fs";

export type Resultado = { ruta: string; fragmento: string };
export type Respuesta = { resultados: Resultado[]; bytesCrudos: number; maxRssKB?: number };
export type Motor = {
  nombre: string;
  pagado: boolean;
  buscar: (consulta: string, pool: number) => Promise<Respuesta>;
};

function correr(cmd: string[], env?: Record<string, string>, timeoutMs = 120_000) {
  const p = Bun.spawnSync(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...(process.env as Record<string, string>), ...(env ?? {}) },
    timeout: timeoutMs,
  });
  const maxRssKB = (p as { resourceUsage?: { maxRSS?: number } }).resourceUsage?.maxRSS;
  if (p.exitCode !== 0) {
    const err = p.stderr.toString().split("\n").filter(Boolean).slice(-2).join(" | ").slice(0, 300);
    throw new Error(`${cmd[0]} salió con ${p.exitCode}: ${err}`);
  }
  return { salida: p.stdout.toString(), maxRssKB };
}

/** qmd `search` (BM25) o `query` (híbrido local: expansión + BM25 + vectores [+ reranker]). */
export function motorQmd(opts: { coleccion: string; index?: string; modo: "search" | "query"; sinRerank?: boolean; configDir?: string; primaria?: string }): Motor {
  // coleccion "*" = todas las colecciones del índice. La primaria (por defecto la colección pedida, o «korvex»)
  // conserva su ruta; las demás quedan como «<colección>/<ruta>» para no chocar con las rutas del corpus principal.
  const primaria = opts.primaria ?? (opts.coleccion === "*" ? "korvex" : opts.coleccion);
  const ruta = (file: string) => {
    const m = file.match(/^qmd:\/\/([^/]+)\/(.*)$/);
    if (!m) return file;
    return m[1] === primaria ? m[2] : `${m[1]}/${m[2]}`;
  };
  const base = ["qmd", ...(opts.index ? ["--index", opts.index] : [])];
  return {
    nombre: `qmd-${opts.modo}${opts.sinRerank ? "-sin-rerank" : ""}:${opts.index ?? "index"}/${opts.coleccion}`,
    pagado: false,
    async buscar(consulta, pool) {
      const extra = opts.modo === "query" && opts.sinRerank ? ["--no-rerank"] : [];
      const { salida, maxRssKB } = correr(
        [...base, opts.modo, consulta, ...(opts.coleccion === "*" ? [] : ["-c", opts.coleccion]), "-n", String(pool), "--json", ...extra],
        opts.configDir ? { QMD_CONFIG_DIR: opts.configDir } : undefined,
        600_000,
      );
      const i = salida.indexOf("[");
      const filas = i >= 0 ? (JSON.parse(salida.slice(i)) as Array<Record<string, unknown>>) : [];
      return {
        resultados: filas.map((f) => ({ ruta: ruta(String(f.file ?? "")), fragmento: String(f.snippet ?? "") })),
        bytesCrudos: Buffer.byteLength(salida, "utf8"),
        maxRssKB,
      };
    },
  };
}

/** GBrain por el daemon de eBrain (MCP). Solo para la línea base de v0.42. */
export function motorGbrainDaemon(herramienta: "search" | "query", fuente: string, primaria = "korvex"): Motor {
  return {
    nombre: `gbrain-daemon-${herramienta}:${fuente}`,
    pagado: herramienta === "query",
    async buscar(consulta, pool) {
      const { callTool } = await import("../remote-tools.ts");
      const args: Record<string, unknown> = { query: consulta, limit: pool, ...(fuente === "*" ? {} : { source_id: fuente }) };
      if (herramienta === "query") args.expand = false;
      const filas = await callTool<unknown>(herramienta, args, 30_000);
      const lista = Array.isArray(filas) ? (filas as Array<Record<string, unknown>>) : [];
      return {
        resultados: lista.map((f) => {
          const sid = String(f.source_id ?? "");
          const slug = String(f.slug ?? "");
          return { ruta: fuente !== "*" || !sid || sid === primaria ? slug : `${sid}/${slug}`, fragmento: String(f.chunk_text ?? "") };
        }),
        bytesCrudos: Buffer.byteLength(JSON.stringify(filas ?? null), "utf8"),
      };
    },
  };
}

/** Un motor externo que responde JSON por stdout: `cmd ... <consulta>`; `mapa` convierte su salida en resultados. */
export function motorComando(opts: {
  nombre: string;
  cmd: (consulta: string, pool: number) => string[];
  env?: Record<string, string>;
  mapa: (salida: string) => Resultado[];
  pagado?: boolean;
}): Motor {
  return {
    nombre: opts.nombre,
    pagado: opts.pagado ?? false,
    async buscar(consulta, pool) {
      const { salida, maxRssKB } = correr(opts.cmd(consulta, pool), opts.env, 600_000);
      return { resultados: opts.mapa(salida), bytesCrudos: Buffer.byteLength(salida, "utf8"), maxRssKB };
    },
  };
}

/**
 * Un servidor MCP por stdio, vivo durante toda la corrida (así lo usan los agentes): se lanza una vez, se hace el
 * `initialize` y cada consulta es un `tools/call`. `mapa` recibe el resultado ya desempaquetado (el texto del primer
 * bloque, parseado como JSON si se puede) y lo convierte en resultados. `cerrar()` detiene el proceso.
 */
export function motorMcpStdio(opts: {
  nombre: string;
  cmd: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** Variables que el servidor NO debe heredar (p. ej. llaves de proveedores: nada sale de la laptop). */
  quitar?: string[];
  herramienta: string;
  argumentos: (consulta: string, pool: number) => Record<string, unknown>;
  mapa: (valor: unknown) => Resultado[];
  pagado?: boolean;
  timeoutMs?: number;
}): Motor & { cerrar: () => void; pid: () => number | undefined } {
  let proc: ReturnType<typeof Bun.spawn> | null = null;
  let buffer = "";
  let id = 0;
  const pendientes = new Map<number, (v: any) => void>();
  const decoder = new TextDecoder();

  async function leer(stream: ReadableStream<Uint8Array>) {
    for await (const trozo of stream) {
      buffer += decoder.decode(trozo, { stream: true });
      let i: number;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const linea = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!linea.startsWith("{")) continue;
        try {
          const msg = JSON.parse(linea);
          if (typeof msg.id === "number" && pendientes.has(msg.id)) {
            pendientes.get(msg.id)!(msg);
            pendientes.delete(msg.id);
          }
        } catch {
          /* línea que no es JSON-RPC */
        }
      }
    }
  }
  function enviar(method: string, params: unknown, notificacion = false): Promise<any> {
    const msg: Record<string, unknown> = { jsonrpc: "2.0", method, params };
    if (notificacion) {
      (proc!.stdin as any).write(JSON.stringify(msg) + "\n");
      return Promise.resolve(null);
    }
    const n = ++id;
    msg.id = n;
    const p = new Promise((resolve, reject) => {
      const t = setTimeout(() => { pendientes.delete(n); reject(new Error(`${opts.nombre}: ${method} sin respuesta`)); }, opts.timeoutMs ?? 120_000);
      pendientes.set(n, (v) => { clearTimeout(t); resolve(v); });
    });
    (proc!.stdin as any).write(JSON.stringify(msg) + "\n");
    (proc!.stdin as any).flush?.();
    return p;
  }
  async function arrancar() {
    proc = Bun.spawn(opts.cmd, {
      cwd: opts.cwd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
      env: (() => {
        const e: Record<string, string> = { ...(process.env as Record<string, string>), ...(opts.env ?? {}) };
        for (const k of opts.quitar ?? []) delete e[k];
        return e;
      })(),
    });
    void leer(proc.stdout as ReadableStream<Uint8Array>);
    const r = await enviar("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "ebrain-eval", version: "1" } });
    if (r?.error) throw new Error(`${opts.nombre}: initialize: ${JSON.stringify(r.error).slice(0, 200)}`);
    await enviar("notifications/initialized", {}, true);
  }
  return {
    nombre: opts.nombre,
    pagado: opts.pagado ?? false,
    async buscar(consulta, pool) {
      if (!proc) await arrancar();
      const r = await enviar("tools/call", { name: opts.herramienta, arguments: opts.argumentos(consulta, pool) });
      if (r?.error) throw new Error(`${opts.nombre}: ${JSON.stringify(r.error).slice(0, 200)}`);
      const bloques = (r?.result?.content ?? []) as Array<{ type: string; text?: string }>;
      const texto = bloques.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
      // Algunos servidores mandan varios bloques de texto (los resultados y avisos aparte): vale el primero que es JSON.
      let valor: unknown = r?.result?.structuredContent ?? texto;
      if (valor === texto) {
        for (const b of bloques) {
          if (b.type !== "text") continue;
          try { valor = JSON.parse(b.text ?? ""); break; } catch { /* bloque de texto plano */ }
        }
      }
      if (r?.result?.isError) throw new Error(`${opts.nombre}: la herramienta devolvió error: ${texto.slice(0, 200)}`);
      return { resultados: opts.mapa(valor), bytesCrudos: Buffer.byteLength(texto, "utf8") };
    },
    cerrar() { try { proc?.kill(); } catch { /* ya terminó */ } proc = null; },
    pid() { return proc?.pid; },
  };
}

/** RAM (residente + swap) de los procesos cuyo cmdline contiene `marca`, leída de /proc. Solo lectura. */
export function memoriaProcesosKB(marca: string): number | null {
  let total = 0;
  let visto = false;
  for (const pid of readdirSync("/proc").filter((d) => /^\d+$/.test(d))) {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8");
      if (!cmd.includes(marca)) continue;
      const st = readFileSync(`/proc/${pid}/status`, "utf8");
      for (const k of ["VmRSS", "VmSwap"]) total += Number(st.match(new RegExp(`${k}:\\s+(\\d+)`))?.[1] ?? 0);
      visto = true;
    } catch {
      /* proceso que terminó entre readdir y read */
    }
  }
  return visto ? total : null;
}
