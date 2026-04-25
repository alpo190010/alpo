"""Scoring rubric and tip selector for product image and media signals.

Converts :class:`ImageSignals` into a deterministic 0\u2013100 score using
weighted criteria derived from Salsify, Baymard Institute, and industry
research on product imagery and conversion optimisation, and selects up to 3
prioritised improvement tips.
"""

from __future__ import annotations

from app.services.images_detector import ImageSignals


# ---------------------------------------------------------------------------
# Scoring rubric
# ---------------------------------------------------------------------------


def score_images(signals: ImageSignals) -> int:
    """Compute a 0\u2013100 product images score from extracted signals.

    Weighted criteria (max 100 pts total):

        Image count (tiered):                              35 pts
        Product video:                                     15 pts
        Alt text quality (continuous):                     15 pts
        Zoom / lightbox capability:                        10 pts
        Modern format (WebP / AVIF):                        5 pts
        High-resolution sources:                            5 pts
        Lifestyle / in-context images:                      5 pts
        360-degree / spin viewer:                           5 pts
        CDN hosting:                                        5 pts

    Returns:
        Integer clamped to 0\u2013100.
    """
    score = 0

    # Image count (35 pts tiered)
    if signals.image_count >= 8:
        score += 35
    elif signals.image_count >= 5:
        score += 25
    elif signals.image_count >= 3:
        score += 10

    # Video (15 pts)
    if signals.has_video:
        score += 15

    # Alt text (0-15 pts continuous)
    score += round(signals.alt_text_score * 15)

    # Zoom (10 pts)
    if signals.has_zoom:
        score += 10

    # Modern format (5 pts)
    if signals.has_modern_format:
        score += 5

    # High-res (5 pts)
    if signals.has_high_res:
        score += 5

    # Lifestyle (5 pts)
    if signals.has_lifestyle_images:
        score += 5

    # 360 view (5 pts)
    if signals.has_360_view:
        score += 5

    # CDN (5 pts)
    if signals.cdn_hosted:
        score += 5

    return max(0, min(100, score))


# ---------------------------------------------------------------------------
# Tip selector
# ---------------------------------------------------------------------------

# Tips ordered by impact priority (highest first). Each entry is a
# (condition_callable, tip_string) pair. The condition receives the
# signals *and* the computed score.

_TIP_RULES: list[tuple] = [
    # 1. Very few images \u2014 biggest conversion lever
    (
        lambda s, _score: s.image_count < 3,
        (
            "Add more product images (aim for 5\u20138) \u2014 going from 1 to 5+ "
            "images increases conversion up to 48% (Salsify study across "
            "millions of Amazon products)."
        ),
    ),
    # 2. No product video
    (
        lambda s, _score: not s.has_video,
        (
            "Add a product video \u2014 product pages with video see 6\u201330% "
            "higher conversion and 37% more add-to-cart clicks "
            "(Gumlet, Xictron)."
        ),
    ),
    # 3. Poor alt text quality
    (
        lambda s, _score: s.alt_text_score < 0.5,
        (
            "Improve image alt text quality \u2014 descriptive, unique alt text "
            "can increase organic traffic by 30% and is required for "
            "accessibility compliance."
        ),
    ),
    # 4. No zoom / lightbox
    (
        lambda s, _score: not s.has_zoom,
        (
            "Enable image zoom or a lightbox \u2014 42% of shoppers gauge product "
            "size from images alone, and 28% of sites lack any scale reference "
            "(Baymard Institute)."
        ),
    ),
    # 5. Low-mid image count \u2014 add variety
    (
        lambda s, _score: 3 <= s.image_count <= 4,
        (
            "Add more image variety (aim for 5\u20138 types) \u2014 66% of shoppers "
            "want 3+ images but conversion peaks with diverse image types "
            "including lifestyle and scale shots."
        ),
    ),
    # 6. No lifestyle images (when image count is reasonable)
    (
        lambda s, _score: not s.has_lifestyle_images and s.image_count >= 3,
        (
            "Add lifestyle/in-context photos \u2014 contextual imagery drives 38% "
            "higher conversion when demographics match the target buyer "
            "(Baymard Institute)."
        ),
    ),
    # 7. No modern image format
    (
        lambda s, _score: not s.has_modern_format,
        (
            "Use modern compressed image formats (WebP or AVIF) instead "
            "of JPEG. They cut image file size 25\u201350% with no visible "
            "difference, making your pages faster \u2014 which Google "
            "rewards in search ranking."
        ),
    ),
    # 8. No 360 view (when images are already plentiful)
    (
        lambda s, _score: not s.has_360_view and s.image_count >= 5,
        (
            "Consider adding 360-degree product views \u2014 spin viewers increase "
            "conversion by 27% by reducing product uncertainty "
            "(DueMaternity.com case study, CXL)."
        ),
    ),
    # 9. Congratulatory \u2014 excellent imagery
    (
        lambda s, score: score >= 85,
        (
            "Excellent product imagery \u2014 your store uses diverse image types, "
            "video, zoom capability, and optimized formats. This is a strong "
            "competitive advantage."
        ),
    ),
]


def get_images_tips(signals: ImageSignals) -> list[str]:
    """Return up to 3 research-backed product image improvement tips.

    Tips are selected based on which image signals are missing or
    weak, prioritised by conversion impact (most impactful first).

    Args:
        signals: Extracted product image and media signals.

    Returns:
        A list of 0\u20133 tip strings.
    """
    score = score_images(signals)
    tips: list[str] = []

    for condition, tip in _TIP_RULES:
        if condition(signals, score):
            tips.append(tip)
            if len(tips) >= 3:
                break

    return tips
