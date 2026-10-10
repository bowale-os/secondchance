import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db import engine
from app.ingest.scheduler import run_forever
from app.routers import auth, clients, documents, health

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(run_forever()) if settings.ingest_enabled else None
    yield
    if task:
        task.cancel()
    await engine.dispose()


app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    """Unhandled errors bypass CORSMiddleware, so the browser reports them as CORS
    failures. Attach the CORS headers here so the real 500 reaches the frontend."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    headers = {}
    origin = request.headers.get("origin")
    if origin in settings.cors_origins:
        headers = {
            "access-control-allow-origin": origin,
            "access-control-allow-credentials": "true",
            "vary": "Origin",
        }
    return JSONResponse({"detail": "Internal server error"}, status_code=500, headers=headers)


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(clients.router)
app.include_router(documents.router)
