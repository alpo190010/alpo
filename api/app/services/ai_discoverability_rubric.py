"""AI Discoverability rubric — scoring and tip generation."""

from app.services.ai_discoverability_detector import AiDiscoverabilitySignals


def score_ai_discoverability(signals: AiDiscoverabilitySignals) -> int:
    """Score AI discoverability 0-100.

    Two scoring paths:
      Path A (full data): robots.txt + llms.txt data available (40 pts) + HTML (60 pts)
      Path B (HTML-only): redistributed weights when external data is missing
    """
    if signals.robots_txt_exists is not None:
        return _score_path_a(signals)
    return _score_path_b(signals)


def _score_path_a(signals: AiDiscoverabilitySignals) -> int:
    """Full scoring with robots.txt and llms.txt data.

    Breakdown (max ~100):
      robots.txt exists .............. 5
      AI search bots allowed (x3) ... 5 each = 15
      AI training bots blocked (x4) . 2.5 each = 10
      llms.txt exists ............... 10
      Core OG tags (x4) ............. 3 each = 12
      Product price OG tags (x2) .... 4 each = 8
      Structured specs .............. 10
      FAQ content ................... 10
      Spec density .................. 10
      Wildcard block penalty ........ -10
    """
    score = 0

    # robots.txt
    if signals.robots_txt_exists:
        score += 5
    score += signals.ai_search_bots_allowed_count * 5     # 0-15
    score += int(signals.ai_training_bots_blocked_count * 2.5)  # 0-10

    # llms.txt
    if signals.llms_txt_exists:
        score += 10

    # OpenGraph core tags
    if signals.has_og_type:
        score += 3
    if signals.has_og_title:
        score += 3
    if signals.has_og_description:
        score += 3
    if signals.has_og_image:
        score += 3

    # Product price OG tags
    if signals.has_product_price_amount:
        score += 4
    if signals.has_product_price_currency:
        score += 4

    # Entity density
    if signals.has_structured_specs or signals.has_spec_table:
        score += 10
    if signals.has_faq_content:
        score += 10
    if signals.spec_mention_count >= 5:
        score += 10
    elif signals.spec_mention_count >= 3:
        score += 7
    elif signals.spec_mention_count >= 1:
        score += 3

    # Wildcard block penalty
    if signals.has_wildcard_block:
        score -= 10

    return max(0, min(100, score))


def _score_path_b(signals: AiDiscoverabilitySignals) -> int:
    """HTML-only scoring when robots.txt/llms.txt data is unavailable.

    Breakdown (max 100):
      Core OG tags (x4) ............. 5 each = 20
      Product price OG tags (x2) .... 7.5 each = 15
      Structured specs .............. 20
      FAQ content ................... 20
      Spec density .................. 15
      Measurement units ............. 10
    """
    score = 0

    # OpenGraph core tags (higher weight)
    if signals.has_og_type:
        score += 5
    if signals.has_og_title:
        score += 5
    if signals.has_og_description:
        score += 5
    if signals.has_og_image:
        score += 5

    # Product price OG tags (higher weight)
    if signals.has_product_price_amount:
        score += 8  # rounded from 7.5
    if signals.has_product_price_currency:
        score += 7

    # Entity density (higher weights)
    if signals.has_structured_specs or signals.has_spec_table:
        score += 20
    if signals.has_faq_content:
        score += 20
    if signals.spec_mention_count >= 5:
        score += 15
    elif signals.spec_mention_count >= 3:
        score += 10
    elif signals.spec_mention_count >= 1:
        score += 5

    # Measurement units
    if signals.has_measurement_units:
        score += 10

    return max(0, min(100, score))


# ── Tip rules ────────────────────────────────────────────────────

_TIP_RULES: list[tuple] = [
    # 1. No OG tags at all
    (
        lambda s, _score: s.og_tag_count == 0,
        "Add OpenGraph meta tags (og:title, og:description, og:image, og:type) — AI shopping assistants like ChatGPT and Perplexity extract product metadata from these tags to build recommendations. AI-referred visitors convert 31% more than traditional search (Adobe)",
    ),
    # 2. Missing product price OG tags
    (
        lambda s, _score: not s.has_product_price_amount or not s.has_product_price_currency,
        "Add product:price:amount and product:price:currency meta tags — these allow AI agents to compare prices and recommend your product directly, with AI-referred shoppers spending 32% more time on page and having 27% lower bounce rates",
    ),
    # 3. AI search bots blocked (only when we have robots.txt data)
    (
        lambda s, _score: s.robots_txt_exists is True and s.ai_search_bots_allowed_count == 0,
        "Allow AI search bots (OAI-SearchBot, PerplexityBot, Claude-SearchBot) in robots.txt — blocking them makes your products invisible to AI shopping, which grew 4,700% YoY. You can block training bots (GPTBot, Google-Extended) separately to protect content",
    ),
    # 4. Wildcard block detected
    (
        lambda s, _score: s.has_wildcard_block,
        "Your robots.txt has a wildcard User-agent: * block with Disallow: / — this prevents all bots including AI search engines from discovering your products. Add specific Allow rules for AI search bots while keeping training bots blocked",
    ),
    # 5. No llms.txt
    (
        lambda s, _score: s.llms_txt_exists is False,
        "Add an /llms.txt file to help AI models understand your store — over 844,000 websites have implemented this lightweight file that tells AI assistants what your store sells and how to navigate it",
    ),
    # 6. No FAQ content
    (
        lambda s, _score: not s.has_faq_content,
        "Add FAQ content or FAQPage schema to your product page — question-answer format is the primary pattern AI models use when recommending products. ChatGPT accounts for 97% of LLM-referred e-commerce sessions (1.81% conversion rate)",
    ),
    # 7. Low spec density
    (
        lambda s, _score: s.spec_mention_count < 3 and not s.has_spec_table,
        "Include concrete specifications (dimensions, weight, materials) in structured lists or tables — AI agents need extractable attributes to make accurate product comparisons. Perplexity shoppers have 57% higher AOV ($320+ vs $204)",
    ),
    # 8. Congratulatory
    (
        lambda s, score: score >= 80,
        "Strong AI discoverability — your page is well-optimized for AI shopping assistants with proper meta tags, structured content, and bot access. AI-referred traffic grew 4,700% YoY and converts at significantly higher rates",
    ),
]


def get_ai_discoverability_tips(signals: AiDiscoverabilitySignals) -> list[str]:
    """Return up to 3 actionable tips, highest impact first."""
    score = score_ai_discoverability(signals)
    tips: list[str] = []
    for condition, tip in _TIP_RULES:
        if condition(signals, score):
            tips.append(tip)
            if len(tips) >= 3:
                break
    return tips
