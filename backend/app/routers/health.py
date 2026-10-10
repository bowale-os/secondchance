from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.schemas import HealthRead

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthRead)
async def health(session: AsyncSession = Depends(get_session)) -> HealthRead:
    try:
        await session.execute(text("SELECT 1"))
        return HealthRead(status="ok", database=True)
    except Exception:
        return HealthRead(status="degraded", database=False)
