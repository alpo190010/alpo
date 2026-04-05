"""Tests for scoring utilities: IMPACT_WEIGHTS, compute_weighted_score, clamp_score, build_category_scores."""

import math

import pytest

from app.services.scoring import (
    CATEGORY_KEYS,
    DIMENSION_SCOPE,
    IMPACT_WEIGHTS,
    PRODUCT_LEVEL_KEYS,
    STORE_WIDE_KEYS,
    _TOTAL_WEIGHT,
    build_category_scores,
    clamp_score,
    compute_weighted_score,
)


# ---------------------------------------------------------------------------
# DIMENSION_SCOPE structural tests
# ---------------------------------------------------------------------------


class TestDimensionScope:
    """Verify DIMENSION_SCOPE classifies all 18 dimensions correctly."""

    def test_dimension_scope_covers_all_category_keys(self):
        assert set(DIMENSION_SCOPE.keys()) == set(CATEGORY_KEYS)

    def test_store_wide_keys_count(self):
        assert len(STORE_WIDE_KEYS) == 7

    def test_product_level_keys_count(self):
        assert len(PRODUCT_LEVEL_KEYS) == 11

    def test_store_and_product_keys_are_disjoint_and_complete(self):
        combined = set(STORE_WIDE_KEYS + PRODUCT_LEVEL_KEYS)
        assert combined == set(CATEGORY_KEYS)
        assert len(STORE_WIDE_KEYS) + len(PRODUCT_LEVEL_KEYS) == len(CATEGORY_KEYS)

    def test_dimension_scope_values_are_valid(self):
        for key, value in DIMENSION_SCOPE.items():
            assert value in ("store", "product"), f"{key} has invalid scope '{value}'"


# ---------------------------------------------------------------------------
# IMPACT_WEIGHTS structural tests
# ---------------------------------------------------------------------------


class TestImpactWeights:
    """Verify IMPACT_WEIGHTS dict matches the frontend tier contract."""

    def test_total_weight_is_48_5(self):
        assert _TOTAL_WEIGHT == 48.5

    def test_all_category_keys_have_weights(self):
        for key in CATEGORY_KEYS:
            assert key in IMPACT_WEIGHTS, f"Missing weight for {key}"

    def test_no_extra_keys_in_weights(self):
        for key in IMPACT_WEIGHTS:
            assert key in CATEGORY_KEYS, f"Unexpected key {key} in IMPACT_WEIGHTS"

    def test_weight_count_matches_categories(self):
        assert len(IMPACT_WEIGHTS) == len(CATEGORY_KEYS) == 18

    def test_very_high_tier(self):
        very_high = ["pageSpeed", "images", "socialProof", "checkout"]
        for k in very_high:
            assert IMPACT_WEIGHTS[k] == 4, f"{k} should be Very High (4)"

    def test_high_tier(self):
        high = ["mobileCta", "title", "aiDiscoverability", "structuredData", "pricing"]
        for k in high:
            assert IMPACT_WEIGHTS[k] == 3, f"{k} should be High (3)"

    def test_medium_high_tier(self):
        medium_high = ["description", "shipping", "crossSell"]
        for k in medium_high:
            assert IMPACT_WEIGHTS[k] == 2.5, f"{k} should be Medium-High (2.5)"

    def test_medium_tier(self):
        medium = ["trust", "socialCommerce", "sizeGuide", "variantUx"]
        for k in medium:
            assert IMPACT_WEIGHTS[k] == 2, f"{k} should be Medium (2)"

    def test_low_medium_tier(self):
        low_medium = ["accessibility", "contentFreshness"]
        for k in low_medium:
            assert IMPACT_WEIGHTS[k] == 1, f"{k} should be Low-Medium (1)"


# ---------------------------------------------------------------------------
# clamp_score tests
# ---------------------------------------------------------------------------


class TestClampScore:
    """Verify clamp_score handles all edge cases."""

    def test_normal_int(self):
        assert clamp_score(50) == 50

    def test_normal_float(self):
        assert clamp_score(75.6) == 75

    def test_zero(self):
        assert clamp_score(0) == 0

    def test_hundred(self):
        assert clamp_score(100) == 100

    def test_negative_clamps_to_zero(self):
        assert clamp_score(-10) == 0

    def test_over_hundred_clamps(self):
        assert clamp_score(150) == 100

    def test_none_returns_zero(self):
        assert clamp_score(None) == 0

    def test_nan_returns_zero(self):
        assert clamp_score(float("nan")) == 0

    def test_string_number(self):
        assert clamp_score("42") == 42

    def test_non_numeric_string(self):
        assert clamp_score("abc") == 0

    def test_empty_string(self):
        assert clamp_score("") == 0

    def test_bool_true(self):
        # bool is subclass of int in Python; True -> 1
        assert clamp_score(True) == 1

    def test_bool_false(self):
        assert clamp_score(False) == 0


# ---------------------------------------------------------------------------
# compute_weighted_score tests
# ---------------------------------------------------------------------------


class TestComputeWeightedScore:
    """Comprehensive tests for compute_weighted_score."""

    def test_all_zeros(self):
        scores = {k: 0 for k in CATEGORY_KEYS}
        assert compute_weighted_score(scores) == 0

    def test_all_hundreds(self):
        scores = {k: 100 for k in CATEGORY_KEYS}
        assert compute_weighted_score(scores) == 100

    def test_empty_dict_defaults_to_zero(self):
        assert compute_weighted_score({}) == 0

    def test_single_very_high_dimension(self):
        """pageSpeed=100 alone should be round(100*4/53) = 8."""
        scores = {"pageSpeed": 100}
        expected = round(100 * 4 / 53)
        assert compute_weighted_score(scores) == expected

    def test_single_high_dimension(self):
        """title=100 alone should be round(100*3/53) = 6."""
        scores = {"title": 100}
        expected = round(100 * 3 / 53)
        assert compute_weighted_score(scores) == expected

    def test_single_medium_high_dimension(self):
        """description=100 alone should be round(100*2.5/53) = 5."""
        scores = {"description": 100}
        expected = round(100 * 2.5 / 53)
        assert compute_weighted_score(scores) == expected

    def test_single_medium_dimension(self):
        """trust=100 alone should be round(100*2/53) = 4."""
        scores = {"trust": 100}
        expected = round(100 * 2 / 53)
        assert compute_weighted_score(scores) == expected

    def test_single_low_medium_dimension(self):
        """accessibility=100 alone should be round(100*1/53) = 2."""
        scores = {"accessibility": 100}
        expected = round(100 * 1 / 53)
        assert compute_weighted_score(scores) == expected

    def test_typical_mixed_scores(self):
        """Realistic scenario: a mix of scores across tiers."""
        scores = {
            "pageSpeed": 85,
            "images": 70,
            "socialProof": 40,
            "checkout": 90,
            "mobileCta": 60,
            "title": 75,
            "aiDiscoverability": 30,
            "structuredData": 50,
            "pricing": 80,
            "description": 65,
            "shipping": 70,
            "crossSell": 20,
            "trust": 55,
            "socialCommerce": 25,
            "sizeGuide": 35,
            "variantUx": 50,
            "accessibility": 60,
            "contentFreshness": 40,
        }
        # Manual calculation
        total = sum(scores[k] * IMPACT_WEIGHTS[k] for k in CATEGORY_KEYS)
        expected = round(total / _TOTAL_WEIGHT)
        assert compute_weighted_score(scores) == expected

    def test_uniform_50(self):
        """All categories at 50 → overall should be 50."""
        scores = {k: 50 for k in CATEGORY_KEYS}
        assert compute_weighted_score(scores) == 50

    def test_missing_keys_default_to_zero(self):
        """Only some keys present; missing ones contribute 0."""
        scores = {"pageSpeed": 100, "images": 100}
        expected = round((100 * 4 + 100 * 4) / _TOTAL_WEIGHT)
        assert compute_weighted_score(scores) == expected

    def test_negative_values_clamped(self):
        """Negative scores should be clamped to 0 before weighting."""
        scores = {k: -50 for k in CATEGORY_KEYS}
        assert compute_weighted_score(scores) == 0

    def test_over_100_values_clamped(self):
        """Scores above 100 should be clamped to 100 before weighting."""
        scores = {k: 200 for k in CATEGORY_KEYS}
        assert compute_weighted_score(scores) == 100

    def test_non_numeric_values_handled(self):
        """Non-numeric values should be treated as 0 via clamp_score."""
        scores = {
            "pageSpeed": "not a number",
            "images": None,
            "socialProof": "",
            "checkout": 80,
        }
        expected = round((0 + 0 + 0 + 80 * 4) / _TOTAL_WEIGHT)
        assert compute_weighted_score(scores) == expected

    def test_float_scores(self):
        """Float scores are truncated to int by clamp_score before weighting."""
        scores = {k: 75.9 for k in CATEGORY_KEYS}
        # clamp_score(75.9) -> int(75.9) -> 75
        assert compute_weighted_score(scores) == 75

    def test_return_type_is_int(self):
        scores = {k: 50 for k in CATEGORY_KEYS}
        result = compute_weighted_score(scores)
        assert isinstance(result, int)

    def test_extra_keys_ignored(self):
        """Extra keys not in CATEGORY_KEYS should not affect the result."""
        scores = {k: 50 for k in CATEGORY_KEYS}
        scores["unknownCategory"] = 100
        assert compute_weighted_score(scores) == 50

    def test_high_impact_dimensions_dominate(self):
        """When only Very High dimensions score well, score should still be moderate."""
        scores = {k: 0 for k in CATEGORY_KEYS}
        for k in ["pageSpeed", "images", "socialProof", "checkout"]:
            scores[k] = 100
        # 4 * 100 * 4 = 1600, total = round(1600/48.5) = 33
        expected = round(1600 / _TOTAL_WEIGHT)
        assert compute_weighted_score(scores) == expected

    def test_low_impact_dimensions_alone(self):
        """When only Low-Medium dimensions score well, score should be low."""
        scores = {"accessibility": 100, "contentFreshness": 100}
        # (100*1 + 100*1) / 48.5 = 200/48.5 ≈ 4.12 → 4
        expected = round(200 / _TOTAL_WEIGHT)
        assert compute_weighted_score(scores) == expected


# ---------------------------------------------------------------------------
# build_category_scores tests
# ---------------------------------------------------------------------------


class TestBuildCategoryScores:
    """Verify build_category_scores produces full 18-key dicts with clamped values."""

    def test_empty_input(self):
        result = build_category_scores({})
        assert len(result) == 18
        assert all(v == 0 for v in result.values())

    def test_full_input(self):
        raw = {k: 50 for k in CATEGORY_KEYS}
        result = build_category_scores(raw)
        assert all(v == 50 for v in result.values())

    def test_partial_input(self):
        result = build_category_scores({"pageSpeed": 80})
        assert result["pageSpeed"] == 80
        assert result["images"] == 0

    def test_clamping_applied(self):
        result = build_category_scores({"pageSpeed": 150, "images": -10})
        assert result["pageSpeed"] == 100
        assert result["images"] == 0
