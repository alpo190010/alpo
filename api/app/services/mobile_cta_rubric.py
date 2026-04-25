"""Scoring rubric and tip selector for mobile CTA & UX signals.

Converts :class:`MobileCtaSignals` into a deterministic 0-100 score
using weighted criteria derived from Growth Rock, Baymard Institute,
Apple HIG, WCAG 2.5.5, Steven Hoober thumb-zone research, and
Contentsquare traffic data, and selects up to 3 prioritised tips.

Two scoring tiers:
  - HTML-only (Playwright measurements unavailable): max ~65/100
  - Full Playwright measurements: max 100/100
"""

from __future__ import annotations

import re

from app.services.mobile_cta_detector import MobileCtaSignals


# ---------------------------------------------------------------------------
# Scoring rubric
# ---------------------------------------------------------------------------

# Compiled once — matches action-oriented CTA text
_ACTION_CTA_RE = re.compile(
    r"^(add to cart|add to bag|buy now|buy it now|shop now|get it now|order now)$",
    re.IGNORECASE,
)


def score_mobile_cta(signals: MobileCtaSignals) -> int:
    """Compute a 0-100 mobile CTA & UX score from extracted signals.

    Weighted criteria (max 100 pts total):

        CTA found on page:                       15 pts
        Sticky CTA (Playwright / HTML fallback):  20 / 15 pts
        Above fold (Playwright / proxy):          15 / 10 pts
        Touch target >= 44px (PW / partial):      10 / 5 pts
        Optimal size 60-72px (PW only):           10 pts
        Thumb-zone placement (PW only):           10 pts
        Full-width CTA (PW / proxy):               5 / 3 pts
        Responsive viewport meta:                  5 pts
        Single clear CTA:                          5 pts
        Action-oriented CTA text:                  5 pts

    Returns:
        Integer clamped to 0-100.
    """
    score = 0

    # --- CTA found (15 pts) — baseline requirement ---
    if signals.cta_found:
        score += 15

    # --- Sticky CTA (20 pts Playwright, 15 pts HTML fallback) ---
    if signals.is_sticky is True:
        # Playwright confirmed sticky behaviour after scroll
        score += 20
    elif signals.has_sticky_class or signals.has_sticky_app is not None:
        # HTML class/app hints (less reliable, reduced credit)
        score += 15

    # --- Above fold (15 pts Playwright, 10 pts proxy) ---
    if signals.above_fold is True:
        score += 15
    elif signals.above_fold is None and signals.cta_found and signals.has_viewport_meta:
        # Proxy: if CTA exists and page has viewport meta, partial credit
        score += 10

    # --- Touch target >= 44px (10 pts Playwright, 5 pts partial) ---
    if signals.meets_min_44px is True:
        score += 10
    elif signals.meets_min_44px is None and signals.cta_found:
        # No measurement available but CTA exists — partial credit
        score += 5

    # --- Optimal size 60-72px (10 pts, Playwright only) ---
    if signals.meets_optimal_60_72px is True:
        score += 10

    # --- Thumb-zone placement (10 pts, Playwright only) ---
    if signals.in_thumb_zone is True:
        score += 10

    # --- Full-width CTA (5 pts Playwright, 3 pts proxy) ---
    if signals.is_full_width is True:
        score += 5
    elif signals.is_full_width is None and (
        signals.has_sticky_class or signals.has_sticky_app is not None
    ):
        # Sticky bars are typically full-width on mobile
        score += 3

    # --- Responsive viewport meta (5 pts) ---
    if signals.has_responsive_meta:
        score += 5

    # --- Single clear CTA (5 pts) ---
    if signals.cta_count == 1:
        score += 5
    elif signals.cta_count > 3:
        # Penalise excessive CTAs (Hick's Law)
        score -= 5

    # --- Action-oriented CTA text (5 pts) ---
    if signals.cta_text and _ACTION_CTA_RE.match(signals.cta_text.strip()):
        score += 5

    return max(0, min(100, score))


# ---------------------------------------------------------------------------
# Tip selector
# ---------------------------------------------------------------------------

# Tips ordered by conversion impact (highest first).  Each entry is a
# (condition_callable, tip_string) pair.  The condition receives the
# signals *and* the computed score.

_TIP_RULES: list[tuple] = [
    # 1. No CTA found — catastrophic
    (
        lambda s, _score: not s.cta_found,
        (
            "Add a visible Add to Cart button \u2014 mobile carries 79% of "
            "e-commerce traffic but converts at just 1.2\u20132.0% vs "
            "desktop\u2019s 3.2\u20134.1% (Contentsquare 2024). Without a "
            "CTA, mobile visitors cannot purchase"
        ),
    ),
    # 2. Not sticky — biggest single CTA improvement
    (
        lambda s, _score: (
            s.cta_found
            and s.is_sticky is not True
            and not s.has_sticky_class
            and s.has_sticky_app is None
        ),
        (
            "Add a sticky add-to-cart button \u2014 Growth Rock\u2019s A/B "
            "test showed 7.9% more completed orders on desktop and 11.8% "
            "more add-to-cart clicks on mobile at >99% statistical "
            "significance"
        ),
    ),
    # 3. Not above fold
    (
        lambda s, _score: s.cta_found and s.above_fold is False,
        (
            "Move your CTA above the fold on mobile \u2014 Baymard Institute "
            "finds that CTA visibility without scrolling is a top-3 mobile "
            "conversion factor; users who must scroll to find the buy button "
            "abandon 2\u20133\u00d7 more often"
        ),
    ),
    # 4. Below 44px minimum
    (
        lambda s, _score: s.cta_found and s.meets_min_44px is False,
        (
            "Your call-to-action button is too small to tap reliably "
            "on mobile. Make it at least 44\u00d744 points (about a "
            "thumbprint) \u2014 that's the size Apple and accessibility "
            "standards require for a comfortable, mistake-free tap"
        ),
    ),
    # 5. Not in thumb zone
    (
        lambda s, _score: s.cta_found and s.in_thumb_zone is False,
        (
            "Position your CTA in the bottom 40% of the screen \u2014 67% of "
            "mobile users hold their phone with one hand and tap with their "
            "right thumb; bottom-positioned CTAs see measurably higher tap "
            "rates (Steven Hoober, A List Apart)"
        ),
    ),
    # 6. Not full width
    (
        lambda s, _score: s.cta_found and s.is_full_width is False,
        (
            "Make your CTA full-width on mobile \u2014 edge-to-edge buttons "
            "eliminate edge-miss taps and increase the effective touch target "
            "by 2\u20133\u00d7 on narrow screens"
        ),
    ),
    # 7. No viewport meta
    (
        lambda s, _score: not s.has_responsive_meta,
        (
            "Add a proper viewport meta tag (width=device-width, "
            "initial-scale=1) \u2014 without it, your page renders at "
            "desktop width on mobile, making all CTAs unusable"
        ),
    ),
    # 8. Congratulatory — strong mobile CTA setup
    (
        lambda s, score: score >= 85,
        (
            "Excellent mobile CTA setup \u2014 your page has a properly "
            "sized, accessible CTA optimised for mobile. This puts you "
            "ahead of 90%+ of Shopify stores on mobile conversion "
            "fundamentals"
        ),
    ),
]


def get_mobile_cta_tips(signals: MobileCtaSignals) -> list[str]:
    """Return up to 3 research-backed mobile CTA improvement tips.

    Tips are selected based on which mobile CTA signals are missing
    or weak, prioritised by conversion impact (most impactful first).

    Args:
        signals: Extracted mobile CTA & UX signals.

    Returns:
        A list of 0-3 tip strings.
    """
    score = score_mobile_cta(signals)
    tips: list[str] = []

    for condition, tip in _TIP_RULES:
        if condition(signals, score):
            tips.append(tip)
            if len(tips) >= 3:
                break

    return tips
