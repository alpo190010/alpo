"""Tests for plan tier definitions."""

from unittest.mock import patch

from app.plans import PLAN_TIERS, get_tier_for_price_id


def test_plan_tiers_count():
    """PLAN_TIERS has exactly 3 tiers (free / insights / fixes)."""
    assert len(PLAN_TIERS) == 3


def test_plan_tier_keys():
    """All expected tier keys are present and lowercase."""
    expected = {"free", "insights", "fixes"}
    assert set(PLAN_TIERS.keys()) == expected
    for key in PLAN_TIERS:
        assert key == key.lower(), f"Tier key '{key}' is not lowercase"


def test_free_tier():
    assert PLAN_TIERS["free"]["credits_limit"] == 3
    assert PLAN_TIERS["free"]["price_yearly"] == 0


def test_insights_tier_is_unlimited():
    assert PLAN_TIERS["insights"]["credits_limit"] is None
    assert PLAN_TIERS["insights"]["price_yearly"] == 79


def test_fixes_tier_is_unlimited():
    assert PLAN_TIERS["fixes"]["credits_limit"] is None
    assert PLAN_TIERS["fixes"]["price_yearly"] == 149


def test_all_tiers_have_required_fields():
    """Every tier must define credits_limit and price_yearly."""
    for name, tier in PLAN_TIERS.items():
        assert "credits_limit" in tier, f"Tier '{name}' missing credits_limit"
        assert "price_yearly" in tier, f"Tier '{name}' missing price_yearly"


def test_legacy_starter_tier_removed():
    """The legacy ``starter`` value was renamed to ``insights`` in 0019."""
    assert "starter" not in PLAN_TIERS


def test_growth_tier_removed():
    """The deprecated growth tier has been removed from PLAN_TIERS."""
    assert "growth" not in PLAN_TIERS


# ---- price_id → tier mapping tests -----------------------------------------


class TestGetTierForPriceId:
    @patch("app.plans.settings")
    def test_insights_price_maps_to_insights(self, mock_settings):
        mock_settings.paddle_price_insights = "pri_insights"
        mock_settings.paddle_price_fixes = "pri_fixes"
        mock_settings.paddle_price_starter_monthly = ""
        mock_settings.paddle_price_starter_annual = ""

        assert get_tier_for_price_id("pri_insights") == "insights"

    @patch("app.plans.settings")
    def test_fixes_price_maps_to_fixes(self, mock_settings):
        mock_settings.paddle_price_insights = "pri_insights"
        mock_settings.paddle_price_fixes = "pri_fixes"
        mock_settings.paddle_price_starter_monthly = ""
        mock_settings.paddle_price_starter_annual = ""

        assert get_tier_for_price_id("pri_fixes") == "fixes"

    @patch("app.plans.settings")
    def test_legacy_starter_price_still_maps_to_insights(self, mock_settings):
        """Dormant subscription IDs route to insights — backward-compat for any
        in-flight test transactions on the legacy Starter price."""
        mock_settings.paddle_price_insights = ""
        mock_settings.paddle_price_fixes = ""
        mock_settings.paddle_price_starter_monthly = "pri_monthly"
        mock_settings.paddle_price_starter_annual = "pri_annual"

        assert get_tier_for_price_id("pri_monthly") == "insights"
        assert get_tier_for_price_id("pri_annual") == "insights"

    @patch("app.plans.settings")
    def test_unknown_price_returns_none(self, mock_settings):
        mock_settings.paddle_price_insights = "pri_insights"
        mock_settings.paddle_price_fixes = "pri_fixes"
        mock_settings.paddle_price_starter_monthly = ""
        mock_settings.paddle_price_starter_annual = ""

        assert get_tier_for_price_id("pri_unknown") is None

    @patch("app.plans.settings")
    def test_empty_env_does_not_match_empty_input(self, mock_settings):
        """Unconfigured env vars must not cause ``""`` to collide with anything."""
        mock_settings.paddle_price_insights = ""
        mock_settings.paddle_price_fixes = ""
        mock_settings.paddle_price_starter_monthly = ""
        mock_settings.paddle_price_starter_annual = ""

        # With env vars all empty, even "" should not resolve.
        assert get_tier_for_price_id("") is None
        assert get_tier_for_price_id("pri_anything") is None
