"""Tests for the dynamic fix-step filtering.

Most of the legacy dimensions keep their static step lists; only
``checkout`` currently tailors steps to the actual scan signals. These
tests focus on the checkout filter logic across a realistic matrix of
stores.
"""

from __future__ import annotations

import pytest

from types import SimpleNamespace

from app.services.dimension_fixes import (
    FIX_CONTENT,
    _checkout_fix_steps,
    gate_store_analysis_for_free_tier,
    get_fix_steps,
    strip_check_remediation,
)


# ---------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------


def _allbirds_signals() -> dict:
    """Realistic Allbirds signal shape from the live scan.

    Apple Pay + Shop Pay + PayPal on checkout, Afterpay + Shop Pay
    Installments as BNPL, no Google Pay, no PDP Shop Pay Express,
    no drawer/ajax cart on the PDP.
    """
    return {
        # Legacy PDP flags (observed from a real /rescan run)
        "hasAcceleratedCheckout": False,
        "hasDynamicCheckoutButton": False,
        "hasPaypal": False,
        "hasKlarna": False,
        "hasAfterpay": False,
        "hasAffirm": False,
        "hasSezzle": False,
        "paymentMethodCount": 1,
        "hasDrawerCart": False,
        "hasAjaxCart": False,
        "hasStickyCheckout": False,
        # Ground-truth from rendered checkout
        "reachedCheckout": True,
        "failureReason": None,
        "checkoutFlavor": "onepage",
        "wallets": {
            "shopPay": True,
            "applePay": True,
            "googlePay": False,
            "paypal": True,
            "amazonPay": False,
            "metaPay": False,
            "stripeLink": False,
        },
        "bnpl": {
            "klarna": False,
            "afterpay": True,
            "clearpay": False,
            "affirm": False,
            "sezzle": False,
            "shopPayInstallments": True,
            "zip": False,
        },
        "cardBrands": ["visa", "mastercard", "amex", "discover", "elo", "jcb"],
        "guestCheckoutAvailable": True,
        "forcedAccountCreation": False,
        "checkoutStepCount": 1,
        "totalFormFieldsStepOne": 16,
        "hasDiscountCodeField": True,
        "hasGiftCardField": False,
        "hasShippingCalculator": True,
        "hasAddressAutocomplete": False,
        "trustBadgeCount": 0,
        "currencyCode": "USD",
    }


def _bare_store_signals() -> dict:
    """A bare Shopify store with essentially no payment coverage."""
    return {
        "hasAcceleratedCheckout": False,
        "hasDynamicCheckoutButton": False,
        "hasPaypal": False,
        "hasKlarna": False,
        "hasAfterpay": False,
        "hasAffirm": False,
        "hasSezzle": False,
        "paymentMethodCount": 1,
        "hasDrawerCart": False,
        "hasAjaxCart": False,
        "hasStickyCheckout": False,
        "reachedCheckout": True,
        "failureReason": None,
        "checkoutFlavor": "onepage",
        "wallets": {
            "shopPay": False,
            "applePay": False,
            "googlePay": False,
            "paypal": False,
            "amazonPay": False,
            "metaPay": False,
            "stripeLink": False,
        },
        "bnpl": {
            "klarna": False,
            "afterpay": False,
            "clearpay": False,
            "affirm": False,
            "sezzle": False,
            "shopPayInstallments": False,
            "zip": False,
        },
        "cardBrands": [],
        "guestCheckoutAvailable": True,
        "forcedAccountCreation": False,
        "checkoutStepCount": 1,
        "totalFormFieldsStepOne": 10,
        "hasDiscountCodeField": False,
        "hasGiftCardField": False,
        "hasShippingCalculator": True,
        "hasAddressAutocomplete": False,
        "trustBadgeCount": 0,
        "currencyCode": "USD",
    }


def _perfect_store_signals() -> dict:
    """Ideal case: everything enabled."""
    return {
        "hasAcceleratedCheckout": True,
        "hasDynamicCheckoutButton": True,
        "hasPaypal": True,
        "hasKlarna": True,
        "hasAfterpay": True,
        "hasAffirm": True,
        "hasSezzle": False,
        "paymentMethodCount": 5,
        "hasDrawerCart": True,
        "hasAjaxCart": True,
        "hasStickyCheckout": True,
        "reachedCheckout": True,
        "failureReason": None,
        "checkoutFlavor": "onepage",
        "wallets": {
            "shopPay": True,
            "applePay": True,
            "googlePay": True,
            "paypal": True,
            "amazonPay": False,
            "metaPay": False,
            "stripeLink": False,
        },
        "bnpl": {
            "klarna": True,
            "afterpay": True,
            "clearpay": False,
            "affirm": False,
            "sezzle": False,
            "shopPayInstallments": True,
            "zip": False,
        },
        "cardBrands": ["visa", "mastercard", "amex"],
        "guestCheckoutAvailable": True,
        "forcedAccountCreation": False,
        "checkoutStepCount": 1,
        "totalFormFieldsStepOne": 14,
        "hasDiscountCodeField": True,
        "hasGiftCardField": True,
        "hasShippingCalculator": True,
        "hasAddressAutocomplete": True,
        "trustBadgeCount": 3,
        "currencyCode": "USD",
    }


# ---------------------------------------------------------------------
# get_fix_steps dispatch
# ---------------------------------------------------------------------


class TestGetFixStepsDispatch:
    def test_unknown_dimension_returns_empty(self) -> None:
        assert get_fix_steps("not_a_dimension", None) == []

    def test_none_signals_returns_static_list(self) -> None:
        # Without signals we can't tailor, so return the full generic list.
        static = FIX_CONTENT["checkout"]["steps"]
        assert get_fix_steps("checkout", None) == list(static)
        assert get_fix_steps("checkout", {}) == list(static)

    def test_non_checkout_dimension_passes_through(self) -> None:
        # Only ``checkout`` is dynamic today; others return their static
        # list regardless of whether signals are supplied.
        expected = FIX_CONTENT["pageSpeed"]["steps"]
        assert get_fix_steps("pageSpeed", {"anything": True}) == list(expected)


# ---------------------------------------------------------------------
# _checkout_fix_steps behavioral tests
# ---------------------------------------------------------------------


class TestAllbirdsCase:
    """This is the user-reported confusion case.

    Allbirds has Shop Pay + Apple Pay + Afterpay on checkout but no
    Google Pay and no PDP Shop Pay Express button. The old static list
    incorrectly told them to install Shop Pay (they already have it).
    """

    def test_does_not_recommend_installing_shop_pay(self) -> None:
        steps = _checkout_fix_steps(_allbirds_signals())
        install_steps = [s for s in steps if s.lower().startswith("install")]
        for s in install_steps:
            assert "Shop Pay" not in s
            assert "Afterpay" not in s

    def test_recommends_enabling_google_pay(self) -> None:
        steps = _checkout_fix_steps(_allbirds_signals())
        assert any("Google Pay" in s for s in steps)

    def test_recommends_pdp_shop_pay_express(self) -> None:
        steps = _checkout_fix_steps(_allbirds_signals())
        assert any(
            "Shop Pay Express" in s and "product" in s for s in steps
        )

    def test_does_not_recommend_installing_apple_pay(self) -> None:
        # Apple Pay is already present on checkout — no install step,
        # only the iOS Safari verification step.
        steps = _checkout_fix_steps(_allbirds_signals())
        assert not any(
            s.startswith("Enable Apple Pay") for s in steps
        )
        assert any("iOS Safari" in s for s in steps)


class TestBareStoreCase:
    def test_install_shop_pay_klarna_afterpay(self) -> None:
        steps = _checkout_fix_steps(_bare_store_signals())
        install_step = next(
            (s for s in steps if s.lower().startswith("install")), None
        )
        assert install_step is not None
        assert "Shop Pay" in install_step
        assert "Klarna" in install_step
        assert "Afterpay" in install_step

    def test_all_major_categories_surfaced(self) -> None:
        steps = _checkout_fix_steps(_bare_store_signals())
        joined = " ".join(steps)
        # Expect mentions for: install providers, Google Pay, Shop Pay
        # Express on PDP, installment callout, Apple Pay.
        assert "Google Pay" in joined
        assert "Shop Pay Express" in joined
        assert "installment" in joined.lower() or "4 payments" in joined.lower()
        assert "Apple Pay" in joined


class TestPerfectStoreCase:
    def test_no_remedial_steps(self) -> None:
        steps = _checkout_fix_steps(_perfect_store_signals())
        # Nothing to install, nothing to enable — only the iOS Safari
        # verification (since Apple Pay is on and we always suggest
        # sanity-checking real devices).
        joined = " ".join(steps).lower()
        assert "install" not in joined
        assert "enable google pay" not in joined
        assert "enable shop pay express" not in joined
        # Verification step is present
        assert any("ios safari" in s.lower() for s in steps)


# ---------------------------------------------------------------------
# Fallback to PDP signals when live flow failed
# ---------------------------------------------------------------------


class TestPdpFallback:
    def test_uses_pdp_flags_when_reached_checkout_false(self) -> None:
        sigs = {
            "hasAcceleratedCheckout": True,   # PDP has Shop Pay button
            "hasDynamicCheckoutButton": True,
            "hasPaypal": True,
            "hasKlarna": True,
            "hasAfterpay": False,
            "hasAffirm": False,
            "hasSezzle": False,
            "paymentMethodCount": 3,
            "hasDrawerCart": True,
            "hasAjaxCart": True,
            "hasStickyCheckout": False,
            "reachedCheckout": False,
            "failureReason": "bot_wall",
        }
        steps = _checkout_fix_steps(sigs)
        # PDP says Shop Pay is present (accelerated checkout wrapper),
        # so we should NOT recommend installing Shop Pay.
        install_step = next(
            (s for s in steps if s.lower().startswith("install")), None
        )
        if install_step is not None:
            assert "Shop Pay" not in install_step
        # PDP has the Shop Pay Express button, so no PDP button step.
        assert not any(
            "Shop Pay Express" in s and "product" in s for s in steps
        )


# ---------------------------------------------------------------------
# Always-return-something guarantee
# ---------------------------------------------------------------------


class TestAlwaysReturnsSteps:
    def test_empty_dict_returns_full_static_list(self) -> None:
        # get_fix_steps, not _checkout_fix_steps — empty dict falls to static
        assert len(get_fix_steps("checkout", {})) > 0

    def test_perfect_store_returns_at_least_one_step(self) -> None:
        steps = _checkout_fix_steps(_perfect_store_signals())
        assert len(steps) >= 1

    @pytest.mark.parametrize(
        "signals",
        [
            _allbirds_signals(),
            _bare_store_signals(),
            _perfect_store_signals(),
        ],
    )
    def test_no_empty_strings(self, signals: dict) -> None:
        steps = _checkout_fix_steps(signals)
        for step in steps:
            assert step.strip() != ""


# ---------------------------------------------------------------------
# gate_store_analysis_for_free_tier — paywall-leak regression coverage
# ---------------------------------------------------------------------


def _payload_with_remediation() -> dict:
    """A minimal store-analysis payload that includes premium fields."""
    return {
        "score": 72,
        "categories": {"checkout": 80},
        "tips": {"checkout": ["Tip 1"]},
        "signals": {"checkout": {"hasShopPay": True}},
        "checks": {
            "checkout": [
                {
                    "key": "shop_pay",
                    "label": "Shop Pay",
                    "passed": True,
                    "remediation": "Install Shop Pay via Shopify Payments.",
                    "code": "<script>...</script>",
                },
            ],
        },
        "analyzedUrl": "https://example.com/p/x",
        "updatedAt": "2026-04-25T12:00:00+00:00",
    }


class TestGateStoreAnalysisForFreeTier:
    def test_paid_tier_passthrough(self) -> None:
        payload = _payload_with_remediation()
        user = SimpleNamespace(plan_tier="starter")
        out = gate_store_analysis_for_free_tier(payload, user)
        assert out["checks"]["checkout"][0]["remediation"] == (
            "Install Shop Pay via Shopify Payments."
        )
        assert out["checks"]["checkout"][0]["code"] == "<script>...</script>"
        assert out["planTier"] == "starter"
        assert out["recommendationsLocked"] is False

    def test_free_tier_strips_remediation_and_code(self) -> None:
        payload = _payload_with_remediation()
        user = SimpleNamespace(plan_tier="free")
        out = gate_store_analysis_for_free_tier(payload, user)
        check = out["checks"]["checkout"][0]
        assert "remediation" not in check
        assert "code" not in check
        # Non-premium fields preserved.
        assert check["label"] == "Shop Pay"
        assert check["passed"] is True
        assert out["planTier"] == "free"
        assert out["recommendationsLocked"] is True

    def test_anonymous_caller_treated_as_free_tier(self) -> None:
        payload = _payload_with_remediation()
        out = gate_store_analysis_for_free_tier(payload, None)
        check = out["checks"]["checkout"][0]
        assert "remediation" not in check
        assert "code" not in check
        assert out["planTier"] is None
        assert out["recommendationsLocked"] is True

    def test_none_payload_passthrough(self) -> None:
        assert gate_store_analysis_for_free_tier(None, None) is None
        user = SimpleNamespace(plan_tier="starter")
        assert gate_store_analysis_for_free_tier(None, user) is None

    def test_does_not_mutate_input(self) -> None:
        payload = _payload_with_remediation()
        user = SimpleNamespace(plan_tier="free")
        gate_store_analysis_for_free_tier(payload, user)
        # Original retained the premium fields — gating returned a copy.
        assert payload["checks"]["checkout"][0]["remediation"] == (
            "Install Shop Pay via Shopify Payments."
        )
        assert payload["checks"]["checkout"][0]["code"] == "<script>...</script>"
        assert "planTier" not in payload
        assert "recommendationsLocked" not in payload

    def test_empty_plan_tier_string_treated_as_free(self) -> None:
        payload = _payload_with_remediation()
        user = SimpleNamespace(plan_tier="")
        out = gate_store_analysis_for_free_tier(payload, user)
        assert "remediation" not in out["checks"]["checkout"][0]
        assert out["planTier"] == "free"
        assert out["recommendationsLocked"] is True


class TestStripCheckRemediation:
    def test_passes_none_through(self) -> None:
        assert strip_check_remediation(None) is None

    def test_removes_premium_fields_only(self) -> None:
        checks = {
            "trust": [
                {
                    "key": "ssl",
                    "passed": True,
                    "remediation": "Renew certificate.",
                    "code": "openssl s_client ...",
                },
            ],
        }
        out = strip_check_remediation(checks)
        assert out["trust"][0] == {"key": "ssl", "passed": True}

    def test_handles_non_dict_input(self) -> None:
        assert strip_check_remediation("not a dict") == "not a dict"  # type: ignore[arg-type]
