"""Driver de evaluación para Data Olympus: arma la MISMA pila de búsqueda que su servidor (data_olympus.server:
Index + expansores de sinónimos y co-ocurrencia + reranker por estado + atajo por id/etiqueta) sobre un corpus local,
sin servidor HTTP, sin lazo de git pull y sin embeddings, y responde un JSON-RPC mínimo por stdio
(initialize / tools/call kb_search) para que el runner lo trate como cualquier servidor MCP.

Uso: python -I olympus_driver.py <corpus> <indice.db> [--in-force]
  --in-force: kb_search con in_force=True (excluye lo superseded/deprecated/expirado ANTES de rankear).
Se ejecuta con el intérprete del entorno de la herramienta (uv tool), nunca con el del sistema.
"""
import json
import sys
import time
from pathlib import Path

from data_olympus.cooccurrence import DEFAULT_MAX_TERMS, compose_expanders, cooccurrence_enabled
from data_olympus.index import Index, make_status_reranker
from data_olympus.query_expansion import default_query_expander
from data_olympus.search_shortcut import make_id_tag_reranker
from data_olympus.tools_read import kb_search_fn


def construir(corpus: Path, db: Path) -> tuple[Index, dict]:
    idx = Index(db)
    info: dict = {}
    if db.exists():
        # El índice ya se construyó en una corrida anterior sobre el mismo corpus: se reutiliza (la medición es de
        # búsqueda, no de construcción; el tiempo de construcción se reporta aparte).
        info["reutilizado"] = True
    else:
        t0 = time.monotonic()
        res = idx.build(corpus, source_commit="e2")
        info = {"build_s": round(time.monotonic() - t0, 2), "docs_indexed": res.docs_indexed}
    syn = default_query_expander()
    cooc = idx.cooccurrence_expander() if cooccurrence_enabled() else None
    idx.query_expander = compose_expanders(syn, cooc, max_terms=DEFAULT_MAX_TERMS)
    idx.reranker = make_id_tag_reranker(idx, inner=make_status_reranker(None))
    return idx, info


def main() -> None:
    corpus, db = Path(sys.argv[1]), Path(sys.argv[2])
    in_force = "--in-force" in sys.argv
    idx, info = construir(corpus, db)
    print(json.dumps({"build": info}), file=sys.stderr, flush=True)
    for linea in sys.stdin:
        linea = linea.strip()
        if not linea.startswith("{"):
            continue
        msg = json.loads(linea)
        if "id" not in msg:
            continue
        if msg.get("method") == "initialize":
            out = {"protocolVersion": "2025-06-18", "capabilities": {"tools": {}}, "serverInfo": {"name": "olympus-eval", "version": "0.11.4"}}
        elif msg.get("method") == "tools/call":
            a = msg["params"].get("arguments", {})
            r = kb_search_fn(idx=idx, query=a["query"], limit=int(a.get("limit", 20)), in_force=in_force)
            hits = [{"path": h.path, "snippet": h.snippet, "status": h.status} for h in r.hits]
            out = {"content": [{"type": "text", "text": json.dumps(hits, ensure_ascii=False)}]}
        else:
            out = {}
        print(json.dumps({"jsonrpc": "2.0", "id": msg["id"], "result": out}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
