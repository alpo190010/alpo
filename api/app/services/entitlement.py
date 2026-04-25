"""Credit entitlement service — pure functions for credit checking, usage
incrementing, and free-tier monthly reset.

Also exposes the store-quota helpers used to cap how many distinct
stores (domains) a user may have scanned at once.

This is the business logic layer that downstream routes wire in as a
Depends() guard (e.g. /analyze in S03).

Race-safety note:
The direct attribute approach (user.credits_used += 1) is sufficient for
the free tier (max 3 credits).  A concurrent request could theoretically
double-reset, but that's harmless (resetting 0 to 0).  Paid-tier resets
are handled atomically by webhooks in S02.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import ProductAnalysis, StoreAnalysis, User
from app.plans import PLAN_TIERS

DEFAULT_STORE_QUOTA = 1


def _effective_store_quota(user: User) -> int:
    """Return the user's store quota, falling back to the default when unset.

    DB-backed users always have a value (server_default="1"), but transient
    ``User()`` instances in tests may have ``store_quota = None``.
    """
    quota = getattr(user, "store_quota", None)
    return quota if quota is not None else DEFAULT_STORE_QUOTA


def get_credits_limit(plan_tier: str) -> int | None:
    """Return the credit limit for *plan_tier*.

    Returns None when the tier is unlimited (Starter, Pro).  Falls back
    to the free-tier limit when the tier key is not recognised, so
    callers never crash on stale or invalid tier strings.
    """
    tier = PLAN_TIERS.get(plan_tier)
    if tier is None:
        return PLAN_TIERS["free"]["credits_limit"]
    return tier["credits_limit"]


def has_credits_remaining(user: User) -> bool:
    """Return True when the user still has credits left in this period.

    Users on unlimited tiers (credits_limit is None) always have credits.
    """
    limit = get_credits_limit(user.plan_tier)
    if limit is None:
        return True
    return user.credits_used < limit


def increment_credits(user: User, db: Session) -> None:
    """Consume one credit for *user* and persist the change.

    No-op for unlimited tiers — tracking usage on Starter/Pro is pointless
    because it never bounds access.
    """
    if get_credits_limit(user.plan_tier) is None:
        return
    user.credits_used += 1
    db.commit()


def maybe_reset_free_credits(user: User, db: Session) -> None:
    """Reset credits for a *free*-tier user when the calendar month rolls over.

    Compares the (year, month) of credits_reset_at to now.  If they differ,
    credits_used is zeroed and credits_reset_at is stamped with the current
    time.  Paid tiers are skipped entirely — their reset is driven by
    webhook events from the billing provider (S02).
    """
    if user.plan_tier != "free":
        return

    if user.credits_reset_at is None:
        return

    reset_at = user.credits_reset_at
    if reset_at.tzinfo is None:
        reset_at = reset_at.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    if (reset_at.year, reset_at.month) == (now.year, now.month):
        return

    user.credits_used = 0
    user.credits_reset_at = now
    db.commit()


def count_user_stores(user_id, db: Session) -> int:
    """Return the number of distinct stores (domains) a user has scanned.

    Counts across both ``store_analyses`` and ``product_analyses`` because
    a user may only have a product-level scan for a domain if they came
    in through the /analyze path. A store counts once per distinct domain.
    """
    sa = {
        row[0]
        for row in db.query(StoreAnalysis.store_domain)
        .filter(StoreAnalysis.user_id == user_id)
        .all()
    }
    pa = {
        row[0]
        for row in db.query(ProductAnalysis.store_domain)
        .filter(ProductAnalysis.user_id == user_id)
        .all()
    }
    return len(sa | pa)


def quota_exhausted_response(user: User, db: Session) -> dict:
    """Build the canonical 403 body for a store-quota-exhausted scan attempt.

    Used by /analyze, /discover-products, and /store/{domain}/rescan
    so all three speak the same wire shape:

        {"error": str, "errorCode": "store_quota_exhausted",
         "quota": int, "used": int}

    Field names match GET /user/stores (the canonical pre-flight check the
    HeroForm modal already consumes), so callers can render the same modal
    regardless of which gate fired.
    """
    return {
        "error": "Store quota reached",
        "errorCode": "store_quota_exhausted",
        "quota": _effective_store_quota(user),
        "used": count_user_stores(user.id, db),
    }


def user_has_store_slot_for(user: User, store_domain: str, db: Session) -> bool:
    """Return True if *user* may scan *store_domain*.

    A user may scan a store when either:
      - they already have a StoreAnalysis or ProductAnalysis row for the
        same domain (re-scan — free), or
      - their distinct-domain count is below their ``store_quota``.
    """
    if (
        db.query(StoreAnalysis.id)
        .filter(
            StoreAnalysis.user_id == user.id,
            StoreAnalysis.store_domain == store_domain,
        )
        .first()
        is not None
    ):
        return True
    if (
        db.query(ProductAnalysis.id)
        .filter(
            ProductAnalysis.user_id == user.id,
            ProductAnalysis.store_domain == store_domain,
        )
        .first()
        is not None
    ):
        return True
    return count_user_stores(user.id, db) < _effective_store_quota(user)
