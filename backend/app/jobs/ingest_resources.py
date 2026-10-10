"""Pull community resources from online sources and save them.

Run by hand (the API also runs it on a timer when INGEST_ENABLED=true):
    python -m app.jobs.ingest_resources [--source samhsa] [--dry-run]

--dry-run fetches and normalizes but does not touch the database.
"""

import argparse
import asyncio
import json
import logging

from pydantic import TypeAdapter

from app.config import get_settings
from app.db import engine
from app.ingest.base import SOURCES
from app.ingest.scheduler import ingest_once

logger = logging.getLogger(__name__)

async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", choices=sorted(SOURCES), action="append",
                        help="repeat to pick several; default is all")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--samples", type=int, default=2, help="records to print with --dry-run")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    get_settings()
    try:
        ok, items = await ingest_once(args.source, args.dry_run)
        if args.dry_run:
            for item in items[: args.samples]:
                print(json.dumps(TypeAdapter(type(item)).dump_python(item, mode="json"), indent=1, default=str))
    finally:
        await engine.dispose()
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    asyncio.run(main())
