"""Content Freshness detector — extracts freshness signals from HTML + optional API data."""

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone

from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ── Signals ──────────────────────────────────────────────────────


@dataclass
class ContentFreshnessSignals:
    """Signals for how fresh/current the content on a product page is."""

    # --- Copyright year (from HTML footer) ---
    copyright_year: int | None = None
    copyright_year_is_current: bool | None = None

    # --- Expired promotions ---
    has_expired_promotion: bool = False
    expired_promotion_text: str | None = None

    # --- Seasonal mismatch ---
    has_seasonal_mismatch: bool = False

    # --- "New" label staleness ---
    has_new_label: bool = False
    date_published_iso: str | None = None
    new_label_is_stale: bool = False

    # --- Stale reviews ---
    most_recent_review_date_iso: str | None = None
    review_age_days: int | None = None
    review_staleness: str | None = None  # "fresh" | "warning" | "critical"

    # --- Schema dateModified ---
    date_modified_iso: str | None = None
    date_modified_age_days: int | None = None

    # --- HTTP Last-Modified header (from API, None = not fetched) ---
    last_modified_header: str | None = None
    last_modified_age_days: int | None = None

    # --- <time> elements ---
    time_element_count: int = 0
    most_recent_time_iso: str | None = None
    most_recent_time_age_days: int | None = None

    # --- Aggregate ---
    freshest_signal_age_days: int | None = None


# ── Constants ────────────────────────────────────────────────────

_RE_COPYRIGHT = re.compile(
    r"(?:copyright|©|\(c\))\s*(?:20[0-9]{2}\s*[-–—]\s*)?(20[0-9]{2})",
    re.IGNORECASE,
)

_RE_YEAR = re.compile(r"\b(20[0-9]{2})\b")

_EVENT_KEYWORDS: set[str] = {
    "black friday",
    "cyber monday",
    "prime day",
    "boxing day",
    "memorial day",
    "labor day",
    "christmas sale",
    "holiday sale",
    "valentine",
    "easter sale",
    "back to school",
    "new year sale",
    "singles day",
    "11.11",
}

_SUMMER_KEYWORDS: set[str] = {
    "summer sale",
    "summer collection",
    "summer clearance",
    "swimwear sale",
    "pool party sale",
}

_WINTER_KEYWORDS: set[str] = {
    "winter sale",
    "winter collection",
    "holiday gift guide",
    "christmas gift",
    "snow gear",
    "winter clearance",
}

_NEW_LABEL_SELECTORS = [
    ".badge",
    ".label",
    ".tag",
    ".product-tag",
    '[class*="badge"]',
    '[class*="label"]',
    '[class*="new"]',
]

_RE_NEW_LABEL = re.compile(r"\bnew\b", re.IGNORECASE)

_REVIEW_CONTAINER_SELECTORS = [
    ".review",
    ".jdgm-rev",
    ".stamped-review",
    ".yotpo-review",
    "[data-review]",
    ".spr-review",
    ".loox-review",
    ".okendo-review",
]

_COMMON_DATE_FORMATS = [
    "%Y-%m-%dT%H:%M:%S%z",
    "%Y-%m-%dT%H:%M:%S.%f%z",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%d",
    "%B %d, %Y",
    "%b %d, %Y",
    "%m/%d/%Y",
    "%d/%m/%Y",
    "%Y/%m/%d",
]


# ── Helpers ──────────────────────────────────────────────────────


def _parse_date_safe(date_str: str) -> datetime | None:
    """Parse a date string, trying ISO format first then common fallbacks."""
    if not date_str or not isinstance(date_str, str):
        return None

    cleaned = date_str.strip()
    if not cleaned:
        return None

    # Try fromisoformat first (handles most ISO 8601 variants)
    try:
        dt = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        pass

    # Try common date formats
    for fmt in _COMMON_DATE_FORMATS:
        try:
            dt = datetime.strptime(cleaned, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue

    return None


def _days_since(dt: datetime) -> int:
    """Return number of days between a datetime and now."""
    now = datetime.now(tz=timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return max(0, (now - dt).days)


def _get_jsonld_items(soup: BeautifulSoup) -> list[dict]:
    """Extract all typed items from JSON-LD scripts, flattening @graph arrays."""
    items: list[dict] = []
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue

        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict) and "@type" in item:
                    items.append(item)
        elif isinstance(data, dict):
            if "@type" in data:
                items.append(data)
            for item in data.get("@graph", []):
                if isinstance(item, dict) and "@type" in item:
                    items.append(item)
    return items


def _get_current_season(month: int) -> str:
    """Return season name for a given month number (1-12)."""
    if month in (12, 1, 2):
        return "winter"
    if month in (3, 4, 5):
        return "spring"
    if month in (6, 7, 8):
        return "summer"
    return "fall"


# ── Detection layers ─────────────────────────────────────────────


def _detect_copyright_year(soup: BeautifulSoup, signals: ContentFreshnessSignals) -> None:
    """Layer 1: Detect copyright year in footer (fallback: full page)."""
    footer = soup.find("footer")
    search_text = footer.get_text(separator=" ", strip=True) if footer else ""

    if not search_text:
        # Fallback: search the last 2000 chars of body text
        body = soup.find("body")
        if body:
            full_text = body.get_text(separator=" ", strip=True)
            search_text = full_text[-2000:] if len(full_text) > 2000 else full_text

    if not search_text:
        return

    match = _RE_COPYRIGHT.search(search_text)
    if not match:
        return

    try:
        year = int(match.group(1))
    except (ValueError, IndexError):
        return

    signals.copyright_year = year
    signals.copyright_year_is_current = year >= datetime.now().year


def _detect_expired_promotions(soup: BeautifulSoup, signals: ContentFreshnessSignals) -> None:
    """Layer 2: Detect references to past promotional events with past-year dates."""
    body = soup.find("body")
    if not body:
        return

    body_text = body.get_text(separator=" ", strip=True).lower()
    current_year = datetime.now().year

    for keyword in _EVENT_KEYWORDS:
        idx = body_text.find(keyword)
        if idx == -1:
            continue

        # Search in a 200-char window around the keyword for a year
        start = max(0, idx - 50)
        end = min(len(body_text), idx + len(keyword) + 150)
        context = body_text[start:end]

        years = _RE_YEAR.findall(context)
        for year_str in years:
            year = int(year_str)
            if year < current_year:
                signals.has_expired_promotion = True
                signals.expired_promotion_text = context[:100].strip()
                return


def _detect_seasonal_mismatch(soup: BeautifulSoup, signals: ContentFreshnessSignals) -> None:
    """Layer 3: Detect opposite-season keywords (summer↔winter only)."""
    body = soup.find("body")
    if not body:
        return

    body_text = body.get_text(separator=" ", strip=True).lower()
    current_season = _get_current_season(datetime.now().month)

    if current_season == "winter":
        for kw in _SUMMER_KEYWORDS:
            if kw in body_text:
                signals.has_seasonal_mismatch = True
                return
    elif current_season == "summer":
        for kw in _WINTER_KEYWORDS:
            if kw in body_text:
                signals.has_seasonal_mismatch = True
                return


def _detect_new_label_staleness(
    soup: BeautifulSoup,
    signals: ContentFreshnessSignals,
    jsonld_items: list[dict],
) -> None:
    """Layer 4: Detect 'New' labels and check if product is actually new."""
    # Look for "New" badge/label
    for selector in _NEW_LABEL_SELECTORS:
        for el in soup.select(selector):
            text = el.get_text(strip=True)
            if _RE_NEW_LABEL.search(text) and len(text) < 30:
                signals.has_new_label = True
                break
        if signals.has_new_label:
            break

    # Extract datePublished from Product JSON-LD
    for item in jsonld_items:
        item_type = item.get("@type", "")
        if item_type == "Product" or (isinstance(item_type, list) and "Product" in item_type):
            dp = item.get("datePublished")
            if dp:
                signals.date_published_iso = str(dp)
                break

    # Check staleness
    if signals.has_new_label and signals.date_published_iso:
        dt = _parse_date_safe(signals.date_published_iso)
        if dt and _days_since(dt) > 90:
            signals.new_label_is_stale = True


def _detect_stale_reviews(
    soup: BeautifulSoup,
    signals: ContentFreshnessSignals,
    jsonld_items: list[dict],
) -> None:
    """Layer 5: Find the most recent review date and classify staleness."""
    review_dates: list[datetime] = []

    # Check JSON-LD for reviews
    for item in jsonld_items:
        item_type = item.get("@type", "")
        is_product = item_type == "Product" or (isinstance(item_type, list) and "Product" in item_type)

        if is_product:
            reviews = item.get("review", [])
            if isinstance(reviews, dict):
                reviews = [reviews]
            for review in reviews:
                if isinstance(review, dict):
                    dp = review.get("datePublished")
                    dt = _parse_date_safe(str(dp)) if dp else None
                    if dt:
                        review_dates.append(dt)

        if item_type == "Review" or (isinstance(item_type, list) and "Review" in item_type):
            dp = item.get("datePublished")
            dt = _parse_date_safe(str(dp)) if dp else None
            if dt:
                review_dates.append(dt)

    # Fallback: check <time> elements inside review containers
    if not review_dates:
        for selector in _REVIEW_CONTAINER_SELECTORS:
            for container in soup.select(selector):
                for time_el in container.find_all("time"):
                    dt_attr = time_el.get("datetime")
                    dt = _parse_date_safe(dt_attr) if dt_attr else None
                    if dt:
                        review_dates.append(dt)

    if not review_dates:
        return

    most_recent = max(review_dates)
    signals.most_recent_review_date_iso = most_recent.isoformat()
    signals.review_age_days = _days_since(most_recent)

    if signals.review_age_days <= 90:
        signals.review_staleness = "fresh"
    elif signals.review_age_days <= 365:
        signals.review_staleness = "warning"
    else:
        signals.review_staleness = "critical"


def _detect_schema_date_modified(
    soup: BeautifulSoup,
    signals: ContentFreshnessSignals,
    jsonld_items: list[dict],
) -> None:
    """Layer 6: Extract dateModified from JSON-LD Product or WebPage schemas."""
    target_types = {"Product", "WebPage", "ItemPage"}

    for item in jsonld_items:
        item_type = item.get("@type", "")
        types = item_type if isinstance(item_type, list) else [item_type]

        if target_types.intersection(types):
            dm = item.get("dateModified")
            if dm:
                signals.date_modified_iso = str(dm)
                dt = _parse_date_safe(str(dm))
                if dt:
                    signals.date_modified_age_days = _days_since(dt)
                return


def _merge_api_data(api_data: dict | None, signals: ContentFreshnessSignals) -> None:
    """Layer 7: Merge external API data (Last-Modified header) into signals."""
    if api_data is None:
        return

    signals.last_modified_header = api_data.get("last_modified_header")

    lm_iso = api_data.get("last_modified_date_iso")
    if lm_iso:
        dt = _parse_date_safe(lm_iso)
        if dt:
            signals.last_modified_age_days = _days_since(dt)


def _detect_time_elements(soup: BeautifulSoup, signals: ContentFreshnessSignals) -> None:
    """Layer 8: Parse <time datetime='...'> elements for freshness signals."""
    dates: list[datetime] = []

    for time_el in soup.find_all("time"):
        dt_attr = time_el.get("datetime")
        if not dt_attr:
            continue
        dt = _parse_date_safe(dt_attr)
        if dt:
            dates.append(dt)

    signals.time_element_count = len(dates)

    if dates:
        most_recent = max(dates)
        signals.most_recent_time_iso = most_recent.isoformat()
        signals.most_recent_time_age_days = _days_since(most_recent)


def _compute_freshest_signal(signals: ContentFreshnessSignals) -> None:
    """Compute the freshest (minimum) age across all age-in-days signals."""
    ages = [
        v for v in [
            signals.date_modified_age_days,
            signals.last_modified_age_days,
            signals.review_age_days,
            signals.most_recent_time_age_days,
        ]
        if v is not None
    ]
    if ages:
        signals.freshest_signal_age_days = min(ages)


# ── Public API ───────────────────────────────────────────────────


def detect_content_freshness(
    html: str,
    api_data: dict | None = None,
) -> ContentFreshnessSignals:
    """Detect content freshness signals from rendered HTML and optional API data.

    Parameters
    ----------
    html : str
        Full rendered HTML of the product page.
    api_data : dict | None
        Optional dict from fetch_content_freshness_data() with Last-Modified
        header information.

    Returns
    -------
    ContentFreshnessSignals
        Populated signals dataclass.
    """
    signals = ContentFreshnessSignals()

    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception:
        logger.warning("Failed to parse HTML for content freshness detection")
        _merge_api_data(api_data, signals)
        return signals

    # Pre-parse JSON-LD once for layers that need it
    jsonld_items = _get_jsonld_items(soup)

    # Layer 1: Copyright year
    _detect_copyright_year(soup, signals)

    # Layer 2: Expired promotions
    _detect_expired_promotions(soup, signals)

    # Layer 3: Seasonal mismatch
    _detect_seasonal_mismatch(soup, signals)

    # Layer 4: New label staleness
    _detect_new_label_staleness(soup, signals, jsonld_items)

    # Layer 5: Stale reviews
    _detect_stale_reviews(soup, signals, jsonld_items)

    # Layer 6: Schema dateModified
    _detect_schema_date_modified(soup, signals, jsonld_items)

    # Layer 7: External API data merge
    _merge_api_data(api_data, signals)

    # Layer 8: <time> elements
    _detect_time_elements(soup, signals)

    # Aggregate
    _compute_freshest_signal(signals)

    logger.info(
        "Content freshness signals: "
        "copyright_year=%s copyright_current=%s "
        "expired_promo=%s seasonal_mismatch=%s "
        "new_label=%s new_stale=%s "
        "review_staleness=%s review_age=%s "
        "date_modified_age=%s last_modified_age=%s "
        "time_elements=%d freshest_age=%s",
        signals.copyright_year, signals.copyright_year_is_current,
        signals.has_expired_promotion, signals.has_seasonal_mismatch,
        signals.has_new_label, signals.new_label_is_stale,
        signals.review_staleness, signals.review_age_days,
        signals.date_modified_age_days, signals.last_modified_age_days,
        signals.time_element_count, signals.freshest_signal_age_days,
    )

    return signals
