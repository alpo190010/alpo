"""Tests for plan tier definitions."""

from unittest.mock import patch

from app.plans import PLAN_TIERS, get_tier_for_price_id


def test_plan_tiers_count():
    """PLAN_TIERS has exactly 3 tiers (free / starter / pro)."""
    assert len(PLAN_TIERS) == 3


def test_plan_tier_keys():
    """All expected tier keys are present and lowercase."""
    expected = {"free", "starter", "pro"}
    assert set(PLAN_TIERS.keys()) == expected
    for key in PLAN_TIERS:
        assert key == key.lower(), f"Tier key '{key}' is not lowercase"


def test_free_tier():
    assert PLAN_TIERS["free"]["credits_limit"] == 3
    assert PLAN_TIERS["free"]["price_monthly"] == 0


def test_starter_tier_is_unlimited():
    assert PLAN_TIERS["starter"]["credits_limit"] is None
    assert PLAN_TIERS["starter"]["price_monthly"] == 29


def test_pro_tier_is_unlimited():
    assert PLAN_TIERS["pro"]["credits_limit"] is None
    assert PLAN_TIERS["pro"]["price_monthly"] == 99


def test_all_tiers_have_required_fields():
    """Every tier must define credits_limit and price_monthly."""
    for name, tier in PLAN_TIERS.items():
        assert "credits_limit" in tier, f"Tier '{name}' missing credits_limit"
        assert "price_monthly" in tier, f"Tier '{name}' missing price_monthly"


def test_growth_tier_removed():
    """The deprecated growth tier has been removed from PLAN_TIERS."""
    assert "growth" not in PLAN_TIERS


# ---- price_id → tier mapping tests -----------------------------------------


class TestGetTierForPriceId:
    @patch("app.plans.settings")
    def test_monthly_starter_price_maps_to_starter(self, mock_settings):
        mock_settings.paddle_price_starter_monthly = "pri_monthly"
        mock_settings.paddle_price_starter_annual = "pri_annual"

        assert get_tier_for_price_id("pri_monthly") == "starter"

    @patch("app.plans.settings")
    def test_annual_starter_price_maps_to_starter(self, mock_settings):
        """Annual Starter price resolves to the same tier as monthly."""
        mock_settings.paddle_price_starter_monthly = "pri_monthly"
        mock_settings.paddle_price_starter_annual = "pri_annual"

        assert get_tier_for_price_id("pri_annual") == "starter"

    @patch("app.plans.settings")
    def test_unknown_price_returns_none(self, mock_settings):
        mock_settings.paddle_price_starter_monthly = "pri_monthly"
        mock_settings.paddle_price_starter_annual = "pri_annual"

        assert get_tier_for_price_id("pri_unknown") is None

    @patch("app.plans.settings")
    def test_empty_env_does_not_match_empty_input(self, mock_settings):
        """Unconfigured env vars must not cause ``""`` to collide with anything."""
        mock_settings.paddle_price_starter_monthly = ""
        mock_settings.paddle_price_starter_annual = ""

        # With both env vars empty, even "" should not resolve.
        assert get_tier_for_price_id("") is None
        assert get_tier_for_price_id("pri_monthly") is None
