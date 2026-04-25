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
        "Make sure your product title, description, image, and category show up clearly when someone shares your link on social media or in an AI chat. AI shopping tools (ChatGPT, Perplexity) use this info to recommend products — and AI-referred shoppers convert 31% more often than regular search visitors (Adobe).",
    ),
    # 2. Missing product price OG tags
    (
        lambda s, _score: not s.has_product_price_amount or not s.has_product_price_currency,
        "Add your price and currency to your product info so AI shopping tools can quote it accurately. Shoppers who arrive via AI tools spend 32% longer on the page and bounce 27% less often.",
    ),
    # 3. AI search bots blocked (only when we have robots.txt data)
    (
        lambda s, _score: s.robots_txt_exists is True and s.ai_search_bots_allowed_count == 0,
        "Let AI shopping assistants (the ones inside ChatGPT, Perplexity, and Claude) find your store. They're currently blocked, which makes you invisible to a market that grew 4,700% in the past year. You can still block AI training bots separately so your content isn't used to train models.",
    ),
    # 4. Wildcard block detected
    (
        lambda s, _score: s.has_wildcard_block,
        "Your store's bot rules currently block every robot, including Google and AI shopping assistants. That stops you from showing up in any search. Allow the search bots in while keeping training bots out.",
    ),
    # 5. No llms.txt
    (
        lambda s, _score: s.llms_txt_exists is False,
        "Add an AI-friendly site summary to your store — a small text file at /llms.txt that tells AI shopping tools what you sell and how to navigate. Over 844,000 sites already have one. Think of it as a store map written for robots.",
    ),
    # 6. No FAQ content
    (
        lambda s, _score: not s.has_faq_content,
        "Add a FAQ section to your product pages (sizing, shipping, returns, care). AI shopping tools quote your answers directly when shoppers ask questions. ChatGPT alone drives 97% of AI-referred shopping sessions, with shoppers buying at 1.81%.",
    ),
    # 7. Low spec density
    (
        lambda s, _score: s.spec_mention_count < 3 and not s.has_spec_table,
        "Add concrete specifications (size, weight, materials) to your product page in a clear list or table. AI shopping tools rely on these to match products to what shoppers are looking for. Perplexity shoppers spend 57% more per order ($320+ vs $204).",
    ),
    # 8. Congratulatory
    (
        lambda s, score: score >= 80,
        "Strong AI discoverability — your store is well set up for AI shopping assistants. AI-referred shopping grew 4,700% in the past year and these shoppers convert at higher rates than search.",
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


# ---------------------------------------------------------------------------
# Per-check breakdown (for UI "What's working / What's missing" lists)
# ---------------------------------------------------------------------------


def list_ai_discoverability_checks(
    signals: AiDiscoverabilitySignals,
) -> list[dict]:
    """Enumerate AI discoverability pass/fail checks.

    Path A (robots.txt + llms.txt data available) adds robots/llms checks
    plus a wildcard-block check. HTML-derived checks (OG tags, product
    price tags, structured specs, FAQ, spec density) are always emitted.
    Weights use Path A values when available, Path B values otherwise.
    """
    has_path_a = signals.robots_txt_exists is not None
    checks: list[dict] = []

    if has_path_a:
        checks.append({
            "id": "robots_txt_exists",
            "label": "Bot access rules in place for your store",
            "passed": bool(signals.robots_txt_exists),
            "weight": 5,
            "remediation": (
                "Your store needs a small file (called robots.txt) at "
                "the root of your domain that tells search and AI bots "
                "what they can access. Shopify creates one for you "
                "automatically — if yours is missing, your theme "
                "developer can add it back in a minute."
            ),
        })
        checks.append({
            "id": "ai_search_bots_allowed",
            "label": "AI shopping assistants can find your store",
            "passed": signals.ai_search_bots_allowed_count >= 3,
            "weight": 15,
            "remediation": (
                "ChatGPT, Perplexity, and Claude each use their own "
                "bots to find products to recommend. Your bot rules "
                "currently block them, which means your store doesn't "
                "show up when shoppers ask these AI tools for product "
                "recommendations. Allow them in (your theme developer "
                "can add the rules below to your store)."
            ),
            "code": (
                "# Append to /robots.txt\n"
                "User-agent: OAI-SearchBot\n"
                "Allow: /\n\n"
                "User-agent: PerplexityBot\n"
                "Allow: /\n\n"
                "User-agent: Claude-SearchBot\n"
                "Allow: /"
            ),
        })
        checks.append({
            "id": "ai_training_bots_blocked",
            "label": "AI model training bots blocked",
            "passed": signals.ai_training_bots_blocked_count >= 4,
            "weight": 10,
            "remediation": (
                "AI companies use separate bots to gather text for "
                "training new AI models — these are different from the "
                "shopping bots above. Blocking them keeps your product "
                "descriptions and copy out of training datasets, "
                "without affecting whether AI shopping assistants can "
                "recommend your store."
            ),
            "code": (
                "# Append to /robots.txt\n"
                "User-agent: GPTBot\n"
                "Disallow: /\n\n"
                "User-agent: Google-Extended\n"
                "Disallow: /\n\n"
                "User-agent: CCBot\n"
                "Disallow: /\n\n"
                "User-agent: Claude-Web\n"
                "Disallow: /"
            ),
        })
        checks.append({
            "id": "llms_txt_exists",
            "label": "AI-friendly site map published",
            "passed": bool(signals.llms_txt_exists),
            "weight": 10,
            "remediation": (
                "Add a small text file (at /llms.txt) that tells AI "
                "shopping tools what your store sells and how to "
                "navigate it — like a store map written for robots. "
                "Include your store name, main categories, top "
                "products, and policy links."
            ),
            "code": (
                "# /llms.txt — example skeleton\n"
                "# {{ shop.name }}\n\n"
                "> {{ shop.description | default: 'Short store description' }}\n\n"
                "## Collections\n"
                "- [All products](https://{{ shop.permanent_domain }}/collections/all)\n\n"
                "## Policies\n"
                "- [Shipping](https://{{ shop.permanent_domain }}/policies/shipping-policy)\n"
                "- [Returns](https://{{ shop.permanent_domain }}/policies/refund-policy)\n"
            ),
        })
        checks.append({
            "id": "no_wildcard_block",
            "label": "Store isn't blocking every robot",
            "passed": not signals.has_wildcard_block,
            "weight": 10,
            "remediation": (
                "Your bot rules currently block every robot from your "
                "store — including Google and the AI shopping "
                "assistants you actually want sending you traffic. "
                "Your theme developer can fix this by removing the "
                "blanket block and adding specific rules instead."
            ),
        })

    og_weight = 3 if has_path_a else 5
    price_amount_weight = 4 if has_path_a else 8
    price_currency_weight = 4 if has_path_a else 7
    specs_weight = 10 if has_path_a else 20
    faq_weight = 10 if has_path_a else 20
    spec_density_weight = 10 if has_path_a else 15

    checks.extend([
        {
            "id": "og_type",
            "label": "Page type tagged for social and AI tools",
            "passed": bool(signals.has_og_type),
            "weight": og_weight,
            "remediation": (
                "Tell social platforms and AI tools whether each page "
                "is a product or your home page. Modern Shopify themes "
                "do this automatically — older themes may not. Your "
                "theme developer can add it in minutes."
            ),
            "code": (
                "<!-- theme.liquid <head> -->\n"
                "{%- if template.name == 'product' -%}\n"
                "  <meta property=\"og:type\" content=\"product\">\n"
                "{%- else -%}\n"
                "  <meta property=\"og:type\" content=\"website\">\n"
                "{%- endif -%}"
            ),
        },
        {
            "id": "og_title",
            "label": "Page title shown in shared links and AI chats",
            "passed": bool(signals.has_og_title),
            "weight": og_weight,
            "remediation": (
                "Make sure each page has a clear title that shows up "
                "when shoppers share a link on social media or in an "
                "AI chat. Without it, links preview as a raw URL with "
                "no context — and AI tools won't know what the page "
                "is about."
            ),
            "code": (
                "<!-- theme.liquid <head> -->\n"
                "<meta property=\"og:title\" content=\"{{ page_title | escape }}\">"
            ),
        },
        {
            "id": "og_description",
            "label": "Page description shown in shared links and AI chats",
            "passed": bool(signals.has_og_description),
            "weight": og_weight,
            "remediation": (
                "Make sure each page has a short description that "
                "shows up under the title when links are shared on "
                "social media or summarized by AI tools. Keeps "
                "previews looking polished."
            ),
            "code": (
                "<!-- theme.liquid <head> -->\n"
                "<meta property=\"og:description\" content=\""
                "{{ page_description | default: shop.description | escape }}\">"
            ),
        },
        {
            "id": "og_image",
            "label": "Product image shown in shared links and AI chats",
            "passed": bool(signals.has_og_image),
            "weight": og_weight,
            "remediation": (
                "Make sure your product image shows up when someone "
                "shares the product link or asks an AI tool about it. "
                "Without this, shared links appear as plain text with "
                "no image — far less likely to get clicks."
            ),
            "code": (
                "<!-- product.liquid <head> additions -->\n"
                "{%- if product.featured_image -%}\n"
                "  <meta property=\"og:image\" content=\"https:{{ product.featured_image | image_url: width: 1200 }}\">\n"
                "  <meta property=\"og:image:width\" content=\"1200\">\n"
                "  <meta property=\"og:image:height\" content=\"1200\">\n"
                "{%- endif -%}"
            ),
        },
        {
            "id": "product_price_amount",
            "label": "Price visible to AI shopping tools",
            "passed": bool(signals.has_product_price_amount),
            "weight": price_amount_weight,
            "remediation": (
                "Add your price to your product info so AI shopping "
                "assistants like ChatGPT can quote it directly when "
                "they recommend your product. Without this, AI tools "
                "may show your product without a price — or skip it "
                "for a competitor whose price is clear."
            ),
            "code": (
                "<!-- product.liquid <head> -->\n"
                "<meta property=\"product:price:amount\" "
                "content=\"{{ product.price | money_without_currency | strip_html }}\">"
            ),
        },
        {
            "id": "product_price_currency",
            "label": "Currency visible to AI shopping tools",
            "passed": bool(signals.has_product_price_currency),
            "weight": price_currency_weight,
            "remediation": (
                "Add your currency (USD, EUR, etc.) alongside the "
                "price so AI shopping tools display it correctly to "
                "shoppers in different regions."
            ),
            "code": (
                "<!-- product.liquid <head> -->\n"
                "<meta property=\"product:price:currency\" "
                "content=\"{{ cart.currency.iso_code }}\">"
            ),
        },
        {
            "id": "structured_specs",
            "label": "Specs listed in a clear table or list",
            "passed": bool(
                signals.has_structured_specs or signals.has_spec_table
            ),
            "weight": specs_weight,
            "remediation": (
                "Add a clear specifications table or list to product "
                "pages — dimensions, weight, materials, compatibility. "
                "AI shopping tools read these to match your product to "
                "what shoppers are looking for. A list is more "
                "scannable than the same info buried in a paragraph."
            ),
            "code": (
                "<!-- product.liquid — replace prose with a spec table -->\n"
                "<table class=\"product-specs\">\n"
                "  <tr><th>Material</th><td>100% merino wool</td></tr>\n"
                "  <tr><th>Weight</th><td>340 g</td></tr>\n"
                "  <tr><th>Dimensions</th><td>30 × 22 × 4 cm</td></tr>\n"
                "  <tr><th>Country of origin</th><td>New Zealand</td></tr>\n"
                "</table>"
            ),
        },
        {
            "id": "faq_content",
            "label": "FAQ section on product pages",
            "passed": bool(signals.has_faq_content),
            "weight": faq_weight,
            "remediation": (
                "Add a FAQ section to your product pages covering "
                "sizing, shipping, returns, materials, and care. AI "
                "shopping tools quote your answers directly when "
                "shoppers ask questions in their chats. Marking it up "
                "in a structured format makes it even easier for AI "
                "to use — your theme developer can do this in 30 "
                "minutes."
            ),
            "code": (
                "<!-- product.liquid — FAQ JSON-LD -->\n"
                "<script type=\"application/ld+json\">\n"
                "{\n"
                "  \"@context\": \"https://schema.org\",\n"
                "  \"@type\": \"FAQPage\",\n"
                "  \"mainEntity\": [{\n"
                "    \"@type\": \"Question\",\n"
                "    \"name\": \"How do I find my size?\",\n"
                "    \"acceptedAnswer\": {\n"
                "      \"@type\": \"Answer\",\n"
                "      \"text\": \"See the size guide link above\"\n"
                "    }\n"
                "  }]\n"
                "}\n"
                "</script>"
            ),
        },
        {
            "id": "spec_density_high",
            "label": "At least 5 concrete product details listed",
            "passed": signals.spec_mention_count >= 5,
            "weight": spec_density_weight,
            "remediation": (
                "List at least 5 specific details on each product "
                "page — dimensions, weight, material, available "
                "colors, item code, country of origin. The more "
                "concrete details you provide, the more shopper "
                "questions AI tools can answer about your product."
            ),
        },
    ])

    if not has_path_a:
        checks.append({
            "id": "measurement_units",
            "label": "Measurement units present (weight, dimensions, etc.)",
            "passed": bool(signals.has_measurement_units),
            "weight": 10,
            "remediation": (
                "Include measurement units (oz, lb, kg, in, cm, mm) "
                "in product copy — not just \"Medium size.\" AI agents "
                "use these to answer \"fits under a 15-inch laptop\" "
                "style queries."
            ),
        })

    return checks
