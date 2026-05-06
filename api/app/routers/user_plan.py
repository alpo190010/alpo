"""User plan endpoints.

- GET  /user/plan            — list of paid stores + portal/waitlist flags.
- POST /user/portal-session  — mint a one-time Paddle customer portal URL.

Note: ``plan`` is no longer a single user-level value. Tier is now resolved
per-store; this endpoint reports the user's full per-store paid set so the
dashboard can render plan badges and the customer portal can be reached.
"""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user_required
from app.config import settings
from app.database import get_db
from app.models import User
from app.services.store_subscriptions import list_paid_stores

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/user/plan")
def user_plan(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Return per-store paid plan summary for the authenticated user."""
    paid_stores = list_paid_stores(current_user.id, db)
    has_subscription = any(
        s.get("currentPeriodEnd") is not None for s in paid_stores
    )
    return {
        "userId": str(current_user.id),
        "paidStores": paid_stores,
        "hasSubscription": has_subscription,
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
    URLs are short-lived (~1h) so we do not persist them. Currently the
    portal is only meaningful for legacy recurring subscriptions tracked
    on ``users.paddle_*`` columns; per-store one-time purchases do not
    need portal management.
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
