"""Admin user management endpoints.

GET  /admin/users           — paginated list with search & filter
GET  /admin/users/{user_id} — full user detail
PATCH /admin/users/{user_id} — edit user (with self-demotion protection)

All endpoints require admin role via ``get_current_user_admin``.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_user_admin
from app.database import get_db
from app.models import User
from app.plans import PLAN_TIERS

logger = logging.getLogger(__name__)

router = APIRouter()

VALID_ROLES = ("user", "admin")


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class AdminUserUpdate(BaseModel):
    plan_tier: Optional[str] = None
    credits_used: Optional[int] = None
    email_verified: Optional[bool] = None
    role: Optional[str] = None
    store_quota: Optional[int] = None


def _user_to_dict(user: User) -> dict:
    """Serialise a User row to a dict safe for JSON responses (no password_hash)."""
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "plan_tier": user.plan_tier,
        "credits_used": user.credits_used,
        "email_verified": user.email_verified,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        "pro_waitlist": user.pro_waitlist,
        "store_quota": user.store_quota,
    }


def _user_detail_dict(user: User, db: Session) -> dict:
    """Extended serialisation for the detail endpoint."""
    from app.services.entitlement import count_user_stores

    base = _user_to_dict(user)
    base.update(
        {
            "picture": user.picture,
            "google_linked": user.google_sub is not None,
            "scan_count": user.scans.count(),
            "analysis_count": user.product_analyses.count(),
            "store_count": count_user_stores(user.id, db),
        }
    )
    return base


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/admin/users")
def list_users(
    search: Optional[str] = None,
    role: Optional[str] = None,
    plan_tier: Optional[str] = None,
    pro_waitlist: Optional[bool] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    admin_user: User = Depends(get_current_user_admin),
    db: Session = Depends(get_db),
):
    """Paginated user list with optional search and filters."""
    query = db.query(User)

    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                User.email.ilike(pattern),
                User.name.ilike(pattern),
            )
        )

    if role:
        query = query.filter(User.role == role)

    if plan_tier:
        query = query.filter(User.plan_tier == plan_tier)

    if pro_waitlist is not None:
        query = query.filter(User.pro_waitlist == pro_waitlist)

    total = query.count()
    users = (
        query.order_by(User.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "users": [_user_to_dict(u) for u in users],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/admin/users/{user_id}")
def get_user_detail(
    user_id: str,
    admin_user: User = Depends(get_current_user_admin),
    db: Session = Depends(get_db),
):
    """Full detail for a single user."""
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    user = db.query(User).filter(User.id == uid).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return _user_detail_dict(user, db)


@router.patch("/admin/users/{user_id}")
def update_user(
    user_id: str,
    body: AdminUserUpdate,
    admin_user: User = Depends(get_current_user_admin),
    db: Session = Depends(get_db),
):
    """Edit a user's plan tier, credits, email_verified, or role.

    Self-demotion protection (R111): admins cannot remove their own admin role.
    """
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    user = db.query(User).filter(User.id == uid).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # --- Validate fields ------------------------------------------------
    if body.plan_tier is not None and body.plan_tier not in PLAN_TIERS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid plan_tier. Must be one of: {', '.join(PLAN_TIERS.keys())}",
        )

    if body.role is not None and body.role not in VALID_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}",
        )

    if body.store_quota is not None and body.store_quota < 1:
        raise HTTPException(
            status_code=400,
            detail="store_quota must be at least 1",
        )

    # --- Self-demotion protection (R111) --------------------------------
    if (
        body.role is not None
        and body.role != "admin"
        and admin_user.id == user.id
    ):
        raise HTTPException(
            status_code=400,
            detail="Cannot remove your own admin role",
        )

    # --- Apply updates ---------------------------------------------------
    if body.plan_tier is not None:
        user.plan_tier = body.plan_tier
    if body.credits_used is not None:
        user.credits_used = body.credits_used
    if body.email_verified is not None:
        user.email_verified = body.email_verified
    if body.role is not None:
        user.role = body.role
    if body.store_quota is not None:
        user.store_quota = body.store_quota

    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    logger.info(
        "Admin %s updated user %s: %s",
        admin_user.email,
        user.email,
        body.model_dump(exclude_none=True),
    )

    return _user_detail_dict(user, db)
