"""Scoring rubric and tip selector for size guide signals.

Converts :class:`SizeGuideSignals` into a deterministic 0-100 score
using weighted criteria derived from Measmerize, Immerss, Loop Returns,
and Shopify research on sizing impact on returns and conversion,
and selects up to 3 prioritised improvement tips.
"""

from __future__ import annotations

from app.services.size_guide_detector import SizeGuideSignals


# ---------------------------------------------------------------------------
# Scoring rubric
# ---------------------------------------------------------------------------


def score_size_guide(signals: SizeGuideSignals) -> int:
    """Compute a 0-100 size guide score from extracted signals.

    Category-dependent: returns 70 for non-applicable categories.

    Weighted criteria (max 100 pts total):

        Size guide link/popup present:        25 pts
        Interactive fit finder:               20 pts
        Measurement table:                    15 pts
        Model measurements:                   10 pts
        Fit recommendation text:              10 pts
        Near size selector:                   10 pts
        Known sizing app detected:             5 pts
        Multiple guide types (depth):          5 pts

    Returns:
        Integer clamped to 0-100.
    """
    # N/A boost for non-applicable categories
    if not signals.category_applicable:
        return 70

    score = 0

    # Size guide link or popup present (25 pts) — foundational
    if signals.has_size_guide_link or signals.has_size_guide_popup:
        score += 25

    # Interactive fit finder (20 pts) — AI fit tools outperform static charts
    if signals.has_fit_finder:
        score += 20

    # Measurement table (15 pts) — concrete sizing data
    if signals.has_size_chart_table:
        score += 15

    # Model measurements (10 pts) — social reference point
    if signals.has_model_measurements:
        score += 10

    # Fit recommendation text (10 pts) — reduces uncertainty
    if signals.has_fit_recommendation:
        score += 10

    # Near size selector (10 pts) — placement near decision point
    if signals.near_size_selector:
        score += 10

    # Known sizing app (5 pts) — professional tooling signal
    if signals.size_guide_app is not None:
        score += 5

    # Multiple guide types — link/popup AND table (5 pts) — depth of info
    if (signals.has_size_guide_link or signals.has_size_guide_popup) and signals.has_size_chart_table:
        score += 5

    return max(0, min(100, score))


# ---------------------------------------------------------------------------
# Tip selector
# ---------------------------------------------------------------------------

# Tips ordered by impact priority (highest first).  Each entry is a
# (condition_callable, tip_string) pair.  The condition receives the
# signals *and* the computed score.

_TIP_RULES: list[tuple] = [
    # 1. No size guide at all — biggest opportunity
    (
        lambda s, _score: (
            not s.has_size_guide_link
            and not s.has_size_guide_popup
            and not s.has_size_chart_table
            and s.size_guide_app is None
        ),
        (
            "Add a size guide \u2014 size guides reduce returns 25\u201340% "
            "and boost conversion 3\u20139\u00d7; 77% of fashion returns "
            "are due to sizing issues (Measmerize/Loop Returns data)"
        ),
    ),
    # 2. No interactive fit finder (but has some guide)
    (
        lambda s, _score: (
            (s.has_size_guide_link or s.has_size_guide_popup or s.has_size_chart_table)
            and not s.has_fit_finder
        ),
        (
            "Add an interactive fit finder like TrueFit or KiwiSizing "
            "\u2014 AI-powered sizing tools increase conversion 3\u20139\u00d7 "
            "from product page to Add to Cart and reduce returns "
            "up to 50% (Measmerize/TrueFit data)"
        ),
    ),
    # 3. No model measurements
    (
        lambda s, _score: not s.has_model_measurements,
        (
            "Add model measurements (\u2018Model is 5\u201910\u201d, "
            "wearing size M\u2019) \u2014 reference body information "
            "helps shoppers map sizes to their own body, reducing "
            "return rates and boosting purchase confidence"
        ),
    ),
    # 4. No fit recommendation
    (
        lambda s, _score: not s.has_fit_recommendation,
        (
            "Add fit recommendation text (\u2018Runs true to size\u2019 "
            "/ \u2018Order one size up\u2019) \u2014 explicit fit guidance "
            "near the size selector reduces sizing hesitation and "
            "cart abandonment"
        ),
    ),
    # 5. Static chart only, no interactivity
    (
        lambda s, _score: s.has_size_chart_table and not s.has_fit_finder,
        (
            "Upgrade from static size chart to an interactive fit "
            "finder \u2014 static charts require shoppers to self-"
            "measure; interactive tools convert 3\u20139\u00d7 better "
            "and reduce returns by up to 50%"
        ),
    ),
    # 6. Size guide not near selector
    (
        lambda s, _score: (
            (s.has_size_guide_link or s.has_size_guide_popup)
            and not s.near_size_selector
        ),
        (
            "Move your size guide link next to the size selector "
            "\u2014 placement near the decision point maximizes "
            "usage; a guide in the footer is effectively invisible"
        ),
    ),
    # 7. Congratulatory — strong size guide setup
    (
        lambda s, score: score >= 80,
        (
            "Strong size guide implementation \u2014 your page provides "
            "comprehensive sizing information. Consider A/B testing "
            "fit finder tool placement for additional lift"
        ),
    ),
]


def get_size_guide_tips(signals: SizeGuideSignals) -> list[str]:
    """Return up to 3 research-backed size guide improvement tips.

    Tips are selected based on which size guide signals are missing or
    weak, prioritised by return-reduction and conversion impact (most
    impactful first).

    For non-applicable categories, returns an empty list.

    Args:
        signals: Extracted size guide signals.

    Returns:
        A list of 0-3 tip strings.
    """
    if not signals.category_applicable:
        return []

    score = score_size_guide(signals)
    tips: list[str] = []

    for condition, tip in _TIP_RULES:
        if condition(signals, score):
            tips.append(tip)
            if len(tips) >= 3:
                break

    return tips
