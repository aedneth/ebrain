import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { ORDERED_DOCS } from "../src/lib/navigation.ts";

const WEBSITE = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(WEBSITE, "dist");
const HTML_LINK = /(?:href|src)="([^"]+)"/g;
const FORBIDDEN = /(?:\/home\/|~\/\.config|\.env(?:\b|\*)|(?:API|TOKEN|SECRET|PASSWORD)_[A-Z0-9_]+\s*=|sk-[A-Za-z0-9]{16,}|HANDOFF|SPRINT-|AUDIT-|F10\.0-|pop-os)/;
// The /demo page ships real captured frames; it must stay persona-neutral. Author names are fine in
// the site's own attribution (footer, links) but must never appear inside the sanitized demo capture.
const DEMO_IDENTITY = /Eduardo|Borjas/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function targetExists(target: string): boolean {
  const pathname = target.split("#", 1)[0] ?? "";
  if (!pathname || /^(?:https?:|mailto:|tel:|#)/.test(pathname)) return true;
  const output = normalize(join(DIST, pathname.replace(/^\//, "")));
  return existsSync(output) || existsSync(join(output, "index.html"));
}

if (!existsSync(DIST)) throw new Error("website build output missing");
for (const doc of ORDERED_DOCS) {
  const page = join(DIST, "docs", doc.id, "index.html");
  if (!existsSync(page)) throw new Error(`missing static page: ${doc.id}`);
}
for (const asset of ["assets/ebrain-wordmark.svg", "assets/ebrain-tui-demo.svg", "icons/github.svg", "icons/x.svg", "icons/search.svg", "demo/index.html"]) {
  if (!existsSync(join(DIST, asset))) throw new Error(`missing static asset: ${asset}`);
}
const demoHtml = join(DIST, "demo", "index.html");
if (existsSync(demoHtml) && DEMO_IDENTITY.test(readFileSync(demoHtml, "utf8"))) {
  throw new Error("demo/index.html must stay persona-neutral (real author name found)");
}
for (const file of walk(DIST).filter((path) => path.endsWith(".html") || path.endsWith(".json"))) {
  const text = readFileSync(file, "utf8");
  if (FORBIDDEN.test(text)) throw new Error(`forbidden public pattern in ${file}`);
  if (!file.endsWith(".html")) continue;
  for (const match of text.matchAll(HTML_LINK)) {
    const target = match[1] ?? "";
    if (!targetExists(target)) throw new Error(`broken output link in ${file}: ${target}`);
    if (!/^(?:https?:|mailto:|tel:|#)/.test(target) && target.includes(".md")) throw new Error(`unrewritten Markdown link in ${file}: ${target}`);
  }
}

console.log(`website verification passed for ${ORDERED_DOCS.length} documentation pages`);
