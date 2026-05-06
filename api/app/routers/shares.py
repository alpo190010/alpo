"""Shareable store-report links — owner CRUD + public read.

A share is a (token, owner, store_domain, share_tier) row. The token is
the bearer credential; anyone with the URL gets a tier-bounded view of
the owner's snapshot of that store. Expiry is *derived* from the
owner's live ``store_subscriptions`` tier — a Fixes share becomes
410 the moment the owner's Fixes plan ends, an Insights share becomes
410 if they drop below Insights, and Free shares never auto-expire
(``free`` is the baseline).

The public endpoint never accepts an ``Authorization`` header — keeping
``get_current_user_optional`` off the handler signature is intentional
so future edits cannot accidentally personalize the share view.
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import asc
from sqlalchemy.orm import Session

from app.auth import get_current_user_required
from app.database import get_db
from app.models import (
    ProductAnalysis,
    Store,
    StoreAnalysis,
    StoreProduct,
    StoreShare,
    User,
)
from app.rate_limit import limiter
from app.services.dimension_fixes import gate_store_analysis
from app.services.shopify_sitemap import total_pages_for
from app.services.store_subscriptions import (
    EffectiveTier,
    get_effective_tier,
    tier_meets,
)

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_TIERS: tuple[str, ...] = ("free", "insights", "fixes")
PRODUCTS_PAGE_SIZE = 10


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _generate_token() -> str:
    """Return a 32-char base64url token (~192 bits of entropy).

    The URL is the credential; the token is stored verbatim. No hashing —
    it would only matter if we wanted to hide tokens from DB read access,
    out of scope for an unauthenticated public-link product.
    """
    return secrets.token_urlsafe(24)


def _serialize_share(share: StoreShare, owner_current_tier: str) -> dict:
    """Build the owner-facing JSON shape for a share row.

    ``ownerCurrentTier`` is computed once per request by the caller so
    the UI can stamp ``isExpiredByOwnerTier`` without re-resolving for
    each row.
    """
    is_expired = (
        share.share_tier != "free"
        and not tier_meets(owner_current_tier, share.share_tier)
    )
    return {
        "id": str(share.id),
        "token": share.token,
        "shareTier": share.share_tier,
        "createdAt": share.created_at.isoformat() if share.created_at else None,
        "revokedAt": share.revoked_at.isoformat() if share.revoked_at else None,
        "viewCount": share.view_count,
        "lastViewedAt": (
            share.last_viewed_at.isoformat() if share.last_viewed_at else None
        ),
        "ownerCurrentTier": owner_current_tier,
        "isExpiredByOwnerTier": is_expired,
    }


def _normalize_domain(domain: str) -> str:
    return (domain or "").strip().lower()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class CreateShareBody(BaseModel):
    shareTier: str = Field(..., description="One of: free, insights, fixes")


# ---------------------------------------------------------------------------
# Owner-scoped endpoints
# ---------------------------------------------------------------------------


@router.get("/user/stores/{domain}/shares")
def list_shares(
    domain: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Return the caller's share links for *domain* (active + revoked)."""
    norm = _normalize_domain(domain)
    if not norm:
        return JSONResponse(
            status_code=400, content={"error": "Domain is required"}
        )

    owner_tier = get_effective_tier(current_user.id, norm, db)
    rows = (
        db.query(StoreShare)
        .filter(
            StoreShare.owner_user_id == current_user.id,
            StoreShare.store_domain == norm,
        )
        .order_by(StoreShare.created_at.desc())
        .all()
    )
    return {
        "shares": [_serialize_share(r, owner_tier) for r in rows],
        "ownerCurrentTier": owner_tier,
    }


@router.post("/user/stores/{domain}/shares")
def create_share(
    domain: str,
    body: CreateShareBody = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Mint a new share link for *domain* at ``body.shareTier``.

    The owner can only share at a tier ≤ their current effective tier
    on this store. Validation is server-side; the frontend disables
    above-ceiling options as a UX courtesy only.
    """
    norm = _normalize_domain(domain)
    if not norm:
        return JSONResponse(
            status_code=400, content={"error": "Domain is required"}
        )

    requested = body.shareTier
    if requested not in ALLOWED_TIERS:
        return JSONResponse(
            status_code=400,
            content={
                "error": f"shareTier must be one of {ALLOWED_TIERS}",
                "errorCode": "invalid_tier",
            },
        )

    owner_tier = get_effective_tier(current_user.id, norm, db)
    if not tier_meets(owner_tier, requested):
        return JSONResponse(
            status_code=403,
            content={
                "error": (
                    f"Cannot share at {requested} tier — "
                    f"your current tier on this store is {owner_tier}."
                ),
                "errorCode": "tier_above_ceiling",
                "ownerCurrentTier": owner_tier,
            },
        )

    share = StoreShare(
        token=_generate_token(),
        owner_user_id=current_user.id,
        store_domain=norm,
        share_tier=requested,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return JSONResponse(
        status_code=201,
        content={"share": _serialize_share(share, owner_tier)},
    )


@router.delete("/user/stores/{domain}/shares/{share_id}")
def revoke_share(
    domain: str,
    share_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Soft-revoke a share. Idempotent — second revoke also returns 204."""
    norm = _normalize_domain(domain)
    try:
        share_uuid = UUID(share_id)
    except (ValueError, TypeError):
        return JSONResponse(
            status_code=404, content={"error": "Share not found"}
        )

    row = (
        db.query(StoreShare)
        .filter(
            StoreShare.id == share_uuid,
            StoreShare.owner_user_id == current_user.id,
            StoreShare.store_domain == norm,
        )
        .first()
    )
    if row is None:
        return JSONResponse(
            status_code=404, content={"error": "Share not found"}
        )
    if row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return JSONResponse(status_code=204, content=None)


# ---------------------------------------------------------------------------
# Public endpoint
# ---------------------------------------------------------------------------


def _fetch_share_payload(share: StoreShare, db: Session) -> dict | JSONResponse:
    """Build the public payload for a validated share, scoped to the owner.

    Mirrors GET /store/{domain} but: (a) data is scoped to the owner's
    user_id, not the caller's; (b) tier-gating uses ``share.share_tier``
    instead of the caller's effective tier; (c) no auth-bearing fields
    leak (no email, no other-store references).
    """
    store = (
        db.query(Store).filter(Store.domain == share.store_domain).first()
    )
    if store is None:
        return JSONResponse(
            status_code=404,
            content={
                "error": "Store not found",
                "errorCode": "store_not_found",
            },
        )

    share_tier = share.share_tier
    sees_prose = share_tier in ("insights", "fixes")
    sees_fixes = share_tier == "fixes"
    details_locked = not sees_prose
    recs_locked = not sees_fixes

    products = (
        db.query(StoreProduct)
        .filter(StoreProduct.store_id == store.id)
        .order_by(asc(StoreProduct.created_at))
        .limit(PRODUCTS_PAGE_SIZE)
        .all()
    )

    analysis_rows = (
        db.query(ProductAnalysis)
        .filter(
            ProductAnalysis.store_domain == share.store_domain,
            ProductAnalysis.user_id == share.owner_user_id,
        )
        .all()
    )
    store_analysis_row = (
        db.query(StoreAnalysis)
        .filter(
            StoreAnalysis.store_domain == share.store_domain,
            StoreAnalysis.user_id == share.owner_user_id,
        )
        .first()
    )

    analyses: dict = {}
    for row in analysis_rows:
        analyses[row.product_url] = {
            "id": str(row.id),
            "score": row.score,
            "summary": row.summary,
            "tips": row.tips,
            "categories": row.categories,
            "productPrice": (
                str(row.product_price) if row.product_price is not None else None
            ),
            "productCategory": row.product_category,
            "signals": row.signals,
            "updatedAt": (
                row.updated_at.isoformat() if row.updated_at else None
            ),
            "planTier": share_tier,
            "detailsLocked": details_locked,
            "recommendationsLocked": recs_locked,
        }

    return {
        "store": {
            "id": str(store.id),
            "domain": store.domain,
            "name": store.name,
            "updatedAt": (
                store.updated_at.isoformat() if store.updated_at else None
            ),
        },
        "products": [
            {
                "id": str(p.id),
                "url": p.url,
                "slug": p.slug,
                "image": p.image,
            }
            for p in products
        ],
        "productCount": store.product_count,
        "currentPage": 1,
        "totalPages": total_pages_for(store.product_count, PRODUCTS_PAGE_SIZE),
        # Pagination is locked unless the share tier itself unlocks it.
        # Defense in depth: even if a free-tier viewer guesses page=2
        # they'd hit the existing /store/{domain}/products gate which
        # requires auth, but we surface a consistent flag here.
        "canPaginate": share_tier in ("insights", "fixes"),
        "analyses": analyses,
        "storeAnalysis": gate_store_analysis(
            {
                "score": store_analysis_row.score,
                "categories": store_analysis_row.categories,
                "tips": store_analysis_row.tips,
                "signals": store_analysis_row.signals,
                "checks": store_analysis_row.checks,
                "analyzedUrl": store_analysis_row.analyzed_url,
                "updatedAt": (
                    store_analysis_row.updated_at.isoformat()
                    if store_analysis_row.updated_at
                    else None
                ),
            },
            share_tier,
        )
        if store_analysis_row
        else None,
        "share": {
            "token": share.token,
            "shareTier": share_tier,
            "isShared": True,
        },
    }


@router.get("/share/{token}")
@limiter.limit("60/minute")
def get_shared_report(
    request: Request,  # noqa: ARG001 — required by SlowAPI key extractor
    token: str,
    db: Session = Depends(get_db),
):
    """Public, unauthenticated read of a shared store report.

    Returns 404/410 with friendly ``errorCode`` strings for the four
    "this link no longer works" states the frontend renders distinctly:
      * ``share_not_found`` — token is invalid
      * ``share_revoked`` — owner revoked the link
      * ``share_tier_lapsed`` — owner's plan dropped below the share tier
      * ``store_not_found`` — backing store row was removed
    """
    if not token:
        return JSONResponse(
            status_code=404,
            content={
                "error": "Share not found",
                "errorCode": "share_not_found",
            },
        )

    share = (
        db.query(StoreShare).filter(StoreShare.token == token).first()
    )
    if share is None:
        return JSONResponse(
            status_code=404,
            content={
                "error": "Share not found",
                "errorCode": "share_not_found",
            },
        )

    if share.revoked_at is not None:
        return JSONResponse(
            status_code=410,
            content={
                "error": "This share link has been revoked.",
                "errorCode": "share_revoked",
            },
        )

    # Free shares always pass — free is the baseline tier.
    if share.share_tier != "free":
        owner_tier = get_effective_tier(
            share.owner_user_id, share.store_domain, db
        )
        if not tier_meets(owner_tier, share.share_tier):
            return JSONResponse(
                status_code=410,
                content={
                    "error": (
                        "The owner's plan changed and this link is no "
                        "longer active."
                    ),
                    "errorCode": "share_tier_lapsed",
                    "shareTier": share.share_tier,
                    "ownerCurrentTier": owner_tier,
                },
            )

    payload = _fetch_share_payload(share, db)
    if isinstance(payload, JSONResponse):
        return payload

    # Best-effort view-count increment. Never blocks the response.
    try:
        share.view_count = (share.view_count or 0) + 1
        share.last_viewed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:  # noqa: BLE001 — telemetry best-effort
        logger.warning("Failed to increment view_count for share %s", share.id)
        db.rollback()

    return payload
