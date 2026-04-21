"""Admin platform analytics endpoint.

GET /admin/analytics — DB-driven platform metrics (total users, signups
over time, scan volume, plan tier distribution, total credits used).

Requires admin role via ``get_current_user_admin``.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import Date, case, cast, func
from sqlalchemy.orm import Session

from app.auth import get_current_user_admin
from app.database import get_db
from app.models import ProductAnalysis, User

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/admin/analytics")
def get_analytics(
    admin_user: User = Depends(get_current_user_admin),
    db: Session = Depends(get_db),
):
    """Return platform-wide analytics metrics.

    Response keys:
    - ``total_users``: int
    - ``signups_over_time``: list of ``{date, count}`` (last 30 days)
    - ``total_scans``: int
    - ``scans_over_time``: list of ``{date, count}`` (last 30 days)
    - ``plan_distribution``: list of ``{plan_tier, count}``
    - ``total_credits_used``: int
    """
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    # --- User single-row aggregates (total, credits sum, waitlist) ---
    # Combined into one query to avoid 3 round-trips. COUNT(*) FILTER is the
    # standard SQL way to do conditional aggregation — Postgres supports it
    # natively.
    user_agg = db.query(
        func.count(User.id).label("total_users"),
        func.coalesce(func.sum(User.credits_used), 0).label("total_credits"),
        func.count(case((User.pro_waitlist == True, 1))).label("waitlist_count"),
    ).one()
    total_users = user_agg.total_users or 0
    total_credits_used = user_agg.total_credits or 0
    waitlist_count = user_agg.waitlist_count or 0

    # --- Signups over time (last 30 days) ---
    signups_rows = (
        db.query(
            cast(User.created_at, Date).label("date"),
            func.count(User.id).label("count"),
        )
        .filter(User.created_at >= thirty_days_ago)
        .group_by(cast(User.created_at, Date))
        .order_by(cast(User.created_at, Date))
        .all()
    )
    signups_over_time = [
        {"date": row.date.isoformat(), "count": row.count}
        for row in signups_rows
    ]

    # --- Total scans (product analyses) ---
    total_scans = db.query(func.count(ProductAnalysis.id)).scalar() or 0

    # --- Scans over time (last 30 days) ---
    scans_rows = (
        db.query(
            cast(ProductAnalysis.created_at, Date).label("date"),
            func.count(ProductAnalysis.id).label("count"),
        )
        .filter(ProductAnalysis.created_at >= thirty_days_ago)
        .group_by(cast(ProductAnalysis.created_at, Date))
        .order_by(cast(ProductAnalysis.created_at, Date))
        .all()
    )
    scans_over_time = [
        {"date": row.date.isoformat(), "count": row.count}
        for row in scans_rows
    ]

    # --- Plan tier distribution ---
    plan_rows = (
        db.query(
            User.plan_tier,
            func.count(User.id).label("count"),
        )
        .group_by(User.plan_tier)
        .all()
    )
    plan_distribution = [
        {"plan_tier": row.plan_tier, "count": row.count}
        for row in plan_rows
    ]

    return {
        "total_users": total_users,
        "signups_over_time": signups_over_time,
        "total_scans": total_scans,
        "scans_over_time": scans_over_time,
        "plan_distribution": plan_distribution,
        "total_credits_used": total_credits_used,
        "waitlistCount": waitlist_count,
    }
