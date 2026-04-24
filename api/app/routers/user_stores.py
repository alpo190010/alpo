"""User store management — list and delete a user's scanned stores.

A "store" (from the user's perspective) is a row in ``store_analyses``
keyed by ``(user_id, store_domain)``. A user can only scan as many
distinct stores as their ``store_quota`` allows. Deleting a store here
frees a slot without affecting other users or the shared ``stores`` /
``store_products`` rows.
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.auth import get_current_user_required
from app.database import get_db
from app.models import ProductAnalysis, Store, StoreAnalysis, User

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/user/stores")
def list_user_stores(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Return the authenticated user's scanned stores + quota summary.

    A "store" here means a distinct domain the user has any analysis for,
    whether the row lives in ``store_analyses`` or ``product_analyses``.
    StoreAnalysis is the preferred source when both exist (carries score
    and last-updated metadata for the whole store).
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

    # Seed from ProductAnalysis first — StoreAnalysis entries below will
    # override these with richer per-store metadata where it exists.
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
            "analyzedAt": analysis.updated_at.isoformat() if analysis.updated_at else None,
            "_updated_at": analysis.updated_at,
        }

    stores = sorted(
        by_domain.values(),
        key=lambda row: row["_updated_at"] or datetime.min,
        reverse=True,
    )
    for row in stores:
        row.pop("_updated_at", None)

    return {
        "stores": stores,
        "quota": current_user.store_quota,
        "used": len(stores),
    }


@router.delete("/user/stores/{domain}", status_code=204)
def delete_user_store(
    domain: str,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Remove the caller's per-store analysis rows for *domain*.

    Keeps the globally shared ``stores`` row and historical ``scans``
    rows. Returns 404 if the user has no analysis for this domain.
    """
    normalized = domain.strip().lower()
    if not normalized:
        raise HTTPException(status_code=400, detail="Domain required")

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

    db.commit()

    logger.info(
        "User %s deleted store %s (store_analyses=%d, product_analyses=%d)",
        current_user.email,
        normalized,
        store_analyses_deleted,
        product_analyses_deleted,
    )

    return Response(status_code=204)
