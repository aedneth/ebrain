/**
 * cli/scrub.ts — el scrubber de secretos, primitivo de seguridad ÚNICO y PURO del harness.
 *
 * Fuente de verdad única para redactar secretos de cualquier TEXTO antes de que salga de un
 * proceso ebrain (pane de tmux capturado, snippet de búsqueda federada, cualquier superficie).
 * Módulo sin dependencias (solo regex + String.replace) para que TANTO el CLI (sessions/query)
 * COMO la TUI pura (knowledge/contracts) importen la MISMA lógica sin arrastrar tmux/fs/Bun.
 *
 * Complementa —no reemplaza— a guard-secrets.sh (harness/core), que bloquea COMANDOS lectores de
 * archivos de secretos ANTES de correr. Acá ya no hay comando que bloquear: hay TEXTO YA IMPRESO
 * que hay que redactar. Reusa el mismo vocabulario (key/token/password/.env-value) pero como
 * patrones de FORMA-DE-VALOR, no de nombre-de-archivo. Sesgo fail-safe: sobre-redactar es aceptable,
 * sub-redactar nunca.
 */

// Nombre con forma de secreto. Incluye el sufijo `KEY` genérico (SECRET_KEY / ENCRYPTION_KEY /
// SSH_KEY — env ultra-comunes de Django/Flask/Rails), no solo API_KEY/ACCESS_KEY/PRIVATE_KEY
// (gap cazado en el gate F6.4.8). Sobre-redactar (p.ej. un inocente `KEY=`) es aceptable.
const KEYLIKE_NAME = /((?:[A-Z0-9_]*_)?(?:API[_-]?KEY|ACCESS[_-]?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIAL[S]?|PRIVATE[_-]?KEY|KEY))/i;
// `NOMBRE=valor` o `NOMBRE: valor` (separador `[:=]` únicamente — NO cubre separador por espacio)
// donde NOMBRE matchea forma de secreto — redacta el VALOR, preserva el nombre (depurar sin filtrar).
const KV_SECRET = new RegExp(`(${KEYLIKE_NAME.source})\\s*[:=]\\s*(\\S+)`, "gi");
// Prefijos de proveedor conocidos (Anthropic/OpenAI/OpenRouter/GitHub/AWS/Google/Slack) + Bearer
// tokens genéricos — redacta el token completo dondequiera que aparezca. sk- admite `_-` internos
// (cubre `sk-proj-…`/`sk-svcacct-…` de OpenAI, que rompían el `sk-<alnum>{20,}` en el guion — gate F6.4.8).
const KNOWN_TOKEN_SHAPES = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /sk-or-v1-[A-Za-z0-9]{8,}/g,
  /sk-[A-Za-z0-9][A-Za-z0-9_-]{19,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /xox[baprs]-[0-9A-Za-z-]{10,}/g,
  /Bearer\s+[A-Za-z0-9._-]{15,}/gi,
];
// Bloque PEM de llave privada (RSA/EC/OPENSSH/…). Un pane capturado es una VENTANA: la llave
// puede cruzar cualquiera de sus dos bordes, y redactar solo el marcador dejaba pasar el cuerpo
// base64 entero — 3 de las 4 posiciones posibles fugaban, incluido el caso "header sin END" que
// el marcador suelto decía cubrir. Los tres casos con marcador se cierran por ANCLAJE, sin tocar
// base64 legítimo (JWT, hashes, diffs):
//   · bloque completo  → se redacta el bloque;
//   · BEGIN sin END    → la llave no termina dentro de la ventana: se redacta hasta el final;
//   · END sin BEGIN    → la ventana abrió dentro de la llave: se redacta desde el inicio.
// Residual honesto y documentado: una ventana que contiene SOLO cuerpo, sin ningún marcador, es
// indistinguible de base64 legítimo. Redactarla exigiría una sobre-redacción masiva del output
// real del agente, que es peor trade. Ver docs/TUI-EDGE-CASES.md.
const PEM_BEGIN_LINE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const PEM_END_LINE = /-----END [A-Z0-9 ]*PRIVATE KEY-----/;
// Una línea que es SOLO cuerpo base64, tolerando un prefijo corto de presentación (`+`/`-` de un
// diff, `>` de una cita, indentación). Sin ese prefijo, un `git diff` que agrega una llave fugaba
// el cuerpo entero. El piso de 4 caracteres cubre la última línea corta de un bloque PEM: exigir
// 16 dejaba pasar el resto del cuerpo al caminar hacia atrás desde el END.
const PEM_BODY_LINE = /^[+\->|\s]{0,4}[A-Za-z0-9+/=]{4,}[ \t]*\r?$/;

/**
 * Redacta cuerpo de llave privada por BARRIDO DE LÍNEAS, no por regex sobre todo el texto.
 *
 * La versión con regex era CUADRÁTICA: en cada posición inicial consumía toda la corrida base64
 * siguiente y luego backtrackeaba al no encontrar el marcador. Medido: 200 líneas (el tamaño exacto
 * de la ventana de `capture-pane -S -200`) ≈ 1 s, 400 líneas ≈ 4 s — y la TUI hace peek hasta una
 * vez por segundo. Un scrubber de secretos que se cuelga con la entrada es una negación de servicio
 * en el camino de seguridad.
 *
 * El barrido es O(n) y sin backtracking: se marcan los marcadores y, desde cada uno, se camina
 * sobre las líneas de cuerpo CONTIGUAS. Eso cubre las tres posiciones de ventana con marcador
 * (bloque completo, BEGIN sin END, END sin BEGIN) sin tocar base64 que no sea adyacente a un
 * marcador. Un `-----BEGIN CERTIFICATE-----` es material público y no entra acá.
 */
function redactPrivateKeyLines(text: string): string {
  if (!text.includes("PRIVATE KEY-----")) return text; // salida barata: el caso común no paga nada
  const lines = text.split("\n");
  const drop = new Array<boolean>(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (PEM_BEGIN_LINE.test(lines[i])) {
      drop[i] = true;
      for (let j = i + 1; j < lines.length && PEM_BODY_LINE.test(lines[j]); j++) drop[j] = true;
    }
    if (PEM_END_LINE.test(lines[i])) {
      drop[i] = true;
      for (let j = i - 1; j >= 0 && PEM_BODY_LINE.test(lines[j]); j--) drop[j] = true;
    }
  }
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!drop[i]) { out.push(lines[i]); continue; }
    if (i === 0 || !drop[i - 1]) out.push("[REDACTED PRIVATE KEY]"); // una marca por bloque contiguo
  }
  return out.join("\n");
}

export function scrubSecrets(text: string): string {
  // El barrido de llaves privadas exige ADYACENCIA física a un marcador, así que base64 suelto
  // nunca se toca. Eso no es cosmético: `scrubSecrets(text) !== text` se usa como VALIDADOR de
  // entrada en episodes.ts y context.ts, de modo que una regla base64 general no solo arruinaría
  // `peek` — empezaría a rechazar texto legítimo.
  let out = redactPrivateKeyLines(text);
  out = out.replace(KV_SECRET, (_m, name: string) => `${name}=[REDACTED]`);
  for (const re of KNOWN_TOKEN_SHAPES) out = out.replace(re, "[REDACTED]");
  return out;
}
