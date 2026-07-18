import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DOCS_ROOT = fileURLToPath(new URL("../../../docs/", import.meta.url));
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const REPOSITORY_URL = "https://github.com/aedneth/ebrain";
const ROOT_PUBLIC_FILES = new Set(["LICENSE", "CONTRIBUTING.md", "SECURITY.md", "THIRD_PARTY_NOTICES.md"]);

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  if (Array.isArray(node.children)) for (const child of node.children) walk(child, visit);
}

function splitHash(url) {
  const hashIndex = url.indexOf("#");
  return hashIndex === -1 ? [url, ""] : [url.slice(0, hashIndex), url.slice(hashIndex)];
}

function routeFor(sourcePath, url) {
  if (!url || /^(?:https?:|mailto:|tel:|#)/.test(url)) return url;
  const [pathname, hash] = splitHash(url);
  const target = resolve(sourcePath, pathname);
  const docsRelative = relative(DOCS_ROOT, target);
  if (docsRelative && !docsRelative.startsWith(`..${sep}`) && docsRelative.endsWith(".md")) {
    if (docsRelative === "PUBLIC-DOCUMENTATION.md") return `/docs/${hash}`;
    return `/docs/${docsRelative.slice(0, -3)}/${hash}`;
  }
  const rootRelative = relative(REPOSITORY_ROOT, target);
  if (ROOT_PUBLIC_FILES.has(rootRelative)) return `${REPOSITORY_URL}/blob/main/${rootRelative}${hash}`;
  return url;
}

export function rewritePublicLinks() {
  return (tree, file) => {
    const sourcePath = file.path ? resolve(file.path, "..") : DOCS_ROOT;
    walk(tree, (node) => {
      if (node.type === "link" && typeof node.url === "string") node.url = routeFor(sourcePath, node.url);
    });
  };
}
