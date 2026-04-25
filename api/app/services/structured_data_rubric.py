"""Scoring rubric and tip selector for structured data signals.

Converts :class:`StructuredDataSignals` into a deterministic 0–100 score
using weighted criteria derived from Google Search Central documentation
and rich-result CTR research, and selects up to 3 prioritised improvement
tips.
"""

from __future__ import annotations

from app.services.structured_data_detector import StructuredDataSignals


# ---------------------------------------------------------------------------
# Scoring rubric
# ---------------------------------------------------------------------------


def score_structured_data(signals: StructuredDataSignals) -> int:
    """Compute a 0–100 structured data score from extracted signals.

    Weighted criteria (max 100 pts total):

    Base points (85 max):
        - Product schema present:                           20 pts
        - Product has name:                                  5 pts
        - Product has image:                                 5 pts
        - Complete offers (price + currency + availability): 15 pts
        - Product has brand:                                 5 pts
        - Product has description:                           5 pts
        - Product has aggregateRating:                       5 pts
        - Product has SKU or GTIN:                           5 pts
        - BreadcrumbList present:                           10 pts
        - Organization present:                              5 pts
        - Any of priceValidUntil/shipping/returns:           5 pts

    Bonus points (15 max):
        - No duplicate Product schemas:                      5 pts
        - No currency symbol in price:                       5 pts
        - No invalid availability URL:                       5 pts

    Returns:
        Integer clamped to 0–100.
    """
    score = 0

    # --- Base points (85 max) ----------------------------------------

    # Product schema present (20 pts)
    if signals.has_product_schema:
        score += 20

    # Product name (5 pts)
    if signals.has_name:
        score += 5

    # Product image (5 pts)
    if signals.has_image:
        score += 5

    # Complete offers block: price + currency + availability (15 pts)
    if (
        signals.has_offers
        and signals.has_price
        and signals.has_price_currency
        and signals.has_availability
    ):
        score += 15

    # Brand (5 pts)
    if signals.has_brand:
        score += 5

    # Description (5 pts)
    if signals.has_description:
        score += 5

    # Aggregate rating (5 pts)
    if signals.has_aggregate_rating:
        score += 5

    # Identifier — SKU or GTIN (5 pts)
    if signals.has_sku or signals.has_gtin:
        score += 5

    # BreadcrumbList (10 pts)
    if signals.has_breadcrumb_list:
        score += 10

    # Organization (5 pts)
    if signals.has_organization:
        score += 5

    # Enhanced commerce fields — any of three (5 pts)
    if (
        signals.has_price_valid_until
        or signals.has_shipping_details
        or signals.has_return_policy
    ):
        score += 5

    # --- Bonus points (15 max) — reward absence of errors ------------
    # Only awarded when a Product schema exists; otherwise an empty page
    # would get free points for having no errors.

    if signals.has_product_schema:
        # No duplicate Product schemas (5 pts)
        if signals.duplicate_product_count <= 1:
            score += 5

        # No currency symbol embedded in price (5 pts)
        if not signals.has_currency_in_price:
            score += 5

        # No invalid availability URL (5 pts)
        if not signals.has_invalid_availability:
            score += 5

    return max(0, min(100, score))


# ---------------------------------------------------------------------------
# Tip selector
# ---------------------------------------------------------------------------

# Tips ordered by impact priority (highest first).  Each entry is a
# (condition_callable, tip_string) pair.  The condition receives the
# signals *and* the computed score.

_TIP_RULES: list[tuple] = [
    # 1. No Product schema — biggest gap
    (
        lambda s, _score: not s.has_product_schema,
        (
            "Add Product structured data \u2014 pages with complete schema "
            "markup see 20\u201340% higher click-through rates"
        ),
    ),
    # 2. Missing offers/price
    (
        lambda s, _score: (
            s.has_product_schema and (not s.has_offers or not s.has_price)
        ),
        (
            "Add price to your schema \u2014 rich results with price get "
            "58% of clicks vs 41% for non-rich results"
        ),
    ),
    # 3. Missing image
    (
        lambda s, _score: s.has_product_schema and not s.has_image,
        (
            "Add image to your Product schema \u2014 image is required for "
            "product rich results"
        ),
    ),
    # 4. Duplicate Product schemas
    (
        lambda s, _score: s.duplicate_product_count > 1,
        (
            "Remove duplicate Product schemas \u2014 multiple conflicting "
            "Product nodes confuse Google\u2019s parser"
        ),
    ),
    # 5. Currency symbol in price
    (
        lambda s, _score: s.has_currency_in_price,
        (
            "Your product price contains a currency symbol where "
            "search engines and AI shopping tools expect a plain number "
            "\u2014 use \u201829.99\u2019 instead of \u2018$29.99\u2019. "
            "Without this, Google may not show your price in shopping "
            "results"
        ),
    ),
    # 6. Invalid availability URL
    (
        lambda s, _score: s.has_invalid_availability,
        (
            "Your stock-status uses a shorthand label that search "
            "engines don\u2019t recognize. Use the full standard format "
            "(\u2018https://schema.org/InStock\u2019, not just \u2018InStock\u2019) "
            "so Google Shopping displays \u2018In stock\u2019 in results"
        ),
    ),
    # 7. Missing brand
    (
        lambda s, _score: s.has_product_schema and not s.has_brand,
        (
            "Add brand to Product schema \u2014 brand is recommended for "
            "merchant listing eligibility"
        ),
    ),
    # 8. No BreadcrumbList
    (
        lambda s, _score: not s.has_breadcrumb_list,
        (
            "Add BreadcrumbList schema \u2014 breadcrumbs improve search "
            "result navigation and CTR"
        ),
    ),
    # 9. No aggregateRating
    (
        lambda s, _score: s.has_product_schema and not s.has_aggregate_rating,
        (
            "Add aggregateRating to Product schema \u2014 star ratings in "
            "search results increase click-through rate by up to 35%"
        ),
    ),
]


def get_structured_data_tips(signals: StructuredDataSignals) -> list[str]:
    """Return up to 3 research-backed improvement tips.

    Tips are selected based on which signals are missing or weak,
    prioritised by impact (most impactful first).

    Args:
        signals: Extracted structured data signals.

    Returns:
        A list of 0–3 tip strings.
    """
    score = score_structured_data(signals)
    tips: list[str] = []

    for condition, tip in _TIP_RULES:
        if condition(signals, score):
            tips.append(tip)
            if len(tips) >= 3:
                break

    return tips
