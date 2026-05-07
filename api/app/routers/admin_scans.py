"""Admin scanned-domain audit endpoints.

GET  /admin/scans                 — paginated list of every scanned domain
POST /admin/scans/{domain}/rescan — re-run store-wide analysis for a domain

The list aggregates the ``scans`` table by hostname (e.g. all rows for
``allbirds.com/products/wool-runners``, ``allbirds.com/products/tree-dasher``,
etc. collapse to a single ``allbirds.com`` row) so admins see one row
per real store rather than one per individual URL.

Each row carries the latest known score, is_shopify flag, and total scan
count for the domain. Rescan triggers the same code path as the user-
facing ``POST /store/{domain}/rescan`` so refreshing here updates the
``StoreAnalysis`` row that ``/scan/{domain}`` reads.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Text, cast, desc, distinct, func
from sqlalchemy.orm import Session

from app.auth import get_current_user_admin
from app.database import get_db
from app.models import ProductAnalysis, Scan, Store, StoreAnalysis, User
from app.routers.discover_products import _run_store_wide_analysis

logger = logging.getLogger(__name__)

router = APIRouter()


def _domain_expr():
    """SQLAlchemy expression that extracts ``host`` from a scan URL.

    Strips ``https?://``, optional ``www.``, and the path/query — yielding
    e.g. ``allbirds.com`` from ``https://www.allbirds.com/products/x``.
    Lowercased for case-insensitive grouping.
    """
    no_scheme = func.regexp_replace(Scan.url, r"^https?://(?:www\.)?", "", "i")
    host_only = func.split_part(no_scheme, "/", 1)
    return func.lower(host_only)


@router.get("/admin/scans")
def list_scanned_domains(
    search: Optional[str] = None,
    is_shopify: Optional[str] = Query(
        None,
        description="Filter by detected platform: 'true', 'false', or 'unknown' (NULL).",
    ),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    admin_user: User = Depends(get_current_user_admin),
    db: Session = Depends(get_db),
):
    """One row per distinct domain seen in the ``scans`` table.

    Aggregates: ``scan_count`` (rows), ``last_scanned_at`` (max created_at),
    ``unique_users`` (distinct user_id incl. anonymous), ``latest_score``
    (most recent Scan.score for the domain), and ``is_shopify`` (most
    recent ``store_analyses.is_shopify`` for the domain — NULL when the
    domain was only product-analyzed without a store-wide pass).
    """
    domain = _domain_expr().label("domain")

    # ``unique_users`` counts distinct authenticated user_ids plus 1 if any
    # anonymous scan exists for the domain. We cast user_id (UUID) to text
    # before COALESCE because PG can't coalesce a UUID with a string literal.
    unique_users_expr = func.count(
        distinct(func.coalesce(cast(Scan.user_id, Text), "anon"))
    )
    base = db.query(
        domain,
        func.count(Scan.id).label("scan_count"),
        func.max(Scan.created_at).label("last_scanned_at"),
        unique_users_expr.label("unique_users"),
    ).group_by(domain)

    if date_from is not None:
        base = base.filter(Scan.created_at >= date_from)
    if date_to is not None:
        base = base.filter(Scan.created_at <= date_to)
    if search:
        base = base.having(domain.ilike(f"%{search}%"))

    # Subquery — pull total count of distinct domains for pagination.
    total = base.count()

    rows = (
        base.order_by(desc("last_scanned_at"))
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    if not rows:
        return {"scans": [], "total": total, "page": page, "perPage": per_page}

    domains = [r.domain for r in rows]

    # Most-recent StoreAnalysis per domain — gives is_shopify and a usable
    # score that matches what /scan/{domain} renders.
    sa_rank = func.row_number().over(
        partition_by=StoreAnalysis.store_domain,
        order_by=desc(StoreAnalysis.updated_at),
    ).label("rn")
    sa_subq = (
        db.query(
            StoreAnalysis.store_domain.label("dom"),
            StoreAnalysis.score.label("score"),
            StoreAnalysis.is_shopify.label("is_shopify"),
            StoreAnalysis.user_id.label("user_id"),
            sa_rank,
        )
        .filter(StoreAnalysis.store_domain.in_(domains))
        .subquery()
    )
    sa_latest = (
        db.query(
            sa_subq.c.dom,
            sa_subq.c.score,
            sa_subq.c.is_shopify,
            sa_subq.c.user_id,
        )
        .filter(sa_subq.c.rn == 1)
        .all()
    )
    sa_by_dom = {row.dom: row for row in sa_latest}

    # Fallback: if there's no StoreAnalysis row but a ProductAnalysis exists
    # for the domain, use its is_shopify flag.
    pa_rank = func.row_number().over(
        partition_by=ProductAnalysis.store_domain,
        order_by=desc(ProductAnalysis.updated_at),
    ).label("rn")
    pa_subq = (
        db.query(
            ProductAnalysis.store_domain.label("dom"),
            ProductAnalysis.score.label("score"),
            ProductAnalysis.is_shopify.label("is_shopify"),
            pa_rank,
        )
        .filter(ProductAnalysis.store_domain.in_(domains))
        .subquery()
    )
    pa_latest = (
        db.query(
            pa_subq.c.dom, pa_subq.c.score, pa_subq.c.is_shopify
        )
        .filter(pa_subq.c.rn == 1)
        .all()
    )
    pa_by_dom = {row.dom: row for row in pa_latest}

    # Apply is_shopify filter post-aggregation (small N, simpler than SQL).
    def _platform_for(dom: str) -> Optional[bool]:
        sa = sa_by_dom.get(dom)
        if sa is not None and sa.is_shopify is not None:
            return bool(sa.is_shopify)
        pa = pa_by_dom.get(dom)
        if pa is not None and pa.is_shopify is not None:
            return bool(pa.is_shopify)
        return None

    def _score_for(dom: str, fallback: Optional[int]) -> Optional[int]:
        sa = sa_by_dom.get(dom)
        if sa is not None and sa.score is not None:
            return int(sa.score)
        pa = pa_by_dom.get(dom)
        if pa is not None and pa.score is not None:
            return int(pa.score)
        return fallback

    out = []
    for r in rows:
        platform = _platform_for(r.domain)
        if is_shopify == "true" and platform is not True:
            continue
        if is_shopify == "false" and platform is not False:
            continue
        if is_shopify == "unknown" and platform is not None:
            continue
        out.append(
            {
                "domain": r.domain,
                "scanCount": int(r.scan_count),
                "uniqueUsers": int(r.unique_users),
                "lastScannedAt": (
                    r.last_scanned_at.isoformat() if r.last_scanned_at else None
                ),
                "latestScore": _score_for(r.domain, None),
                "isShopify": platform,
            }
        )

    return {"scans": out, "total": total, "page": page, "perPage": per_page}


@router.post("/admin/scans/{domain}/rescan")
async def rescan_domain(
    domain: str,
    admin_user: User = Depends(get_current_user_admin),
    db: Session = Depends(get_db),
):
    """Force-rescan a domain's store-wide analysis.

    Picks an existing user + product URL associated with the domain
    (preferring the most recent StoreAnalysis row, falling back to the
    most recent authenticated ProductAnalysis or Scan) and runs
    ``_run_store_wide_analysis(force=True)`` against it. The same path
    the user-facing ``POST /store/{domain}/rescan`` button uses, so the
    ``StoreAnalysis`` row that ``/scan/{domain}`` reads gets refreshed
    in place.
    """
    domain = (domain or "").strip().lower()
    if not domain:
        raise HTTPException(status_code=400, detail="domain is required")

    # Prefer the most recent StoreAnalysis row — it has both user_id and
    # analyzed_url, ready to feed into _run_store_wide_analysis.
    sa = (
        db.query(StoreAnalysis)
        .filter(StoreAnalysis.store_domain == domain)
        .order_by(desc(StoreAnalysis.updated_at))
        .first()
    )
    user_id = None
    product_url = None
    if sa is not None:
        user_id = sa.user_id
        product_url = sa.analyzed_url

    # Fall back to most recent authenticated ProductAnalysis if no
    # StoreAnalysis row exists for this domain yet.
    if user_id is None or product_url is None:
        pa = (
            db.query(ProductAnalysis)
            .filter(ProductAnalysis.store_domain == domain)
            .order_by(desc(ProductAnalysis.updated_at))
            .first()
        )
        if pa is not None:
            user_id = pa.user_id
            product_url = pa.product_url

    # Last fallback: any authenticated Scan row for the domain. We need an
    # authenticated user_id because StoreAnalysis has a NOT NULL user_id FK.
    if user_id is None or product_url is None:
        scan = (
            db.query(Scan)
            .filter(Scan.url.ilike(f"%{domain}%"))
            .filter(Scan.user_id.isnot(None))
            .order_by(desc(Scan.created_at))
            .first()
        )
        if scan is not None:
            user_id = scan.user_id
            product_url = scan.url

    if user_id is None or product_url is None:
        # Domain has only anonymous scans — admin can't refresh per-user
        # store data. Surface the situation rather than silently no-op.
        # Confirm a StoreProduct record exists so we can pick one URL.
        store = db.query(Store).filter(Store.domain == domain).first()
        if store is None:
            raise HTTPException(
                status_code=404,
                detail="Domain not found in any analysis or store record.",
            )
        raise HTTPException(
            status_code=409,
            detail=(
                "Only anonymous scans exist for this domain — sign in as the "
                "owning user and visit it to populate per-user data first."
            ),
        )

    logger.info(
        "Admin %s rescanning domain %s (using user_id=%s product_url=%s)",
        admin_user.email,
        domain,
        user_id,
        product_url,
    )

    result = await _run_store_wide_analysis(
        domain=domain,
        product_url=product_url,
        user_id=user_id,
        db=db,
        force=True,
    )
    if result is None:
        raise HTTPException(
            status_code=502,
            detail="Store-wide analysis failed — please try again.",
        )

    return {
        "domain": domain,
        "score": result.get("score"),
        "isShopify": result.get("isShopify"),
        "skippedDimensions": result.get("skippedDimensions", []),
        "updatedAt": result.get("updatedAt"),
    }
