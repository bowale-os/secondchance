import uuid
from urllib.parse import quote

import jwt
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import undefer

from app.auth import bearer, get_current_staff, get_token_claims
from app.db import get_session
from app.security import decode_client_token
from app.tables import Assignment, Document, Staff

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/{document_id}/content")
async def get_document_content(
    document_id: uuid.UUID,
    download: bool = False,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """The stored file. Case workers can read what they uploaded or what belongs to
    their clients; a client can read only their own documents."""
    if creds is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Missing bearer token", headers={"WWW-Authenticate": "Bearer"}
        )
    doc = await session.scalar(
        select(Document).options(undefer(Document.content)).where(Document.id == document_id)
    )
    not_found = HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    if doc is None or doc.content is None:
        raise not_found

    try:  # client tokens are HS256 and Auth0 staff tokens RS256, so at most one decodes
        client_id = decode_client_token(creds.credentials)
    except (jwt.PyJWTError, ValueError):
        staff: Staff = await get_current_staff(await get_token_claims(creds), session)
        allowed = doc.uploaded_by_staff_id == staff.id or (
            doc.client_id is not None
            and await session.scalar(
                select(Assignment.id).where(
                    Assignment.client_id == doc.client_id,
                    Assignment.staff_id == staff.id,
                    Assignment.is_active.is_(True),
                )
            )
            is not None
        )
    else:
        allowed = doc.client_id == client_id
    if not allowed:
        raise not_found

    disposition = "attachment" if download else "inline"
    filename = quote(doc.original_filename or "document")
    return Response(
        content=doc.content,
        media_type=doc.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{filename}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )
