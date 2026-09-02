#!/usr/bin/env bun
// manifest-get.ts <archivo.yaml> <clave.punteada> — imprime el valor del manifest de un adapter.
// Objetos/arrays → JSON (para parsear con jq en install.sh). Ausente → exit 1. Bun.YAML nativo.
const [file, key] = Bun.argv.slice(2);
if (!file || !key) { console.error("uso: manifest-get.ts <archivo> <clave>"); process.exit(2); }
let doc: any;
try { doc = Bun.YAML.parse(await Bun.file(file).text()); } catch { process.exit(1); }
let v: any = doc;
for (const k of key.split(".")) { if (v == null) break; v = v[k]; }
if (v == null) process.exit(1);
console.log(typeof v === "object" ? JSON.stringify(v) : String(v));
