"""Scoring rubric and tip selector for social commerce signals.

Converts :class:`SocialCommerceSignals` into a deterministic 0–100
score using weighted criteria derived from Emplifi, TikTok, Pinterest,
and consumer research on social commerce conversion, and selects up to
3 prioritised improvement tips.
"""

from __future__ import annotations

from app.services.social_commerce_detector import SocialCommerceSignals


# ---------------------------------------------------------------------------
# Scoring rubric
# ---------------------------------------------------------------------------


def score_social_commerce(signals: SocialCommerceSignals) -> int:
    """Compute a 0–100 social commerce score from extracted signals.

    Weighted criteria (max 100 pts total):

        Any platform embed (Instagram OR TikTok OR Pinterest): 30 pts
        UGC gallery app present:                               25 pts
        TikTok specifically:                                   15 pts
        Pinterest specifically:                                10 pts
        2+ platforms:                                          10 pts
        All 3 platforms:                                       10 pts

    Returns:
        Integer clamped to 0–100.
    """
    score = 0

    # Any platform embed — Instagram OR TikTok OR Pinterest (30 pts)
    if signals.has_instagram_embed or signals.has_tiktok_embed or signals.has_pinterest:
        score += 30

    # UGC gallery app present (25 pts)
    if signals.has_ugc_gallery:
        score += 25

    # TikTok specifically (15 pts)
    if signals.has_tiktok_embed:
        score += 15

    # Pinterest specifically (10 pts)
    if signals.has_pinterest:
        score += 10

    # 2+ platforms (10 pts)
    if signals.platform_count >= 2:
        score += 10

    # All 3 platforms (10 pts)
    if signals.platform_count >= 3:
        score += 10

    return max(0, min(100, score))


# ---------------------------------------------------------------------------
# Tip selector
# ---------------------------------------------------------------------------

# Tips ordered by impact priority (highest first).  Each entry is a
# (condition_callable, tip_string) pair.  The condition receives the
# signals *and* the computed score.

_TIP_RULES: list[tuple] = [
    # 1. No embeds at all → add Instagram/TikTok
    (
        lambda s, _score: (
            not s.has_instagram_embed
            and not s.has_tiktok_embed
            and not s.has_pinterest
        ),
        (
            "Add Instagram or TikTok embeds to your product pages "
            "\u2014 social content generates up to 10\u00d7 more "
            "engagement than brand-created content (Emplifi)"
        ),
    ),
    # 2. No TikTok → add TikTok Shop
    (
        lambda s, _score: not s.has_tiktok_embed,
        (
            "Add TikTok integration \u2014 TikTok Shop drives "
            "3\u20135\u00d7 higher conversion than traditional social "
            "ads (TikTok for Business)"
        ),
    ),
    # 3. No Pinterest → enable Rich Pins
    (
        lambda s, _score: not s.has_pinterest,
        (
            "Enable Pinterest Rich Pins \u2014 Rich Pins see up to "
            "39% higher click-through rates than standard Pins "
            "(Pinterest Business)"
        ),
    ),
    # 4. No UGC gallery → add gallery app
    (
        lambda s, _score: not s.has_ugc_gallery,
        (
            "Add a UGC gallery app (e.g. SnapWidget, EmbedSocial) "
            "\u2014 79% of consumers say user-generated content highly "
            "impacts purchasing decisions (Stackla)"
        ),
    ),
    # 5. Only 1 platform → expand to 2+
    (
        lambda s, _score: s.platform_count == 1,
        (
            "Expand to at least 2 social platforms \u2014 multi-platform "
            "social commerce strategies increase reach and reduce "
            "dependency on a single channel"
        ),
    ),
    # 6. No Instagram → add Instagram
    (
        lambda s, _score: not s.has_instagram_embed,
        (
            "Add Instagram embeds \u2014 Instagram-referred traffic "
            "converts at 74\u2013161% higher rates than average social "
            "traffic (Shopify)"
        ),
    ),
    # 7. Congratulatory — strong social commerce presence
    (
        lambda s, score: score >= 80,
        (
            "Excellent social commerce presence \u2014 your store "
            "leverages multiple social platforms and UGC to drive "
            "engagement and conversions"
        ),
    ),
]


def get_social_commerce_tips(signals: SocialCommerceSignals) -> list[str]:
    """Return up to 3 research-backed social commerce improvement tips.

    Tips are selected based on which social commerce signals are missing
    or weak, prioritised by conversion impact (most impactful first).

    Args:
        signals: Extracted social commerce signals.

    Returns:
        A list of 0–3 tip strings.
    """
    score = score_social_commerce(signals)
    tips: list[str] = []

    for condition, tip in _TIP_RULES:
        if condition(signals, score):
            tips.append(tip)
            if len(tips) >= 3:
                break

    return tips


# ---------------------------------------------------------------------------
# Per-check breakdown (for UI "What's working / What's missing" lists)
# ---------------------------------------------------------------------------


def list_social_commerce_checks(signals: SocialCommerceSignals) -> list[dict]:
    """Enumerate the social commerce rubric's individual pass/fail checks."""
    any_platform = bool(
        signals.has_instagram_embed
        or signals.has_tiktok_embed
        or signals.has_pinterest
    )
    return [
        {
            "id": "any_platform_embed",
            "label": "At least one social platform embed (Instagram, TikTok, or Pinterest)",
            "passed": any_platform,
            "weight": 30,
        },
        {
            "id": "ugc_gallery",
            "label": "User-generated content gallery app",
            "passed": bool(signals.has_ugc_gallery),
            "weight": 25,
        },
        {
            "id": "tiktok_embed",
            "label": "TikTok integration",
            "passed": bool(signals.has_tiktok_embed),
            "weight": 15,
        },
        {
            "id": "pinterest",
            "label": "Pinterest integration",
            "passed": bool(signals.has_pinterest),
            "weight": 10,
        },
        {
            "id": "platforms_2plus",
            "label": "Two or more social platforms",
            "passed": signals.platform_count >= 2,
            "weight": 10,
        },
        {
            "id": "platforms_3",
            "label": "All three platforms (Instagram + TikTok + Pinterest)",
            "passed": signals.platform_count >= 3,
            "weight": 10,
        },
    ]
