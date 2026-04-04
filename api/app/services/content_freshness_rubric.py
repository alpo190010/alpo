"""Content Freshness rubric — scoring and tip generation."""

from app.services.content_freshness_detector import ContentFreshnessSignals


def score_content_freshness(signals: ContentFreshnessSignals) -> int:
    """Score content freshness 0-100.

    Two scoring paths:
      Path A (full data): Last-Modified header available (20 pts) + HTML (80 pts)
      Path B (HTML-only): redistributed weights when HTTP header data is missing
    """
    if signals.last_modified_age_days is not None:
        return _score_path_a(signals)
    return _score_path_b(signals)


def _score_path_a(signals: ContentFreshnessSignals) -> int:
    """Full scoring with Last-Modified header data.

    Breakdown (max 100):
      Last-Modified freshness ..... 20
      Copyright year current ...... 15
      No expired promotions ....... 15
      No seasonal mismatch ........ 10
      Schema dateModified fresh ... 15
      Review freshness ............ 15
      New label not stale ......... 5
      Time elements fresh ......... 5
    """
    score = 0

    # Last-Modified header freshness
    days = signals.last_modified_age_days
    if days is not None:
        if days <= 30:
            score += 20
        elif days <= 90:
            score += 14
        elif days <= 180:
            score += 8
        elif days <= 365:
            score += 4

    # Copyright year
    if signals.copyright_year_is_current is True:
        score += 15
    elif signals.copyright_year_is_current is False:
        from datetime import datetime
        if signals.copyright_year and signals.copyright_year == datetime.now().year - 1:
            score += 8
        # else: 0 for older
    else:
        score += 5  # Not found → neutral

    # Expired promotions
    if not signals.has_expired_promotion:
        score += 15

    # Seasonal mismatch
    if not signals.has_seasonal_mismatch:
        score += 10

    # Schema dateModified
    dm_days = signals.date_modified_age_days
    if dm_days is not None:
        if dm_days <= 30:
            score += 15
        elif dm_days <= 90:
            score += 10
        elif dm_days <= 180:
            score += 6
        elif dm_days <= 365:
            score += 3
    elif signals.date_modified_iso is None:
        score += 3  # Missing → small neutral

    # Review freshness
    rs = signals.review_staleness
    if rs == "fresh":
        score += 15
    elif rs == "warning":
        score += 7
    elif rs == "critical":
        pass  # 0
    else:
        score += 5  # No reviews → neutral

    # New label
    if not signals.has_new_label or not signals.new_label_is_stale:
        score += 5

    # Time elements
    if signals.time_element_count >= 1 and signals.most_recent_time_age_days is not None:
        if signals.most_recent_time_age_days <= 90:
            score += 5
        else:
            score += 2

    return max(0, min(100, score))


def _score_path_b(signals: ContentFreshnessSignals) -> int:
    """HTML-only scoring when Last-Modified header data is unavailable.

    Breakdown (max 100):
      Copyright year current ...... 20
      No expired promotions ....... 20
      No seasonal mismatch ........ 15
      Schema dateModified fresh ... 15
      Review freshness ............ 15
      New label not stale ......... 8
      Time elements fresh ......... 7
    """
    score = 0

    # Copyright year (higher weight)
    if signals.copyright_year_is_current is True:
        score += 20
    elif signals.copyright_year_is_current is False:
        from datetime import datetime
        if signals.copyright_year and signals.copyright_year == datetime.now().year - 1:
            score += 10
    else:
        score += 8  # Not found → neutral

    # Expired promotions (higher weight)
    if not signals.has_expired_promotion:
        score += 20

    # Seasonal mismatch (higher weight)
    if not signals.has_seasonal_mismatch:
        score += 15

    # Schema dateModified
    dm_days = signals.date_modified_age_days
    if dm_days is not None:
        if dm_days <= 30:
            score += 15
        elif dm_days <= 90:
            score += 10
        elif dm_days <= 180:
            score += 6
        elif dm_days <= 365:
            score += 3
    elif signals.date_modified_iso is None:
        score += 5  # Missing → neutral

    # Review freshness
    rs = signals.review_staleness
    if rs == "fresh":
        score += 15
    elif rs == "warning":
        score += 7
    elif rs == "critical":
        pass  # 0
    else:
        score += 5  # No reviews → neutral

    # New label
    if not signals.has_new_label or not signals.new_label_is_stale:
        score += 8

    # Time elements
    if signals.time_element_count >= 1 and signals.most_recent_time_age_days is not None:
        if signals.most_recent_time_age_days <= 90:
            score += 7
        else:
            score += 3

    return max(0, min(100, score))


# ── Tip rules ────────────────────────────────────────────────────

_TIP_RULES: list[tuple] = [
    # 1. Expired promotion (highest impact — actively harms trust)
    (
        lambda s, _score: s.has_expired_promotion,
        "Remove expired promotions — references to past events like Black Friday 2024 signal neglected content. 38% of consumers won't purchase if page content appears outdated (BrightLocal)",
    ),
    # 2. Copyright year outdated
    (
        lambda s, _score: s.copyright_year_is_current is False,
        "Update your copyright year — an outdated footer year is the most visible freshness signal to shoppers and AI crawlers. AI-cited content is 25.7% fresher than traditional organic results (Ahrefs)",
    ),
    # 3. Reviews critical (>12 months)
    (
        lambda s, _score: s.review_staleness == "critical",
        "Your most recent review is over 12 months old — 44% of consumers want reviews from the past month, and 38% won't buy if reviews are older than 90 days. Set up automated post-purchase review request emails",
    ),
    # 4. Reviews warning (>90 days)
    (
        lambda s, _score: s.review_staleness == "warning",
        "Your reviews are aging — the most recent is over 90 days old. 64% of consumers prefer fewer recent reviews over many older ones. Automated post-purchase emails can generate a steady stream of fresh social proof",
    ),
    # 5. Seasonal mismatch
    (
        lambda s, _score: s.has_seasonal_mismatch,
        "Seasonal content mismatch detected — update seasonal keywords and imagery to match the current season. Stale seasonal references reduce perceived relevance for both shoppers and AI recommendations",
    ),
    # 6. Stale "New" label
    (
        lambda s, _score: s.new_label_is_stale,
        "Remove or update 'New' badges on products published over 90 days ago — stale 'new' labels undermine trust and credibility. Use datePublished schema to let AI accurately assess product recency",
    ),
    # 7. No dateModified in schema
    (
        lambda s, _score: s.date_modified_iso is None and s.date_modified_age_days is None,
        "Add dateModified to your Product schema markup — AI shopping assistants use this to prioritize fresh content. 65% of AI bot crawl hits target content published in just the past year (Seer Interactive)",
    ),
    # 8. Congratulatory
    (
        lambda s, score: score >= 80,
        "Strong content freshness — your page shows current dates, timely promotions, and recent reviews. Fresh content signals relevance to both shoppers and AI recommendation engines that increasingly favor recent information",
    ),
]


def get_content_freshness_tips(signals: ContentFreshnessSignals) -> list[str]:
    """Return up to 3 actionable tips, highest impact first."""
    score = score_content_freshness(signals)
    tips: list[str] = []
    for condition, tip in _TIP_RULES:
        if condition(signals, score):
            tips.append(tip)
            if len(tips) >= 3:
                break
    return tips
