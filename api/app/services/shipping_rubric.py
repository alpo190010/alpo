"""Scoring rubric and tip selector for shipping transparency signals.

Converts :class:`ShippingSignals` into a deterministic 0–100 score
using weighted criteria derived from Baymard Institute, SellersCommerce,
TheGoodMedium, Convertcart, and Getkard research on shipping
transparency and cart abandonment, and selects up to 3 prioritised
improvement tips.
"""

from __future__ import annotations

from app.services.shipping_detector import ShippingSignals


# ---------------------------------------------------------------------------
# Scoring rubric
# ---------------------------------------------------------------------------


def score_shipping(signals: ShippingSignals) -> int:
    """Compute a 0–100 shipping transparency score from extracted signals.

    Weighted criteria (max 100 pts total):

        Free shipping messaging present:                     25 pts
        Specific delivery date present:                      25 pts
        Free shipping threshold detected:                    15 pts
        Shipping cost shown (any transparency):              10 pts
        Structured data shippingDetails:                     10 pts
        Shipping policy link near product:                    5 pts
        Vague delivery estimate (only if no specific date):   5 pts
        Returns/refunds mentioned with shipping:              5 pts

    Returns:
        Integer clamped to 0–100.
    """
    score = 0

    # Free shipping messaging (25 pts)
    if signals.has_free_shipping:
        score += 25

    # Specific delivery date (25 pts) — mutually exclusive with vague (5 pts)
    if signals.has_delivery_date:
        score += 25
    elif signals.has_delivery_estimate or signals.has_edd_app:
        score += 5

    # Free shipping threshold (15 pts)
    if signals.has_free_shipping_threshold:
        score += 15

    # Shipping cost transparency (10 pts)
    if signals.has_shipping_cost_shown:
        score += 10

    # Structured data shippingDetails (10 pts)
    if signals.has_shipping_in_structured_data:
        score += 10

    # Shipping policy link (5 pts)
    if signals.has_shipping_policy_link:
        score += 5

    # Returns mentioned (5 pts)
    if signals.has_returns_mentioned:
        score += 5

    return max(0, min(100, score))


# ---------------------------------------------------------------------------
# Tip selector
# ---------------------------------------------------------------------------

# Tips ordered by impact priority (highest first).  Each entry is a
# (condition_callable, tip_string) pair.  The condition receives the
# signals *and* the computed score.

_TIP_RULES: list[tuple] = [
    # 1. No free shipping at all
    (
        lambda s, _score: not s.has_free_shipping,
        (
            "Add free shipping messaging \u2014 62% of shoppers won't "
            "purchase without it, and offering it can increase orders "
            "by 90% (SellersCommerce/Yieldify)"
        ),
    ),
    # 2. No delivery date at all
    (
        lambda s, _score: (
            not s.has_delivery_date
            and not s.has_delivery_estimate
            and not s.has_edd_app
        ),
        (
            "Show estimated delivery dates \u2014 75.1% of shoppers say "
            "EDDs positively influence purchase decisions, with up to "
            "24% conversion lift (TheGoodMedium)"
        ),
    ),
    # 3. Has vague estimate but no specific date
    (
        lambda s, _score: (
            not s.has_delivery_date
            and (s.has_delivery_estimate or s.has_edd_app)
        ),
        (
            "Upgrade to specific delivery dates \u2014 'Arrives by "
            "Thursday, Feb 12' dramatically outperforms '3\u20135 "
            "business days' in conversion tests (RankTracker)"
        ),
    ),
    # 4. No threshold (has free shipping but no threshold)
    (
        lambda s, _score: s.has_free_shipping and not s.has_free_shipping_threshold,
        (
            "Add a free shipping threshold 10\u201315% above your AOV "
            "\u2014 58% of shoppers add items to qualify, lifting AOV "
            "by 15\u201320% (Getkard/Convertcart)"
        ),
    ),
    # 5. No shipping cost transparency
    (
        lambda s, _score: not s.has_shipping_cost_shown and not s.has_free_shipping,
        (
            "Show shipping costs on the product page \u2014 hidden "
            "extra costs cause 48% of all cart abandonment "
            "(Baymard Institute)"
        ),
    ),
    # 6. No structured data shippingDetails
    (
        lambda s, _score: not s.has_shipping_in_structured_data,
        (
            "Add shippingDetails to your Product schema \u2014 enables "
            "shipping cost display in Google Shopping results and AI "
            "citations"
        ),
    ),
    # 7. No shipping policy link
    (
        lambda s, _score: not s.has_shipping_policy_link,
        (
            "Add a visible shipping policy link near the buy button "
            "\u2014 transparency reduces pre-purchase hesitation and "
            "support inquiries"
        ),
    ),
    # 8. Congratulatory — strong shipping transparency
    (
        lambda s, score: score >= 80,
        (
            "Strong shipping transparency \u2014 your page addresses "
            "the #1 cause of cart abandonment. Consider A/B testing "
            "your free shipping threshold to optimise AOV"
        ),
    ),
]


def get_shipping_tips(signals: ShippingSignals) -> list[str]:
    """Return up to 3 research-backed shipping transparency tips.

    Tips are selected based on which shipping signals are missing or
    weak, prioritised by conversion impact (most impactful first).

    Args:
        signals: Extracted shipping transparency signals.

    Returns:
        A list of 0–3 tip strings.
    """
    score = score_shipping(signals)
    tips: list[str] = []

    for condition, tip in _TIP_RULES:
        if condition(signals, score):
            tips.append(tip)
            if len(tips) >= 3:
                break

    return tips


# ---------------------------------------------------------------------------
# Per-check breakdown (for UI "What's working / What's missing" lists)
# ---------------------------------------------------------------------------


def list_shipping_checks(signals: ShippingSignals) -> list[dict]:
    """Enumerate the shipping rubric's individual pass/fail checks.

    Specific delivery date (25 pts) and vague estimate (5 pts) are
    mutually exclusive in :func:`score_shipping` — a specific date
    supersedes the vague fallback, so the vague-estimate check is
    reported as passed when a specific date is present.
    """
    has_vague_estimate = bool(
        signals.has_delivery_estimate or signals.has_edd_app
    )
    return [
        {
            "id": "free_shipping",
            "label": "Free shipping messaging",
            "passed": bool(signals.has_free_shipping),
            "weight": 25,
            "remediation": (
                "Add a \"Free shipping\" line to the announcement bar "
                "or above Add to Cart. If you can't offer it globally, "
                "offer it above a threshold (\"Free over $50\"). "
                "Unexpected shipping is the #1 cause of cart abandonment."
            ),
        },
        {
            "id": "specific_delivery_date",
            "label": "Specific delivery date shown (e.g. \"Arrives Thursday\")",
            "passed": bool(signals.has_delivery_date),
            "weight": 25,
            "remediation": (
                "Install Shopify's Delivery Dates app (or Deliverr, "
                "Starshipit) and render \"Get it by [date]\" above Add "
                "to Cart. Specific dates convert 24% better than vague "
                "ranges and cut \"where is my order\" tickets by 31%."
            ),
        },
        {
            "id": "free_shipping_threshold",
            "label": "Free shipping threshold (e.g. \"Free over $50\")",
            "passed": bool(signals.has_free_shipping_threshold),
            "weight": 15,
            "remediation": (
                "Set a free-shipping threshold in Settings → Shipping "
                "and display a progress bar in the cart (\"$12 away "
                "from free shipping\"). Lifts AOV 10–25%."
            ),
        },
        {
            "id": "shipping_cost_shown",
            "label": "Shipping cost visible on product page",
            "passed": bool(signals.has_shipping_cost_shown),
            "weight": 10,
            "remediation": (
                "Show shipping cost (or \"Calculated at checkout\" "
                "with a flat-rate hint) on the product page. Opaque "
                "cost is the #1 abandonment driver (Baymard)."
            ),
        },
        {
            "id": "shipping_structured_data",
            "label": "Shipping details visible to Google and AI tools",
            "passed": bool(signals.has_shipping_in_structured_data),
            "weight": 10,
            "remediation": (
                "Add shipping cost and delivery time to your product "
                "info so Google Shopping can show \"Free shipping\" "
                "right in search results, and AI shopping tools can "
                "answer \"how much is shipping?\" questions directly. "
                "Your theme developer adds a small block of code to "
                "your product page (see below)."
            ),
            "code": (
                "<!-- product.liquid — inside the Offer JSON-LD -->\n"
                "\"shippingDetails\": {\n"
                "  \"@type\": \"OfferShippingDetails\",\n"
                "  \"shippingRate\": {\n"
                "    \"@type\": \"MonetaryAmount\",\n"
                "    \"value\": \"0\",\n"
                "    \"currency\": \"{{ cart.currency.iso_code }}\"\n"
                "  },\n"
                "  \"shippingDestination\": {\n"
                "    \"@type\": \"DefinedRegion\",\n"
                "    \"addressCountry\": \"US\"\n"
                "  },\n"
                "  \"deliveryTime\": {\n"
                "    \"@type\": \"ShippingDeliveryTime\",\n"
                "    \"handlingTime\": { \"@type\": \"QuantitativeValue\", \"minValue\": 0, \"maxValue\": 1, \"unitCode\": \"DAY\" },\n"
                "    \"transitTime\": { \"@type\": \"QuantitativeValue\", \"minValue\": 2, \"maxValue\": 5, \"unitCode\": \"DAY\" }\n"
                "  }\n"
                "}"
            ),
        },
        {
            "id": "shipping_policy_link",
            "label": "Shipping policy link near buy button",
            "passed": bool(signals.has_shipping_policy_link),
            "weight": 5,
            "remediation": (
                "Link to your shipping policy from the product page "
                "(not just the footer). Place it beneath Add to Cart "
                "or inside the shipping-info accordion."
            ),
        },
        {
            "id": "delivery_estimate_any",
            "label": "Any delivery estimate (specific or vague)",
            "passed": bool(signals.has_delivery_date) or has_vague_estimate,
            "weight": 5,
            "remediation": (
                "Even a vague estimate (\"Ships in 2–3 business days\") "
                "beats silence. Add it above Add to Cart. Graduate to "
                "specific dates once you integrate a fulfillment app."
            ),
        },
        {
            "id": "returns_mentioned",
            "label": "Returns / refunds mentioned",
            "passed": bool(signals.has_returns_mentioned),
            "weight": 5,
            "remediation": (
                "Mention the return window on the product page (\"30-day "
                "returns\" or \"Free returns within 30 days\"). Buyers "
                "want to see this before committing, not in the footer."
            ),
        },
    ]
