"""Scoring rubric and tip selector for description quality signals.

Converts :class:`DescriptionSignals` into a deterministic 0–100 score using
weighted NLP criteria derived from Baymard Institute, NNGroup, and
readability research, and selects up to 3 prioritised improvement tips.
"""

from __future__ import annotations

from app.services.description_detector import DescriptionSignals


# ---------------------------------------------------------------------------
# Scoring rubric
# ---------------------------------------------------------------------------


def score_description(signals: DescriptionSignals) -> int:
    """Compute a 0–100 description quality score from extracted signals.

    Weighted criteria (max 100 pts total):

        Word count in optimal range (100–400):          20 pts
        Flesch-Kincaid grade level 6–8:                 15 pts
        Average sentence length 10–20 words:            10 pts
        Benefit-to-feature ratio 0.4–0.6:               20 pts
        Emotional/persuasive language density 3–8%:      10 pts
        HTML tag variety (4+ distinct types):            15 pts
        Has headings (h2/h3):                             5 pts
        Has bullet lists (ul/ol):                         5 pts

    Returns:
        Integer clamped to 0–100.
    """
    if not signals.description_found:
        return 0

    score = 0

    # Word count (20 pts)
    wc = signals.word_count
    if 100 <= wc <= 400:
        score += 20
    elif (50 <= wc < 100) or (400 < wc <= 600):
        score += 10

    # Flesch-Kincaid grade level (15 pts)
    fk = signals.flesch_kincaid_grade
    if 6.0 <= fk <= 8.0:
        score += 15
    elif (4.0 <= fk < 6.0) or (8.0 < fk <= 10.0):
        score += 8

    # Average sentence length (10 pts)
    asl = signals.avg_sentence_length
    if 10.0 <= asl <= 20.0:
        score += 10
    elif (8.0 <= asl < 10.0) or (20.0 < asl <= 25.0):
        score += 5

    # Benefit-to-feature ratio (20 pts)
    br = signals.benefit_ratio
    total_bf = signals.benefit_word_count + signals.feature_word_count
    if total_bf > 0:
        if 0.4 <= br <= 0.6:
            score += 20
        elif (0.25 <= br < 0.4) or (0.6 < br <= 0.75):
            score += 10

    # Emotional language density (10 pts)
    ed = signals.emotional_density
    if 0.03 <= ed <= 0.08:
        score += 10
    elif (0.01 <= ed < 0.03) or (0.08 < ed <= 0.12):
        score += 5

    # HTML tag variety (15 pts)
    tv = signals.html_tag_variety
    if tv >= 7:
        score += 15
    elif tv >= 4:
        score += 12
    elif tv >= 1:
        score += 6

    # Headings (5 pts)
    if signals.has_headings:
        score += 5

    # Bullet lists (5 pts)
    if signals.has_bullet_lists:
        score += 5

    return max(0, min(100, score))


# ---------------------------------------------------------------------------
# Tip selector
# ---------------------------------------------------------------------------

# Tips ordered by impact priority (highest first). Each entry is a
# (condition_callable, tip_string) pair. The condition receives the
# signals *and* the computed score.

_TIP_RULES: list[tuple] = [
    # 1. No description at all
    (
        lambda s, _score: not s.description_found,
        (
            "Add a product description \u2014 87% of shoppers consider "
            "descriptions the most important purchase factor, and "
            "optimised descriptions increase conversions up to 127% "
            "(Salsify/ButterflAI)"
        ),
    ),
    # 2. Word count too low (<50)
    (
        lambda s, _score: s.description_found and s.word_count < 50,
        (
            "Your description is too thin \u2014 aim for 100\u2013300 words "
            "to give shoppers enough information to buy with confidence"
        ),
    ),
    # 3. No bullet lists
    (
        lambda s, _score: s.description_found and not s.has_bullet_lists,
        (
            "Add bullet points to your description \u2014 only 16% of users "
            "read word-for-word; scannable layouts with bullets increase "
            "time-on-page by 47% (NNGroup/Plytix)"
        ),
    ),
    # 4. No headings
    (
        lambda s, _score: s.description_found and not s.has_headings,
        (
            "Break your description into sections with H2/H3 headings \u2014 "
            "structured descriptions increase readability and reduce "
            "returns (Baymard Institute)"
        ),
    ),
    # 5. Feature-heavy copy (ratio < 0.3)
    (
        lambda s, _score: (
            s.description_found
            and s.benefit_ratio < 0.3
            and (s.benefit_word_count + s.feature_word_count) > 3
        ),
        (
            "Rewrite to lead with benefits over features \u2014 benefit-led "
            "copy converts 12\u201324% better than specification-heavy "
            "descriptions (MarketingExperiments)"
        ),
    ),
    # 6. FK grade too high (>10)
    (
        lambda s, _score: s.description_found and s.flesch_kincaid_grade > 10,
        (
            "Simplify your language \u2014 your description reads above a "
            "high-school level. Aim for short sentences a middle-schooler "
            "could follow easily; that's where conversions peak in "
            "reading-level studies"
        ),
    ),
    # 7. No emotional language (<1%)
    (
        lambda s, _score: s.description_found and s.emotional_density < 0.01,
        (
            "Add persuasive language \u2014 descriptions with 3\u20138% "
            "emotional words see measurably higher engagement and "
            "add-to-cart rates"
        ),
    ),
    # 8. Word count too high (>600)
    (
        lambda s, _score: s.description_found and s.word_count > 600,
        (
            "Trim your description \u2014 descriptions over 600 words "
            "risk losing shoppers before they reach the buy button"
        ),
    ),
    # 9. Plain text (no formatting tags)
    (
        lambda s, _score: s.description_found and s.html_tag_variety == 0,
        (
            "Add HTML formatting \u2014 plain text walls are skipped by "
            "79% of scanners. Use bold, bullets, and images to structure "
            "your description (NNGroup)"
        ),
    ),
    # 10. Congratulatory — strong description
    (
        lambda s, score: score >= 85,
        (
            "Excellent description quality \u2014 your product description "
            "is well-structured, benefit-focused, and readable"
        ),
    ),
]


def get_description_tips(signals: DescriptionSignals) -> list[str]:
    """Return up to 3 research-backed description improvement tips.

    Tips are selected based on which description signals are missing or
    weak, prioritised by conversion impact (most impactful first).

    Args:
        signals: Extracted description quality signals.

    Returns:
        A list of 0\u20133 tip strings.
    """
    score = score_description(signals)
    tips: list[str] = []

    for condition, tip in _TIP_RULES:
        if condition(signals, score):
            tips.append(tip)
            if len(tips) >= 3:
                break

    return tips
