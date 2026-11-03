/**
 * Registro de motores por nombre, para el runner de casos y el de tareas. Las rutas de los sandboxes salen de
 * banderas (--qmd-index, --sandbox …) para que el código no traiga rutas de ninguna máquina.
 */
import { motorComando, motorGbrainDaemon, motorMcpStdio, motorQmd, type Motor } from "./motores.ts";

type Arg = (flag: string, def?: string) => string | undefined;

export const MOTORES = ["qmd-search", "qmd-query", "gbrain-daemon-search", "gbrain-daemon-query"] as const;

export function crearMotor(nombre: string, arg: Arg): Motor {
  const coleccion = arg("--coleccion", "korvex")!;
  const index = arg("--qmd-index");
  const configDir = arg("--qmd-config");
  switch (nombre) {
    case "qmd":
    case "qmd-search":
      return motorQmd({ coleccion, index, modo: "search", configDir });
    case "qmd-query":
      return motorQmd({ coleccion, index, modo: "query", configDir, sinRerank: arg("--sin-rerank") === "1" });
    case "gbrain-daemon-search":
    case "gbrain-search":
      return motorGbrainDaemon("search", arg("--fuente", "company-brain")!);
    case "gbrain-daemon-query":
    case "gbrain-query":
      return motorGbrainDaemon("query", arg("--fuente", "company-brain")!);
    default:
      return crearMotorExterno(nombre, arg);
  }
}

/** Llaves de proveedores que ningún motor de sandbox hereda: nada sale de la laptop. */
export const LLAVES = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "ZEROENTROPY_API_KEY", "VOYAGE_API_KEY",
  "GROQ_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "DEEPSEEK_API_KEY", "MISTRAL_API_KEY", "COHERE_API_KEY"];

/** Motores de los sandboxes de E2. `--sandbox <dir>` es la carpeta donde viven sus instalaciones. */
function crearMotorExterno(nombre: string, arg: Arg): Motor {
  const sandbox = arg("--sandbox");
  if (nombre.startsWith("gbrain060-")) {
    if (!sandbox) throw new Error("gbrain060 necesita --sandbox");
    const herramienta = nombre === "gbrain060-search" ? "search" : "query";
    const fuente = arg("--fuente", "korvex-con")!;
    const home = arg("--gbrain-home", `${sandbox}/gbrain-home`)!;
    // El híbrido embebe cada consulta con OpenAI: solo ese motor recibe OPENAI_API_KEY (del entorno de la corrida,
    // nunca de un archivo de configuración). Las demás llaves nunca pasan.
    const hibrido = herramienta === "query";
    return motorMcpStdio({
      nombre: `${nombre}:${fuente}`,
      pagado: hibrido,
      cmd: [`${sandbox}/bun-1.4.4/bun-linux-x64/bun`, "run", `${sandbox}/gbrain-0.60/src/cli.ts`, "serve", "--surface", "full", "--access", "read-only"],
      cwd: `${sandbox}/gbrain-0.60`,
      env: { GBRAIN_HOME: home, DO_NOT_TRACK: "1" },
      quitar: hibrido ? LLAVES.filter((k) => k !== "OPENAI_API_KEY") : LLAVES,
      herramienta,
      argumentos: (q, pool) => ({ query: q, limit: pool, source_id: fuente, ...(herramienta === "query" ? { expand: false } : {}) }),
      mapa: (v) => (Array.isArray(v) ? v : []).map((f: any) => ({ ruta: String(f.slug ?? ""), fragmento: String(f.chunk_text ?? "") })),
    });
  }
  if (nombre.startsWith("olympus")) {
    // olympus = kb_search por defecto (reranker por estado); olympus-in-force = in_force=True (excluye lo no vigente).
    if (!sandbox) throw new Error("olympus necesita --sandbox");
    const corpus = arg("--corpus", `${sandbox}/corpus-do`)!;
    const db = arg("--db", `${sandbox}/olympus/indices/${corpus.split("/").pop()}.db`)!;
    const driver = new URL("./olympus_driver.py", import.meta.url).pathname;
    return motorMcpStdio({
      nombre: `${nombre}:${corpus.split("/").pop()}`,
      cmd: [`${sandbox}/olympus/tools/data-olympus/bin/python`, "-I", driver, corpus, db, ...(nombre === "olympus-in-force" ? ["--in-force"] : [])],
      quitar: LLAVES,
      env: { KB_DISABLE_VERSION_CHECK: "1", KB_EMBEDDINGS_MODE: "off" },
      herramienta: "kb_search",
      argumentos: (q, pool) => ({ query: q, limit: pool }),
      mapa: (v) => (Array.isArray(v) ? v : []).map((f: any) => ({ ruta: String(f.path ?? ""), fragmento: String(f.snippet ?? "") })),
      timeoutMs: 900_000,
    });
  }
  if (nombre === "engram") {
    if (!sandbox) throw new Error("engram necesita --sandbox");
    const datos = arg("--datos", `${sandbox}/engram-datos/con`)!;
    return motorMcpStdio({
      nombre: `engram:${datos.split("/").pop()}`,
      cmd: [`${sandbox}/engram-3.6.0/engram`, "mcp", "--tools=agent", "--project", "korvex"],
      cwd: sandbox,
      quitar: LLAVES,
      env: { ENGRAM_DATA_DIR: datos },
      herramienta: "mem_search",
      argumentos: (q, pool) => ({ query: q, limit: pool, project: "korvex" }),
      mapa: (v) => mapaEngram(v),
    });
  }
  throw new Error(`motor desconocido: ${nombre} (conocidos: ${MOTORES.join(", ")}, gbrain060-search, gbrain060-query, olympus, olympus-in-force, engram)`);
}

/** Texto que identifica en /proc los procesos residentes de un motor, para medir su RAM. */
export function marcaDeProceso(nombre: string): string | null {
  if (nombre.startsWith("gbrain-daemon") || nombre.startsWith("gbrain-search") || nombre.startsWith("gbrain-query")) return "vendor/gbrain/src/cli.ts";
  if (nombre.startsWith("gbrain060-")) return "gbrain-0.60/src/cli.ts";
  if (nombre.startsWith("olympus")) return "data-olympus";
  if (nombre.startsWith("engram")) return "engram-3.6.0/engram";
  return null;
}

export { motorComando };

/** engram devuelve texto: «[n] #id (tipo) — título» y debajo el contenido recortado. El título es la ruta. */
export function mapaEngram(v: unknown): { ruta: string; fragmento: string }[] {
  // v3.6 por MCP devuelve {results: [...], result: "<texto>"}; el texto trae la ruta (título) y el fragmento.
  const texto = typeof v === "string" ? v : typeof (v as any)?.result === "string" ? (v as any).result : JSON.stringify(v ?? "");
  const out: { ruta: string; fragmento: string }[] = [];
  const lineas = texto.split("\n");
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(/^\[\d+\]\s+#\d+\s+\([^)]*\)\s+[—-]\s+(.+?)\s*$/);
    if (!m) continue;
    const cuerpo: string[] = [];
    for (let j = i + 1; j < lineas.length && !/^\[\d+\]\s+#\d+/.test(lineas[j]); j++) cuerpo.push(lineas[j]);
    out.push({ ruta: m[1], fragmento: cuerpo.join("\n").trim() });
  }
  return out;
}
