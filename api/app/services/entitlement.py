"""Entitlement service — per-store gating helpers.

After the per-store-plans rewrite this module is a thin shim around
``store_subscriptions``: the only gate left at the entitlement layer is
catalog pagination, which is unlocked by an active paid plan on the
specific store being browsed.

Removed (obsolete in the per-store model):

- ``store_quota`` / ``user_has_store_slot_for`` / ``count_user_stores`` /
  ``quota_exhausted_response``: scans are unlimited.
- ``credits_*`` / ``has_credits_remaining`` / ``increment_credits`` /
  ``maybe_reset_free_credits``: no more monthly free-credit cap.
- ``maybe_expire_paid_access``: lazy expiry now lives on each
  ``store_subscriptions`` row's ``current_period_end``.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.services.store_subscriptions import get_effective_tier

PAID_TIERS = ("insights", "fixes")


def can_paginate(
    user_id: UUID | str | None,
    store_domain: str | None,
    db: Session,
) -> bool:
    """Return True if *user_id* may paginate past page 1 of *store_domain*.

    Anonymous callers and free-tier (no active subscription) callers are
    capped at the first page. Paid plans (insights, fixes) on the
    specific store unlock the full catalog.
    """
    if user_id is None or not store_domain:
        return False
    return get_effective_tier(user_id, store_domain, db) in PAID_TIERS


def pagination_locked_response(plan_tier: str = "free") -> dict:
    """Build the canonical 403 body for a free-tier paginated request."""
    return {
        "error": "Pagination requires a paid plan",
        "errorCode": "pagination_locked",
        "planTier": plan_tier,
    }
