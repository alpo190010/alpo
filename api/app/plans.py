"""Plan tier definitions — single source of truth for billing configuration.

Checkout URL contract (R085):
    https://<store>.lemonsqueezy.com/checkout/buy/<VARIANT_ID>?checkout[custom][user_id]=<USER_UUID>

The frontend (S04) constructs checkout URLs using this format. Each variant ID
maps to a plan tier via get_tier_for_variant() below. The variant IDs are
configured as environment variables (LEMONSQUEEZY_VARIANT_*) so they differ
between dev/staging/production LemonSqueezy stores.
"""

from app.config import settings

PLAN_TIERS = {
    "free":    {"credits_limit": 3,   "price_monthly": 0},
    "starter": {"credits_limit": 10,  "price_monthly": 29},
    "growth":  {"credits_limit": 30,  "price_monthly": 79},
    "pro":     {"credits_limit": 100, "price_monthly": 149},
}


def get_tier_for_variant(variant_id: str) -> str | None:
    """Map a LemonSqueezy variant ID to its plan tier name.

    Returns the tier string ("starter", "growth", "pro") or None if
    the variant_id is unknown or empty.
    """
    mapping = {
        settings.lemonsqueezy_variant_starter: "starter",
        settings.lemonsqueezy_variant_growth: "growth",
        settings.lemonsqueezy_variant_pro: "pro",
    }
    return mapping.get(variant_id)
