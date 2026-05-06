"""Per-store subscription service — single source of truth for paid access.

Replaces the user-level ``plan_tier`` / ``credits`` model. Tier is
resolved per (user, store) pair: a fresh row in ``store_subscriptions``
unlocks ``insights`` or ``fixes`` for that store; absence or expiry
means the pair is on the implicit free tier.

Design rules
------------
- Anonymous users always resolve to ``"free"``.
- A row whose ``current_period_end`` is at or before ``now()`` is
  considered expired and yields ``"free"``. We do not delete expired
  rows here — webhook events drive lifecycle. Lazy expiry means the
  store also becomes deletable again automatically (see ``user_stores``).
- ``store_domain`` is matched as the caller passes it. Callers should
  pre-normalize via ``.strip().lower()`` to match the convention used
  throughout the analyze pipeline.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import StoreSubscription

PaidTier = Literal["insights", "fixes"]
EffectiveTier = Literal["free", "insights", "fixes"]

PAID_TIERS: tuple[PaidTier, ...] = ("insights", "fixes")


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _is_active(subscription: StoreSubscription) -> bool:
    """Return True iff the subscription's window has not yet ended."""
    period_end = subscription.current_period_end
    if period_end is None:
        return False
    if period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=timezone.utc)
    return period_end > _now_utc()


def get_active_subscription(
    user_id: UUID | str | None,
    store_domain: str,
    db: Session,
) -> StoreSubscription | None:
    """Return the active subscription for *user_id* / *store_domain*, or None.

    Returns None for anonymous callers, missing rows, and expired rows.
    """
    if user_id is None:
        return None
    row = (
        db.query(StoreSubscription)
        .filter(
            StoreSubscription.user_id == user_id,
            StoreSubscription.store_domain == store_domain,
        )
        .first()
    )
    if row is None:
        return None
    return row if _is_active(row) else None


def get_effective_tier(
    user_id: UUID | str | None,
    store_domain: str,
    db: Session,
) -> EffectiveTier:
    """Return the tier the user has for *store_domain*: "free", "insights", or "fixes"."""
    sub = get_active_subscription(user_id, store_domain, db)
    if sub is None:
        return "free"
    tier = sub.plan_tier
    if tier in PAID_TIERS:
        return tier  # type: ignore[return-value]
    return "free"


def user_has_active_subscription_for(
    user_id: UUID | str | None,
    store_domain: str,
    db: Session,
) -> bool:
    """Return True iff the user holds a currently-active paid plan for the store.

    Used by ``DELETE /user/stores/{domain}`` to forbid deletion of a
    store with an active paid plan attached.
    """
    return get_active_subscription(user_id, store_domain, db) is not None


def list_paid_stores(user_id: UUID | str, db: Session) -> list[dict]:
    """Return one entry per store the user holds an active paid plan for.

    Shape: ``[{"domain": str, "tier": "insights"|"fixes", "currentPeriodEnd": iso}]``.
    Only currently-active rows are returned; expired rows are filtered out.
    """
    rows = (
        db.query(StoreSubscription)
        .filter(StoreSubscription.user_id == user_id)
        .all()
    )
    out: list[dict] = []
    for row in rows:
        if not _is_active(row):
            continue
        period_end = row.current_period_end
        if period_end is not None and period_end.tzinfo is None:
            period_end = period_end.replace(tzinfo=timezone.utc)
        out.append(
            {
                "domain": row.store_domain,
                "tier": row.plan_tier,
                "currentPeriodEnd": (
                    period_end.isoformat() if period_end else None
                ),
            }
        )
    return out


def get_paid_domains(user_id: UUID | str, db: Session) -> set[str]:
    """Return the set of store domains for which *user_id* has an active plan.

    Optimized for ``/user/stores`` which needs to stamp ``planTier`` on
    each row without a per-row roundtrip.
    """
    rows = (
        db.query(StoreSubscription)
        .filter(StoreSubscription.user_id == user_id)
        .all()
    )
    return {row.store_domain for row in rows if _is_active(row)}


def upsert_subscription(
    *,
    user_id: UUID | str,
    store_domain: str,
    plan_tier: PaidTier,
    current_period_end: datetime,
    paddle_transaction_id: str | None = None,
    paddle_subscription_id: str | None = None,
    paddle_customer_id: str | None = None,
    db: Session,
) -> StoreSubscription:
    """Create or update a per-store subscription. Webhook handlers call this.

    Idempotent on (user_id, store_domain): re-running with new period_end
    extends the window without duplicating rows.
    """
    row = (
        db.query(StoreSubscription)
        .filter(
            StoreSubscription.user_id == user_id,
            StoreSubscription.store_domain == store_domain,
        )
        .first()
    )
    now = _now_utc()
    if row is None:
        row = StoreSubscription(
            user_id=user_id,
            store_domain=store_domain,
            plan_tier=plan_tier,
            current_period_end=current_period_end,
            paddle_transaction_id=paddle_transaction_id,
            paddle_subscription_id=paddle_subscription_id,
            paddle_customer_id=paddle_customer_id,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
    else:
        row.plan_tier = plan_tier
        row.current_period_end = current_period_end
        if paddle_transaction_id is not None:
            row.paddle_transaction_id = paddle_transaction_id
        if paddle_subscription_id is not None:
            row.paddle_subscription_id = paddle_subscription_id
        if paddle_customer_id is not None:
            row.paddle_customer_id = paddle_customer_id
        row.updated_at = now
    db.commit()
    return row


def find_by_paddle_subscription_id(
    paddle_subscription_id: str, db: Session
) -> StoreSubscription | None:
    """Lookup helper for Paddle ``subscription.updated`` / ``subscription.canceled``.

    Returns the matching row regardless of whether the window has expired —
    the caller (webhook handler) decides what to do based on the event.
    """
    if not paddle_subscription_id:
        return None
    return (
        db.query(StoreSubscription)
        .filter(StoreSubscription.paddle_subscription_id == paddle_subscription_id)
        .first()
    )


def delete_subscription(subscription: StoreSubscription, db: Session) -> None:
    """Delete a subscription row outright (used on full cancellation)."""
    db.delete(subscription)
    db.commit()
