"""Unit tests for structured_data_detector and structured_data_rubric.

Covers all R120–R126 requirements: JSON-LD extraction, Product/BreadcrumbList/
Organization detection, Shopify error flags, deterministic 0–100 scoring, and
research-backed tip selection.
"""

import json
from dataclasses import fields

import pytest

from app.services.structured_data_detector import (
    StructuredDataSignals,
    detect_structured_data,
)
from app.services.structured_data_rubric import (
    get_structured_data_tips,
    score_structured_data,
)


# ---------------------------------------------------------------------------
# HTML fixture helpers — minimal <script type="application/ld+json"> blocks
# ---------------------------------------------------------------------------


def _wrap_jsonld(*payloads: dict | str) -> str:
    """Wrap one or more JSON-LD payloads in script tags inside an HTML doc."""
    tags = []
    for p in payloads:
        raw = p if isinstance(p, str) else json.dumps(p)
        tags.append(f'<script type="application/ld+json">{raw}</script>')
    return f"<html><head>{''.join(tags)}</head><body></body></html>"


def _empty_html() -> str:
    """No JSON-LD tags at all."""
    return "<html><body><h1>Hello</h1></body></html>"


def _minimal_product() -> str:
    """Product with just a name — nothing else."""
    return _wrap_jsonld({
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Simple Widget",
    })


def _complete_product() -> str:
    """All fields populated with valid values, plus BreadcrumbList and Organization."""
    return _wrap_jsonld({
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Product",
                "name": "Premium Widget",
                "image": "https://example.com/widget.jpg",
                "description": "A premium widget for all your needs",
                "brand": "WidgetCo",
                "sku": "WDG-001",
                "gtin13": "1234567890123",
                "aggregateRating": {
                    "@type": "AggregateRating",
                    "ratingValue": "4.5",
                    "reviewCount": "42",
                },
                "offers": {
                    "@type": "Offer",
                    "price": "29.99",
                    "priceCurrency": "USD",
                    "availability": "https://schema.org/InStock",
                    "priceValidUntil": "2026-12-31",
                    "shippingDetails": {
                        "@type": "OfferShippingDetails",
                    },
                    "hasMerchantReturnPolicy": {
                        "@type": "MerchantReturnPolicy",
                    },
                },
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Home"},
                ],
            },
            {
                "@type": "Organization",
                "name": "WidgetCo Inc.",
                "url": "https://example.com",
            },
        ],
    })


def _duplicate_products() -> str:
    """Two separate Product JSON-LD script tags."""
    return _wrap_jsonld(
        {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Widget A",
        },
        {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Widget B",
        },
    )


def _currency_in_price() -> str:
    """Price value is "$29.99" instead of "29.99"."""
    return _wrap_jsonld({
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Pricey Widget",
        "offers": {
            "@type": "Offer",
            "price": "$29.99",
            "priceCurrency": "USD",
            "availability": "https://schema.org/InStock",
        },
    })


def _invalid_availability() -> str:
    """Availability is "InStock" not full URL."""
    return _wrap_jsonld({
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Available Widget",
        "offers": {
            "@type": "Offer",
            "price": "29.99",
            "priceCurrency": "USD",
            "availability": "InStock",
        },
    })


def _graph_wrapper() -> str:
    """@graph array containing Product + BreadcrumbList."""
    return _wrap_jsonld({
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "Product", "name": "Graph Widget", "image": "img.jpg"},
            {"@type": "BreadcrumbList", "itemListElement": []},
        ],
    })


def _malformed_json() -> str:
    """Invalid JSON in script tag."""
    return '<html><head><script type="application/ld+json">{not valid json!!}</script></head><body></body></html>'


def _offers_as_array() -> str:
    """Offers is [{...}] not {...}."""
    return _wrap_jsonld({
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Array Offers Widget",
        "offers": [
            {
                "@type": "Offer",
                "price": "19.99",
                "priceCurrency": "EUR",
                "availability": "https://schema.org/InStock",
            },
        ],
    })


def _multiple_script_tags() -> str:
    """Separate script tags for Product, BreadcrumbList, Organization."""
    return _wrap_jsonld(
        {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Multi-Tag Widget",
            "image": "https://example.com/img.jpg",
            "brand": "TagCo",
        },
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [],
        },
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "TagCo Inc.",
        },
    )


def _product_with_brand_object() -> str:
    """Brand as {"@type": "Brand", "name": "Nike"}."""
    return _wrap_jsonld({
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Branded Widget",
        "brand": {"@type": "Brand", "name": "Nike"},
    })


def _product_with_gtin_variants() -> str:
    """Product with gtin13 and isbn."""
    return _wrap_jsonld({
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "GTIN Widget",
        "gtin13": "1234567890123",
        "isbn": "978-0-13-468599-1",
    })


def _type_as_list() -> str:
    """@type as ["Product", "IndividualProduct"]."""
    return _wrap_jsonld({
        "@context": "https://schema.org",
        "@type": ["Product", "IndividualProduct"],
        "name": "Typed Widget",
    })


# ---------------------------------------------------------------------------
# Helper to build signals for rubric tests (avoids HTML round-trip)
# ---------------------------------------------------------------------------


def _all_true_signals() -> StructuredDataSignals:
    """Signals with every boolean True, dup count = 1, no errors."""
    return StructuredDataSignals(
        has_product_schema=True,
        has_name=True,
        has_image=True,
        has_description=True,
        has_offers=True,
        has_price=True,
        has_price_currency=True,
        has_availability=True,
        has_brand=True,
        has_sku=True,
        has_gtin=True,
        has_aggregate_rating=True,
        has_price_valid_until=True,
        has_shipping_details=True,
        has_return_policy=True,
        has_breadcrumb_list=True,
        has_organization=True,
        has_missing_brand=False,
        has_currency_in_price=False,
        has_invalid_availability=False,
        json_parse_errors=0,
        duplicate_product_count=1,
    )


# ---------------------------------------------------------------------------
# 1. TestDetectorPresence
# ---------------------------------------------------------------------------


class TestDetectorPresence:
    """has_product_schema true/false, has_name, has_image, has_description."""

    def test_empty_html_no_product_schema(self):
        signals = detect_structured_data(_empty_html())
        assert signals.has_product_schema is False

    def test_minimal_product_has_schema(self):
        signals = detect_structured_data(_minimal_product())
        assert signals.has_product_schema is True

    def test_minimal_product_has_name(self):
        signals = detect_structured_data(_minimal_product())
        assert signals.has_name is True

    def test_minimal_product_no_image(self):
        signals = detect_structured_data(_minimal_product())
        assert signals.has_image is False

    def test_minimal_product_no_description(self):
        signals = detect_structured_data(_minimal_product())
        assert signals.has_description is False

    def test_complete_product_has_name(self):
        signals = detect_structured_data(_complete_product())
        assert signals.has_name is True

    def test_complete_product_has_image(self):
        signals = detect_structured_data(_complete_product())
        assert signals.has_image is True

    def test_complete_product_has_description(self):
        signals = detect_structured_data(_complete_product())
        assert signals.has_description is True


# ---------------------------------------------------------------------------
# 2. TestDetectorOffers
# ---------------------------------------------------------------------------


class TestDetectorOffers:
    """has_offers, has_price, has_price_currency, has_availability; offers variants."""

    def test_minimal_product_no_offers(self):
        signals = detect_structured_data(_minimal_product())
        assert signals.has_offers is False

    def test_minimal_product_no_price(self):
        signals = detect_structured_data(_minimal_product())
        assert signals.has_price is False

    def test_complete_product_has_offers(self):
        signals = detect_structured_data(_complete_product())
        assert signals.has_offers is True

    def test_complete_product_has_price(self):
        signals = detect_structured_data(_complete_product())
        assert signals.has_price is True

    def test_complete_product_has_price_currency(self):
        signals = detect_structured_data(_complete_product())
        assert signals.has_price_currency is True

    def test_complete_product_has_availability(self):
        signals = detect_structured_data(_complete_product())
        assert signals.has_availability is True

    def test_offers_as_array_has_offers(self):
        signals = detect_structured_data(_offers_as_array())
        assert signals.has_offers is True

    def test_offers_as_array_has_price(self):
        signals = detect_structured_data(_offers_as_array())
        assert signals.has_price is True

    def test_offers_as_array_has_currency(self):
        signals = detect_structured_data(_offers_as_array())
        assert signals.has_price_currency is True

    def test_offers_as_array_has_availability(self):
        signals = detect_structured_data(_offers_as_array())
        assert signals.has_availability is True


# ---------------------------------------------------------------------------
# 3. TestDetectorRecommendedFields
# ---------------------------------------------------------------------------


class TestDetectorRecommendedFields:
    """brand (string/object), sku, gtin, aggregateRating, extras."""

    def test_brand_as_string(self):
        """Brand stored as a plain string is detected."""
        signals = detect_structured_data(_complete_product())
        assert signals.has_brand is True

    def test_brand_as_object(self):
        """Brand as {"@type": "Brand", "name": "Nike"} is detected."""
        signals = detect_structured_data(_product_with_brand_object())
        assert signals.has_brand is True

    def test_brand_object_no_missing_brand_flag(self):
        signals = detect_structured_data(_product_with_brand_object())
        assert signals.has_missing_brand is False

    def test_no_brand_sets_missing_brand(self):
        signals = detect_structured_data(_minimal_product())
        assert signals.has_missing_brand is True

    def test_has_sku(self):
        signals = detect_structured_data(_complete_product())
        assert signals.has_sku is True

    def test_has_gtin(self):
        signals = detect_structured_data(_product_with_gtin_variants())
        assert signals.has_gtin is True

    def test_gtin13_detected(self):
        """gtin13 key is recognised as a GTIN variant."""
        signals = detect_structured_data(_product_with_gtin_variants())
        assert signals.has_gtin is True

    def test_has_aggregate_rating(self):
        signals = detect_structured_data(_complete_product())
        assert signals.has_aggregate_rating is True

    def test_has_price_valid_until(self):
        signals = detect_structured_data(_complete_product())
        assert signals.has_price_valid_until is True

    def test_has_shipping_details(self):
        signals = detect_structured_data(_complete_product())
        assert signals.has_shipping_details is True

    def test_has_return_policy(self):
        signals = detect_structured_data(_complete_product())
        assert signals.has_return_policy is True


# ---------------------------------------------------------------------------
# 4. TestDetectorErrors
# ---------------------------------------------------------------------------


class TestDetectorErrors:
    """duplicate_product_count, currency in price, invalid availability, json errors."""

    def test_single_product_count_is_one(self):
        signals = detect_structured_data(_minimal_product())
        assert signals.duplicate_product_count == 1

    def test_duplicate_product_count(self):
        signals = detect_structured_data(_duplicate_products())
        assert signals.duplicate_product_count == 2

    def test_currency_in_price_detected(self):
        signals = detect_structured_data(_currency_in_price())
        assert signals.has_currency_in_price is True

    def test_valid_price_no_currency_flag(self):
        signals = detect_structured_data(_complete_product())
        assert signals.has_currency_in_price is False

    def test_invalid_availability_detected(self):
        signals = detect_structured_data(_invalid_availability())
        assert signals.has_invalid_availability is True

    def test_valid_availability_no_error(self):
        signals = detect_structured_data(_complete_product())
        assert signals.has_invalid_availability is False

    def test_json_parse_error_incremented(self):
        signals = detect_structured_data(_malformed_json())
        assert signals.json_parse_errors == 1

    def test_no_json_errors_on_valid(self):
        signals = detect_structured_data(_complete_product())
        assert signals.json_parse_errors == 0


# ---------------------------------------------------------------------------
# 5. TestDetectorEdgeCases
# ---------------------------------------------------------------------------


class TestDetectorEdgeCases:
    """@graph, @type as list, offers array, multiple tags, malformed JSON, empty HTML."""

    def test_graph_wrapper_extracts_product(self):
        signals = detect_structured_data(_graph_wrapper())
        assert signals.has_product_schema is True
        assert signals.has_name is True

    def test_graph_wrapper_extracts_breadcrumb(self):
        signals = detect_structured_data(_graph_wrapper())
        assert signals.has_breadcrumb_list is True

    def test_type_as_list_detects_product(self):
        signals = detect_structured_data(_type_as_list())
        assert signals.has_product_schema is True

    def test_type_as_list_detects_name(self):
        signals = detect_structured_data(_type_as_list())
        assert signals.has_name is True

    def test_offers_as_array_full_extraction(self):
        signals = detect_structured_data(_offers_as_array())
        assert signals.has_offers is True
        assert signals.has_price is True
        assert signals.has_price_currency is True
        assert signals.has_availability is True

    def test_multiple_script_tags_product(self):
        signals = detect_structured_data(_multiple_script_tags())
        assert signals.has_product_schema is True

    def test_multiple_script_tags_breadcrumb(self):
        signals = detect_structured_data(_multiple_script_tags())
        assert signals.has_breadcrumb_list is True

    def test_multiple_script_tags_organization(self):
        signals = detect_structured_data(_multiple_script_tags())
        assert signals.has_organization is True

    def test_malformed_json_no_product(self):
        """Malformed JSON doesn't produce a product signal."""
        signals = detect_structured_data(_malformed_json())
        assert signals.has_product_schema is False
        assert signals.json_parse_errors == 1

    def test_empty_html_returns_all_defaults(self):
        signals = detect_structured_data(_empty_html())
        assert signals.has_product_schema is False
        assert signals.has_name is False
        assert signals.has_offers is False
        assert signals.has_breadcrumb_list is False
        assert signals.has_organization is False
        assert signals.duplicate_product_count == 0
        assert signals.json_parse_errors == 0

    def test_empty_string_returns_defaults(self):
        signals = detect_structured_data("")
        assert signals.has_product_schema is False
        assert signals.duplicate_product_count == 0

    def test_malformed_plus_valid_json(self):
        """Malformed block counted as error; valid block still extracted."""
        html = (
            '<html><head>'
            '<script type="application/ld+json">{bad json}</script>'
            '<script type="application/ld+json">'
            '{"@type":"Product","name":"OK Widget"}'
            '</script>'
            '</head><body></body></html>'
        )
        signals = detect_structured_data(html)
        assert signals.json_parse_errors == 1
        assert signals.has_product_schema is True
        assert signals.has_name is True


# ---------------------------------------------------------------------------
# 6. TestDetectorAncillary
# ---------------------------------------------------------------------------


class TestDetectorAncillary:
    """BreadcrumbList and Organization detection."""

    def test_has_breadcrumb_list(self):
        signals = detect_structured_data(_graph_wrapper())
        assert signals.has_breadcrumb_list is True

    def test_has_organization(self):
        signals = detect_structured_data(_multiple_script_tags())
        assert signals.has_organization is True

    def test_no_breadcrumb_list(self):
        signals = detect_structured_data(_minimal_product())
        assert signals.has_breadcrumb_list is False

    def test_no_organization(self):
        signals = detect_structured_data(_minimal_product())
        assert signals.has_organization is False

    def test_multiple_tags_both_ancillary(self):
        signals = detect_structured_data(_multiple_script_tags())
        assert signals.has_breadcrumb_list is True
        assert signals.has_organization is True


# ---------------------------------------------------------------------------
# 7. TestScoringRubric
# ---------------------------------------------------------------------------


class TestScoringRubric:
    """Deterministic 0–100 scoring from StructuredDataSignals."""

    def test_empty_signals_score_zero(self):
        assert score_structured_data(StructuredDataSignals()) == 0

    def test_all_true_score_100(self):
        assert score_structured_data(_all_true_signals()) == 100

    def test_product_schema_only(self):
        """Product schema alone = 20 base + 15 bonus = 35."""
        s = StructuredDataSignals(has_product_schema=True)
        assert score_structured_data(s) == 35

    def test_product_with_name(self):
        """Product + name = 20 + 5 + 15 bonus = 40."""
        s = StructuredDataSignals(has_product_schema=True, has_name=True)
        assert score_structured_data(s) == 40

    def test_product_with_image(self):
        """Product + image = 20 + 5 + 15 bonus = 40."""
        s = StructuredDataSignals(has_product_schema=True, has_image=True)
        assert score_structured_data(s) == 40

    def test_complete_offers_points(self):
        """Product + all 4 offers fields = 20 + 15 + 15 bonus = 50."""
        s = StructuredDataSignals(
            has_product_schema=True,
            has_offers=True,
            has_price=True,
            has_price_currency=True,
            has_availability=True,
        )
        assert score_structured_data(s) == 50

    def test_brand_points(self):
        s = StructuredDataSignals(has_product_schema=True, has_brand=True)
        assert score_structured_data(s) == 40

    def test_description_points(self):
        s = StructuredDataSignals(has_product_schema=True, has_description=True)
        assert score_structured_data(s) == 40

    def test_aggregate_rating_points(self):
        s = StructuredDataSignals(has_product_schema=True, has_aggregate_rating=True)
        assert score_structured_data(s) == 40

    def test_sku_points(self):
        s = StructuredDataSignals(has_product_schema=True, has_sku=True)
        assert score_structured_data(s) == 40

    def test_gtin_points(self):
        s = StructuredDataSignals(has_product_schema=True, has_gtin=True)
        assert score_structured_data(s) == 40

    def test_breadcrumb_points(self):
        """BreadcrumbList alone = 10 pts, no bonus (no product)."""
        s = StructuredDataSignals(has_breadcrumb_list=True)
        assert score_structured_data(s) == 10

    def test_organization_points(self):
        """Organization alone = 5 pts, no bonus."""
        s = StructuredDataSignals(has_organization=True)
        assert score_structured_data(s) == 5

    def test_extras_price_valid_until(self):
        s = StructuredDataSignals(has_product_schema=True, has_price_valid_until=True)
        assert score_structured_data(s) == 40

    def test_extras_shipping_details(self):
        s = StructuredDataSignals(has_product_schema=True, has_shipping_details=True)
        assert score_structured_data(s) == 40

    def test_extras_return_policy(self):
        s = StructuredDataSignals(has_product_schema=True, has_return_policy=True)
        assert score_structured_data(s) == 40

    def test_error_penalty_duplicate(self):
        """Duplicate products lose 5 bonus pts."""
        s = StructuredDataSignals(has_product_schema=True, duplicate_product_count=2)
        # 20 base + 0 (dupes) + 5 (no currency) + 5 (no invalid avail) = 30
        assert score_structured_data(s) == 30

    def test_error_penalty_currency(self):
        """Currency in price loses 5 bonus pts."""
        s = StructuredDataSignals(has_product_schema=True, has_currency_in_price=True)
        # 20 base + 5 (no dupes) + 0 (currency) + 5 (no invalid avail) = 30
        assert score_structured_data(s) == 30

    def test_error_penalty_invalid_availability(self):
        """Invalid availability loses 5 bonus pts."""
        s = StructuredDataSignals(
            has_product_schema=True, has_invalid_availability=True
        )
        # 20 base + 5 + 5 + 0 = 30
        assert score_structured_data(s) == 30

    def test_all_three_errors_lose_15_bonus(self):
        """All three errors = no bonus points."""
        s = StructuredDataSignals(
            has_product_schema=True,
            has_name=True,
            duplicate_product_count=2,
            has_currency_in_price=True,
            has_invalid_availability=True,
        )
        # 20 + 5 + 0 bonus = 25
        assert score_structured_data(s) == 25


# ---------------------------------------------------------------------------
# 8. TestScoringBoundaries
# ---------------------------------------------------------------------------


class TestScoringBoundaries:
    """Offers requires all 4, SKU OR GTIN sufficient, any of 3 extras sufficient."""

    def test_offers_requires_all_four(self):
        """All four offer sub-fields → 15 pts."""
        s = StructuredDataSignals(
            has_product_schema=True,
            has_offers=True,
            has_price=True,
            has_price_currency=True,
            has_availability=True,
        )
        # 20 + 15 + 15 bonus = 50
        assert score_structured_data(s) == 50

    def test_offers_missing_availability_no_points(self):
        """Three of four offer fields → 0 pts for offers criterion."""
        s = StructuredDataSignals(
            has_product_schema=True,
            has_offers=True,
            has_price=True,
            has_price_currency=True,
            # availability missing
        )
        # 20 + 0 + 15 = 35
        assert score_structured_data(s) == 35

    def test_offers_missing_price_no_points(self):
        s = StructuredDataSignals(
            has_product_schema=True,
            has_offers=True,
            has_price_currency=True,
            has_availability=True,
        )
        assert score_structured_data(s) == 35

    def test_sku_alone_sufficient(self):
        s = StructuredDataSignals(has_product_schema=True, has_sku=True)
        assert score_structured_data(s) == 40

    def test_gtin_alone_sufficient(self):
        s = StructuredDataSignals(has_product_schema=True, has_gtin=True)
        assert score_structured_data(s) == 40

    def test_both_sku_and_gtin_still_5pts(self):
        """SKU + GTIN together still awards 5, not 10."""
        s = StructuredDataSignals(
            has_product_schema=True, has_sku=True, has_gtin=True
        )
        assert score_structured_data(s) == 40

    def test_any_extra_sufficient(self):
        """Any one of the three extras gives 5 pts."""
        for field in ("has_price_valid_until", "has_shipping_details", "has_return_policy"):
            s = StructuredDataSignals(has_product_schema=True, **{field: True})
            assert score_structured_data(s) == 40, f"{field} should give 5 pts"

    def test_bonus_only_with_product_schema(self):
        """No product schema → no bonus points, even with clean signals."""
        s = StructuredDataSignals(has_name=True, has_breadcrumb_list=True)
        # 5 (name) + 10 (breadcrumb) + 0 bonus = 15
        assert score_structured_data(s) == 15

    def test_score_clamped_at_zero(self):
        """Score cannot go below 0."""
        s = StructuredDataSignals()
        assert score_structured_data(s) >= 0

    def test_score_clamped_at_100(self):
        """Score cannot exceed 100."""
        assert score_structured_data(_all_true_signals()) <= 100


# ---------------------------------------------------------------------------
# 9. TestTipSelection
# ---------------------------------------------------------------------------


class TestTipSelection:
    """Tip ordering, max count, and content verification."""

    def test_no_product_first_tip(self):
        """Empty signals → first tip is about adding Product schema."""
        tips = get_structured_data_tips(StructuredDataSignals())
        assert len(tips) >= 1
        assert "Product structured data" in tips[0]

    def test_empty_signals_get_breadcrumb_tip(self):
        """Empty signals also get a BreadcrumbList tip."""
        tips = get_structured_data_tips(StructuredDataSignals())
        assert any("BreadcrumbList" in t for t in tips)

    def test_empty_signals_max_two_tips(self):
        """Empty signals match only 2 rules (no product + no breadcrumb)."""
        tips = get_structured_data_tips(StructuredDataSignals())
        assert len(tips) == 2

    def test_max_3_tips(self):
        """Never returns more than 3 tips regardless of how many rules match."""
        # Minimal product matches many rules: no offers, no image, no brand, etc.
        signals = detect_structured_data(_minimal_product())
        tips = get_structured_data_tips(signals)
        assert len(tips) <= 3

    def test_minimal_product_tips_order(self):
        """Minimal product tips follow priority order: price, image, brand."""
        signals = detect_structured_data(_minimal_product())
        tips = get_structured_data_tips(signals)
        assert len(tips) == 3
        assert "price" in tips[0].lower()
        assert "image" in tips[1].lower()
        assert "brand" in tips[2].lower()

    def test_fully_optimized_no_tips(self):
        """All signals present → no tips needed."""
        tips = get_structured_data_tips(_all_true_signals())
        assert tips == []

    def test_currency_error_tip_included(self):
        """Currency error in otherwise minimal product triggers currency tip."""
        signals = detect_structured_data(_currency_in_price())
        tips = get_structured_data_tips(signals)
        assert any("currency" in t.lower() for t in tips)

    def test_duplicate_product_tip_included(self):
        """Duplicate products trigger duplicate removal tip."""
        signals = detect_structured_data(_duplicate_products())
        tips = get_structured_data_tips(signals)
        assert any("duplicate" in t.lower() for t in tips)

    def test_invalid_availability_tip_included(self):
        """Invalid availability URL triggers URL fix tip."""
        signals = detect_structured_data(_invalid_availability())
        tips = get_structured_data_tips(signals)
        assert any("schema.org" in t.lower() for t in tips)

    def test_tips_are_strings(self):
        tips = get_structured_data_tips(StructuredDataSignals())
        assert all(isinstance(t, str) for t in tips)

    def test_tips_are_nonempty(self):
        tips = get_structured_data_tips(StructuredDataSignals())
        assert all(len(t) > 10 for t in tips)


# ---------------------------------------------------------------------------
# 10. TestDataclassStructure
# ---------------------------------------------------------------------------


class TestDataclassStructure:
    """StructuredDataSignals dataclass invariants."""

    def test_field_count_22(self):
        assert len(fields(StructuredDataSignals)) == 22

    def test_default_values_all_false_or_zero(self):
        s = StructuredDataSignals()
        for f in fields(s):
            val = getattr(s, f.name)
            if isinstance(val, bool):
                assert val is False, f"{f.name} should default to False"
            elif isinstance(val, int):
                assert val == 0, f"{f.name} should default to 0"

    def test_signals_is_dataclass(self):
        from dataclasses import is_dataclass

        assert is_dataclass(StructuredDataSignals)

    def test_signals_instantiation_defaults(self):
        """Can instantiate with no args and get valid defaults."""
        s = StructuredDataSignals()
        assert s.has_product_schema is False
        assert s.duplicate_product_count == 0
        assert s.json_parse_errors == 0


# ---------------------------------------------------------------------------
# Integration: end-to-end HTML → score
# ---------------------------------------------------------------------------


class TestEndToEnd:
    """Full pipeline: HTML → detect → score → tips."""

    def test_complete_product_scores_100(self):
        signals = detect_structured_data(_complete_product())
        assert score_structured_data(signals) == 100

    def test_complete_product_no_tips(self):
        signals = detect_structured_data(_complete_product())
        tips = get_structured_data_tips(signals)
        assert tips == []

    def test_empty_html_scores_0(self):
        signals = detect_structured_data(_empty_html())
        assert score_structured_data(signals) == 0

    def test_minimal_product_score(self):
        """Minimal product = 20 (product) + 5 (name) + 15 (bonus) = 40."""
        signals = detect_structured_data(_minimal_product())
        assert score_structured_data(signals) == 40

    def test_currency_error_reduces_score(self):
        """Currency in price loses 5 bonus pts vs clean offers."""
        bad = detect_structured_data(_currency_in_price())
        bad_score = score_structured_data(bad)
        # Build clean version for comparison
        clean_html = _wrap_jsonld({
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Widget",
            "offers": {
                "@type": "Offer",
                "price": "29.99",
                "priceCurrency": "USD",
                "availability": "https://schema.org/InStock",
            },
        })
        clean = detect_structured_data(clean_html)
        clean_score = score_structured_data(clean)
        assert clean_score - bad_score == 5
