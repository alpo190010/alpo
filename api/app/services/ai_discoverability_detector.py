"""AI Discoverability detector — extracts signals from HTML + optional API data."""

import json
import logging
import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ── Signals ──────────────────────────────────────────────────────

@dataclass
class AiDiscoverabilitySignals:
    """Signals for how well a product page can be discovered by AI shopping assistants."""

    # --- robots.txt signals (from API, None = not fetched) ---
    robots_txt_exists: bool | None = None
    ai_search_bots_allowed_count: int = 0        # 0-3
    ai_training_bots_blocked_count: int = 0      # 0-4
    has_oai_searchbot_allowed: bool = False
    has_perplexitybot_allowed: bool = False
    has_claude_searchbot_allowed: bool = False
    has_wildcard_block: bool = False

    # --- llms.txt signals (from API) ---
    llms_txt_exists: bool | None = None

    # --- OpenGraph signals (from HTML) ---
    has_og_type: bool = False
    has_og_title: bool = False
    has_og_description: bool = False
    has_og_image: bool = False
    has_product_price_amount: bool = False
    has_product_price_currency: bool = False
    og_tag_count: int = 0

    # --- Entity density signals (from HTML) ---
    has_structured_specs: bool = False            # <ul>/<ol> with spec content
    has_spec_table: bool = False                  # <table> with specifications
    has_faq_content: bool = False                 # FAQ schema or Q&A patterns
    spec_mention_count: int = 0                   # measurement + material mentions
    has_measurement_units: bool = False
    entity_density_score: float = 0.0             # 0.0-1.0 normalized


# ── Constants ────────────────────────────────────────────────────

_OG_CORE_TAGS = {"og:type", "og:title", "og:description", "og:image"}
_OG_PRICE_TAGS = {"product:price:amount", "product:price:currency"}

# Product description selectors (shared with description_detector.py)
_DESC_SELECTORS = [
    ".product__description",
    ".product-description",
    "[data-product-description]",
    ".product-single__description",
    ".product_description",
    "#product-description",
    ".rte",
    '[itemprop="description"]',
]

_RE_MEASUREMENT = re.compile(
    r"\b\d+(?:\.\d+)?\s*(?:cm|mm|m|in(?:ch(?:es)?)?|ft|\'|\"|\blbs?\b|oz|kg|g|ml|fl\.?\s*oz|gal(?:lon)?|qt|watt|volt|amp|mah|mAh|ppi|dpi|mp)\b",
    re.IGNORECASE,
)

_RE_MATERIAL = re.compile(
    r"\b(?:cotton|polyester|nylon|silk|leather|suede|stainless\s*steel|aluminum|titanium|ceramic|bamboo|wood|oak|walnut|maple|teak|linen|wool|cashmere|latex|rubber|glass|crystal|plastic|acrylic|carbon\s*fiber|copper|brass|zinc|pewter|platinum|gold[- ]?plated|silver[- ]?plated|sterling\s*silver|vegan\s*leather|faux\s*leather|microfiber|spandex|lycra|rayon|viscose|polycarbonate|abs|silicone|mesh|denim|canvas|twill|satin|velvet|chiffon|organza)\b",
    re.IGNORECASE,
)

_RE_SPEC_PATTERN = re.compile(
    r"\b(?:dimensions?|weight|capacity|voltage|wattage|resolution|thickness|diameter|length|width|height|depth|volume|power|speed|frequency|torque|pressure|density|hardness)\s*[:\-]\s*\d",
    re.IGNORECASE,
)

_SPEC_TABLE_HEADERS = re.compile(
    r"\b(?:material|weight|dimensions?|size|color|capacity|voltage|wattage|specifications?|features?)\b",
    re.IGNORECASE,
)

_FAQ_SELECTORS = [
    "details",
    ".faq",
    "#faq",
    "[data-faq]",
    ".accordion",
    ".product-faq",
]


# ── Detection layers ─────────────────────────────────────────────

def _detect_og_tags(soup: BeautifulSoup, signals: AiDiscoverabilitySignals) -> None:
    """Layer 1: Detect OpenGraph and product price meta tags."""
    found_properties: set[str] = set()
    count = 0

    for meta in soup.find_all("meta", attrs={"property": True}):
        prop = (meta.get("property") or "").lower()
        content = (meta.get("content") or "").strip()
        if not content:
            continue
        if prop.startswith("og:") or prop.startswith("product:"):
            count += 1
            found_properties.add(prop)

    signals.has_og_type = "og:type" in found_properties
    signals.has_og_title = "og:title" in found_properties
    signals.has_og_description = "og:description" in found_properties
    signals.has_og_image = "og:image" in found_properties
    signals.has_product_price_amount = "product:price:amount" in found_properties
    signals.has_product_price_currency = "product:price:currency" in found_properties
    signals.og_tag_count = count


def _detect_entity_density(soup: BeautifulSoup, signals: AiDiscoverabilitySignals) -> None:
    """Layer 2: Detect spec-rich content, FAQ patterns, and entity density."""
    # Find product description area
    desc_el = None
    for selector in _DESC_SELECTORS:
        desc_el = soup.select_one(selector)
        if desc_el:
            break

    # Fall back to main content if no description found
    if not desc_el:
        desc_el = soup.find("main") or soup.find("body")
    if not desc_el:
        return

    desc_text = desc_el.get_text(separator=" ", strip=True)
    words = desc_text.split()
    word_count = len(words)

    # Measurement mentions
    measurement_matches = _RE_MEASUREMENT.findall(desc_text)
    material_matches = _RE_MATERIAL.findall(desc_text)
    spec_pattern_matches = _RE_SPEC_PATTERN.findall(desc_text)

    total_specs = len(measurement_matches) + len(material_matches) + len(spec_pattern_matches)
    signals.spec_mention_count = total_specs
    signals.has_measurement_units = len(measurement_matches) > 0

    # Entity density: specs per 50 words
    if word_count > 0:
        signals.entity_density_score = min(1.0, total_specs / max(word_count / 50, 1))

    # Structured spec lists: <ul>/<ol> containing spec-like content
    for list_el in desc_el.find_all(["ul", "ol"]):
        list_text = list_el.get_text(separator=" ", strip=True)
        if _RE_MEASUREMENT.search(list_text) or _RE_MATERIAL.search(list_text) or _RE_SPEC_PATTERN.search(list_text):
            signals.has_structured_specs = True
            break

    # Spec tables
    for table in desc_el.find_all("table"):
        header_text = ""
        for th in table.find_all(["th", "td"]):
            header_text += " " + th.get_text(strip=True)
        if _SPEC_TABLE_HEADERS.search(header_text):
            signals.has_spec_table = True
            signals.has_structured_specs = True
            break

    # Also check tables outside the description area (common for spec sections)
    if not signals.has_spec_table:
        for table in soup.find_all("table"):
            header_text = ""
            for th in table.find_all(["th", "td"]):
                header_text += " " + th.get_text(strip=True)
            if _SPEC_TABLE_HEADERS.search(header_text):
                signals.has_spec_table = True
                signals.has_structured_specs = True
                break

    # FAQ detection
    _detect_faq(soup, signals)


def _detect_faq(soup: BeautifulSoup, signals: AiDiscoverabilitySignals) -> None:
    """Detect FAQ content via JSON-LD schema and HTML patterns."""
    # Check JSON-LD for FAQPage schema
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and item.get("@type") == "FAQPage":
                        signals.has_faq_content = True
                        return
            elif isinstance(data, dict):
                if data.get("@type") == "FAQPage":
                    signals.has_faq_content = True
                    return
                # Check @graph array
                for item in data.get("@graph", []):
                    if isinstance(item, dict) and item.get("@type") == "FAQPage":
                        signals.has_faq_content = True
                        return
        except (json.JSONDecodeError, TypeError):
            continue

    # Check HTML FAQ patterns
    for selector in _FAQ_SELECTORS:
        if soup.select_one(selector):
            signals.has_faq_content = True
            return

    # Check for heading-based Q&A (h2/h3/h4 ending with ?)
    for heading in soup.find_all(["h2", "h3", "h4"]):
        text = heading.get_text(strip=True)
        if text.endswith("?") and len(text) > 10:
            signals.has_faq_content = True
            return


def _merge_api_data(api_data: dict | None, signals: AiDiscoverabilitySignals) -> None:
    """Layer 3: Merge external API data (robots.txt, llms.txt) into signals."""
    if api_data is None:
        return

    signals.robots_txt_exists = api_data.get("robots_txt_exists")
    signals.llms_txt_exists = api_data.get("llms_txt_exists")
    signals.has_wildcard_block = api_data.get("has_wildcard_block", False)

    # AI search bots (should be allowed)
    search_bots = api_data.get("ai_search_bots", {})
    signals.has_oai_searchbot_allowed = search_bots.get("OAI-SearchBot", False)
    signals.has_perplexitybot_allowed = search_bots.get("PerplexityBot", False)
    signals.has_claude_searchbot_allowed = search_bots.get("Claude-SearchBot", False)
    signals.ai_search_bots_allowed_count = sum(
        1 for v in search_bots.values() if v
    )

    # AI training bots (should be blocked)
    training_bots = api_data.get("ai_training_bots", {})
    signals.ai_training_bots_blocked_count = sum(
        1 for v in training_bots.values() if v
    )


# ── Public API ───────────────────────────────────────────────────

def detect_ai_discoverability(
    html: str,
    api_data: dict | None = None,
) -> AiDiscoverabilitySignals:
    """Detect AI discoverability signals from rendered HTML and optional API data.

    Parameters
    ----------
    html : str
        Full rendered HTML of the product page.
    api_data : dict | None
        Optional dict from fetch_ai_discoverability_data() with robots.txt and
        llms.txt information.

    Returns
    -------
    AiDiscoverabilitySignals
        Populated signals dataclass.
    """
    signals = AiDiscoverabilitySignals()

    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception:
        logger.warning("Failed to parse HTML for AI discoverability detection")
        _merge_api_data(api_data, signals)
        return signals

    # Layer 1: OpenGraph tags
    _detect_og_tags(soup, signals)

    # Layer 2: Entity density
    _detect_entity_density(soup, signals)

    # Layer 3: External API data merge
    _merge_api_data(api_data, signals)

    logger.info(
        "AI discoverability signals: "
        "robots_txt=%s llms_txt=%s "
        "og_tags=%d og_type=%s og_title=%s og_desc=%s og_image=%s "
        "price_amount=%s price_currency=%s "
        "search_bots_allowed=%d training_bots_blocked=%d wildcard_block=%s "
        "structured_specs=%s spec_table=%s faq=%s "
        "spec_mentions=%d measurements=%s density=%.2f",
        signals.robots_txt_exists, signals.llms_txt_exists,
        signals.og_tag_count, signals.has_og_type, signals.has_og_title,
        signals.has_og_description, signals.has_og_image,
        signals.has_product_price_amount, signals.has_product_price_currency,
        signals.ai_search_bots_allowed_count, signals.ai_training_bots_blocked_count,
        signals.has_wildcard_block,
        signals.has_structured_specs, signals.has_spec_table, signals.has_faq_content,
        signals.spec_mention_count, signals.has_measurement_units,
        signals.entity_density_score,
    )

    return signals
