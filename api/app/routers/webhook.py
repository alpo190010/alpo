"""POST /webhook — Paddle Billing webhook with HMAC verification.

Signature format (Paddle Billing):
    Header: ``Paddle-Signature: ts=<unix_ts>;h1=<hex_digest>``
    Signed payload: ``"{ts}:{raw_body}"`` (no separators, utf-8)
    Algorithm: HMAC-SHA256 using ``settings.paddle_webhook_secret``

Per-store binding (post-rewrite):
    Plans are now scoped to a single ``(user_id, store_domain)`` pair.
    Every checkout call from the frontend MUST include both fields in
    ``customData`` so the webhook can route the purchase to the correct
    store. Events missing ``store_domain`` are logged and discarded — we
    never grant access without an explicit store binding.

Events handled:
    - transaction.completed   — one-time purchase paid (Insights/Fixes flow)
    - subscription.created    — recurring subscription activation (dormant)
    - subscription.updated    — tier change / renewal / past_due
    - subscription.canceled   — scheduled end; keep access until current_period_end
    - subscription.past_due   — leave row, rely on customer to recover

Reference: https://developer.paddle.com/webhooks/overview
"""

from __future__ import annotations

import hashlib
import hmac as hmac_mod
import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.plans import get_tier_for_price_id
from app.services.store_subscriptions import (
    delete_subscription,
    find_by_paddle_subscription_id,
    upsert_subscription,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Signature verification
# ---------------------------------------------------------------------------


def _parse_paddle_signature(header: str) -> tuple[str, str] | None:
    """Parse a Paddle-Signature header into ``(ts, h1)``.

    Returns None if the header is malformed or missing parts.
    """
    parts = {}
    for segment in header.split(";"):
        if "=" not in segment:
            continue
        k, v = segment.split("=", 1)
        parts[k.strip()] = v.strip()
    ts = parts.get("ts")
    h1 = parts.get("h1")
    if not ts or not h1:
        return None
    return ts, h1


def _verify_paddle_signature(raw_body: bytes, header: str, secret: str) -> bool:
    """Validate the Paddle-Signature header using HMAC-SHA256 of ``ts:body``."""
    parsed = _parse_paddle_signature(header)
    if parsed is None:
        return False
    ts, h1 = parsed
    signed_payload = f"{ts}:".encode("utf-8") + raw_body
    expected = hmac_mod.new(
        secret.encode("utf-8"), signed_payload, hashlib.sha256
    ).hexdigest()
    return hmac_mod.compare_digest(h1, expected)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_iso_datetime(value: str | None) -> datetime | None:
    """Parse an ISO 8601 datetime safely. Returns None on failure."""
    if not value:
        return None
    try:
        cleaned = value.replace("Z", "+00:00")
        return datetime.fromisoformat(cleaned)
    except (ValueError, TypeError):
        logger.warning("Failed to parse ISO datetime: %s", value)
        return None


def _extract_price_id(data: dict) -> str | None:
    """Return the first item's price_id from a Paddle subscription/tx event."""
    items = data.get("items") or []
    if not items:
        return None
    first = items[0] or {}
    price = first.get("price") or {}
    price_id = price.get("id")
    return price_id or None


def _period_end(data: dict) -> datetime | None:
    """Return current_billing_period.ends_at as a datetime (UTC)."""
    period = data.get("current_billing_period") or {}
    return _parse_iso_datetime(period.get("ends_at"))


def _extract_binding(data: dict) -> tuple[str | None, str | None]:
    """Return ``(user_id, store_domain)`` from the event's ``custom_data``.

    Both values are required for any handler that grants access. We
    normalize ``store_domain`` (strip + lower) so it matches the form
    used everywhere else in the analyze pipeline.
    """
    custom = data.get("custom_data") or {}
    user_id = custom.get("user_id")
    raw_domain = custom.get("store_domain")
    store_domain = raw_domain.strip().lower() if isinstance(raw_domain, str) else None
    return (user_id or None), (store_domain or None)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/webhook")
async def webhook(request: Request, db: Session = Depends(get_db)):
    try:
        raw_body = await request.body()
        signature = request.headers.get("paddle-signature", "")
        secret = settings.paddle_webhook_secret

        if not secret:
            logger.error("PADDLE_WEBHOOK_SECRET not configured")
            return JSONResponse(
                status_code=500, content={"error": "Webhook not configured"}
            )

        if not _verify_paddle_signature(raw_body, signature, secret):
            return JSONResponse(
                status_code=401, content={"error": "Invalid signature"}
            )

        body = json.loads(raw_body)
        event_type = body.get("event_type")
        data = body.get("data") or {}

        if event_type == "transaction.completed":
            return _handle_transaction_completed(data, db)
        if event_type == "subscription.created":
            return _handle_subscription_created(data, db)
        if event_type == "subscription.updated":
            return _handle_subscription_updated(data, db)
        if event_type == "subscription.canceled":
            return _handle_subscription_canceled(data, db)
        if event_type == "subscription.past_due":
            return _handle_subscription_past_due(data, db)

        return {"ok": True}

    except Exception:
        logger.exception("Webhook error")
        return JSONResponse(
            status_code=500, content={"error": "Webhook failed"}
        )


# ---------------------------------------------------------------------------
# Event handlers
# ---------------------------------------------------------------------------


def _handle_transaction_completed(data: dict, db: Session) -> dict:
    """One-time paid-tier purchase. Resolve binding from ``custom_data``.

    Used by Insights ($79/yr) and Fixes ($149/yr) — both Paddle one-time
    charges with a 1-year access window. Creates or updates a row in
    ``store_subscriptions`` for the (user_id, store_domain) pair carried
    in the checkout's customData. Without a ``store_domain`` we fail
    closed: log and return ``{"ok": True}`` so Paddle doesn't retry.
    """
    user_id, store_domain = _extract_binding(data)
    if not user_id or not store_domain:
        logger.warning(
            "transaction.completed missing binding: user_id=%s store_domain=%s",
            user_id, store_domain,
        )
        return {"ok": True}

    price_id = _extract_price_id(data)
    tier = get_tier_for_price_id(price_id) if price_id else None
    if tier is None:
        logger.warning(
            "transaction.completed: unknown price_id=%s for user_id=%s",
            price_id, user_id,
        )
        return {"ok": True}

    period_end = datetime.now(timezone.utc) + timedelta(days=365)
    upsert_subscription(
        user_id=user_id,
        store_domain=store_domain,
        plan_tier=tier,
        current_period_end=period_end,
        paddle_transaction_id=data.get("id"),
        paddle_customer_id=data.get("customer_id"),
        db=db,
    )
    logger.info(
        "transaction.completed: user_id=%s domain=%s tier=%s expires=%s",
        user_id, store_domain, tier, period_end.isoformat(),
    )
    return {"ok": True}


def _handle_subscription_created(data: dict, db: Session) -> dict:
    """First-time recurring subscription activation. Resolve binding from custom_data."""
    user_id, store_domain = _extract_binding(data)
    if not user_id or not store_domain:
        logger.warning(
            "subscription.created missing binding: user_id=%s store_domain=%s",
            user_id, store_domain,
        )
        return {"ok": True}

    price_id = _extract_price_id(data)
    tier = get_tier_for_price_id(price_id) if price_id else None
    if tier is None:
        logger.warning(
            "subscription.created: unknown price_id=%s for user_id=%s",
            price_id, user_id,
        )
        return {"ok": True}

    period_end = _period_end(data)
    if period_end is None:
        logger.warning(
            "subscription.created missing current_billing_period for user_id=%s",
            user_id,
        )
        return {"ok": True}

    upsert_subscription(
        user_id=user_id,
        store_domain=store_domain,
        plan_tier=tier,
        current_period_end=period_end,
        paddle_subscription_id=data.get("id"),
        paddle_customer_id=data.get("customer_id"),
        db=db,
    )
    logger.info(
        "subscription.created: user_id=%s domain=%s tier=%s",
        user_id, store_domain, tier,
    )
    return {"ok": True}


def _handle_subscription_updated(data: dict, db: Session) -> dict:
    """Plan change, renewal, or termination. Lookup by paddle_subscription_id."""
    sub_id = data.get("id")
    row = find_by_paddle_subscription_id(sub_id, db) if sub_id else None
    if row is None:
        logger.warning(
            "subscription.updated: row not found by subscription_id=%s",
            sub_id,
        )
        return {"ok": True}

    status = data.get("status", "")

    # Paddle's "canceled" status on subscription.updated = fully terminated.
    # The store should become deletable again, so drop the gate row.
    if status == "canceled":
        delete_subscription(row, db)
        logger.info(
            "subscription.updated(canceled): deleted row for user_id=%s domain=%s",
            row.user_id, row.store_domain,
        )
        return {"ok": True}

    # Other statuses: active, past_due, paused, trialing, etc.
    price_id = _extract_price_id(data)
    new_tier = get_tier_for_price_id(price_id) if price_id else None
    period_end = _period_end(data) or row.current_period_end

    upsert_subscription(
        user_id=row.user_id,
        store_domain=row.store_domain,
        plan_tier=new_tier or row.plan_tier,
        current_period_end=period_end,
        paddle_subscription_id=sub_id,
        paddle_customer_id=data.get("customer_id") or row.paddle_customer_id,
        db=db,
    )
    logger.info(
        "subscription.updated: user_id=%s domain=%s tier=%s",
        row.user_id, row.store_domain, new_tier or row.plan_tier,
    )
    return {"ok": True}


def _handle_subscription_canceled(data: dict, db: Session) -> dict:
    """Scheduled cancellation — keep access until ``current_period_end``."""
    sub_id = data.get("id")
    row = find_by_paddle_subscription_id(sub_id, db) if sub_id else None
    if row is None:
        logger.warning(
            "subscription.canceled: row not found by subscription_id=%s",
            sub_id,
        )
        return {"ok": True}

    period_end = _period_end(data)
    if period_end is not None:
        row.current_period_end = period_end
        db.commit()
        logger.info(
            "subscription.canceled: user_id=%s domain=%s access until %s",
            row.user_id, row.store_domain, period_end.isoformat(),
        )
    return {"ok": True}


def _handle_subscription_past_due(data: dict, db: Session) -> dict:
    """Payment failed. Leave the row — Paddle retries and emits another event."""
    sub_id = data.get("id")
    row = find_by_paddle_subscription_id(sub_id, db) if sub_id else None
    if row is None:
        return {"ok": True}
    logger.info(
        "subscription.past_due: user_id=%s domain=%s",
        row.user_id, row.store_domain,
    )
    return {"ok": True}
