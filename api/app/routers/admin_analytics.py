"""Admin platform analytics endpoint.

GET /admin/analytics — DB-driven platform metrics (total users, signups
over time, scan volume, plan tier distribution, total credits used).

Requires admin role via ``get_current_user_admin``.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import get_current_user_admin
from app.database import get_db
from app.models import User

logger = logging.getLogger(__name__)

router = APIRouter()


# Single-round-trip analytics query. Every metric the admin dashboard needs is
# produced by one SELECT so we pay the Python/DBAPI/socket round-trip tax once
# instead of five times. Postgres builds the JSON shapes server-side; the
# handler only has to unpack already-correct payloads.
_ANALYTICS_SQL = text(
    """
    WITH
      user_agg AS (
        SELECT
          count(*)                                AS total_users,
          count(*) FILTER (WHERE pro_waitlist)    AS waitlist_count
        FROM users
      ),
      signups AS (
        SELECT created_at::date AS date, count(*)::int AS count
        FROM users
        WHERE created_at >= :cutoff
        GROUP BY 1 ORDER BY 1
      ),
      scans_series AS (
        SELECT created_at::date AS date, count(*)::int AS count
        FROM product_analyses
        WHERE created_at >= :cutoff
        GROUP BY 1 ORDER BY 1
      ),
      plans AS (
        SELECT plan_tier, count(*)::int AS count
        FROM store_subscriptions
        WHERE current_period_end > now()
        GROUP BY plan_tier
      )
    SELECT
      (SELECT row_to_json(user_agg) FROM user_agg)                           AS user_agg,
      coalesce((SELECT json_agg(signups)      FROM signups),      '[]'::json) AS signups,
      (SELECT count(*) FROM product_analyses)                                AS total_scans,
      coalesce((SELECT json_agg(scans_series) FROM scans_series), '[]'::json) AS scans_series,
      coalesce((SELECT json_agg(plans)        FROM plans),        '[]'::json) AS plans
    """
)


@router.get("/admin/analytics")
def get_analytics(
    admin_user: User = Depends(get_current_user_admin),
    db: Session = Depends(get_db),
):
    """Return platform-wide analytics metrics in a single DB round-trip."""
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    t0 = time.perf_counter()
    row = db.execute(_ANALYTICS_SQL, {"cutoff": thirty_days_ago}).one()
    db_ms = (time.perf_counter() - t0) * 1000
    logger.info("admin_analytics db_ms=%.1f", db_ms)

    user_agg = row.user_agg or {}
    signups = row.signups or []
    scans_series = row.scans_series or []
    plans = row.plans or []

    return {
        "total_users": user_agg.get("total_users", 0) or 0,
        "signups_over_time": [
            {"date": s["date"], "count": s["count"]} for s in signups
        ],
        "total_scans": row.total_scans or 0,
        "scans_over_time": [
            {"date": s["date"], "count": s["count"]} for s in scans_series
        ],
        "plan_distribution": [
            {"plan_tier": p["plan_tier"], "count": p["count"]} for p in plans
        ],
        "active_paid_plans": sum(p.get("count", 0) or 0 for p in plans),
        "waitlistCount": user_agg.get("waitlist_count", 0) or 0,
    }
