"""Scoring rubric and tip selector for checkout experience signals.

Converts :class:`CheckoutSignals` into a deterministic 0–100 score
using weighted criteria derived from Shopify, McKinsey, and Baymard
Institute research on checkout conversion optimisation, and selects
up to 3 prioritised improvement tips.
"""

from __future__ import annotations

from app.services.checkout_detector import CheckoutSignals


# ---------------------------------------------------------------------------
# Scoring rubric
# ---------------------------------------------------------------------------


def score_checkout(signals: CheckoutSignals) -> int:
    """Compute a 0–100 checkout experience score from extracted signals.

    Weighted criteria (max 100 pts total):

        Express checkout (accelerated OR dynamic button):  30 pts
        Any BNPL provider (klarna/afterpay/affirm/sezzle): 20 pts
        Payment method count >= 3:                         10 pts
        Payment method count >= 5 (bonus):                  5 pts
        Drawer / slide-out cart:                           10 pts
        AJAX cart:                                          5 pts
        PayPal present:                                    10 pts
        Dynamic checkout button specifically:               5 pts
        Sticky checkout button:                             5 pts

    Returns:
        Integer clamped to 0–100.
    """
    score = 0

    # Express checkout — accelerated OR dynamic checkout button (30 pts)
    if signals.has_accelerated_checkout or signals.has_dynamic_checkout_button:
        score += 30

    # Any BNPL provider (20 pts)
    if any([
        signals.has_klarna,
        signals.has_afterpay,
        signals.has_affirm,
        signals.has_sezzle,
    ]):
        score += 20

    # Payment method count >= 3 (10 pts)
    if signals.payment_method_count >= 3:
        score += 10

    # Payment method count >= 5 bonus (5 pts)
    if signals.payment_method_count >= 5:
        score += 5

    # Drawer / slide-out cart (10 pts)
    if signals.has_drawer_cart:
        score += 10

    # AJAX cart (5 pts)
    if signals.has_ajax_cart:
        score += 5

    # PayPal present (10 pts)
    if signals.has_paypal:
        score += 10

    # Dynamic checkout button specifically (5 pts)
    if signals.has_dynamic_checkout_button:
        score += 5

    # Sticky checkout button (5 pts)
    if signals.has_sticky_checkout:
        score += 5

    return max(0, min(100, score))


# ---------------------------------------------------------------------------
# Tip selector
# ---------------------------------------------------------------------------

# Tips ordered by impact priority (highest first).  Each entry is a
# (condition_callable, tip_string) pair.  The condition receives the
# signals *and* the computed score.

_TIP_RULES: list[tuple] = [
    # 1. No express checkout → Shop Pay lift
    (
        lambda s, _score: (
            not s.has_accelerated_checkout
            and not s.has_dynamic_checkout_button
        ),
        (
            "Add express checkout (e.g. Shop Pay) \u2014 Shop Pay "
            "increases checkout-to-order rate by up to 50% vs guest "
            "checkout (Shopify)"
        ),
    ),
    # 2. No BNPL → conversion lift
    (
        lambda s, _score: not any([
            s.has_klarna,
            s.has_afterpay,
            s.has_affirm,
            s.has_sezzle,
        ]),
        (
            "Add a buy-now-pay-later option (Klarna, Afterpay, Affirm) "
            "\u2014 BNPL increases conversion rates by 20\u201330% "
            "(McKinsey/RBC Capital Markets)"
        ),
    ),
    # 3. Low payment diversity
    (
        lambda s, _score: s.payment_method_count < 3,
        (
            "Offer more payment methods \u2014 13% of shoppers abandon "
            "carts because their preferred payment method is missing "
            "(Baymard Institute)"
        ),
    ),
    # 4. No drawer cart
    (
        lambda s, _score: not s.has_drawer_cart,
        (
            "Add a drawer/slide-out cart \u2014 slide-out carts are "
            "associated with 15\u201340% average order value lifts by "
            "keeping shoppers on the product page"
        ),
    ),
    # 5. No PayPal
    (
        lambda s, _score: not s.has_paypal,
        (
            "Add PayPal as a payment option \u2014 PayPal is the "
            "expected checkout method for approximately 60% of online "
            "shoppers"
        ),
    ),
    # 6. No sticky checkout
    (
        lambda s, _score: not s.has_sticky_checkout,
        (
            "Add a sticky add-to-cart button \u2014 sticky checkout "
            "buttons increase conversion rate by 6.8% (Charle Agency)"
        ),
    ),
    # 7. Congratulatory — everything looks good
    (
        lambda s, score: score >= 90,
        (
            "Excellent checkout experience \u2014 your store covers "
            "express checkout, BNPL, payment diversity, and cart UX "
            "best practices"
        ),
    ),
]


def get_checkout_tips(signals: CheckoutSignals) -> list[str]:
    """Return up to 3 research-backed checkout improvement tips.

    Tips are selected based on which checkout signals are missing or
    weak, prioritised by conversion impact (most impactful first).

    Args:
        signals: Extracted checkout experience signals.

    Returns:
        A list of 0–3 tip strings.
    """
    score = score_checkout(signals)
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


def list_checkout_checks(signals: CheckoutSignals) -> list[dict]:
    """Enumerate the checkout rubric's individual pass/fail checks.

    Mirrors :func:`score_checkout` — the same booleans that award points
    are exposed as discrete `{id, label, passed, weight}` entries so the
    frontend can render "What's working" / "What's missing" lists.
    """
    has_bnpl = any([
        signals.has_klarna,
        signals.has_afterpay,
        signals.has_affirm,
        signals.has_sezzle,
    ])
    return [
        {
            "id": "express_checkout",
            "label": "Express checkout (Shop Pay or equivalent)",
            "passed": bool(
                signals.has_accelerated_checkout
                or signals.has_dynamic_checkout_button
            ),
            "weight": 30,
        },
        {
            "id": "bnpl",
            "label": "Buy-now-pay-later provider (Klarna, Afterpay, Affirm, Sezzle)",
            "passed": bool(has_bnpl),
            "weight": 20,
        },
        {
            "id": "payment_methods_3plus",
            "label": "Accepts 3+ payment methods",
            "passed": signals.payment_method_count >= 3,
            "weight": 10,
        },
        {
            "id": "payment_methods_5plus",
            "label": "Accepts 5+ payment methods",
            "passed": signals.payment_method_count >= 5,
            "weight": 5,
        },
        {
            "id": "drawer_cart",
            "label": "Drawer / slide-out cart",
            "passed": bool(signals.has_drawer_cart),
            "weight": 10,
        },
        {
            "id": "ajax_cart",
            "label": "AJAX cart (no page reload on add)",
            "passed": bool(signals.has_ajax_cart),
            "weight": 5,
        },
        {
            "id": "paypal",
            "label": "PayPal available",
            "passed": bool(signals.has_paypal),
            "weight": 10,
        },
        {
            "id": "dynamic_checkout_button",
            "label": "Dynamic checkout button on product page",
            "passed": bool(signals.has_dynamic_checkout_button),
            "weight": 5,
        },
        {
            "id": "sticky_checkout",
            "label": "Sticky add-to-cart on scroll",
            "passed": bool(signals.has_sticky_checkout),
            "weight": 5,
        },
    ]
