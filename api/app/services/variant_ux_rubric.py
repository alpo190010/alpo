"""Scoring rubric and tip selector for variant UX & stock signals.

Converts :class:`VariantUxSignals` into a deterministic 0-100 score
using weighted criteria derived from MECLABS, HulkApps, Peasy, Convertcart,
and Superb Digital research on variant selector and stock display impact,
and selects up to 3 prioritised improvement tips.
"""

from __future__ import annotations

from app.services.variant_ux_detector import VariantUxSignals


# ---------------------------------------------------------------------------
# Scoring rubric
# ---------------------------------------------------------------------------


def score_variant_ux(signals: VariantUxSignals) -> int:
    """Compute a 0-100 variant UX & stock score from extracted signals.

    Weighted criteria (max ~95 pts total):

        No variants (N/A baseline):               60 pts
        Visual swatches for color/pattern:         20 pts
        Pill buttons for size/options:             15 pts
        Stock level indicators:                    15 pts
        Variant-image linking:                     12 pts
        Sold-out variant handling:                 10 pts
        Precise stock count ("Only 3 left"):        8 pts
        Notify-me functionality:                    8 pts
        Hybrid approach (2+ selector types):        7 pts
        Penalty: color uses dropdown:             -10 pts

    Returns:
        Integer clamped to 0-100.
    """
    # Products without variants get a neutral N/A score
    if not signals.has_variants:
        return 60

    score = 0

    # Visual swatches (20 pts) — ~15% conversion lift over dropdowns (MECLABS)
    if signals.has_visual_swatches:
        score += 20

    # Pill buttons (15 pts) — 14.6% lift over dropdowns for 4+ choices (MECLABS)
    if signals.has_pill_buttons:
        score += 15

    # Stock level indicators (15 pts) — 10-20% conversion lift (HulkApps)
    if signals.has_stock_indicator:
        score += 15

    # Variant-image linking (12 pts) — 83% consider images essential (Convertcart)
    if signals.has_variant_image_link:
        score += 12

    # Sold-out variant handling (10 pts) — reduces abandonment
    if signals.has_sold_out_handling:
        score += 10

    # Precise stock count (8 pts) — specific > vague (Peasy/Superb Digital)
    if signals.has_precise_stock_count:
        score += 8

    # Notify-me functionality (8 pts) — captures lost demand
    if signals.has_notify_me:
        score += 8

    # Hybrid approach: 2+ selector types (7 pts) — Adidas/Nordstrom/Walmart
    selector_type_count = sum([
        signals.has_visual_swatches,
        signals.has_pill_buttons,
        signals.has_dropdown_selectors,
    ])
    if selector_type_count >= 2:
        score += 7

    # Penalty: color option using dropdown (-10 pts) — anti-pattern
    if signals.color_uses_dropdown:
        score -= 10

    return max(0, min(100, score))


# ---------------------------------------------------------------------------
# Tip selector
# ---------------------------------------------------------------------------

# Tips ordered by impact priority (highest first).  Each entry is a
# (condition_callable, tip_string) pair.  The condition receives the
# signals *and* the computed score.

_TIP_RULES: list[tuple] = [
    # 1. Color uses dropdown — biggest missed opportunity
    (
        lambda s, _score: s.color_uses_dropdown and not s.has_visual_swatches,
        (
            "Switch color options from dropdowns to visual swatches \u2014 "
            "swatches outperform dropdowns by ~15% in conversion rate "
            "(MECLABS). Adidas, Nordstrom, and Walmart all use this pattern"
        ),
    ),
    # 2. No stock indicator — high-impact signal
    (
        lambda s, _score: s.has_variants and not s.has_stock_indicator,
        (
            "Add low-stock indicators showing precise counts \u2014 "
            "\u2018Only 3 left\u2019 messaging improves conversion 10\u201320% "
            "when inventory is genuinely under 10 units (HulkApps/Peasy)"
        ),
    ),
    # 3. Size uses dropdown instead of pills
    (
        lambda s, _score: s.size_selector_type == "dropdown",
        (
            "Switch size selection to pill buttons \u2014 radio/pill buttons "
            "outperform dropdowns by 14.6% when customers have 4+ choices "
            "(MECLABS)"
        ),
    ),
    # 4. No variant-image linking with swatches present
    (
        lambda s, _score: s.has_visual_swatches and not s.has_variant_image_link,
        (
            "Link color swatches to product images for real-time preview "
            "\u2014 83% of online shoppers consider product images essential "
            "to purchase decisions (Convertcart)"
        ),
    ),
    # 5. No out-of-stock handling
    (
        lambda s, _score: (
            s.has_variants and not s.has_sold_out_handling
            and not s.has_notify_me
        ),
        (
            "Add visual indicators for unavailable variants and \u2018Notify "
            "me\u2019 forms \u2014 shoppers abandon when their preferred "
            "option appears unavailable without explanation"
        ),
    ),
    # 6. Vague stock messaging instead of precise counts
    (
        lambda s, _score: s.has_stock_indicator and not s.has_precise_stock_count,
        (
            "Show precise inventory counts (\u2018Only 3 left\u2019) instead "
            "of vague messaging \u2014 specific numbers significantly "
            "outperform \u2018Only a few left\u2019 (Superb Digital)"
        ),
    ),
    # 7. Strong score — congratulatory
    (
        lambda s, score: score >= 80,
        (
            "Strong variant UX \u2014 your hybrid selector approach with "
            "stock indicators follows the pattern used by top-converting "
            "retailers like Adidas and Nordstrom"
        ),
    ),
]


def get_variant_ux_tips(signals: VariantUxSignals) -> list[str]:
    """Return up to 3 research-backed variant UX improvement tips.

    Tips are selected based on which variant UX signals are missing or
    weak, prioritised by conversion impact (most impactful first).

    Products without variants return no tips (N/A).

    Args:
        signals: Extracted variant UX & stock signals.

    Returns:
        A list of 0-3 tip strings.
    """
    if not signals.has_variants:
        return []

    score = score_variant_ux(signals)
    tips: list[str] = []

    for condition, tip in _TIP_RULES:
        if condition(signals, score):
            tips.append(tip)
            if len(tips) >= 3:
                break

    return tips
