"""GET /store/{domain} — return store, products, and analyses for a domain.

Also exposes POST /store/{domain}/refresh-analysis to manually re-run the
store-wide dimension scan, bypassing the 7-day cache.
"""

import logging
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import asc
from sqlalchemy.orm import Session

from app.auth import get_current_user_optional, get_current_user_required
from app.database import get_db
from app.models import ProductAnalysis, Store, StoreAnalysis, StoreProduct, User
from app.routers.discover_products import _run_store_wide_analysis
from app.services.dimension_fixes import strip_check_remediation
from app.services.entitlement import count_user_stores, user_has_store_slot_for
from app.services.scoring import STORE_WIDE_KEYS

logger = logging.getLogger(__name__)

router = APIRouter()

PRODUCT_ANALYSIS_TTL = timedelta(hours=24)

# Free-tier refresh cooldown — paid tiers are unlimited. Keyed by user id.
_FREE_REFRESH_COOLDOWN_SECONDS = 60
_free_refresh_last: dict[str, float] = {}


def _is_fresh(row, now: datetime) -> bool:
    updated = row.updated_at
    if updated is None:
        return False
    if updated.tzinfo is None:
        updated = updated.replace(tzinfo=timezone.utc)
    return (now - updated) < PRODUCT_ANALYSIS_TTL


@router.get("/store/{domain}")
def get_store(
    domain: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    if not domain:
        return JSONResponse(
            status_code=400, content={"error": "Domain is required"}
        )

    timings: dict[str, float] = {}
    t_total = time.perf_counter()
    outcome = "success"
    products_count = 0
    analyses_count = 0
    has_store_analysis = False
    try:
        t_phase = time.perf_counter()
        store = db.query(Store).filter(Store.domain == domain).first()
        timings["store_lookup_s"] = round((time.perf_counter() - t_phase) , 3)
        if not store:
            outcome = "store_not_found"
            return JSONResponse(
                status_code=404, content={"error": "Store not found"}
            )

        t_phase = time.perf_counter()
        products = (
            db.query(StoreProduct)
            .filter(StoreProduct.store_id == store.id)
            .order_by(asc(StoreProduct.created_at))
            .all()
        )
        timings["products_query_s"] = round((time.perf_counter() - t_phase) , 3)
        products_count = len(products)

        if current_user is not None:
            t_phase = time.perf_counter()
            analysis_rows = (
                db.query(ProductAnalysis)
                .filter(ProductAnalysis.store_domain == domain)
                .filter(ProductAnalysis.user_id == current_user.id)
                .all()
            )
            store_analysis_row = (
                db.query(StoreAnalysis)
                .filter(StoreAnalysis.store_domain == domain)
                .filter(StoreAnalysis.user_id == current_user.id)
                .first()
            )
            timings["analyses_query_s"] = round((time.perf_counter() - t_phase) , 3)
        else:
            analysis_rows = []
            store_analysis_row = None

        # Build analyses dict keyed by productUrl (fresh rows only)
        t_phase = time.perf_counter()
        now = datetime.now(timezone.utc)
        analyses: dict = {}
        for row in analysis_rows:
            if not _is_fresh(row, now):
                continue
            analyses[row.product_url] = {
                "id": str(row.id),
                "score": row.score,
                "summary": row.summary,
                "tips": row.tips,
                "categories": row.categories,
                "productPrice": (
                    str(row.product_price)
                    if row.product_price is not None
                    else None
                ),
                "productCategory": row.product_category,
                "signals": row.signals,
                "updatedAt": (
                    row.updated_at.isoformat() if row.updated_at else None
                ),
            }
        timings["serialize_s"] = round((time.perf_counter() - t_phase) , 3)
        analyses_count = len(analyses)
        has_store_analysis = store_analysis_row is not None

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
            "analyses": analyses,
            "storeAnalysis": {
                "score": store_analysis_row.score,
                "categories": store_analysis_row.categories,
                "tips": store_analysis_row.tips,
                "signals": store_analysis_row.signals,
                "checks": (
                    store_analysis_row.checks
                    if current_user is not None
                    and (current_user.plan_tier or "free") != "free"
                    else strip_check_remediation(store_analysis_row.checks)
                ),
                "analyzedUrl": store_analysis_row.analyzed_url,
                "updatedAt": (
                    store_analysis_row.updated_at.isoformat()
                    if store_analysis_row.updated_at
                    else None
                ),
            }
            if store_analysis_row
            else None,
        }
    except Exception:
        outcome = "error"
        logger.exception("Failed to fetch store data")
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to fetch store data"},
        )
    finally:
        timings["total_s"] = round((time.perf_counter() - t_total) , 3)
        logger.info(
            "scan_timings get_store outcome=%s domain=%s total_s=%s timings=%s",
            outcome, domain, timings["total_s"], timings,
            extra={
                "event": "scan_timings",
                "scope": "get_store",
                "outcome": outcome,
                "domain": domain,
                "user_id": str(current_user.id) if current_user else None,
                "products_count": products_count,
                "analyses_count": analyses_count,
                "has_store_analysis": has_store_analysis,
                "timings_s": timings,
            },
        )


@router.post("/store/{domain}/refresh-analysis")
async def refresh_store_analysis(
    request: Request,
    domain: str,
    dimension: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Force a fresh store-wide analysis, bypassing the 7-day cache.

    Picks a representative product page (first StoreProduct for the domain, or
    falls back to the last analyzed_url on the existing StoreAnalysis row).

    When no ``dimension`` query param is provided, runs all 7 store-wide
    detectors + every external API call (axe, PSI, AI discoverability) and
    upserts the row. When a valid dimension key is provided, runs only that
    detector, skips the external calls it doesn't need, and merges the result
    into the existing StoreAnalysis row — roughly 2–3× faster for most
    dimensions since we avoid axe/PSI/AI fetches that aren't relevant.

    Free-tier users are rate-limited to 1 refresh per minute (per user). Paid
    tiers (starter, pro, etc.) are unlimited.
    """
    if not domain:
        return JSONResponse(
            status_code=400, content={"error": "Domain is required"}
        )

    # --- Store quota check ---
    # Refresh can upsert a new StoreAnalysis row for a domain the caller
    # has never scanned, so it must respect the quota like /analyze and
    # /discover-products.
    if not user_has_store_slot_for(current_user, domain, db):
        return JSONResponse(
            status_code=403,
            content={
                "error": "Store quota reached",
                "errorCode": "store_quota_exhausted",
                "storeQuota": current_user.store_quota,
                "storeUsed": count_user_stores(current_user.id, db),
            },
        )

    only_dimensions: set[str] | None = None
    if dimension is not None:
        if dimension not in STORE_WIDE_KEYS:
            return JSONResponse(
                status_code=400,
                content={
                    "error": (
                        f"Invalid dimension '{dimension}'. "
                        f"Valid keys: {sorted(STORE_WIDE_KEYS)}"
                    ),
                },
            )
        only_dimensions = {dimension}

    # Plan-gated cooldown: free users only.
    if (current_user.plan_tier or "free") == "free":
        now_ts = time.time()
        user_key = str(current_user.id)
        last_ts = _free_refresh_last.get(user_key)
        if last_ts is not None and (now_ts - last_ts) < _FREE_REFRESH_COOLDOWN_SECONDS:
            retry_after = int(
                _FREE_REFRESH_COOLDOWN_SECONDS - (now_ts - last_ts)
            )
            return JSONResponse(
                status_code=429,
                content={
                    "error": (
                        f"Please wait {retry_after}s before re-analyzing again. "
                        "Upgrade to remove this limit."
                    ),
                    "retryAfter": retry_after,
                    "upgradeAvailable": True,
                },
                headers={"Retry-After": str(retry_after)},
            )
        _free_refresh_last[user_key] = now_ts

    timings: dict[str, float] = {}
    t_total = time.perf_counter()
    outcome = "success"
    try:
        t_phase = time.perf_counter()
        store = db.query(Store).filter(Store.domain == domain).first()
        if not store:
            timings["pick_product_url_s"] = round(
                (time.perf_counter() - t_phase) , 3
            )
            outcome = "store_not_found"
            return JSONResponse(
                status_code=404, content={"error": "Store not found"}
            )

        # Pick a product URL to analyze as the storefront sample.
        first_product = (
            db.query(StoreProduct)
            .filter(StoreProduct.store_id == store.id)
            .order_by(asc(StoreProduct.created_at))
            .first()
        )
        product_url: str | None = first_product.url if first_product else None

        # Fallback: reuse the URL from the previous StoreAnalysis run.
        if product_url is None:
            existing = (
                db.query(StoreAnalysis)
                .filter(StoreAnalysis.store_domain == domain)
                .filter(StoreAnalysis.user_id == current_user.id)
                .first()
            )
            if existing is not None:
                product_url = existing.analyzed_url

        timings["pick_product_url_s"] = round((time.perf_counter() - t_phase) , 3)

        if product_url is None:
            outcome = "no_products"
            return JSONResponse(
                status_code=404,
                content={"error": "No products found for this store to analyze"},
            )

        t_phase = time.perf_counter()
        result = await _run_store_wide_analysis(
            domain,
            product_url,
            current_user.id,
            db,
            force=True,
            only_dimensions=only_dimensions,
        )
        timings["store_wide_analysis_s"] = round(
            (time.perf_counter() - t_phase) , 3
        )
        if result is None:
            outcome = "analysis_failed"
            return JSONResponse(
                status_code=502,
                content={"error": "Store-wide analysis failed — please try again"},
            )
        return result

    except Exception:
        outcome = "error"
        logger.exception(
            "refresh-analysis failed for domain=%s user_id=%s", domain, current_user.id
        )
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to refresh store analysis"},
        )
    finally:
        timings["total_s"] = round((time.perf_counter() - t_total) , 3)
        logger.info(
            "scan_timings refresh_analysis outcome=%s domain=%s total_s=%s timings=%s",
            outcome, domain, timings["total_s"], timings,
            extra={
                "event": "scan_timings",
                "scope": "refresh_analysis",
                "outcome": outcome,
                "domain": domain,
                "user_id": str(current_user.id) if current_user else None,
                "timings_s": timings,
            },
        )
