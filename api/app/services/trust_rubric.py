"""Scoring rubric and tip selector for trust & guarantee signals.

Converts :class:`TrustSignals` into a deterministic 0-100 score
using weighted criteria derived from VWO, MonetizePros, Build Grow
Scale, and Forrester research on trust element conversion impact,
and selects up to 3 prioritised improvement tips.
"""

from __future__ import annotations

from app.services.trust_detector import TrustSignals


# ---------------------------------------------------------------------------
# Scoring rubric
# ---------------------------------------------------------------------------


def score_trust(signals: TrustSignals) -> int:
    """Compute a 0-100 trust & guarantees score from extracted signals.

    Weighted criteria (max 100 pts total):

        Money-back guarantee:                   20 pts
        Trust elements near Add to Cart:        15 pts
        Return policy visible:                  12 pts
        Security badge (Norton/McAfee/SSL):     10 pts
        "Guaranteed Safe Checkout" badge:        8 pts
        Live chat available:                     8 pts
        "Secure checkout" text:                  7 pts
        Trust badge count >= 1:                  5 pts
        Trust badge count >= 2 (bonus):          3 pts
        Payment trust icons:                     5 pts
        Phone number visible:                    4 pts
        Free shipping badge:                     3 pts

    Returns:
        Integer clamped to 0-100.
    """
    score = 0

    # Money-back guarantee (20 pts) — +32% conversion (VWO case study)
    if signals.has_money_back_guarantee:
        score += 20

    # Trust elements near ATC (15 pts) — 8-19% lift
    if signals.has_trust_near_atc:
        score += 15

    # Return policy visible (12 pts) — +8-14% for AOV $75+
    if signals.has_return_policy:
        score += 12

    # Security badge (10 pts) — +12.2% conversion (Norton/MonetizePros)
    if signals.has_security_badge:
        score += 10

    # "Guaranteed Safe Checkout" badge (8 pts) — +11% (Build Grow Scale)
    if signals.has_safe_checkout_badge:
        score += 8

    # Live chat available (8 pts) — +20% conversion average (Forrester)
    if signals.has_live_chat:
        score += 8

    # "Secure checkout" text (7 pts)
    if signals.has_secure_checkout_text:
        score += 7

    # Trust badges present (5 pts base, +3 bonus for 2+)
    if signals.trust_badge_count >= 1:
        score += 5
    if signals.trust_badge_count >= 2:
        score += 3

    # Payment trust icons (5 pts)
    if signals.has_payment_icons:
        score += 5

    # Phone number visible (4 pts) — +1.6% lift, #1 trust symbol
    if signals.has_phone_number:
        score += 4

    # Free shipping badge (3 pts)
    if signals.has_free_shipping_badge:
        score += 3

    return max(0, min(100, score))


# ---------------------------------------------------------------------------
# Tip selector
# ---------------------------------------------------------------------------

# Tips ordered by impact priority (highest first).  Each entry is a
# (condition_callable, tip_string) pair.  The condition receives the
# signals *and* the computed score.

_TIP_RULES: list[tuple] = [
    # 1. No money-back guarantee — biggest single conversion driver
    (
        lambda s, _score: not s.has_money_back_guarantee,
        (
            "Add a money-back guarantee badge \u2014 money-back guarantees "
            "increase conversion by up to 32% (Alexander Jarvis VWO case study)"
        ),
    ),
    # 2. No trust near ATC — placement is critical
    (
        lambda s, _score: not s.has_trust_near_atc and s.trust_element_count > 0,
        (
            "Move trust badges near your Add to Cart button \u2014 trust "
            "signals within 300px of the ATC button deliver 8\u201319% "
            "conversion lift; the same badge in the footer has near-zero "
            "impact"
        ),
    ),
    # 3. No return policy visible
    (
        lambda s, _score: not s.has_return_policy,
        (
            "Make your return policy visible on the product page \u2014 "
            "return policy visibility near ATC increases conversion "
            "8\u201314% for products over $75, and up to 19% for products "
            "over $300"
        ),
    ),
    # 4. No security badge and no safe checkout badge
    (
        lambda s, _score: not s.has_security_badge and not s.has_safe_checkout_badge,
        (
            "Add a security badge (Norton, McAfee, or SSL seal) \u2014 "
            "security badges increase conversion by 12.2% on average "
            "(MonetizePros/Build Grow Scale)"
        ),
    ),
    # 5. No live chat
    (
        lambda s, _score: not s.has_live_chat,
        (
            "Add live chat \u2014 chat availability increases conversion "
            "20% on average and 40% in engaged sessions; chat users spend "
            "60% more per order (Forrester/Bold360)"
        ),
    ),
    # 6. No trust badges at all
    (
        lambda s, _score: s.trust_badge_count == 0,
        (
            "Add 2\u20133 trust badges (guarantee, secure checkout, payment "
            "icons) \u2014 trust badges increase conversion 12\u201342% when "
            "implemented correctly; limit to 2\u20133 badges at 60\u201380px "
            "wide"
        ),
    ),
    # 7. Too many trust badges (>3) — diminishing returns
    (
        lambda s, _score: s.trust_badge_count > 3,
        (
            "Reduce to 2\u20133 trust badges \u2014 more than 3 badges "
            "creates visual clutter and diminishes trust rather than "
            "building it"
        ),
    ),
    # 8. No phone number and no email
    (
        lambda s, _score: not s.has_phone_number and not s.has_contact_email,
        (
            "Add a visible phone number or contact email \u2014 a phone "
            "number alone lifts conversion 1.6% and is the #1 global "
            "trust symbol for online stores"
        ),
    ),
    # 9. Congratulatory — strong trust setup
    (
        lambda s, score: score >= 75,
        (
            "Strong trust setup \u2014 your page covers guarantees, "
            "security badges, and contact accessibility. Consider A/B "
            "testing badge placement near the checkout CTA for further "
            "lift"
        ),
    ),
]


def get_trust_tips(signals: TrustSignals) -> list[str]:
    """Return up to 3 research-backed trust improvement tips.

    Tips are selected based on which trust signals are missing or
    weak, prioritised by conversion impact (most impactful first).

    Args:
        signals: Extracted trust & guarantee signals.

    Returns:
        A list of 0-3 tip strings.
    """
    score = score_trust(signals)
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


def list_trust_checks(signals: TrustSignals) -> list[dict]:
    """Enumerate the trust rubric's individual pass/fail checks."""
    return [
        {
            "id": "money_back_guarantee",
            "label": "Money-back guarantee",
            "passed": bool(signals.has_money_back_guarantee),
            "weight": 20,
            "remediation": (
                "Add a clear money-back guarantee line above or near "
                "Add to Cart (e.g. \"30-day money-back guarantee — no "
                "questions asked\"). Pair it with the return policy "
                "link. Lifts first-purchase conversion 10–15%."
            ),
        },
        {
            "id": "trust_near_atc",
            "label": "Trust elements near Add to Cart",
            "passed": bool(signals.has_trust_near_atc),
            "weight": 15,
            "remediation": (
                "Place a compact row of trust signals (SSL / money-back / "
                "payment icons / review count) directly under the Add "
                "to Cart button. Proximity matters more than page "
                "position — buyers decide in the final 2 seconds."
            ),
        },
        {
            "id": "return_policy",
            "label": "Return policy visible on product page",
            "passed": bool(signals.has_return_policy),
            "weight": 12,
            "remediation": (
                "Link to a concrete return policy from the product "
                "page (not just the footer). State the window and "
                "cost explicitly: \"30-day returns, free on all "
                "orders.\""
            ),
        },
        {
            "id": "security_badge",
            "label": "Security badge (Norton / McAfee / SSL seal)",
            "passed": bool(signals.has_security_badge),
            "weight": 10,
            "remediation": (
                "Add a security badge (Norton Secured, McAfee SECURE, "
                "TrustedSite, or your SSL provider's seal) near the "
                "Add to Cart and checkout buttons. Free options like "
                "TrustedSite give a 7–15% conversion lift."
            ),
        },
        {
            "id": "safe_checkout_badge",
            "label": "\"Guaranteed Safe Checkout\" badge",
            "passed": bool(signals.has_safe_checkout_badge),
            "weight": 8,
            "remediation": (
                "Add a \"Guaranteed Safe Checkout\" strip with card "
                "logos (Visa, Mastercard, Amex, PayPal, Shop Pay) "
                "beneath the Add to Cart button. Most Shopify trust "
                "apps (TrustHub, Trustify) ship this pattern."
            ),
        },
        {
            "id": "live_chat",
            "label": "Live chat available",
            "passed": bool(signals.has_live_chat),
            "weight": 8,
            "remediation": (
                "Install a live-chat app (Tidio, Gorgias, Shopify "
                "Inbox). Even without 24/7 staffing, an off-hours "
                "auto-responder that collects email recovers 8–12% "
                "of hesitant buyers."
            ),
        },
        {
            "id": "secure_checkout_text",
            "label": "\"Secure checkout\" text",
            "passed": bool(signals.has_secure_checkout_text),
            "weight": 7,
            "remediation": (
                "Add the phrase \"Secure checkout\" (with a lock icon) "
                "adjacent to the Add to Cart or checkout button. The "
                "text alone, without a badge, still measurably reduces "
                "payment anxiety."
            ),
        },
        {
            "id": "trust_badges_any",
            "label": "At least one trust badge",
            "passed": signals.trust_badge_count >= 1,
            "weight": 5,
            "remediation": (
                "Add at least one trust badge (SSL, money-back, or "
                "secure-checkout seal) to the product page. Zero "
                "badges signals \"random website\" to unfamiliar "
                "buyers."
            ),
        },
        {
            "id": "trust_badges_two_plus",
            "label": "Two or more trust badges",
            "passed": signals.trust_badge_count >= 2,
            "weight": 3,
            "remediation": (
                "Add a second trust signal — pairing SSL + money-back "
                "(or payment-icons + secure-checkout) converts 4–6% "
                "better than a single badge alone."
            ),
        },
        {
            "id": "payment_icons",
            "label": "Payment method icons shown (Visa, Mastercard, etc.)",
            "passed": bool(signals.has_payment_icons),
            "weight": 5,
            "remediation": (
                "Show small payment-method icons (Visa, Mastercard, "
                "Amex, PayPal, Shop Pay) just below the Add to Cart "
                "button. They quickly reassure shoppers that their "
                "preferred payment method is accepted. Modern Shopify "
                "themes can render these automatically — turn the "
                "setting on in your theme customizer, or ask your "
                "theme developer to add it."
            ),
        },
        {
            "id": "phone_number",
            "label": "Phone number visible",
            "passed": bool(signals.has_phone_number),
            "weight": 4,
            "remediation": (
                "Show a phone number in the header and footer. Even "
                "a click-to-call link on mobile signals a real, "
                "reachable business — critical for first-time buyers "
                "over $50 AOV."
            ),
        },
        {
            "id": "free_shipping_badge",
            "label": "Free shipping badge",
            "passed": bool(signals.has_free_shipping_badge),
            "weight": 3,
            "remediation": (
                "Add a \"Free shipping\" strip to the announcement bar "
                "or product page. If you charge shipping, show the "
                "threshold (\"Free shipping over $50\") — opaque "
                "shipping costs are the #1 cart abandonment cause "
                "(Baymard)."
            ),
        },
    ]
