# Hacklanta-2026 — SecondChance

Low-income budget help and case management for people returning from incarceration. Case workers
keep each client's documents, benefits, IDs, medications, obligations and contacts in one place,
and clients can find nearby shelters, food and treatment programs.

## Layout

| Folder | What it is |
|---|---|
| `backend/` | FastAPI + async SQLAlchemy on PostgreSQL (Neon). Auth, clients, documents, resources, ingestion. |
| `frontend/` | React 18 + Vite + TypeScript, Auth0 login. |
| `second-chance-reader/` | Separate Node workspace (`apps/`, `packages/`) for the document reader. |
| `appointment-tracker*.html` | Standalone prototype pages. |

## Run the backend

```
cd backend
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements.txt
copy .env.example .env                                # then fill it in; only DATABASE_URL is required
alembic upgrade head
uvicorn app.main:app --reload --port 3000
```

Routes: `/auth`, `/clients`, `/documents`, plus a health check (see `app/routers/`).
Settings live in `app/config.py` and mirror `backend/.env`.

## Run the frontend

```
cd frontend
npm install
copy .env.example .env      # VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, VITE_AUTH0_AUDIENCE, VITE_API_BASE_URL
npm run dev
```

`npm run build` type-checks and builds.

## Community resources

Shelters, food banks and addiction treatment programs are pulled from public sources
(SAMHSA FindTreatment.gov and OpenStreetMap), normalized, merged across sources and stored in the
`resources` table.

```
cd backend
python -m app.jobs.ingest_resources --dry-run      # fetch and normalize only
python -m app.jobs.ingest_resources                # save to the database
```

Set `INGEST_ENABLED=true` to also run it inside the API every `INGEST_INTERVAL_HOURS` (default 6).
Details, source contract and merge rules: [backend/app/ingest/README.md](backend/app/ingest/README.md).

## Maintenance jobs

```
python -m app.jobs.cleanup_documents [--hours N] [--dry-run]   # delete abandoned uploads
```

## Database migrations

```
cd backend
alembic upgrade head                          # apply
alembic revision --autogenerate -m "message"  # new migration after changing app/tables.py
```
