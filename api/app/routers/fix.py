"""``GET /fix/{dimension_key}`` — structured fix content for a store-wide dimension.

Tier gating (DOM-safe — locked fields are never sent):

  * ``fixes`` tier ($149/yr) sees everything: label, problem,
    revenue_gain, effort, scope, steps, code.
  * ``insights`` tier ($79/yr) sees the diagnostic prose (problem,
    scope) but ``steps=[]`` and ``code=null``. ``recommendationsLocked=True``.
  * ``free`` / anonymous see ``label``, ``revenue_gain``, ``effort`` —
    these are headline metrics meant to advertise the unlock. Premium
    diagnostic prose (``problem``, ``scope``) is ``None`` and the
    fix content (``steps``, ``code``) is empty/null. ``detailsLocked=True``.

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
from app.services.store_subscriptions import get_effective_tier

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

    # Per-store tier: ``domain`` carries the binding. Without a domain
    # we resolve to free — generic /fix calls (no specific store) cannot
    # unlock paid content because they aren't tied to a paid plan.
    plan_tier = (
        get_effective_tier(current_user.id, domain, db)
        if current_user is not None and domain
        else "free"
    )
    sees_prose = plan_tier in ("insights", "fixes")
    sees_fixes = plan_tier == "fixes"
    locked = not sees_fixes
    details_locked = not sees_prose

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

    # ``label``, ``revenueGain``, and ``effort`` are headline metrics
    # that *advertise* the unlock — they're shown unblurred to free
    # users so the upgrade CTA has tangible numbers next to it. Only
    # the diagnostic prose (``problem``, ``scope``) and the fix
    # playbook (``steps``, ``code``) are tier-gated.
    return {
        "dimensionKey": dimension_key,
        "label": fix["label"],
        "revenueGain": fix["revenue_gain"],
        "effort": fix["effort"],
        "problem": fix["problem"] if sees_prose else None,
        "scope": fix.get("scope", "All products") if sees_prose else None,
        "steps": [] if locked else steps,
        "code": None if locked else fix.get("code"),
        "planTier": plan_tier,
        "locked": locked,
        "detailsLocked": details_locked,
        "stepsTailored": dim_signals is not None,
    }
