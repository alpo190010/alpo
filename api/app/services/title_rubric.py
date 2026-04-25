"""Title & SEO scoring rubric and tip selection.

Scores 0–100 based on 10 weighted criteria derived from conversion research.
Returns up to 3 actionable tips ordered by impact.
"""

from app.services.title_detector import TitleSignals


def score_title(signals: TitleSignals) -> int:
    """Score 0–100 based on title & SEO signals."""
    score = 0

    # H1 present and non-empty: 20 pts
    if signals.has_h1:
        score += 20

    # Exactly one H1 on page: 10 pts
    if signals.has_single_h1:
        score += 10

    # H1 length <= 80 chars: 10 pts (only if H1 exists)
    if signals.has_h1 and signals.h1_length <= 80:
        score += 10

    # Meta title length <= 60 chars: 10 pts (only if meta title exists)
    if signals.meta_title is not None and signals.meta_title_length <= 60:
        score += 10

    # Brand name present in title: 15 pts
    if signals.has_brand_in_title:
        score += 15

    # No keyword stuffing: 10 pts
    if not signals.has_keyword_stuffing:
        score += 10

    # Not ALL CAPS: 5 pts
    if not signals.is_all_caps:
        score += 5

    # No promotional text in title: 5 pts
    if not signals.has_promotional_text:
        score += 5

    # H1 and meta title differ: 10 pts
    if signals.h1_meta_differ:
        score += 10

    # Title contains specifics: 5 pts
    if signals.has_specifics:
        score += 5

    return max(0, min(100, score))


# Tip rules: (condition, tip_text) ordered by impact.
_TIP_RULES: list[tuple] = [
    (
        lambda s, _score: not s.has_h1,
        "Add a clear product title in an H1 tag \u2014 products with proper heading "
        "hierarchy see 12\u201315% better organic click-through rates",
    ),
    (
        lambda s, _score: s.has_h1 and not s.has_brand_in_title and s.brand_name is not None,
        "Include your brand name in the product title \u2014 97% of top-performing "
        "product titles include the brand name (Store Growers)",
    ),
    (
        lambda s, _score: s.meta_title is not None and s.meta_title_length > 60,
        "Shorten your search-result title to under 60 characters. "
        "Longer titles get cut off in Google, which lowers click-through "
        "by about 20%",
    ),
    (
        lambda s, _score: s.has_h1 and s.h1_length > 80,
        "Trim your H1 product title to under 80 characters \u2014 concise titles "
        "improve scannability and conversion",
    ),
    (
        lambda s, _score: s.has_keyword_stuffing,
        "Remove repeated keywords from your title \u2014 keyword stuffing reduces "
        "trust and may trigger Google penalties",
    ),
    (
        lambda s, _score: s.is_all_caps,
        "Avoid ALL CAPS in product titles \u2014 mixed case titles have 40% higher "
        "readability and feel more trustworthy",
    ),
    (
        lambda s, _score: s.has_promotional_text,
        "Remove promotional language (Sale!, Free Shipping!) from your product "
        "title \u2014 SEO titles should describe the product, not the deal",
    ),
    (
        lambda s, _score: s.has_h1 and s.meta_title is not None and not s.h1_meta_differ,
        "Differentiate your H1 and meta title \u2014 the H1 can be descriptive "
        "(up to 80 chars) while the meta title should be optimized for SERP "
        "display under 60 characters",
    ),
    (
        lambda s, _score: s.h1_count > 1,
        "Use only one H1 tag per page \u2014 multiple H1s confuse search engine "
        "crawlers and dilute heading hierarchy",
    ),
    (
        lambda s, score: score >= 85,
        "Excellent title SEO \u2014 your product title includes brand, key "
        "attributes, and is properly structured for both search and conversion",
    ),
]


def get_title_tips(signals: TitleSignals) -> list[str]:
    """Return up to 3 actionable tips based on detected signals."""
    score = score_title(signals)
    tips: list[str] = []

    for condition, tip in _TIP_RULES:
        if condition(signals, score):
            tips.append(tip)
            if len(tips) >= 3:
                break

    return tips
