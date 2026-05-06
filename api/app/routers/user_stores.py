"""User store management — list and delete a user's scanned stores.

A "store" (from the user's perspective) is any domain the user has
analyzed (rows in ``store_analyses`` or ``product_analyses``). Plans
are now per-store: each row in the response carries its own
``planTier`` and ``canDelete`` flag. Stores with an active paid plan
cannot be deleted until the plan expires.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.auth import get_current_user_required
from app.database import get_db
from app.models import ProductAnalysis, Store, StoreAnalysis, StoreProduct, User
from app.services.store_subscriptions import (
    get_active_subscription,
    list_paid_stores,
    user_has_active_subscription_for,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/user/stores")
def list_user_stores(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Return the authenticated user's scanned stores with per-store plan info.

    Each row carries ``planTier`` ("free", "insights", or "fixes"),
    ``currentPeriodEnd`` (ISO timestamp or null), and ``canDelete`` (false
    while a paid plan is active).
    """
    sa_rows = (
        db.query(StoreAnalysis, Store)
        .outerjoin(Store, Store.domain == StoreAnalysis.store_domain)
        .filter(StoreAnalysis.user_id == current_user.id)
        .all()
    )
    pa_rows = (
        db.query(ProductAnalysis, Store)
        .outerjoin(Store, Store.domain == ProductAnalysis.store_domain)
        .filter(ProductAnalysis.user_id == current_user.id)
        .all()
    )

    by_domain: dict[str, dict] = {}

    # Seed from ProductAnalysis first; StoreAnalysis below overrides with
    # richer per-store metadata when both exist.
    for analysis, store in pa_rows:
        existing = by_domain.get(analysis.store_domain)
        updated = analysis.updated_at
        if existing is None or (
            existing.get("_updated_at") is not None
            and updated is not None
            and updated > existing["_updated_at"]
        ):
            by_domain[analysis.store_domain] = {
                "domain": analysis.store_domain,
                "name": store.name if store is not None else None,
                "score": analysis.score,
                "analyzedAt": updated.isoformat() if updated else None,
                "_updated_at": updated,
            }

    for analysis, store in sa_rows:
        by_domain[analysis.store_domain] = {
            "domain": analysis.store_domain,
            "name": store.name if store is not None else None,
            "score": analysis.score,
            "analyzedAt": (
                analysis.updated_at.isoformat() if analysis.updated_at else None
            ),
            "_updated_at": analysis.updated_at,
        }

    # One pass over store_subscriptions for this user, merged in by domain.
    paid_by_domain: dict[str, dict] = {
        entry["domain"]: entry for entry in list_paid_stores(current_user.id, db)
    }

    stores = sorted(
        by_domain.values(),
        key=lambda row: row["_updated_at"] or datetime.min,
        reverse=True,
    )
    for row in stores:
        row.pop("_updated_at", None)
        paid = paid_by_domain.get(row["domain"])
        if paid is not None:
            row["planTier"] = paid["tier"]
            row["currentPeriodEnd"] = paid["currentPeriodEnd"]
            row["canDelete"] = False
        else:
            row["planTier"] = "free"
            row["currentPeriodEnd"] = None
            row["canDelete"] = True

    return {"stores": stores}


@router.delete("/user/stores/{domain}", status_code=204)
def delete_user_store(
    domain: str,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Remove the caller's per-store analysis rows for *domain*.

    Forbidden (409) while an active paid plan exists for the (user,
    domain) pair — wait for the plan to expire or cancel the
    subscription first.

    Also drops the globally-shared ``stores`` row and its
    ``store_products`` children when no other user references the domain
    anymore. Those rows are a discovery cache (rebuilt on next
    ``/discover-products`` call), so evicting them frees storage without
    losing canonical data.

    Keeps historical ``scans`` rows (URL-scoped, not store-owned).
    Returns 404 if the user has no analysis for this domain.
    """
    normalized = domain.strip().lower()
    if not normalized:
        raise HTTPException(status_code=400, detail="Domain required")

    if user_has_active_subscription_for(current_user.id, normalized, db):
        raise HTTPException(
            status_code=409,
            detail={
                "error": (
                    "Cannot delete a store while an active paid plan is "
                    "attached. Wait for the plan to expire or cancel it first."
                ),
                "errorCode": "store_has_active_plan",
            },
        )

    store_analyses_deleted = (
        db.query(StoreAnalysis)
        .filter(
            StoreAnalysis.user_id == current_user.id,
            StoreAnalysis.store_domain == normalized,
        )
        .delete(synchronize_session=False)
    )
    product_analyses_deleted = (
        db.query(ProductAnalysis)
        .filter(
            ProductAnalysis.user_id == current_user.id,
            ProductAnalysis.store_domain == normalized,
        )
        .delete(synchronize_session=False)
    )

    if store_analyses_deleted == 0 and product_analyses_deleted == 0:
        db.rollback()
        raise HTTPException(status_code=404, detail="Store not found for user")

    stores_deleted = 0
    store_products_deleted = 0
    remaining_refs = (
        db.query(StoreAnalysis)
        .filter(StoreAnalysis.store_domain == normalized)
        .count()
        + db.query(ProductAnalysis)
        .filter(ProductAnalysis.store_domain == normalized)
        .count()
    )
    if remaining_refs == 0:
        store = db.query(Store).filter(Store.domain == normalized).first()
        if store is not None:
            store_products_deleted = (
                db.query(StoreProduct)
                .filter(StoreProduct.store_id == store.id)
                .delete(synchronize_session=False)
            )
            stores_deleted = (
                db.query(Store)
                .filter(Store.id == store.id)
                .delete(synchronize_session=False)
            )

    db.commit()

    logger.info(
        "User %s deleted store %s (store_analyses=%d, product_analyses=%d, "
        "stores=%d, store_products=%d)",
        current_user.email,
        normalized,
        store_analyses_deleted,
        product_analyses_deleted,
        stores_deleted,
        store_products_deleted,
    )

    return Response(status_code=204)
