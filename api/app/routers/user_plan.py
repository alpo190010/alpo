"""User plan endpoints.

- GET  /user/plan            — subscription and credit state (read-only).
- POST /user/portal-session  — mint a one-time Paddle customer portal URL.
"""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user_required
from app.config import settings
from app.database import get_db
from app.models import User
from app.services.entitlement import (
    get_credits_limit,
    has_credits_remaining,
    maybe_expire_paid_access,
    maybe_reset_free_credits,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/user/plan")
def user_plan(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Return the authenticated user's plan, credit usage, and limits."""
    maybe_expire_paid_access(current_user, db)
    maybe_reset_free_credits(current_user, db)
    return {
        "userId": str(current_user.id),
        "plan": current_user.plan_tier,
        "creditsUsed": current_user.credits_used,
        "creditsLimit": get_credits_limit(current_user.plan_tier),
        "creditsResetAt": (
            current_user.credits_reset_at.isoformat()
            if current_user.credits_reset_at
            else None
        ),
        "currentPeriodEnd": (
            current_user.current_period_end.isoformat()
            if current_user.current_period_end
            else None
        ),
        "hasCreditsRemaining": has_credits_remaining(current_user),
        "hasSubscription": current_user.paddle_subscription_id is not None,
        "customerPortalUrl": current_user.paddle_customer_portal_url,
        "proWaitlist": current_user.pro_waitlist,
    }


def _paddle_api_base() -> str:
    """Toggle between Paddle's sandbox and production REST endpoints."""
    if settings.paddle_environment == "production":
        return "https://api.paddle.com"
    return "https://sandbox-api.paddle.com"


@router.post("/user/portal-session")
async def user_portal_session(
    current_user: User = Depends(get_current_user_required),
):
    """Mint a one-time Paddle customer portal URL.

    The portal lets the user update payment methods, cancel, or reactivate.
    URLs are short-lived (~1h) so we do not persist them — the column
    ``users.paddle_customer_portal_url`` exists for forward-compat but is left
    None on subscription.created (see webhook.py).
    """
    if (
        not current_user.paddle_customer_id
        or not current_user.paddle_subscription_id
    ):
        raise HTTPException(
            status_code=400, detail="No active subscription to manage."
        )
    if not settings.paddle_api_key:
        logger.error("PADDLE_API_KEY not configured")
        raise HTTPException(status_code=500, detail="Billing not configured.")

    url = (
        f"{_paddle_api_base()}/customers/"
        f"{current_user.paddle_customer_id}/portal-sessions"
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {settings.paddle_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "subscription_ids": [current_user.paddle_subscription_id]
                },
            )
    except httpx.RequestError:
        logger.exception("Paddle portal-session request failed")
        raise HTTPException(
            status_code=502, detail="Could not reach billing provider."
        )

    if response.status_code >= 400:
        logger.error(
            "Paddle portal-session error: status=%s body=%s",
            response.status_code, response.text[:500],
        )
        raise HTTPException(
            status_code=502, detail="Could not open subscription portal."
        )

    portal_url = (
        ((response.json().get("data") or {}).get("urls") or {})
        .get("general", {})
        .get("overview")
    )
    if not portal_url:
        logger.error("Paddle portal-session response missing overview URL")
        raise HTTPException(
            status_code=502, detail="Invalid response from billing provider."
        )

    return {"url": portal_url}
