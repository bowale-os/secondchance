"""
The contract every resource source follows, and the one place sources are listed.

A source is a module with one function:

    async def collect(http: httpx.AsyncClient) -> tuple[list[ResourceUpsert], int]
        # (normalized resources, raw rows fetched)

Everything source-specific (URLs, field names, codes) stays inside the module. Everything after
collect() is shared: validation, cross-source merge, dedupe key, database upsert.
"""

import re
from typing import Protocol

import httpx

from app.ingest import feed_america, osm, samhsa
from app.ingest.common import IngestError
from app.ingest.runner import merge_sources
from app.schemas import DETAILS_FOR, ResourceUpsert

E164 = re.compile(r"^\+1\d{10}$")


class Source(Protocol):
    async def collect(self, http: httpx.AsyncClient) -> tuple[list[ResourceUpsert], int]: ...


# Best source first: when two sources describe one place, the earlier one's values win
SOURCES: dict[str, Source] = {"samhsa": samhsa, "feed_america": feed_america, "osm": osm}


def problems(item: ResourceUpsert) -> list[str]:
    """Ways a normalized resource breaks the shared contract. Empty means it is fine."""
    out = []
    if not item.name.strip():
        out.append("empty name")
    if not isinstance(item.details, DETAILS_FOR[item.category]):
        out.append(f"details is {type(item.details).__name__}, {item.category.value} needs {DETAILS_FOR[item.category].__name__}")
    if item.phone and not E164.match(item.phone):
        out.append(f"phone not E.164: {item.phone}")
    if item.website and not item.website.startswith(("http://", "https://")):
        out.append(f"website has no scheme: {item.website}")
    if item.location and not (-90 <= item.location.lat <= 90 and -180 <= item.location.lng <= 180):
        out.append("location out of range")
    return out


async def collect_sources(names: list[str]) -> tuple[dict[str, list[ResourceUpsert] | None], list[ResourceUpsert], int]:
    """Run the named sources. Returns (per-source results, merged resources, duplicates merged).
    A failed source is None in the per-source results and the others still go through.
    A source that returns an item breaking the contract fails as a whole: that is a bug in its normalize()."""
    results: dict[str, list[ResourceUpsert] | None] = {}
    for name in [n for n in SOURCES if n in names]:  # registry order, not the order asked for
        try:
            async with httpx.AsyncClient(follow_redirects=True) as http:
                items, fetched = await SOURCES[name].collect(http)
            bad = [(i.name, p) for i in items for p in problems(i)]
            if bad:
                raise IngestError(f"{len(bad)} contract violations, first: {bad[0]}")
        except (IngestError, httpx.HTTPError) as exc:
            print(f"[{name}] FAILED, existing data kept: {exc}")
            results[name] = None
            continue
        print(f"[{name}] fetched {fetched} rows -> {len(items)} resources")
        results[name] = items
    # Sorted so the merge result does not depend on the order a server happened to return rows in
    flat = sorted(
        (i for r in results.values() for i in r or []),
        key=lambda i: (list(SOURCES).index(i.source.name.lower()) if i.source.name.lower() in SOURCES else 99,
                       i.category.value, i.name.lower(), i.dedupe_key()),
    )
    merged, folded = merge_sources(flat)
    return results, merged, folded
