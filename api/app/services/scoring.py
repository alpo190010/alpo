"""Scoring utilities: category keys, score clamping, and competitor page scoring."""

from app.services.openrouter import call_openrouter

# All 18 category keys in canonical order (camelCase).
CATEGORY_KEYS: list[str] = [
    "pageSpeed",
    "images",
    "socialProof",
    "checkout",
    "mobileCta",
    "title",
    "aiDiscoverability",
    "structuredData",
    "pricing",
    "description",
    "shipping",
    "crossSell",
    "trust",
    "socialCommerce",
    "sizeGuide",
    "variantUx",
    "accessibility",
    "contentFreshness",
]

# Copied VERBATIM from webapp/src/lib/competitor-analysis.ts (SCORING_PROMPT).
COMPETITOR_SCORING_PROMPT: str = (
    "You are an e-commerce conversion expert specializing in Shopify product pages."
    " Analyze this HTML and return a JSON object with:\n"
    '- "score": number 0-100 (overall product page conversion effectiveness)\n'
    '- "summary": one-sentence assessment (max 30 words)\n'
    '- "tips": array of exactly 3 specific, actionable improvement tips (each max 25 words)\n'
    '- "categories": object with scores 0-100 for each:'
    ' { "title", "images", "pricing", "socialProof", "cta", "description", "trust" }\n'
    "\n"
    "Score these e-commerce specific criteria:\n"
    "- Title: Does it include product name, key benefit, and relevant keywords?\n"
    "- Images: Are there multiple high-quality images? Lifestyle shots? Zoom capability?\n"
    "- Pricing: Is there price anchoring? Original price shown? Savings highlighted?\n"
    "- Social proof: Reviews count, star ratings, UGC, testimonials visible?\n"
    '- CTA: Is "Add to Cart" prominent, above the fold, with urgency signals?\n'
    "- Description: Does it lead with benefits over features? Scannable format?\n"
    "- Trust: Are there badges, guarantees, secure checkout signals, return policy?\n"
    "\n"
    "All scores must be 0-100. Be specific and reference actual content from the page."
    " Be honest \u2014 don\u2019t inflate scores."
    " If the page is a 404 or error page, score it 0 and say so.\n"
    "\nHTML:\n"
)


# Revenue-impact weights per category, mirroring frontend CATEGORY_REVENUE_IMPACT tiers.
# Very High = 4, High = 3, Medium-High = 2.5, Medium = 2, Low-Medium = 1.  Total = 48.5.
IMPACT_WEIGHTS: dict[str, float] = {
    "pageSpeed": 4,
    "images": 4,
    "socialProof": 4,
    "checkout": 4,
    "mobileCta": 3,
    "title": 3,
    "aiDiscoverability": 3,
    "structuredData": 3,
    "pricing": 3,
    "description": 2.5,
    "shipping": 2.5,
    "crossSell": 2.5,
    "trust": 2,
    "socialCommerce": 2,
    "sizeGuide": 2,
    "variantUx": 2,
    "accessibility": 1,
    "contentFreshness": 1,
}

_TOTAL_WEIGHT = sum(IMPACT_WEIGHTS[k] for k in CATEGORY_KEYS)

# Dimension scope: classifies each category as store-wide or product-level.
# Store-wide dimensions describe overall store quality (checkout flow, shipping
# policy, trust signals, etc.).  Product-level dimensions depend on the
# individual product page being analyzed.
DIMENSION_SCOPE: dict[str, str] = {
    "pageSpeed": "store",
    "images": "product",
    "socialProof": "product",
    "checkout": "store",
    "mobileCta": "product",
    "title": "product",
    "aiDiscoverability": "store",
    "structuredData": "product",
    "pricing": "product",
    "description": "product",
    "shipping": "store",
    "crossSell": "product",
    "trust": "store",
    "socialCommerce": "store",
    "sizeGuide": "product",
    "variantUx": "product",
    "accessibility": "store",
    "contentFreshness": "product",
}

STORE_WIDE_KEYS: list[str] = [k for k in CATEGORY_KEYS if DIMENSION_SCOPE[k] == "store"]
PRODUCT_LEVEL_KEYS: list[str] = [k for k in CATEGORY_KEYS if DIMENSION_SCOPE[k] == "product"]


def compute_weighted_score(categories: dict) -> int:
    """Compute overall score as a weighted average across all 20 category dimensions.

    Each category score is clamped to 0-100 before weighting. Missing keys default to 0.
    Weights mirror the frontend's CATEGORY_REVENUE_IMPACT tiers.

    Returns an integer 0-100.
    """
    total = sum(
        clamp_score(categories.get(k, 0)) * IMPACT_WEIGHTS[k]
        for k in CATEGORY_KEYS
    )
    return round(total / _TOTAL_WEIGHT)


def clamp_score(v) -> int:
    """Clamp any value to a 0\u2013100 integer. Returns 0 for None, NaN, or non-numeric."""
    try:
        n = int(float(v))
        return max(0, min(100, n))
    except Exception:
        return 0


def build_category_scores(raw_cats: dict) -> dict:
    """Build a full 20-field category scores dict, defaulting missing keys to 0."""
    return {key: clamp_score(raw_cats.get(key)) for key in CATEGORY_KEYS}


async def score_page(html: str, api_key: str) -> dict:
    """Score a page for competitor comparison via OpenRouter AI.

    Returns a dict with: score, summary, tips, categories.
    """
    prompt = COMPETITOR_SCORING_PROMPT + html + "\n\nReturn ONLY valid JSON, no markdown."
    result = await call_openrouter(
        prompt,
        api_key,
        model="openai/gpt-5.4-nano",
        temperature=0.3,
        max_tokens=500,
    )
    cats = result.get("categories", {}) if isinstance(result, dict) else {}
    return {
        "score": clamp_score(result.get("score", 50) if isinstance(result, dict) else 50),
        "summary": (result.get("summary", "Analysis complete.") if isinstance(result, dict) else "Analysis complete."),
        "tips": (result.get("tips", []) if isinstance(result, dict) else [])[:3],
        "categories": build_category_scores(cats),
    }
