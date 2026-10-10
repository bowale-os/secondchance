# Resource ingestion

Pulls shelters, food, and treatment programs from outside sources, normalizes them to one shape,
merges duplicates across sources, and saves them to the `resources` table.

    python -m app.jobs.ingest_resources [--source samhsa] [--source osm] [--dry-run] [--samples N]

`--dry-run` fetches and normalizes but never touches the database.

## Scheduling

No external cron is needed. Set `INGEST_ENABLED=true` in `backend/.env` and the API runs the
ingest in the background when it starts, then every `INGEST_INTERVAL_HOURS` (default 6)
(`scheduler.py`). It is off by default so local dev and `--reload` do not hit the APIs.

- Several API workers each run the loop, so a run first takes a Postgres advisory lock; a worker that cannot get it skips that round.
- A failed run is logged and retried at the next interval.
- The timer lives in the API process, so it only runs while the API is up, and it restarts its clock on every deploy. On a host that sleeps idle servers (many free tiers), use an external scheduler to hit `python -m app.jobs.ingest_resources` instead.

## Pipeline

    source.collect()  ->  contract check  ->  sort  ->  merge_sources  ->  upsert_resources
    (per source)          (base.problems)     (base)    (runner)           (runner)

| Step | File | What it does |
|---|---|---|
| schedule | `scheduler.py` | Runs the pipeline on a timer, once at a time across workers. |
| fetch + normalize | `samhsa.py`, `feed_america.py`, `osm.py` | Source-specific. Raw API rows become `ResourceUpsert`. |
| contract check | `base.py` | Rejects a source whose output is malformed (bad phone, wrong details type, out-of-range position). |
| sort | `base.py` | Orders by source priority, category, name, so results do not depend on server row order. |
| merge | `runner.py` | Folds the same place from different sources into one resource. |
| upsert | `runner.py` | Inserts new rows, updates changed ones, never erases good data. |

## The source contract

A source is a module with:

    async def collect(http) -> tuple[list[ResourceUpsert], int]   # (resources, raw rows fetched)

Raw formats differ completely (SAMHSA `rows` + service codes, OSM `elements` + tags); the output
does not. Every source emits `ResourceUpsert` with:

- phone as E.164 (`+14045551234`), website with `https://`
- enums from `app/tables.py` (`Gender`, `Tri`, `CostType`, `RecordsPolicy`); unknown is `UNKNOWN`/`None`, never a guess
- `details` matching the category (`ShelterDetails`, `FoodDetails`, `AddictionDetails`, ...)
- `field_meta` with a confidence for each field that was inferred rather than stated

To add a source: write `normalize(row) -> ResourceUpsert | None` and `collect(http)`, then add the
module to `SOURCES` in `base.py`.

## Source priority

`SOURCES` in `base.py` is ordered best first. When two sources describe one place the earlier one
keeps its values and only gains fields it was missing. Currently SAMHSA, Feed America, then OSM (OSM is volunteer-edited, so its fields are marked LOW confidence).

## Duplicates

Two levels:

1. **Dedupe key** (`ResourceUpsert.dedupe_key`): category + name + normalized street (`street_key`: lowercased, "Street"->"st", directions dropped), or position rounded to ~100 m when there is no street. Same key = same database row.
2. **Cross-source merge** (`runner.same_place`): same category and similar name, then:
   - both have a street: streets must match
   - else both have a position: within 150 m
   - else: names must be identical, and phones must agree if both have one

A shared phone number alone never merges anything, because one office line often serves several sites.

## What a re-run does to existing rows

- A field the scrape did not find never erases a stored value.
- `VERIFIED` rows (confirmed by a case worker) are only filled where a field is unknown.
- A value a case worker set in `field_meta` is never overwritten by a scrape.
- `verification`, `near_transit` and `nearest_stops` are never touched, except that a changed location clears the transit result so it is recomputed.

## Failures

A source that is down or returns garbage is reported as FAILED and skipped; existing data stays.
The other sources still save. The exit code is 1 if any source failed. Overpass (OSM) is a public
server and often returns 5xx; re-running fixes it.

## Known gaps

- No hours from SAMHSA, no records policy or medication info from OSM.
- `near_transit` is never computed; nothing in the repo does it yet.
- No classes/events source, and no shelter source beyond OSM.
- Feed America (feedam.org, CC BY 4.0) is itself an aggregate of 211, Plentiful and FoodPantries.org, so its fields are LOW confidence and its hours are often missing. Keep the attribution: each row's `source_url` points back to feedam.org.
- No offline tests or raw-response snapshots yet, so runs against live APIs are not reproducible.
