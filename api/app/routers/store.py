"""GET /store/{domain} — return store, products, and analyses for a domain.

Also exposes POST /store/{domain}/rescan to manually re-run the store-wide
dimension scan, bypassing the 7-day cache.
"""

import logging
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import asc
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.auth import get_current_user_optional, get_current_user_required
from app.database import get_db
from app.models import ProductAnalysis, Store, StoreAnalysis, StoreProduct, User
from app.routers.discover_products import (
    _run_store_wide_analysis,
    _try_shopify_json_page,
)
from app.services.dimension_fixes import gate_store_analysis_for_free_tier
from app.services.entitlement import (
    can_paginate,
    get_credits_limit,
    has_credits_remaining,
    increment_credits,
    maybe_reset_free_credits,
    pagination_locked_response,
    quota_exhausted_response,
    user_has_store_slot_for,
)
from app.services.scoring import STORE_WIDE_KEYS
from app.services.shopify_sitemap import total_pages_for

PRODUCTS_PAGE_SIZE = 10

logger = logging.getLogger(__name__)

router = APIRouter()

PRODUCT_ANALYSIS_TTL = timedelta(hours=24)

# Free-tier rescan cooldown.
#
# Keyed *per user*, not per (user, dimension): a free-tier user gets one
# rescan of any kind per minute, full stop. Switching dimensions does NOT
# reset the timer. This is intentional — the cooldown exists to keep free
# users from grinding through the credit pool with rapid back-to-back
# rescans, and a per-dimension key would let them bypass it by rotating
# (checkout → trust → shipping → …). Paid tiers (starter, pro) are
# unlimited and skip this gate entirely.
_FREE_RESCAN_COOLDOWN_SECONDS = 60
_free_rescan_last: dict[str, float] = {}


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
            .limit(PRODUCTS_PAGE_SIZE)
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
            "productCount": store.product_count,
            "currentPage": 1,
            "totalPages": total_pages_for(store.product_count, PRODUCTS_PAGE_SIZE),
            "canPaginate": can_paginate(current_user),
            "analyses": analyses,
            "storeAnalysis": gate_store_analysis_for_free_tier(
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
                current_user,
            )
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


@router.get("/store/{domain}/products")
async def get_store_products(
    domain: str,
    page: int = 1,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Paginated catalog browse for the cached/lazy-fetched product list.

    Page 1 is allowed for any authenticated user (it's the same data
    /store/{domain} returns).  Pages 2+ require ``can_paginate(user)`` —
    free-tier callers receive a 403 with ``errorCode: pagination_locked``.

    DB-cache first.  On miss for page > 1 we lazy-fetch
    ``/products.json?page=N&limit=10`` from Shopify, idempotently insert
    the results, and serialise in Shopify's order.  The on-conflict-do-
    nothing on (store_id, url) makes concurrent pagination safe.
    """
    if not domain:
        return JSONResponse(
            status_code=400, content={"error": "Domain is required"}
        )
    if page < 1:
        return JSONResponse(
            status_code=400, content={"error": "Page must be >= 1"}
        )

    store = db.query(Store).filter(Store.domain == domain).first()
    if not store:
        return JSONResponse(
            status_code=404, content={"error": "Store not found"}
        )

    # Pages past the first require a paid plan.  Page 1 is always free
    # (it mirrors what /store/{domain} already returns).
    if page > 1 and not can_paginate(current_user):
        return JSONResponse(
            status_code=403,
            content=pagination_locked_response(current_user),
        )

    page_size = PRODUCTS_PAGE_SIZE
    offset = (page - 1) * page_size

    cached = (
        db.query(StoreProduct)
        .filter(StoreProduct.store_id == store.id)
        .order_by(asc(StoreProduct.created_at))
        .offset(offset)
        .limit(page_size)
        .all()
    )

    if len(cached) == page_size or (cached and page == 1):
        products_out = [
            {"id": str(p.id), "url": p.url, "slug": p.slug, "image": p.image}
            for p in cached
        ]
    else:
        # DB cache miss — lazy-fetch this page directly from Shopify.
        origin = f"https://{store.domain}"
        fetched = await _try_shopify_json_page(
            origin, page=page, page_size=page_size
        )
        if not fetched:
            if page == 1:
                products_out = [
                    {"id": str(p.id), "url": p.url, "slug": p.slug, "image": p.image}
                    for p in cached
                ]
            else:
                return JSONResponse(
                    status_code=404,
                    content={
                        "error": "Page not found",
                        "errorCode": "page_out_of_range",
                    },
                )
        else:
            rows = [
                {
                    "store_id": store.id,
                    "url": p["url"],
                    "slug": p["slug"],
                    "image": p.get("image") or None,
                }
                for p in fetched
            ]
            stmt = (
                pg_insert(StoreProduct)
                .values(rows)
                .on_conflict_do_nothing(
                    index_elements=["store_id", "url"]
                )
            )
            db.execute(stmt)
            db.commit()

            # Resolve IDs for the just-inserted (or already-present) rows
            # so we can return the same shape as the DB-cache-hit branch.
            urls = [p["url"] for p in fetched]
            id_by_url = {
                row[0]: str(row[1])
                for row in db.query(StoreProduct.url, StoreProduct.id)
                .filter(StoreProduct.store_id == store.id)
                .filter(StoreProduct.url.in_(urls))
                .all()
            }
            products_out = [
                {
                    "id": id_by_url.get(p["url"], ""),
                    "url": p["url"],
                    "slug": p["slug"],
                    "image": p.get("image"),
                }
                for p in fetched
            ]

    return {
        "products": products_out,
        "productCount": store.product_count,
        "currentPage": page,
        "totalPages": total_pages_for(store.product_count, page_size),
        "canPaginate": can_paginate(current_user),
    }


@router.post("/store/{domain}/rescan")
async def rescan_store_analysis(
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

    Free-tier users are rate-limited to 1 rescan per minute (per user). Paid
    tiers (starter, pro, etc.) are unlimited.
    """
    if not domain:
        return JSONResponse(
            status_code=400, content={"error": "Domain is required"}
        )

    # --- Store quota check ---
    # Rescan can upsert a new StoreAnalysis row for a domain the caller
    # has never scanned, so it must respect the quota like /analyze and
    # /discover-products.
    if not user_has_store_slot_for(current_user, domain, db):
        return JSONResponse(
            status_code=403,
            content=quota_exhausted_response(current_user, db),
        )

    # --- Credit check ---
    # Rescan forces a fresh scan (force=True below), so it does the same
    # work as /analyze and consumes one credit. Free users hitting their
    # monthly cap get the same 403 envelope as /analyze.
    maybe_reset_free_credits(current_user, db)
    if not has_credits_remaining(current_user):
        return JSONResponse(
            status_code=403,
            content={
                "error": "Credit limit reached",
                "errorCode": "credit_exhausted",
                "planTier": current_user.plan_tier,
                "creditsUsed": current_user.credits_used,
                "creditsLimit": get_credits_limit(current_user.plan_tier),
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
        last_ts = _free_rescan_last.get(user_key)
        if last_ts is not None and (now_ts - last_ts) < _FREE_RESCAN_COOLDOWN_SECONDS:
            retry_after = int(
                _FREE_RESCAN_COOLDOWN_SECONDS - (now_ts - last_ts)
            )
            return JSONResponse(
                status_code=429,
                content={
                    "error": (
                        f"Please wait {retry_after}s before rescanning again. "
                        "Upgrade to remove this limit."
                    ),
                    "retryAfter": retry_after,
                    "upgradeAvailable": True,
                },
                headers={"Retry-After": str(retry_after)},
            )
        _free_rescan_last[user_key] = now_ts

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

        # --- Consume credit (best-effort — analysis already succeeded) ---
        try:
            increment_credits(current_user, db)
        except Exception:
            logger.exception(
                "Credit increment failed for user %s domain=%s — rescan delivered anyway",
                current_user.id, domain,
            )
        return gate_store_analysis_for_free_tier(result, current_user)

    except Exception:
        outcome = "error"
        logger.exception(
            "rescan failed for domain=%s user_id=%s", domain, current_user.id
        )
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to rescan store"},
        )
    finally:
        timings["total_s"] = round((time.perf_counter() - t_total) , 3)
        logger.info(
            "scan_timings rescan outcome=%s domain=%s total_s=%s timings=%s",
            outcome, domain, timings["total_s"], timings,
            extra={
                "event": "scan_timings",
                "scope": "rescan",
                "outcome": outcome,
                "domain": domain,
                "user_id": str(current_user.id) if current_user else None,
                "timings_s": timings,
            },
        )


# ---------------------------------------------------------------------------
# Deprecated: legacy /refresh-analysis path → /rescan
# ---------------------------------------------------------------------------
#
# The route was renamed to /rescan to align with the rest of the product's
# terminology (every other surface — buttons, cooldown messages, lib names —
# uses "rescan"). This handler 308-redirects the old path to the new one so
# any cached client URLs / bookmarked integrations keep working for one
# release cycle. Delete after operators have had a chance to update their
# clients (track via the PR description).
@router.post("/store/{domain}/refresh-analysis", include_in_schema=False)
async def refresh_analysis_legacy_redirect(domain: str, request: Request):
    """308-redirect from the deprecated /refresh-analysis path to /rescan.

    308 (vs 301/307) preserves both the POST method and the request body, so
    clients hitting the old path with a JSON body don't get downgraded to a
    GET. Query params (e.g. ``?dimension=X``) come along automatically when
    the client follows the redirect.
    """
    target = f"/store/{domain}/rescan"
    if request.url.query:
        target = f"{target}?{request.url.query}"
    return JSONResponse(
        status_code=308,
        content={"detail": "Renamed to /rescan; following redirect."},
        headers={"Location": target},
    )
