"""Unit tests for variant_ux_detector and variant_ux_rubric.

Covers variant selector type detection (swatches, pills, dropdowns),
option classification (color vs size), swatch app detection, stock level
indicators, out-of-stock handling, notify-me forms, variant-image linking,
deterministic 0-100 scoring, and research-cited tip selection (max 3).
"""

from dataclasses import fields, is_dataclass

import pytest

from app.services.variant_ux_detector import VariantUxSignals, detect_variant_ux
from app.services.variant_ux_rubric import get_variant_ux_tips, score_variant_ux


# ---------------------------------------------------------------------------
# HTML fixture helpers — minimal but realistic Shopify product page fragments
# ---------------------------------------------------------------------------


def _empty_html() -> str:
    """Baseline page with no variant selectors."""
    return "<html><body><h1>Product</h1></body></html>"


def _dawn_pills_html() -> str:
    """Dawn theme with pill-style radio buttons for size."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        '<div class="product-form__input product-form__input--pill">'
        "<fieldset>"
        "<legend>Size</legend>"
        '<input type="radio" id="s" name="option1" value="S">'
        '<label for="s">S</label>'
        '<input type="radio" id="m" name="option1" value="M">'
        '<label for="m">M</label>'
        '<input type="radio" id="l" name="option1" value="L">'
        '<label for="l">L</label>'
        "</fieldset>"
        "</div>"
        "</form>"
        "</body></html>"
    )


def _dawn_dropdown_html() -> str:
    """Dawn theme with dropdown selector for size."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        '<div class="product-form__input product-form__input--dropdown">'
        "<label>Size</label>"
        '<select name="option1" id="SingleOptionSelector-0">'
        '<option value="S">S</option>'
        '<option value="M">M</option>'
        '<option value="L">L</option>'
        "</select>"
        "</div>"
        "</form>"
        "</body></html>"
    )


def _dawn_swatch_html() -> str:
    """Dawn theme with native swatch support for color via variant-picker."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        "<variant-picker>"
        '<div class="product-form__input product-form__input--swatch">'
        "<fieldset>"
        "<legend>Color</legend>"
        '<input type="radio" name="option1" value="Red">'
        '<label class="swatch" style="background-color: #ff0000;" data-swatch="Red">Red</label>'
        '<input type="radio" name="option1" value="Blue">'
        '<label class="swatch" style="background-color: #0000ff;" data-swatch="Blue">Blue</label>'
        "</fieldset>"
        "</div>"
        "</variant-picker>"
        "</form>"
        "</body></html>"
    )


def _generic_swatch_html() -> str:
    """Third-party swatch app with color swatches."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        '<div class="variant-option" data-option-index="0">'
        "<label>Color</label>"
        '<div class="color-swatch" style="background-color: #ff0000;" data-swatch="Red"></div>'
        '<div class="color-swatch" style="background-color: #00ff00;" data-swatch="Green"></div>'
        '<div class="color-swatch" style="background-color: #0000ff;" data-swatch="Blue"></div>'
        "</div>"
        "</form>"
        "</body></html>"
    )


def _color_dropdown_html() -> str:
    """Anti-pattern: color option as <select> dropdown."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        '<div class="product-form__input product-form__input--dropdown">'
        "<label>Color</label>"
        '<select name="option1" id="SingleOptionSelector-0">'
        '<option value="Red">Red</option>'
        '<option value="Blue">Blue</option>'
        '<option value="Green">Green</option>'
        "</select>"
        "</div>"
        "</form>"
        "</body></html>"
    )


def _stock_precise_html() -> str:
    """Page with precise stock count indicator."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        '<div class="product-form__input product-form__input--pill">'
        "<fieldset>"
        "<legend>Size</legend>"
        '<input type="radio" name="option1" value="M">'
        '<label for="m">M</label>'
        "</fieldset>"
        "</div>"
        "</form>"
        '<p class="stock-badge">Only 3 left in stock</p>'
        "</body></html>"
    )


def _stock_vague_html() -> str:
    """Page with vague urgency messaging (no precise count)."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        '<div class="product-form__input product-form__input--pill">'
        "<fieldset>"
        "<legend>Size</legend>"
        '<input type="radio" name="option1" value="M">'
        '<label for="m">M</label>'
        "</fieldset>"
        "</div>"
        "</form>"
        "<p>Hurry - selling fast!</p>"
        "</body></html>"
    )


def _sold_out_html() -> str:
    """Page with disabled variant options (sold-out handling)."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        '<div class="product-form__input product-form__input--pill">'
        "<fieldset>"
        "<legend>Size</legend>"
        '<input type="radio" name="option1" value="S">'
        '<label for="s">S</label>'
        '<input type="radio" name="option1" value="M" disabled>'
        '<label for="m" class="sold-out">M</label>'
        "</fieldset>"
        "</div>"
        "</form>"
        "</body></html>"
    )


def _notify_me_html() -> str:
    """Page with back-in-stock notification form."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        '<div class="product-form__input product-form__input--pill">'
        "<fieldset>"
        "<legend>Size</legend>"
        '<input type="radio" name="option1" value="S">'
        '<label for="s">S</label>'
        "</fieldset>"
        "</div>"
        "</form>"
        '<div class="back-in-stock">'
        "<p>Notify me when available</p>"
        '<input type="email" placeholder="Enter email">'
        "</div>"
        "</body></html>"
    )


def _variant_image_link_html() -> str:
    """Swatch elements with data-variant-image and background-image linking."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        '<div class="product-form__input product-form__input--swatch">'
        "<fieldset>"
        "<legend>Color</legend>"
        '<label class="swatch" data-variant-image="https://cdn.shopify.com/s/files/1/image1.jpg"'
        ' style="background-image: url(https://cdn.shopify.com/s/files/1/thumb1.jpg);">Red</label>'
        '<label class="swatch" data-variant-image="https://cdn.shopify.com/s/files/1/image2.jpg"'
        ' style="background-image: url(https://cdn.shopify.com/s/files/1/thumb2.jpg);">Blue</label>'
        "</fieldset>"
        "</div>"
        "</form>"
        "</body></html>"
    )


def _kiwi_app_html() -> str:
    """Page with KiwiSizing swatch app."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        '<div class="kiwi-swatch-container" data-kiwi="true">'
        "<label>Size</label>"
        '<div class="kiwi-swatch">S</div>'
        '<div class="kiwi-swatch">M</div>'
        "</div>"
        "</form>"
        '<script src="https://cdn.kiwisizing.com/widget.js"></script>'
        "</body></html>"
    )


def _full_variant_html() -> str:
    """All signals present: swatches for color, pills for size, stock, notify me, image link."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        "<variant-picker>"
        # Color swatches with image linking
        '<div class="product-form__input product-form__input--swatch">'
        "<fieldset>"
        "<legend>Color</legend>"
        '<input type="radio" name="option1" value="Red">'
        '<label class="swatch" data-variant-image="/red.jpg" style="background-color: #ff0000;">Red</label>'
        '<input type="radio" name="option1" value="Blue">'
        '<label class="swatch" data-variant-image="/blue.jpg" style="background-color: #0000ff;">Blue</label>'
        "</fieldset>"
        "</div>"
        # Size pills with sold-out handling
        '<div class="product-form__input product-form__input--pill">'
        "<fieldset>"
        "<legend>Size</legend>"
        '<input type="radio" name="option2" value="S">'
        '<label for="s">S</label>'
        '<input type="radio" name="option2" value="M" disabled>'
        '<label for="m" class="sold-out">M</label>'
        '<input type="radio" name="option2" value="L">'
        '<label for="l">L</label>'
        "</fieldset>"
        "</div>"
        "</variant-picker>"
        "</form>"
        # Stock indicator
        '<p class="stock-badge">Only 2 left in stock</p>'
        # Notify me
        '<div class="back-in-stock">'
        "<p>Notify me when available</p>"
        "</div>"
        "</body></html>"
    )


def _hybrid_html() -> str:
    """Hybrid approach: swatches for color, pills for size, dropdown for material."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        # Color swatches
        '<div class="product-form__input product-form__input--swatch">'
        "<fieldset>"
        "<legend>Color</legend>"
        '<label class="swatch" style="background-color: #ff0000;" data-swatch="Red">Red</label>'
        "</fieldset>"
        "</div>"
        # Size pills
        '<div class="product-form__input product-form__input--pill">'
        "<fieldset>"
        "<legend>Size</legend>"
        '<input type="radio" name="option2" value="S">'
        '<label for="s">S</label>'
        "</fieldset>"
        "</div>"
        # Material dropdown
        '<div class="product-form__input product-form__input--dropdown">'
        "<label>Material</label>"
        '<select name="option3">'
        '<option value="Cotton">Cotton</option>'
        '<option value="Silk">Silk</option>'
        "</select>"
        "</div>"
        "</form>"
        "</body></html>"
    )


# ---------------------------------------------------------------------------
# TestDetection
# ---------------------------------------------------------------------------


class TestDetection:
    """Test signal extraction from HTML."""

    def test_empty_html_no_variants(self):
        signals = detect_variant_ux(_empty_html())
        assert signals.has_variants is False
        assert signals.has_visual_swatches is False
        assert signals.option_group_count == 0

    def test_empty_string_returns_defaults(self):
        signals = detect_variant_ux("")
        assert signals.has_variants is False
        assert signals.swatch_app is None

    def test_dawn_pill_detected(self):
        signals = detect_variant_ux(_dawn_pills_html())
        assert signals.has_variants is True
        assert signals.has_pill_buttons is True
        assert signals.has_dropdown_selectors is False
        assert signals.size_selector_type == "pill"

    def test_dawn_dropdown_detected(self):
        signals = detect_variant_ux(_dawn_dropdown_html())
        assert signals.has_variants is True
        assert signals.has_dropdown_selectors is True
        assert signals.has_pill_buttons is False
        assert signals.size_selector_type == "dropdown"

    def test_dawn_swatch_detected(self):
        signals = detect_variant_ux(_dawn_swatch_html())
        assert signals.has_variants is True
        assert signals.has_visual_swatches is True
        assert signals.color_selector_type == "swatch"
        assert signals.swatch_app == "dawn-native"

    def test_generic_swatch_detected(self):
        signals = detect_variant_ux(_generic_swatch_html())
        assert signals.has_variants is True
        assert signals.has_visual_swatches is True
        assert signals.color_selector_type == "swatch"

    def test_color_dropdown_antipattern(self):
        signals = detect_variant_ux(_color_dropdown_html())
        assert signals.has_variants is True
        assert signals.has_dropdown_selectors is True
        assert signals.color_uses_dropdown is True
        assert signals.color_selector_type == "dropdown"

    def test_stock_precise_detected(self):
        signals = detect_variant_ux(_stock_precise_html())
        assert signals.has_stock_indicator is True
        assert signals.has_precise_stock_count is True

    def test_stock_vague_detected(self):
        signals = detect_variant_ux(_stock_vague_html())
        assert signals.has_stock_indicator is True
        assert signals.has_precise_stock_count is False
        assert signals.has_low_stock_urgency is True

    def test_sold_out_handling_detected(self):
        signals = detect_variant_ux(_sold_out_html())
        assert signals.has_sold_out_handling is True

    def test_notify_me_detected(self):
        signals = detect_variant_ux(_notify_me_html())
        assert signals.has_notify_me is True

    def test_variant_image_link_detected(self):
        signals = detect_variant_ux(_variant_image_link_html())
        assert signals.has_variant_image_link is True

    def test_swatch_app_kiwi_detected(self):
        signals = detect_variant_ux(_kiwi_app_html())
        assert signals.swatch_app == "kiwisizing"

    def test_option_group_count(self):
        signals = detect_variant_ux(_hybrid_html())
        assert signals.option_group_count == 3

    def test_color_selector_type_swatch(self):
        signals = detect_variant_ux(_dawn_swatch_html())
        assert signals.color_selector_type == "swatch"

    def test_size_selector_type_pill(self):
        signals = detect_variant_ux(_dawn_pills_html())
        assert signals.size_selector_type == "pill"

    def test_full_html_all_signals(self):
        signals = detect_variant_ux(_full_variant_html())
        assert signals.has_variants is True
        assert signals.has_visual_swatches is True
        assert signals.has_pill_buttons is True
        assert signals.has_stock_indicator is True
        assert signals.has_precise_stock_count is True
        assert signals.has_sold_out_handling is True
        assert signals.has_notify_me is True
        assert signals.has_variant_image_link is True
        assert signals.swatch_app == "dawn-native"


# ---------------------------------------------------------------------------
# TestScoring
# ---------------------------------------------------------------------------


class TestScoring:
    """Test deterministic scoring rubric."""

    def test_no_variants_score_60(self):
        signals = VariantUxSignals(has_variants=False)
        assert score_variant_ux(signals) == 60

    def test_empty_signals_score_0(self):
        signals = VariantUxSignals(has_variants=True)
        assert score_variant_ux(signals) == 0

    def test_full_signals_max_score(self):
        signals = VariantUxSignals(
            has_variants=True,
            has_visual_swatches=True,
            has_pill_buttons=True,
            has_dropdown_selectors=False,
            has_stock_indicator=True,
            has_precise_stock_count=True,
            has_variant_image_link=True,
            has_sold_out_handling=True,
            has_notify_me=True,
            color_uses_dropdown=False,
        )
        # 20 + 15 + 15 + 12 + 10 + 8 + 8 + 7(hybrid: swatches+pills) = 95
        assert score_variant_ux(signals) == 95

    def test_swatch_only_score(self):
        signals = VariantUxSignals(has_variants=True, has_visual_swatches=True)
        assert score_variant_ux(signals) == 20

    def test_color_dropdown_penalty(self):
        signals = VariantUxSignals(
            has_variants=True,
            has_dropdown_selectors=True,
            color_uses_dropdown=True,
        )
        # 0 - 10 = -10, clamped to 0
        assert score_variant_ux(signals) == 0

    def test_hybrid_bonus(self):
        signals = VariantUxSignals(
            has_variants=True,
            has_visual_swatches=True,
            has_pill_buttons=True,
        )
        # 20 + 15 + 7(hybrid) = 42
        assert score_variant_ux(signals) == 42

    def test_stock_precise_bonus(self):
        signals = VariantUxSignals(
            has_variants=True,
            has_stock_indicator=True,
            has_precise_stock_count=True,
        )
        # 15 + 8 = 23
        assert score_variant_ux(signals) == 23

    def test_score_clamped_to_0_100(self):
        # All penalties, no positives
        signals = VariantUxSignals(
            has_variants=True,
            color_uses_dropdown=True,
        )
        score = score_variant_ux(signals)
        assert 0 <= score <= 100


# ---------------------------------------------------------------------------
# TestTipSelection
# ---------------------------------------------------------------------------


class TestTipSelection:
    """Test tip prioritisation and selection."""

    def test_no_variants_no_tips(self):
        signals = VariantUxSignals(has_variants=False)
        assert get_variant_ux_tips(signals) == []

    def test_color_dropdown_tip_first(self):
        signals = VariantUxSignals(
            has_variants=True,
            has_dropdown_selectors=True,
            color_uses_dropdown=True,
            color_selector_type="dropdown",
        )
        tips = get_variant_ux_tips(signals)
        assert len(tips) >= 1
        assert "swatch" in tips[0].lower()

    def test_max_3_tips_enforced(self):
        signals = VariantUxSignals(
            has_variants=True,
            has_dropdown_selectors=True,
            color_uses_dropdown=True,
            color_selector_type="dropdown",
            size_selector_type="dropdown",
        )
        tips = get_variant_ux_tips(signals)
        assert len(tips) <= 3

    def test_tips_are_nonempty_strings(self):
        signals = VariantUxSignals(has_variants=True)
        tips = get_variant_ux_tips(signals)
        for tip in tips:
            assert isinstance(tip, str)
            assert len(tip) > 0

    def test_strong_score_congratulatory(self):
        signals = VariantUxSignals(
            has_variants=True,
            has_visual_swatches=True,
            has_pill_buttons=True,
            has_stock_indicator=True,
            has_precise_stock_count=True,
            has_variant_image_link=True,
            has_sold_out_handling=True,
            has_notify_me=True,
        )
        tips = get_variant_ux_tips(signals)
        assert any("strong" in t.lower() for t in tips)

    def test_no_stock_tip_includes_citation(self):
        signals = VariantUxSignals(has_variants=True)
        tips = get_variant_ux_tips(signals)
        stock_tips = [t for t in tips if "stock" in t.lower() or "left" in t.lower()]
        if stock_tips:
            assert any("hulkapps" in t.lower() or "peasy" in t.lower() for t in stock_tips)

    def test_vague_stock_tip(self):
        signals = VariantUxSignals(
            has_variants=True,
            has_stock_indicator=True,
            has_precise_stock_count=False,
            has_low_stock_urgency=True,
        )
        tips = get_variant_ux_tips(signals)
        vague_tips = [t for t in tips if "precise" in t.lower() or "specific" in t.lower()]
        assert len(vague_tips) >= 1


# ---------------------------------------------------------------------------
# TestDataclassStructure
# ---------------------------------------------------------------------------


class TestDataclassStructure:
    """Test VariantUxSignals dataclass structure."""

    def test_signals_is_dataclass(self):
        assert is_dataclass(VariantUxSignals)

    def test_field_count(self):
        assert len(fields(VariantUxSignals)) == 15

    def test_default_values(self):
        signals = VariantUxSignals()
        assert signals.has_variants is False
        assert signals.swatch_app is None
        assert signals.option_group_count == 0
        assert signals.color_selector_type is None

    def test_instantiation_with_no_args(self):
        signals = VariantUxSignals()
        assert isinstance(signals, VariantUxSignals)


# ---------------------------------------------------------------------------
# TestEndToEnd
# ---------------------------------------------------------------------------


class TestEndToEnd:
    """End-to-end pipeline: detect → score → tips."""

    def test_full_html_high_score_with_tips(self):
        signals = detect_variant_ux(_full_variant_html())
        score = score_variant_ux(signals)
        tips = get_variant_ux_tips(signals)
        assert score >= 80
        assert isinstance(tips, list)

    def test_empty_html_baseline_60(self):
        signals = detect_variant_ux(_empty_html())
        score = score_variant_ux(signals)
        tips = get_variant_ux_tips(signals)
        assert score == 60
        assert tips == []

    def test_color_dropdown_low_score_with_tips(self):
        signals = detect_variant_ux(_color_dropdown_html())
        score = score_variant_ux(signals)
        tips = get_variant_ux_tips(signals)
        assert score < 40
        assert len(tips) >= 1

    def test_detect_score_tips_pipeline_consistent(self):
        """Score and tips should be consistent for the same input."""
        html = _hybrid_html()
        s1 = detect_variant_ux(html)
        s2 = detect_variant_ux(html)
        assert score_variant_ux(s1) == score_variant_ux(s2)
        assert get_variant_ux_tips(s1) == get_variant_ux_tips(s2)
