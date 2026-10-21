"""Read-only local offer audit. Run with backend's uv environment; no live calls."""
import argparse
import asyncio
from datetime import timedelta
import json
from pathlib import Path
import sys
import time
from urllib.parse import urlsplit

from dotenv import dotenv_values
from prisma import Prisma

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / 'backend'
sys.path.insert(0, str(BACKEND))
from src.services.offer_name_resolver import _RESOLVE_NAMES_SQL
from src.services.scryfall_service import fold_search_text


async def read(client, sql, *args):
    async with client.tx(timeout=timedelta(seconds=15)) as tx:
        await tx.execute_raw('SET TRANSACTION READ ONLY')
        await tx.execute_raw("SET LOCAL statement_timeout='10s'")
        return await tx.query_raw(sql, *args)


async def audit(names):
    url = dotenv_values(BACKEND / '.env').get('DATABASE_URL', '')
    if urlsplit(url).hostname not in ('localhost', '127.0.0.1', 'db'):
        raise RuntimeError('This audit requires a local PostgreSQL database')
    url = url.replace('@db:', '@localhost:').replace('@db/', '@localhost/')
    client = Prisma(datasource={'url': url})
    await client.connect()
    try:
        data = {'scope': 'local/read-only', 'live_external_calls': False}
        data['counts'] = (await read(client, '''SELECT
            (SELECT count(*) FROM card_catalog)::int AS catalog,
            (SELECT count(*) FROM card_printings)::int AS printings,
            (SELECT count(*) FROM simulated_collections)::int AS offers'''))[0]
        data['offer_schema_available'] = (await read(client, """SELECT EXISTS(
            SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
            AND table_name='simulated_collections' AND column_name='raw_text') AS available"""))[0]['available']
        data['indexes'] = await read(client, """SELECT tablename,indexname,indexdef
            FROM pg_indexes WHERE schemaname=current_schema()
            AND tablename IN ('card_catalog','card_printings','simulated_collections')""")
        data['statistics'] = await read(client, """SELECT relname,n_live_tup,n_dead_tup,
            last_analyze,last_autoanalyze FROM pg_stat_user_tables
            WHERE schemaname=current_schema() AND relname IN ('card_catalog','card_printings','simulated_collections')""")
        started = time.perf_counter()
        try:
            rows = await read(client, 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + _RESOLVE_NAMES_SQL,
                              json.dumps(sorted({fold_search_text(name) for name in names})))
            data['name_resolution'] = {'wall_ms': round((time.perf_counter()-started)*1000, 2),
                                       'plan': rows[0]['QUERY PLAN'][0]}
        except Exception as error:
            data['name_resolution'] = {'error_type': type(error).__name__}
        return data
    finally:
        await client.disconnect()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--names', nargs='+', default=['Sol Ring', 'Island', 'Arcane Signet'])
    parser.add_argument('--output', type=Path)
    options = parser.parse_args()
    result = json.dumps(asyncio.run(audit(options.names)), indent=2, ensure_ascii=False, default=str)
    if options.output:
        options.output.write_text(result+'\n')
    else:
        print(result)
