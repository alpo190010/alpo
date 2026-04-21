"""POST /webhook — Paddle Billing webhook with HMAC verification.

Signature format (Paddle Billing):
    Header: ``Paddle-Signature: ts=<unix_ts>;h1=<hex_digest>``
    Signed payload: ``"{ts}:{raw_body}"`` (no separators, utf-8)
    Algorithm: HMAC-SHA256 using ``settings.paddle_webhook_secret``

Events handled:
    - subscription.created    — activate paid tier
    - subscription.updated    — tier change / renewal / past_due
    - subscription.canceled   — scheduled end; keep access until current_period_end
    - subscription.past_due   — leave tier, rely on customer to recover (or
                                 a later subscription.updated / canceled event)

Reference: https://developer.paddle.com/webhooks/overview
"""

from __future__ import annotations

import hashlib
import hmac as hmac_mod
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.plans import get_tier_for_price_id

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


def _resolve_user_by_custom_data(data: dict, db: Session) -> User | None:
    """Resolve a user from ``data.custom_data.user_id``."""
    user_id = (data.get("custom_data") or {}).get("user_id")
    if not user_id:
        logger.warning("Paddle webhook missing data.custom_data.user_id")
        return None
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        logger.error("Paddle webhook user not found: user_id=%s", user_id)
        return None
    return user


def _resolve_user_by_subscription_id(data: dict, db: Session) -> User | None:
    """Resolve a user by stored paddle_subscription_id (renewals + cancels)."""
    sub_id = data.get("id")
    if not sub_id:
        logger.warning("Paddle webhook missing data.id for subscription lookup")
        return None
    user = db.query(User).filter(User.paddle_subscription_id == sub_id).first()
    if not user:
        logger.error(
            "Paddle webhook user not found by subscription_id=%s", sub_id
        )
        return None
    return user


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


def _handle_subscription_created(data: dict, db: Session) -> dict:
    """First-time subscription activation. Resolve user by custom_data.user_id."""
    user = _resolve_user_by_custom_data(data, db)
    if user is None:
        return {"ok": True}

    price_id = _extract_price_id(data)
    tier = get_tier_for_price_id(price_id) if price_id else None

    if tier is None:
        logger.warning(
            "subscription.created: unknown price_id=%s for user_id=%s",
            price_id, user.id,
        )
        return {"ok": True}

    old_tier = user.plan_tier
    user.plan_tier = tier
    user.paddle_subscription_id = data.get("id")
    user.paddle_customer_id = data.get("customer_id")
    user.paddle_customer_portal_url = None  # on-demand via portal session API

    # Reset credits on new subscription
    user.credits_used = 0
    user.credits_reset_at = datetime.now(timezone.utc)

    period_end = _period_end(data)
    if period_end:
        user.current_period_end = period_end

    db.commit()
    logger.info(
        "subscription.created: user_id=%s tier %s→%s price_id=%s",
        user.id, old_tier, tier, price_id,
    )
    return {"ok": True}


def _handle_subscription_updated(data: dict, db: Session) -> dict:
    """Plan change, renewal, or reactivation."""
    user = _resolve_user_by_subscription_id(data, db)
    if user is None:
        return {"ok": True}

    status = data.get("status", "")

    # Paddle's "canceled" status on subscription.updated = fully terminated.
    if status == "canceled":
        old_tier = user.plan_tier
        user.plan_tier = "free"
        user.credits_used = 0
        user.credits_reset_at = datetime.now(timezone.utc)
        user.paddle_subscription_id = None
        user.paddle_customer_id = None
        user.current_period_end = None
        user.paddle_customer_portal_url = None
        db.commit()
        logger.info(
            "subscription.updated(canceled): user_id=%s downgraded %s→free",
            user.id, old_tier,
        )
        return {"ok": True}

    # Other statuses: active, past_due, paused, trialing, etc.
    price_id = _extract_price_id(data)
    new_tier = get_tier_for_price_id(price_id) if price_id else None
    if new_tier and new_tier != user.plan_tier:
        old_tier = user.plan_tier
        user.plan_tier = new_tier
        logger.info(
            "subscription.updated: user_id=%s tier %s→%s",
            user.id, old_tier, new_tier,
        )

    # Detect renewal: period_end advanced
    period_end = _period_end(data)
    if period_end and period_end != user.current_period_end:
        user.current_period_end = period_end
        user.credits_used = 0
        user.credits_reset_at = datetime.now(timezone.utc)
        logger.info("subscription.updated: user_id=%s credits reset (renewal)", user.id)

    db.commit()
    return {"ok": True}


def _handle_subscription_canceled(data: dict, db: Session) -> dict:
    """Scheduled cancellation. Keep tier until current_period_end."""
    user = _resolve_user_by_subscription_id(data, db)
    if user is None:
        return {"ok": True}

    period_end = _period_end(data)
    if period_end:
        user.current_period_end = period_end
        logger.info(
            "subscription.canceled: user_id=%s access until %s",
            user.id, period_end.isoformat(),
        )

    db.commit()
    return {"ok": True}


def _handle_subscription_past_due(data: dict, db: Session) -> dict:
    """Payment failed. Keep tier — Paddle retries and will send another event."""
    user = _resolve_user_by_subscription_id(data, db)
    if user is None:
        return {"ok": True}

    logger.info("subscription.past_due: user_id=%s", user.id)
    # No state change — wait for subscription.updated (recovered) or canceled.
    return {"ok": True}
