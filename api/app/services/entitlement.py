"""Credit entitlement service — pure functions for credit checking, usage
incrementing, and free-tier monthly reset.

This is the business logic layer that downstream routes wire in as a
Depends() guard (e.g. /analyze in S03).

Race-safety note:
The direct attribute approach (user.credits_used += 1) is sufficient for
the free tier (max 3 credits).  A concurrent request could theoretically
double-reset, but that's harmless (resetting 0 to 0).  Paid-tier resets
are handled atomically by webhooks in S02.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import User
from app.plans import PLAN_TIERS


def get_credits_limit(plan_tier: str) -> int:
    """Return the credit limit for *plan_tier*.

    Falls back to the free-tier limit when the tier key is not recognised,
    so callers never crash on stale or invalid tier strings.
    """
    tier = PLAN_TIERS.get(plan_tier)
    if tier is None:
        return PLAN_TIERS["free"]["credits_limit"]
    return tier["credits_limit"]


def has_credits_remaining(user: User) -> bool:
    """Return True when the user still has credits left in this period."""
    return user.credits_used < get_credits_limit(user.plan_tier)


def increment_credits(user: User, db: Session) -> None:
    """Consume one credit for *user* and persist the change."""
    user.credits_used += 1
    db.commit()


def maybe_reset_free_credits(user: User, db: Session) -> None:
    """Reset credits for a *free*-tier user whose 30-day window has elapsed.

    Paid tiers are skipped entirely — their reset is driven by webhook
    events from the billing provider (S02).
    """
    if user.plan_tier != "free":
        return

    if user.credits_reset_at is None:
        return

    threshold = datetime.now(timezone.utc) - timedelta(days=30)

    # Handle timezone-naive datetimes by treating them as UTC.
    reset_at = user.credits_reset_at
    if reset_at.tzinfo is None:
        reset_at = reset_at.replace(tzinfo=timezone.utc)

    if reset_at > threshold:
        # Recent reset — nothing to do.
        return

    user.credits_used = 0
    user.credits_reset_at = datetime.now(timezone.utc)
    db.commit()
