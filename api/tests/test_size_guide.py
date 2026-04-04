"""Unit tests for size_guide_detector and size_guide_rubric.

Covers size guide link/button detection, modal/popup triggers, embedded
measurement tables, sizing app detection (KiwiSizing, TrueFit, Measmerize),
model measurements, fit recommendations, measurement instructions,
proximity to size selectors, category applicability, deterministic
0-100 scoring, and research-cited tip selection (max 3).
"""

from dataclasses import fields, is_dataclass

import pytest

from app.services.size_guide_detector import SizeGuideSignals, detect_size_guide
from app.services.size_guide_rubric import get_size_guide_tips, score_size_guide


# ---------------------------------------------------------------------------
# HTML fixture helpers — minimal but realistic Shopify product page fragments
# ---------------------------------------------------------------------------


def _empty_html() -> str:
    """Baseline page with no size guide signals."""
    return "<html><body><h1>Product</h1></body></html>"


def _size_guide_link_html() -> str:
    """Page with a text link to a size guide."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        '<div class="product-form__input">'
        "<label>Size</label>"
        '<select name="option1">'
        '<option value="S">S</option>'
        '<option value="M">M</option>'
        '<option value="L">L</option>'
        "</select>"
        "</div>"
        '<a href="#size-chart" class="size-guide-link">Size Guide</a>'
        "</form>"
        "</body></html>"
    )


def _size_guide_button_html() -> str:
    """Page with a button labelled 'Find Your Size'."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        '<button type="button" class="fit-guide-btn">Find Your Size</button>'
        "</form>"
        "</body></html>"
    )


def _size_guide_popup_html() -> str:
    """Page with a modal trigger for size chart."""
    return (
        "<html><body>"
        '<a data-toggle="modal" data-target="#size-chart-modal">Size Chart</a>'
        '<div id="size-chart-modal" class="modal">'
        "<h2>Size Chart</h2>"
        "<p>Chest, Waist, Hip measurements</p>"
        "</div>"
        "</body></html>"
    )


def _size_guide_dialog_html() -> str:
    """Page with a <dialog> element containing size guide content."""
    return (
        "<html><body>"
        "<dialog id='size-guide-dialog'>"
        "<h2>Size Guide</h2>"
        "<p>Measure your chest and waist to find your perfect fit.</p>"
        "</dialog>"
        "</body></html>"
    )


def _size_chart_table_html() -> str:
    """Page with an embedded measurement table."""
    return (
        "<html><body>"
        "<table>"
        "<tr><th>Size</th><th>Chest</th><th>Waist</th><th>Hip</th></tr>"
        "<tr><td>S</td><td>34-36</td><td>28-30</td><td>35-37</td></tr>"
        "<tr><td>M</td><td>38-40</td><td>32-34</td><td>39-41</td></tr>"
        "<tr><td>L</td><td>42-44</td><td>36-38</td><td>43-45</td></tr>"
        "<tr><td>XL</td><td>46-48</td><td>40-42</td><td>47-49</td></tr>"
        "</table>"
        "</body></html>"
    )


def _non_size_table_html() -> str:
    """Page with a specs table that is NOT a size chart (no measurement headers)."""
    return (
        "<html><body>"
        "<table>"
        "<tr><th>Feature</th><th>Value</th></tr>"
        "<tr><td>Material</td><td>100% Cotton</td></tr>"
        "<tr><td>Weight</td><td>200g</td></tr>"
        "</table>"
        "</body></html>"
    )


def _kiwi_sizing_html() -> str:
    """Page with KiwiSizing app elements."""
    return (
        "<html><body>"
        '<div class="kiwi-size-chart">Size Chart</div>'
        '<script src="https://cdn.kiwisizing.com/widget.js"></script>'
        "</body></html>"
    )


def _truefit_html() -> str:
    """Page with TrueFit interactive fit finder."""
    return (
        "<html><body>"
        '<div class="truefit-widget" data-truefit="true">'
        '<button class="tfc-fitrec-button">Find Your Fit</button>'
        "</div>"
        '<script src="https://static.truefit.com/widget.js"></script>'
        "</body></html>"
    )


def _measmerize_html() -> str:
    """Page with Measmerize sizing tool."""
    return (
        "<html><body>"
        '<div class="measmerize-widget">Find Your Size</div>'
        '<script src="https://app.measmerize.com/sdk.js"></script>'
        "</body></html>"
    )


def _model_measurements_html() -> str:
    """Page with model measurement text."""
    return (
        "<html><body>"
        "<div class='product-description'>"
        "<p>Model is 5'10\" wearing size M. Model's chest: 38\", waist: 30\".</p>"
        "</div>"
        "</body></html>"
    )


def _fit_recommendation_html() -> str:
    """Page with fit recommendation text."""
    return (
        "<html><body>"
        "<div class='product-description'>"
        "<p>This item runs true to size. We recommend ordering your regular size.</p>"
        "</div>"
        "</body></html>"
    )


def _measurement_instructions_html() -> str:
    """Page with 'How to Measure' section."""
    return (
        "<html><body>"
        "<div class='how-to-measure'>"
        "<h3>How to Measure</h3>"
        "<p>Using a measuring tape, measure around the fullest part of your chest.</p>"
        "</div>"
        "</body></html>"
    )


def _size_near_selector_html() -> str:
    """Page with size guide link next to size variant selector."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        '<div class="product-options">'
        '<div class="size-option">'
        "<label>Size</label>"
        '<select name="size">'
        '<option value="S">S</option>'
        '<option value="M">M</option>'
        "</select>"
        '<a href="#size-chart" class="size-guide-trigger">Size Guide</a>'
        "</div>"
        "</div>"
        "</form>"
        "</body></html>"
    )


def _full_size_guide_html() -> str:
    """Page combining ALL size guide signals."""
    return (
        "<html><body>"
        '<form action="/cart/add" method="post">'
        '<div class="product-options">'
        '<div class="size-option">'
        "<label>Size</label>"
        '<select name="size">'
        '<option value="S">S</option>'
        '<option value="M">M</option>'
        '<option value="L">L</option>'
        "</select>"
        '<a href="#size-chart" class="size-guide-link">Size Guide</a>'
        "</div>"
        "</div>"
        "</form>"
        # Modal popup
        '<a data-toggle="modal" data-target="#size-chart-modal">View Size Chart</a>'
        '<div id="size-chart-modal" class="modal">'
        "<h2>Size Chart</h2>"
        # Measurement table
        "<table>"
        "<tr><th>Size</th><th>Chest</th><th>Waist</th><th>Hip</th></tr>"
        "<tr><td>S</td><td>34-36</td><td>28-30</td><td>35-37</td></tr>"
        "<tr><td>M</td><td>38-40</td><td>32-34</td><td>39-41</td></tr>"
        "<tr><td>L</td><td>42-44</td><td>36-38</td><td>43-45</td></tr>"
        "</table>"
        "</div>"
        # Fit finder
        '<div class="truefit-widget" data-truefit="true">'
        '<button class="tfc-fitrec-button">Find Your Fit</button>'
        "</div>"
        '<script src="https://static.truefit.com/widget.js"></script>'
        # Model measurements
        "<div class='product-description'>"
        "<p>Model is 5'10\" wearing size M.</p>"
        "<p>This item runs true to size.</p>"
        "</div>"
        # How to measure
        "<div class='how-to-measure'>"
        "<h3>How to Measure</h3>"
        "<p>Using a measuring tape, measure around the fullest part of your chest.</p>"
        "</div>"
        "</body></html>"
    )


# ---------------------------------------------------------------------------
# Detection tests
# ---------------------------------------------------------------------------


class TestDetection:
    """Test signal extraction from HTML fixtures."""

    def test_empty_html_no_signals(self):
        signals = detect_size_guide(_empty_html())
        assert signals.size_guide_app is None
        assert signals.has_size_guide_link is False
        assert signals.has_size_guide_popup is False
        assert signals.has_size_chart_table is False
        assert signals.has_fit_finder is False
        assert signals.has_model_measurements is False
        assert signals.has_fit_recommendation is False
        assert signals.has_measurement_instructions is False
        assert signals.near_size_selector is False
        assert signals.category_applicable is True

    def test_empty_string_returns_defaults(self):
        signals = detect_size_guide("")
        assert signals.size_guide_app is None
        assert signals.has_size_guide_link is False
        assert signals.category_applicable is True

    def test_size_guide_link_detected(self):
        signals = detect_size_guide(_size_guide_link_html())
        assert signals.has_size_guide_link is True

    def test_size_guide_button_detected(self):
        signals = detect_size_guide(_size_guide_button_html())
        assert signals.has_size_guide_link is True

    def test_size_guide_popup_detected(self):
        signals = detect_size_guide(_size_guide_popup_html())
        assert signals.has_size_guide_popup is True

    def test_size_guide_dialog_detected(self):
        signals = detect_size_guide(_size_guide_dialog_html())
        assert signals.has_size_guide_popup is True

    def test_size_chart_table_detected(self):
        signals = detect_size_guide(_size_chart_table_html())
        assert signals.has_size_chart_table is True

    def test_non_size_table_not_detected(self):
        signals = detect_size_guide(_non_size_table_html())
        assert signals.has_size_chart_table is False

    def test_kiwi_sizing_app_detected(self):
        signals = detect_size_guide(_kiwi_sizing_html())
        assert signals.size_guide_app == "kiwisizing"

    def test_truefit_app_detected(self):
        signals = detect_size_guide(_truefit_html())
        assert signals.size_guide_app == "truefit"

    def test_truefit_marks_fit_finder(self):
        signals = detect_size_guide(_truefit_html())
        assert signals.has_fit_finder is True

    def test_measmerize_app_detected(self):
        signals = detect_size_guide(_measmerize_html())
        assert signals.size_guide_app == "measmerize"
        assert signals.has_fit_finder is True

    def test_model_measurements_detected(self):
        signals = detect_size_guide(_model_measurements_html())
        assert signals.has_model_measurements is True

    def test_fit_recommendation_detected(self):
        signals = detect_size_guide(_fit_recommendation_html())
        assert signals.has_fit_recommendation is True

    def test_measurement_instructions_detected(self):
        signals = detect_size_guide(_measurement_instructions_html())
        assert signals.has_measurement_instructions is True

    def test_near_size_selector_detected(self):
        signals = detect_size_guide(_size_near_selector_html())
        assert signals.has_size_guide_link is True
        assert signals.near_size_selector is True

    def test_full_html_all_signals(self):
        signals = detect_size_guide(_full_size_guide_html())
        assert signals.size_guide_app == "truefit"
        assert signals.has_size_guide_link is True
        assert signals.has_size_guide_popup is True
        assert signals.has_size_chart_table is True
        assert signals.has_fit_finder is True
        assert signals.has_model_measurements is True
        assert signals.has_fit_recommendation is True
        assert signals.has_measurement_instructions is True
        assert signals.near_size_selector is True
        assert signals.category_applicable is True

    def test_non_applicable_category_skips_detection(self):
        signals = detect_size_guide(_full_size_guide_html(), product_category="electronics")
        assert signals.category_applicable is False
        assert signals.size_guide_app is None
        assert signals.has_size_guide_link is False
        assert signals.has_size_chart_table is False

    def test_applicable_category_detects(self):
        signals = detect_size_guide(_size_guide_link_html(), product_category="fashion")
        assert signals.category_applicable is True
        assert signals.has_size_guide_link is True

    def test_none_category_defaults_applicable(self):
        signals = detect_size_guide(_size_guide_link_html(), product_category=None)
        assert signals.category_applicable is True
        assert signals.has_size_guide_link is True

    def test_size_guide_href_fragment_detected(self):
        """Links with #size-chart href should be detected."""
        html = (
            "<html><body>"
            '<a href="#sizechart">Sizing</a>'
            "</body></html>"
        )
        signals = detect_size_guide(html)
        assert signals.has_size_guide_link is True


# ---------------------------------------------------------------------------
# Scoring tests
# ---------------------------------------------------------------------------


class TestScoring:
    """Test deterministic 0-100 scoring from signals."""

    def test_empty_signals_score_0(self):
        signals = detect_size_guide(_empty_html())
        assert score_size_guide(signals) == 0

    def test_full_signals_high_score(self):
        signals = detect_size_guide(_full_size_guide_html())
        score = score_size_guide(signals)
        assert score >= 90
        assert score <= 100

    def test_size_guide_link_only_25pts(self):
        signals = SizeGuideSignals(has_size_guide_link=True)
        assert score_size_guide(signals) == 25

    def test_fit_finder_only_20pts(self):
        signals = SizeGuideSignals(has_fit_finder=True)
        assert score_size_guide(signals) == 20

    def test_chart_table_only_15pts(self):
        signals = SizeGuideSignals(has_size_chart_table=True)
        assert score_size_guide(signals) == 15

    def test_non_applicable_category_score_70(self):
        signals = SizeGuideSignals(category_applicable=False)
        assert score_size_guide(signals) == 70

    def test_link_plus_table_gives_depth_bonus(self):
        signals = SizeGuideSignals(
            has_size_guide_link=True,
            has_size_chart_table=True,
        )
        # 25 (link) + 15 (table) + 5 (depth) = 45
        assert score_size_guide(signals) == 45

    def test_score_clamped_0_100(self):
        """Score should never exceed 100 even with all signals."""
        signals = SizeGuideSignals(
            size_guide_app="truefit",
            has_size_guide_link=True,
            has_size_guide_popup=True,
            has_size_chart_table=True,
            has_fit_finder=True,
            has_model_measurements=True,
            has_fit_recommendation=True,
            has_measurement_instructions=True,
            near_size_selector=True,
            category_applicable=True,
        )
        score = score_size_guide(signals)
        assert 0 <= score <= 100

    def test_partial_score_predictable(self):
        """Link + model measurements = 25 + 10 = 35."""
        signals = SizeGuideSignals(
            has_size_guide_link=True,
            has_model_measurements=True,
        )
        assert score_size_guide(signals) == 35


# ---------------------------------------------------------------------------
# Tip selection tests
# ---------------------------------------------------------------------------


class TestTipSelection:
    """Test research-backed tip selection logic."""

    def test_empty_signals_tips_returned(self):
        signals = detect_size_guide(_empty_html())
        tips = get_size_guide_tips(signals)
        assert len(tips) >= 1
        assert "size guide" in tips[0].lower() or "size" in tips[0].lower()

    def test_full_signals_congratulatory(self):
        signals = detect_size_guide(_full_size_guide_html())
        tips = get_size_guide_tips(signals)
        assert any("strong" in t.lower() or "congratul" in t.lower() for t in tips)

    def test_max_3_tips(self):
        signals = detect_size_guide(_empty_html())
        tips = get_size_guide_tips(signals)
        assert len(tips) <= 3

    def test_no_size_guide_tip_first_priority(self):
        signals = detect_size_guide(_empty_html())
        tips = get_size_guide_tips(signals)
        assert len(tips) >= 1
        assert "add a size guide" in tips[0].lower()

    def test_non_applicable_no_tips(self):
        signals = SizeGuideSignals(category_applicable=False)
        tips = get_size_guide_tips(signals)
        assert tips == []

    def test_tips_are_nonempty_strings(self):
        signals = detect_size_guide(_size_guide_link_html())
        tips = get_size_guide_tips(signals)
        for tip in tips:
            assert isinstance(tip, str)
            assert len(tip) > 10

    def test_has_guide_no_finder_suggests_finder(self):
        signals = SizeGuideSignals(has_size_guide_link=True)
        tips = get_size_guide_tips(signals)
        assert any("fit finder" in t.lower() or "truefit" in t.lower() for t in tips)


# ---------------------------------------------------------------------------
# Dataclass structure tests
# ---------------------------------------------------------------------------


class TestDataclassStructure:
    """Verify SizeGuideSignals dataclass shape and defaults."""

    def test_signals_is_dataclass(self):
        assert is_dataclass(SizeGuideSignals)

    def test_field_count(self):
        assert len(fields(SizeGuideSignals)) == 10

    def test_default_values(self):
        signals = SizeGuideSignals()
        assert signals.size_guide_app is None
        assert signals.has_size_guide_link is False
        assert signals.has_size_guide_popup is False
        assert signals.has_size_chart_table is False
        assert signals.has_fit_finder is False
        assert signals.has_model_measurements is False
        assert signals.has_fit_recommendation is False
        assert signals.has_measurement_instructions is False
        assert signals.near_size_selector is False
        assert signals.category_applicable is True


# ---------------------------------------------------------------------------
# End-to-end pipeline tests
# ---------------------------------------------------------------------------


class TestEndToEnd:
    """Integration tests: detect → score → tips pipeline."""

    def test_full_html_high_score_congratulatory(self):
        signals = detect_size_guide(_full_size_guide_html())
        score = score_size_guide(signals)
        tips = get_size_guide_tips(signals)
        assert score >= 80
        assert any("strong" in t.lower() for t in tips)

    def test_empty_html_score_0_with_tips(self):
        signals = detect_size_guide(_empty_html())
        score = score_size_guide(signals)
        tips = get_size_guide_tips(signals)
        assert score == 0
        assert len(tips) >= 1

    def test_detect_score_tips_pipeline_consistent(self):
        """Pipeline should produce consistent results across calls."""
        for html_fn in [_empty_html, _size_guide_link_html, _full_size_guide_html]:
            s1 = detect_size_guide(html_fn())
            s2 = detect_size_guide(html_fn())
            assert score_size_guide(s1) == score_size_guide(s2)
            assert get_size_guide_tips(s1) == get_size_guide_tips(s2)

    def test_non_applicable_category_neutral_score(self):
        for category in ["electronics", "home", "food", "beauty", "other"]:
            signals = detect_size_guide(_full_size_guide_html(), product_category=category)
            assert score_size_guide(signals) == 70
            assert get_size_guide_tips(signals) == []

    def test_applicable_category_scores_normally(self):
        for category in ["fashion", "fitness", "jewelry"]:
            signals = detect_size_guide(_full_size_guide_html(), product_category=category)
            assert score_size_guide(signals) >= 80
