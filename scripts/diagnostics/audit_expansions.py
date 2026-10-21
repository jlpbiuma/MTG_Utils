"""Read-only local audit of expansion queries. Run with the backend environment."""
import argparse
import ast
import asyncio
from datetime import timedelta
import json
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urlsplit

from dotenv import dotenv_values
from prisma import Prisma

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
from src.services.expansion_completion import base_printing_sql


def expansion_query(source):
    module = ast.parse(source)
    function = next(node for node in module.body if isinstance(node, ast.AsyncFunctionDef) and node.name == "list_sets")
    for node in ast.walk(function):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == "query_raw" and node.args):
            continue
        expression = node.args[0]
        if isinstance(expression, ast.Constant):
            query = expression.value
        elif isinstance(expression, ast.JoinedStr):
            query = eval(compile(ast.Expression(expression), "<local catalog query>", "eval"),
                         {"__builtins__": {}, "base_condition": base_printing_sql()})
        else:
            continue
        if isinstance(query, str) and '"totalValueEur"' in query:
            return query
    raise ValueError("Expansion aggregate query not found")



async def read(db, sql, params=(), analyze=False):
    async with db.tx(timeout=timedelta(seconds=15)) as tx:
        await tx.execute_raw("SET TRANSACTION READ ONLY")
        await tx.execute_raw("SET LOCAL statement_timeout='8s'")
        prefix = "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " if analyze else ""
        return await tx.query_raw(prefix + sql, *params)


async def main(output):
    url = dotenv_values(BACKEND / ".env").get("DATABASE_URL", "")
    if urlsplit(url).hostname not in ("localhost", "127.0.0.1", "db"):
        raise RuntimeError("This audit only accepts a local PostgreSQL database")
    url = url.replace("@db:", "@localhost:").replace("@db/", "@localhost/")
    db = Prisma(datasource={"url": url})
    await db.connect()
    try:
        users = await read(db, "SELECT user_id,COUNT(*)::int AS n FROM user_collections GROUP BY user_id ORDER BY n DESC LIMIT 1")
        uid = users[0]["user_id"] if users else "audit-no-user"
        data = {"largest_inventory_rows": users[0]["n"] if users else 0,
                "statement_timeout_seconds": 8, "scope": "local/read-only",
                "counts": await read(db, "SELECT (SELECT COUNT(*) FROM card_printings)::int AS printings,(SELECT COUNT(*) FROM card_sets)::int AS sets,(SELECT COUNT(*) FROM user_collections)::int AS inventory,(SELECT COUNT(*) FROM cm_price_history)::int AS history")}
        current = expansion_query((BACKEND / "src/routers/catalog.py").read_text())
        legacy = expansion_query(subprocess.check_output(["git", "-C", str(BACKEND), "show", "HEAD:src/routers/catalog.py"], text=True))
        candidate = (ROOT / "docs/auditoria/consulta-listado-expansiones-candidata.sql").read_text()
        for name, query, user in [("legacy", legacy, uid), ("current", current, uid), ("candidate", candidate, uid), ("current_empty_inventory", current, "audit-no-user")]:
            started = time.perf_counter()
            try:
                result = await read(db, query, (user,), analyze=True)
                plan = result[0]["QUERY PLAN"][0]
                data[name] = {"wall_ms": round((time.perf_counter()-started)*1000, 1), "execution_ms": plan["Execution Time"], "plan": plan}
            except Exception as exc:
                data[name] = {"wall_ms": round((time.perf_counter()-started)*1000, 1), "error_type": type(exc).__name__, "error": str(exc)[:300]}
        safe = json.dumps(data, ensure_ascii=False, indent=2, default=str).replace(uid, "<usuario>")
        output.write_text(safe + "\n")
        print(json.dumps({name: {k: v for k, v in value.items() if k != "plan"} if isinstance(value, dict) else value for name, value in json.loads(safe).items()}, ensure_ascii=False))
        print(f"Saved sanitized evidence: {output}")
    finally:
        await db.disconnect()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("/tmp/mtg-expansions-audit.json"))
    asyncio.run(main(parser.parse_args().output))
