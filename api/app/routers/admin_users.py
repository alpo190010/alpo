"""Admin user management endpoints.

GET    /admin/users                                          — list
GET    /admin/users/{user_id}                                — detail
PATCH  /admin/users/{user_id}                                — edit role / email_verified
PUT    /admin/users/{user_id}/store-subscriptions            — upsert per-store plan
DELETE /admin/users/{user_id}/store-subscriptions/{domain}   — revoke per-store plan

All endpoints require admin role via ``get_current_user_admin``.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_user_admin
from app.database import get_db
from app.models import User
from app.services.store_subscriptions import (
    PAID_TIERS,
    delete_subscription,
    get_active_subscription,
    upsert_subscription,
)

logger = logging.getLogger(__name__)

router = APIRouter()

VALID_ROLES = ("user", "admin")


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class AdminUserUpdate(BaseModel):
    email_verified: Optional[bool] = None
    role: Optional[str] = None


def _user_to_dict(user: User) -> dict:
    """Serialise a User row to a dict safe for JSON responses (no password_hash)."""
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "email_verified": user.email_verified,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        "pro_waitlist": user.pro_waitlist,
    }


def _user_detail_dict(user: User, db: Session) -> dict:
    """Extended serialisation for the detail endpoint."""
    from app.services.store_subscriptions import list_paid_stores

    base = _user_to_dict(user)
    paid_stores = list_paid_stores(user.id, db)
    base.update(
        {
            "picture": user.picture,
            "google_linked": user.google_sub is not None,
            "scan_count": user.scans.count(),
            "analysis_count": user.product_analyses.count(),
            "paid_stores": paid_stores,
            "paid_store_count": len(paid_stores),
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
    if body.role is not None and body.role not in VALID_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}",
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
    if body.email_verified is not None:
        user.email_verified = body.email_verified
    if body.role is not None:
        user.role = body.role

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


# ---------------------------------------------------------------------------
# Per-store subscription management (admin)
# ---------------------------------------------------------------------------


class AdminStoreSubscriptionUpsert(BaseModel):
    """Body for ``PUT /admin/users/{user_id}/store-subscriptions``.

    ``store_domain`` is normalized server-side (strip + lower).
    ``plan_tier`` accepts ``"free"`` to revoke any existing row (free is the
    implicit default — no row equals free). ``"insights"`` and ``"fixes"``
    upsert a row with the given window.
    ``current_period_end`` is optional — defaults to one year from now for
    paid tiers, ignored for ``"free"``.
    """

    store_domain: str = Field(..., min_length=1, max_length=253)
    plan_tier: Literal["free", "insights", "fixes"]
    current_period_end: Optional[datetime] = None


@router.put("/admin/users/{user_id}/store-subscriptions")
def upsert_store_subscription(
    user_id: str,
    body: AdminStoreSubscriptionUpsert,
    admin_user: User = Depends(get_current_user_admin),
    db: Session = Depends(get_db),
):
    """Set a (user, store_domain) plan to any tier — free, insights, or fixes.

    Setting ``plan_tier="free"`` deletes any existing row (free is the
    implicit default). Paid tiers create or update the subscription row
    in place.
    """
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    user = db.query(User).filter(User.id == uid).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    domain = body.store_domain.strip().lower()
    if not domain:
        raise HTTPException(status_code=400, detail="store_domain is required")

    if body.plan_tier == "free":
        # Free = no subscription row. Drop whatever exists (active or expired).
        from app.models import StoreSubscription

        existing = (
            db.query(StoreSubscription)
            .filter(
                StoreSubscription.user_id == user.id,
                StoreSubscription.store_domain == domain,
            )
            .first()
        )
        if existing is not None:
            from app.services.store_subscriptions import delete_subscription

            delete_subscription(existing, db)
        logger.info(
            "Admin %s set free on %s for user %s",
            admin_user.email, domain, user.email,
        )
        return _user_detail_dict(user, db)

    if body.plan_tier not in PAID_TIERS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid plan_tier. Must be one of: free, "
                + ", ".join(PAID_TIERS)
            ),
        )

    period_end = body.current_period_end or (
        datetime.now(timezone.utc) + timedelta(days=365)
    )
    if period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=timezone.utc)

    upsert_subscription(
        user_id=user.id,
        store_domain=domain,
        plan_tier=body.plan_tier,
        current_period_end=period_end,
        db=db,
    )

    logger.info(
        "Admin %s set %s on %s for user %s until %s",
        admin_user.email,
        body.plan_tier,
        domain,
        user.email,
        period_end.isoformat(),
    )

    return _user_detail_dict(user, db)


@router.delete(
    "/admin/users/{user_id}/store-subscriptions/{store_domain}",
    status_code=204,
)
def revoke_store_subscription(
    user_id: str,
    store_domain: str,
    admin_user: User = Depends(get_current_user_admin),
    db: Session = Depends(get_db),
):
    """Revoke a per-store paid plan for *user_id* / *store_domain*.

    Returns 204 on success, 404 when no subscription exists for the pair.
    """
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    user = db.query(User).filter(User.id == uid).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    domain = store_domain.strip().lower()
    if not domain:
        raise HTTPException(status_code=400, detail="store_domain is required")

    sub = get_active_subscription(user.id, domain, db)
    if sub is None:
        # Also clean up expired rows so admin can clear the slate.
        from app.models import StoreSubscription

        sub = (
            db.query(StoreSubscription)
            .filter(
                StoreSubscription.user_id == user.id,
                StoreSubscription.store_domain == domain,
            )
            .first()
        )
        if sub is None:
            raise HTTPException(
                status_code=404, detail="Subscription not found"
            )

    delete_subscription(sub, db)
    logger.info(
        "Admin %s revoked subscription for user %s on domain %s",
        admin_user.email,
        user.email,
        domain,
    )
