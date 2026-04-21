"""GET /user/plan — return authenticated user's subscription and credit state."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user_required
from app.database import get_db
from app.models import User
from app.services.entitlement import (
    get_credits_limit,
    has_credits_remaining,
    maybe_reset_free_credits,
)

router = APIRouter()


@router.get("/user/plan")
def user_plan(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Return the authenticated user's plan, credit usage, and limits."""
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
        "customerPortalUrl": current_user.paddle_customer_portal_url,
        "proWaitlist": current_user.pro_waitlist,
    }
