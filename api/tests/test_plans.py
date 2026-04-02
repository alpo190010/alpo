"""Tests for plan tier definitions."""

from unittest.mock import patch

from app.plans import PLAN_TIERS, get_tier_for_variant


def test_plan_tiers_count():
    """PLAN_TIERS has exactly 4 tiers."""
    assert len(PLAN_TIERS) == 4


def test_plan_tier_keys():
    """All expected tier keys are present and lowercase."""
    expected = {"free", "starter", "growth", "pro"}
    assert set(PLAN_TIERS.keys()) == expected
    for key in PLAN_TIERS:
        assert key == key.lower(), f"Tier key '{key}' is not lowercase"


def test_free_tier():
    assert PLAN_TIERS["free"]["credits_limit"] == 3
    assert PLAN_TIERS["free"]["price_monthly"] == 0


def test_starter_tier():
    assert PLAN_TIERS["starter"]["credits_limit"] == 10
    assert PLAN_TIERS["starter"]["price_monthly"] == 29


def test_growth_tier():
    assert PLAN_TIERS["growth"]["credits_limit"] == 30
    assert PLAN_TIERS["growth"]["price_monthly"] == 79


def test_pro_tier():
    assert PLAN_TIERS["pro"]["credits_limit"] == 100
    assert PLAN_TIERS["pro"]["price_monthly"] == 149


def test_all_tiers_have_required_fields():
    """Every tier must define credits_limit and price_monthly."""
    for name, tier in PLAN_TIERS.items():
        assert "credits_limit" in tier, f"Tier '{name}' missing credits_limit"
        assert "price_monthly" in tier, f"Tier '{name}' missing price_monthly"


# ---- variant → tier mapping tests ------------------------------------------


class TestGetTierForVariant:
    @patch("app.plans.settings")
    def test_known_variant_returns_correct_tier(self, mock_settings):
        """Each configured variant ID resolves to the correct tier string."""
        mock_settings.lemonsqueezy_variant_starter = "var_111"
        mock_settings.lemonsqueezy_variant_growth = "var_222"
        mock_settings.lemonsqueezy_variant_pro = "var_333"

        assert get_tier_for_variant("var_111") == "starter"
        assert get_tier_for_variant("var_222") == "growth"
        assert get_tier_for_variant("var_333") == "pro"

    @patch("app.plans.settings")
    def test_unknown_variant_returns_none(self, mock_settings):
        """A variant ID not in the mapping returns None."""
        mock_settings.lemonsqueezy_variant_starter = "var_111"
        mock_settings.lemonsqueezy_variant_growth = "var_222"
        mock_settings.lemonsqueezy_variant_pro = "var_333"

        assert get_tier_for_variant("var_unknown") is None

    @patch("app.plans.settings")
    def test_empty_string_variant_returns_none(self, mock_settings):
        """Empty string variant ID returns None (unconfigured env vars)."""
        mock_settings.lemonsqueezy_variant_starter = ""
        mock_settings.lemonsqueezy_variant_growth = ""
        mock_settings.lemonsqueezy_variant_pro = ""

        assert get_tier_for_variant("var_111") is None
