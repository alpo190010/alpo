"""``GET /fix/{dimension_key}`` — structured fix content for a store-wide dimension.

Tier gating: only the ``fixes`` tier ($149/yr) sees ``steps`` and ``code``;
``free`` and ``insights`` tiers receive the metadata (label, problem,
revenue_gain, effort, scope) with ``steps=[]`` and ``code=null`` and
``locked=True``. Insights pays for diagnostic prose at the per-check level
(rendered elsewhere) but not for the fix-step playbook.

When ``?domain=`` is provided and the caller is authenticated, the step
list is filtered against that store's latest scan signals so only the
actions that actually apply are shown. Without ``domain`` the generic
(worst-case) step list is returned for backward compatibility.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.auth import get_current_user_optional
from app.database import get_db
from app.models import StoreAnalysis, User
from app.services.dimension_fixes import FIX_CONTENT, get_fix_steps

router = APIRouter()


@router.get("/fix/{dimension_key}")
def get_dimension_fix(
    dimension_key: str,
    domain: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> dict:
    fix = FIX_CONTENT.get(dimension_key)
    if fix is None:
        raise HTTPException(status_code=404, detail="Unknown dimension")

    plan_tier = current_user.plan_tier if current_user else "free"
    locked = plan_tier != "fixes"

    # Pull the latest scan signals for this dimension so we can tailor
    # the step list. Requires an authenticated user + domain; silently
    # falls back to the static list otherwise.
    dim_signals: dict | None = None
    if current_user is not None and domain:
        row = (
            db.query(StoreAnalysis)
            .filter(
                StoreAnalysis.store_domain == domain,
                StoreAnalysis.user_id == current_user.id,
            )
            .first()
        )
        if row is not None and isinstance(row.signals, dict):
            maybe = row.signals.get(dimension_key)
            if isinstance(maybe, dict):
                dim_signals = maybe

    steps = get_fix_steps(dimension_key, dim_signals)

    return {
        "dimensionKey": dimension_key,
        "label": fix["label"],
        "problem": fix["problem"],
        "revenueGain": fix["revenue_gain"],
        "effort": fix["effort"],
        "scope": fix.get("scope", "All products"),
        "steps": [] if locked else steps,
        "code": None if locked else fix.get("code"),
        "planTier": plan_tier,
        "locked": locked,
        "stepsTailored": dim_signals is not None,
    }
