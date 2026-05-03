"""Plan tier definitions — single source of truth for billing configuration.

Billing provider: **Paddle** (Paddle Billing API, not Paddle Classic).

The frontend opens Paddle's inline checkout via `@paddle/paddle-js`:

    paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customData: { user_id: "<uuid>" },
        customer: { email },
    })

Paddle then delivers webhook events (transaction.completed for one-time
purchases, subscription.* for recurring) to `POST /webhook`. Each event's
`data.items[].price.id` maps to a tier via `get_tier_for_price_id`.

Three tiers in v2 pricing:
  * ``free``     — scores visible, prose + fixes blurred
  * ``insights`` — $79/yr, prose unlocked, fixes blurred
  * ``fixes``    — $149/yr, everything unlocked

credits_limit semantics: an integer cap per calendar month for metered tiers,
or None for unlimited-scan tiers.
"""

from app.config import settings

PLAN_TIERS: dict[str, dict] = {
    "free":     {"credits_limit": 3,    "price_yearly": 0},
    "insights": {"credits_limit": None, "price_yearly": 79},
    "fixes":    {"credits_limit": None, "price_yearly": 149},
}


def get_tier_for_price_id(price_id: str) -> str | None:
    """Map a Paddle price ID to its plan tier name.

    Two active price IDs:
      - ``paddle_price_insights`` ($79/yr) → ``"insights"``
      - ``paddle_price_fixes``    ($149/yr) → ``"fixes"``

    Legacy ``paddle_price_starter_*`` (dormant subscription path) still
    resolve to ``"insights"`` so any in-flight test transactions don't
    crash; remove once truly dead.

    Returns the tier string or None if the price_id is unknown or empty.
    """
    mapping = {
        settings.paddle_price_insights: "insights",
        settings.paddle_price_fixes: "fixes",
        settings.paddle_price_starter_monthly: "insights",
        settings.paddle_price_starter_annual: "insights",
    }
    # Treat the empty-string env default as a sentinel for "unmapped".
    mapping.pop("", None)
    return mapping.get(price_id)
