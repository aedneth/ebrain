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
// Bloque PEM de llave privada (RSA/EC/OPENSSH/…) — redacta entero, o el header suelto si el pane
// cortó el bloque antes del END (gate F6.4.8: un `.pen`/`.key` volcado al pane fugaba sin esto).
const PEM_BLOCK = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
const PEM_HEADER = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g;

export function scrubSecrets(text: string): string {
  let out = text.replace(PEM_BLOCK, "[REDACTED PRIVATE KEY]");
  out = out.replace(PEM_HEADER, "[REDACTED PRIVATE KEY]"); // header sin END en la ventana capturada
  out = out.replace(KV_SECRET, (_m, name: string) => `${name}=[REDACTED]`);
  for (const re of KNOWN_TOKEN_SHAPES) out = out.replace(re, "[REDACTED]");
  return out;
}
