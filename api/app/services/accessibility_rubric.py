"""Scoring rubric and tip selector for accessibility signals.

Converts :class:`AccessibilitySignals` into a deterministic 0–100
score using severity-weighted deductions, and selects up to 3
prioritised improvement tips with research-backed, conversion-first
framing.
"""

from __future__ import annotations

from app.services.accessibility_detector import AccessibilitySignals


# ---------------------------------------------------------------------------
# Severity deduction weights
# ---------------------------------------------------------------------------

_SEVERITY_WEIGHTS: dict[str, int] = {
    "critical": 15,
    "serious": 8,
    "moderate": 4,
    "minor": 2,
}


# ---------------------------------------------------------------------------
# Scoring rubric
# ---------------------------------------------------------------------------


def score_accessibility(signals: AccessibilitySignals) -> int:
    """Compute a 0–100 accessibility score from extracted signals.

    Starts at 100 and deducts points per severity level:

        critical violations × 15
        serious  violations × 8
        moderate violations × 4
        minor    violations × 2

    If ``scan_completed`` is ``False`` (no axe-core data available),
    returns 0 — the score cannot be determined.

    Returns:
        Integer clamped to 0–100.
    """
    if not signals.scan_completed:
        return 0

    score = 100
    score -= signals.critical_count * _SEVERITY_WEIGHTS["critical"]
    score -= signals.serious_count * _SEVERITY_WEIGHTS["serious"]
    score -= signals.moderate_count * _SEVERITY_WEIGHTS["moderate"]
    score -= signals.minor_count * _SEVERITY_WEIGHTS["minor"]

    return max(0, min(100, score))


# ---------------------------------------------------------------------------
# Tip selector
# ---------------------------------------------------------------------------

# Tips ordered by impact priority (highest first).  Each entry is a
# (condition_callable, tip_string) pair.  The condition receives the
# signals *and* the computed score.

_TIP_RULES: list[tuple] = [
    # 1. Contrast — most common WCAG failure
    (
        lambda s, _score: s.contrast_violations > 0,
        (
            "Fix color-contrast issues — low contrast is the #1 "
            "accessibility barrier, found on 79.1% of home pages "
            "(WebAIM Million 2024), and affects purchasing for 300M+ "
            "people with visual impairments worldwide"
        ),
    ),
    # 2. Alt text — second most common
    (
        lambda s, _score: s.alt_text_violations > 0,
        (
            "Add descriptive alt text to images — missing alt text is "
            "detected on 55.5% of home pages (WebAIM Million 2024) and "
            "blocks screen-reader users from understanding your products"
        ),
    ),
    # 3. Form labels — critical for conversions
    (
        lambda s, _score: s.form_label_violations > 0,
        (
            "Associate labels with form inputs — 39% of home pages have "
            "missing form labels (WebAIM Million 2024), causing checkout "
            "abandonment for assistive-technology users"
        ),
    ),
    # 4. Empty links
    (
        lambda s, _score: s.empty_link_violations > 0,
        (
            "Give every link a descriptive accessible name — empty links "
            "confuse keyboard and screen-reader navigation, increasing "
            "bounce rates for the 15% of the population with disabilities"
        ),
    ),
    # 5. Empty buttons
    (
        lambda s, _score: s.empty_button_violations > 0,
        (
            "Label all buttons with accessible text — unnamed buttons "
            "prevent assistive-technology users from completing actions "
            "like Add to Cart, directly reducing conversion"
        ),
    ),
    # 6. Document language
    (
        lambda s, _score: s.document_language_violations > 0,
        (
            "Set the lang attribute on your <html> element — screen "
            "readers rely on it for correct pronunciation, and missing "
            "lang is flagged on 17.1% of home pages (WebAIM Million 2024)"
        ),
    ),
    # 7. Congratulatory — high score
    (
        lambda _s, score: score >= 85,
        (
            "Strong accessibility foundation — accessible sites reach "
            "the $490B annual spending power of disabled consumers "
            "(American Institutes for Research) and rank higher in search"
        ),
    ),
]


def get_accessibility_tips(signals: AccessibilitySignals) -> list[str]:
    """Return up to 3 research-backed accessibility improvement tips.

    Tips are selected based on which violation categories are present,
    prioritised by prevalence and conversion impact (most impactful
    first).

    Args:
        signals: Extracted accessibility signals.

    Returns:
        A list of 0–3 tip strings.
    """
    score = score_accessibility(signals)
    tips: list[str] = []

    for condition, tip in _TIP_RULES:
        if condition(signals, score):
            tips.append(tip)
            if len(tips) >= 3:
                break

    return tips
