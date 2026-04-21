"""JWT authentication dependencies for FastAPI.

Verifies Auth.js-issued JWTs using PyJWT and resolves the user from
the `sub` claim in the database.  New sessions carry a Postgres UUID as
``sub``; legacy Google sessions carry a ``google_sub`` string.
"""

from __future__ import annotations

import logging
import uuid
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User

logger = logging.getLogger(__name__)


def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Extract and verify a Bearer JWT from the Authorization header.

    Returns the matching User row if the token is valid and the user exists,
    otherwise returns None.  **Never raises** — any error path returns None so
    that anonymous access remains possible.
    """
    # Guard: if auth_secret is not configured, auth is disabled.
    if not settings.auth_secret:
        return None

    auth_header = request.headers.get("authorization")
    if not auth_header:
        logger.warning("No Authorization header in request to %s", request.url.path)
        return None

    # Expect "Bearer <token>"
    parts = auth_header.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        return None

    token = parts[1].strip()

    try:
        payload = jwt.decode(
            token,
            settings.auth_secret,
            algorithms=["HS256"],
        )
    except jwt.PyJWTError as e:
        logger.warning("JWT decode failed: %s (secret len=%d, token prefix=%s)", e, len(settings.auth_secret), token[:20])
        return None

    sub: str | None = payload.get("sub")
    if not sub:
        logger.warning("JWT valid but no 'sub' claim. Keys: %s", list(payload.keys()))
        return None

    # Phase 1: Try resolving as a Postgres UUID (new sessions from both
    # Credentials and Google providers). A UUID-shaped sub can never match
    # google_sub (which stores Google-issued strings), so we don't fall
    # through to Phase 2 on a miss — that would just waste a DB round-trip.
    try:
        user_uuid = uuid.UUID(sub)
    except ValueError:
        user_uuid = None

    if user_uuid is not None:
        return db.query(User).filter(User.id == user_uuid).first()

    # Phase 2: Fallback to google_sub lookup (legacy Google sessions).
    user = db.query(User).filter(User.google_sub == sub).first()
    if not user:
        # Auto-provision user on first authenticated request
        email = payload.get("email", "")
        name = payload.get("name")
        picture = payload.get("picture")
        user = User(google_sub=sub, email=email, name=name, picture=picture)
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Auto-created user sub=%s email=%s", sub, email)
    return user


def get_current_user_required(
    user: Optional[User] = Depends(get_current_user_optional),
) -> User:
    """Require an authenticated user — raises 401 if absent."""
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def get_current_user_admin(
    user: User = Depends(get_current_user_required),
) -> User:
    """Require an authenticated admin user — raises 403 if not admin.

    Chains off ``get_current_user_required`` so unauthenticated requests
    get a 401 before the role check runs.
    """
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
