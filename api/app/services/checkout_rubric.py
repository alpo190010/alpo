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
            "remediation": (
                "Shopify admin → Settings → Payments → Shop Pay → turn "
                "on. Also enable the Shop Pay Express button in your "
                "theme's product template."
            ),
            "code": (
                "{%- comment -%} Inside product-form.liquid {%- endcomment -%}\n"
                "{%- form 'product', product -%}\n"
                "  {{ form | payment_button }}\n"
                "{%- endform -%}"
            ),
        },
        {
            "id": "bnpl",
            "label": "Buy-now-pay-later provider (Klarna, Afterpay, Affirm, Sezzle)",
            "passed": bool(has_bnpl),
            "weight": 20,
            "remediation": (
                "Install Shop Pay Installments, Klarna, Afterpay, or "
                "Affirm from the Shopify App Store → enable in "
                "Settings → Payments."
            ),
        },
        {
            "id": "payment_methods_3plus",
            "label": "Accepts 3+ payment methods",
            "passed": signals.payment_method_count >= 3,
            "weight": 10,
            "remediation": (
                "Add at least three payment methods (credit card, one "
                "wallet, one BNPL). Most Shopify stores reach this by "
                "enabling Shop Pay + Apple Pay + Google Pay."
            ),
        },
        {
            "id": "payment_methods_5plus",
            "label": "Accepts 5+ payment methods",
            "passed": signals.payment_method_count >= 5,
            "weight": 5,
            "remediation": (
                "Add a fifth payment method — PayPal or Amazon Pay are "
                "the most common additions on top of card + wallets + BNPL."
            ),
        },
        {
            "id": "drawer_cart",
            "label": "Drawer / slide-out cart",
            "passed": bool(signals.has_drawer_cart),
            "weight": 10,
            "remediation": (
                "Enable your theme's drawer cart in the theme customizer "
                "(Dawn and most modern themes support it). If unavailable, "
                "install a cart-drawer app."
            ),
        },
        {
            "id": "ajax_cart",
            "label": "Add to Cart doesn't reload the page",
            "passed": bool(signals.has_ajax_cart),
            "weight": 5,
            "remediation": (
                "When a shopper clicks Add to Cart, the page should "
                "update silently — no reload, no flicker. Most modern "
                "Shopify themes do this by default. Check your theme "
                "settings or ask your theme developer to switch it on."
            ),
        },
        {
            "id": "paypal",
            "label": "PayPal available",
            "passed": bool(signals.has_paypal),
            "weight": 10,
            "remediation": (
                "Shopify admin → Settings → Payments → add PayPal as an "
                "alternative payment method. ~60% of shoppers expect "
                "PayPal to be available."
            ),
        },
        {
            "id": "dynamic_checkout_button",
            "label": "Quick-pay button on product page",
            "passed": bool(signals.has_dynamic_checkout_button),
            "weight": 5,
            "remediation": (
                "Show a one-click pay button (Shop Pay, PayPal, Apple "
                "Pay, Google Pay) right on the product page so "
                "returning shoppers can buy without re-entering details. "
                "Modern Shopify themes have a setting for this — your "
                "theme developer can switch it on if it isn't visible."
            ),
            "code": (
                "{%- comment -%} Inside product-form.liquid, after Add to Cart {%- endcomment -%}\n"
                "{%- if product.selected_or_first_available_variant.available -%}\n"
                "  {{ form | payment_button }}\n"
                "{%- endif -%}"
            ),
        },
        {
            "id": "sticky_checkout",
            "label": "Sticky add-to-cart on scroll",
            "passed": bool(signals.has_sticky_checkout),
            "weight": 5,
            "remediation": (
                "Enable a sticky Add-to-Cart section in your theme "
                "customizer, or install a sticky-cart app like Flair "
                "or Kaching Bundles."
            ),
        },
    ]


# ---------------------------------------------------------------------------
# Merged rubric (ground-truth checkout + PDP fallback)
# ---------------------------------------------------------------------------
#
# When the flow simulator successfully reaches the real Shopify checkout
# page, we score against what the buyer actually sees. When it can't
# (bot wall, password page, OOS, timeout), we fall back to the legacy
# PDP-only rubric but cap the result at 70 so stores with real but
# unverifiable checkout problems don't walk away with an artificially
# high score.
#
# Weight distribution (100 points total when reached_checkout=True):
#
#   Apple Pay on checkout                 12
#   Google Pay on checkout                10
#   Shop Pay on checkout                  10
#   Other wallet (Amazon/Meta/Link)        5
#   Any BNPL on checkout                  15
#   Guest checkout supported              12
#   One-page checkout                      8
#   Discount code field                    5
#   Address autocomplete                   5
#   Trust badges on checkout               5
#   Drawer / AJAX cart on PDP              8
#   Sticky checkout button on PDP          5
#

from app.services.checkout_detector import MergedCheckoutSignals  # noqa: E402

_UNVERIFIED_MAX = 70


def score_merged_checkout(merged: MergedCheckoutSignals) -> int:
    """Score a merged signal bundle (checkout-page preferred, PDP fallback).

    When ``merged.reached_checkout`` is False, scoring degrades to the
    legacy PDP-only rubric and is clamped to a ceiling of 70 so we don't
    overstate confidence in a store we couldn't actually inspect.
    """
    if not merged.reached_checkout:
        pdp_score = score_checkout(merged.pdp)
        return min(pdp_score, _UNVERIFIED_MAX)

    cp = merged.checkout_page
    pdp = merged.pdp
    score = 0

    # Wallets (checkout-page ground truth)
    if cp.has_apple_pay:
        score += 12
    if cp.has_google_pay:
        score += 10
    if cp.has_shop_pay:
        score += 10
    if cp.has_amazon_pay or cp.has_meta_pay or cp.has_stripe_link:
        score += 5

    # BNPL (any provider)
    if cp.bnpl_count > 0:
        score += 15

    # Guest checkout
    if cp.guest_checkout_available:
        score += 12

    # One-page checkout
    if cp.checkout_step_count == 1:
        score += 8

    # Discount code field
    if cp.has_discount_code_field:
        score += 5

    # Address autocomplete
    if cp.has_address_autocomplete:
        score += 5

    # Trust badges
    if cp.trust_badge_count > 0:
        score += 5

    # PDP-sourced cart UX (kept from legacy rubric)
    if pdp.has_drawer_cart or pdp.has_ajax_cart:
        score += 8
    if pdp.has_sticky_checkout:
        score += 5

    return max(0, min(100, score))


# Tip rules for the merged rubric. Each (condition, tip) pair is
# evaluated in priority order; up to 3 tips are returned. The condition
# receives ``(merged, computed_score)``.
_MERGED_TIP_RULES: list[tuple] = [
    # 1. Couldn't reach the checkout at all
    (
        lambda m, _s: not m.reached_checkout,
        (
            "We couldn't inspect your real checkout (reason: "
            "{failure_reason}). Payment-method scoring above is inferred "
            "from the product page only — verify your live checkout "
            "manually."
        ),
    ),
    # 2. No Apple Pay on checkout (mobile conversion driver)
    (
        lambda m, _s: m.reached_checkout and not m.checkout_page.has_apple_pay,
        (
            "Enable Apple Pay in Shopify Payments — mobile buyers "
            "convert ~2x higher with Apple Pay vs typing card details "
            "(Shopify, 2024)."
        ),
    ),
    # 3. No Google Pay on checkout (Android / Chrome conversion)
    (
        lambda m, _s: m.reached_checkout and not m.checkout_page.has_google_pay,
        (
            "Enable Google Pay — 43% of Android shoppers abandon "
            "checkout when it's unavailable (Google/Ipsos 2023)."
        ),
    ),
    # 4. No Shop Pay on checkout
    (
        lambda m, _s: m.reached_checkout and not m.checkout_page.has_shop_pay,
        (
            "Turn on Shop Pay — Shopify reports a 50% lift in "
            "checkout-to-order rate for returning buyers."
        ),
    ),
    # 5. No BNPL at all
    (
        lambda m, _s: m.reached_checkout and m.checkout_page.bnpl_count == 0,
        (
            "Add a buy-now-pay-later provider (Shop Pay Installments, "
            "Afterpay, Klarna, or Affirm) — BNPL lifts conversion "
            "20–30% (McKinsey / RBC Capital Markets)."
        ),
    ),
    # 6. Forced account creation
    (
        lambda m, _s: m.reached_checkout
        and m.checkout_page.forced_account_creation,
        (
            "Allow guest checkout — 24% of US shoppers abandon "
            "carts when forced to create an account (Baymard Institute)."
        ),
    ),
    # 7. Multi-step checkout
    (
        lambda m, _s: m.reached_checkout
        and m.checkout_page.checkout_step_count > 1,
        (
            "Consolidate to a one-page checkout — single-page "
            "checkouts convert 13% better than multi-step (Baymard)."
        ),
    ),
    # 8. No discount code field
    (
        lambda m, _s: m.reached_checkout
        and not m.checkout_page.has_discount_code_field,
        (
            "Expose a discount-code field — buyers who can't find "
            "one often leave to search for a code and never return "
            "(Baymard)."
        ),
    ),
    # 9. No address autocomplete
    (
        lambda m, _s: m.reached_checkout
        and not m.checkout_page.has_address_autocomplete,
        (
            "Enable address autocomplete — reduces typing by 20% "
            "and cuts address-entry errors, the #3 cause of failed "
            "orders (Google Places/Shopify)."
        ),
    ),
    # 10. PDP cart UX missing
    (
        lambda m, _s: not (m.pdp.has_drawer_cart or m.pdp.has_ajax_cart),
        (
            "Add a drawer / AJAX cart so adding to cart doesn't bounce "
            "the buyer off the product page — 15–40% AOV lift "
            "is typical."
        ),
    ),
    # 11. Congratulatory
    (
        lambda _m, score: score >= 90,
        (
            "Your checkout covers the major wallets, guest checkout, "
            "and one-page flow — keep monitoring mobile speed and "
            "trust signals."
        ),
    ),
]


def get_merged_checkout_tips(merged: MergedCheckoutSignals) -> list[str]:
    """Return up to 3 prioritized tips for the merged rubric."""
    score = score_merged_checkout(merged)
    tips: list[str] = []
    for condition, template in _MERGED_TIP_RULES:
        if condition(merged, score):
            # Interpolate failure_reason for the fallback tip.
            if "{failure_reason}" in template:
                reason = merged.failure_reason or "unknown"
                template = template.format(failure_reason=reason)
            tips.append(template)
            if len(tips) >= 3:
                break
    return tips


def list_merged_checkout_checks(merged: MergedCheckoutSignals) -> list[dict]:
    """Per-check breakdown of the merged rubric for UI rendering.

    When ``reached_checkout`` is False, falls back to the legacy PDP
    checks and appends a single row flagging the unverifiable state so
    the UI can show an explanatory banner.
    """
    if not merged.reached_checkout:
        rows = list_checkout_checks(merged.pdp)
        rows.insert(0, {
            "id": "checkout_flow_unverified",
            "label": (
                f"Live checkout inspection failed "
                f"({merged.failure_reason or 'unknown'}) — "
                "showing product-page signals only"
            ),
            "passed": False,
            "weight": 0,
        })
        return rows

    cp = merged.checkout_page
    pdp = merged.pdp
    return [
        {
            "id": "apple_pay_on_checkout",
            "label": "Apple Pay available on checkout",
            "passed": bool(cp.has_apple_pay),
            "weight": 12,
            "remediation": (
                "Open Shopify admin → Settings → Payments → Shopify "
                "Payments → toggle Apple Pay on. Re-publish the theme "
                "and verify on a real iOS Safari session."
            ),
        },
        {
            "id": "google_pay_on_checkout",
            "label": "Google Pay available on checkout",
            "passed": bool(cp.has_google_pay),
            "weight": 10,
            "remediation": (
                "Shopify admin → Settings → Payments → Shopify Payments "
                "→ toggle Google Pay on. Verify on Chrome for Android."
            ),
        },
        {
            "id": "shop_pay_on_checkout",
            "label": "Shop Pay available on checkout",
            "passed": bool(cp.has_shop_pay),
            "weight": 10,
            "remediation": (
                "Shopify admin → Settings → Payments → Shop Pay → turn "
                "on. Returning Shop Pay buyers convert 50% higher than "
                "guest checkout (Shopify, 2024)."
            ),
        },
        {
            "id": "other_wallet_on_checkout",
            "label": "Amazon Pay / Meta Pay / Stripe Link available",
            "passed": bool(
                cp.has_amazon_pay or cp.has_meta_pay or cp.has_stripe_link
            ),
            "weight": 5,
            "remediation": (
                "Install Amazon Pay (or the Stripe Link / Meta Pay app) "
                "from the Shopify App Store, then enable it in "
                "Settings → Payments."
            ),
        },
        {
            "id": "bnpl_on_checkout",
            "label": "Buy-now-pay-later available on checkout",
            "passed": cp.bnpl_count > 0,
            "weight": 15,
            "remediation": (
                "Install Shop Pay Installments, Klarna, Afterpay, or "
                "Affirm from the Shopify App Store → enable in "
                "Settings → Payments. BNPL lifts conversion 20–30% "
                "(McKinsey / RBC)."
            ),
        },
        {
            "id": "guest_checkout",
            "label": "Guest checkout supported",
            "passed": bool(cp.guest_checkout_available),
            "weight": 12,
            "remediation": (
                "Shopify admin → Settings → Checkout → Customer "
                "accounts → switch to \"Accounts are optional\" "
                "or \"Accounts are disabled\". 24% of US shoppers "
                "abandon when forced to create an account (Baymard)."
            ),
        },
        {
            "id": "one_page_checkout",
            "label": "One-page checkout",
            "passed": cp.checkout_step_count == 1,
            "weight": 8,
            "remediation": (
                "Shopify admin → Settings → Checkout → enable the "
                "one-page checkout (default for all stores in 2025). "
                "Single-page converts 13% better than multi-step "
                "(Baymard)."
            ),
        },
        {
            "id": "discount_code_field",
            "label": "Discount code field on checkout",
            "passed": bool(cp.has_discount_code_field),
            "weight": 5,
            "remediation": (
                "Re-enable the discount-code field via the Checkout "
                "Editor (Shopify Plus) or your theme's checkout.liquid. "
                "Buyers who can't find a code often leave to search for "
                "one and never return (Baymard)."
            ),
        },
        {
            "id": "address_autocomplete",
            "label": "Address autocomplete on checkout",
            "passed": bool(cp.has_address_autocomplete),
            "weight": 5,
            "remediation": (
                "Shopify admin → Settings → Markets → enable address "
                "autocomplete. For extra accuracy, add Google Places "
                "via a theme app. Cuts typing 20% and reduces the #3 "
                "cause of failed orders."
            ),
        },
        {
            "id": "trust_badges_on_checkout",
            "label": "Trust badges / security signals on checkout",
            "passed": cp.trust_badge_count > 0,
            "weight": 5,
            "remediation": (
                "Install a trust-badge app (ShopSecure, TrustLock) or "
                "add a money-back-guarantee / secure-checkout line via "
                "checkout.liquid (Plus) near the submit button."
            ),
        },
        {
            "id": "cart_ux",
            "label": "Drawer / AJAX cart on product page",
            "passed": bool(pdp.has_drawer_cart or pdp.has_ajax_cart),
            "weight": 8,
            "remediation": (
                "Enable your theme's drawer / slide-out cart in the "
                "theme customizer (Dawn and most modern themes support "
                "it natively). If your theme doesn't, install a "
                "cart-drawer app. Typical AOV lift: 15–40%."
            ),
        },
        {
            "id": "sticky_checkout_pdp",
            "label": "Sticky add-to-cart on product page",
            "passed": bool(pdp.has_sticky_checkout),
            "weight": 5,
            "remediation": (
                "Enable a sticky Add-to-Cart section in your theme "
                "customizer (most 2.0 themes support it), or install "
                "a sticky-cart app such as Flair or Kaching Bundles."
            ),
        },
    ]
