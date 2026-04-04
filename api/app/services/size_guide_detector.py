"""Size guide signal detector for Shopify product pages.

Detects size guides through text triggers ("Size Chart", "Size Guide",
"Find Your Size", "Fit Guide"), modal/popup triggers, known sizing app
scripts (KiwiSizing, TrueFit, Sizely, Measmerize, Bold Metrics, Fit
Analytics, MySizeID, 3DLOOK), embedded measurement tables, model
measurements, and fit recommendation text.

Only flags for applicable categories: apparel, footwear, accessories,
and furniture (fashion, fitness, jewelry). Returns a neutral N/A score
for electronics, home, food, beauty, and other categories.

All detection uses standard BeautifulSoup DOM inspection and compiled
regex patterns, consistent with the other detectors in this package.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Signals dataclass
# ---------------------------------------------------------------------------


@dataclass
class SizeGuideSignals:
    """Size guide signals extracted from a product page.

    10 fields total:
      - 1 app detection field
      - 4 size guide presence fields
      - 3 content quality fields
      - 1 proximity field
      - 1 category applicability field
    """

    # --- App detection (1) ---
    size_guide_app: str | None = None
    """Detected sizing app name, e.g. "kiwisizing", "truefit",
    "measmerize", "sizely", or None."""

    # --- Size guide presence (4) ---
    has_size_guide_link: bool = False
    """Text link or button to a size chart/guide detected on page."""

    has_size_guide_popup: bool = False
    """Modal/popup trigger for size guide (data-toggle, #size-chart href, dialog)."""

    has_size_chart_table: bool = False
    """Embedded measurement table with size labels and body measurements."""

    has_fit_finder: bool = False
    """Interactive AI-powered fit tool (TrueFit, Measmerize, etc.)."""

    # --- Content quality (3) ---
    has_model_measurements: bool = False
    """Model measurement text, e.g. 'Model is 5\\'10\" wearing size M'."""

    has_fit_recommendation: bool = False
    """Fit recommendation text, e.g. 'Runs true to size'."""

    has_measurement_instructions: bool = False
    """'How to measure' or measuring guide section."""

    # --- Proximity (1) ---
    near_size_selector: bool = False
    """Size guide link/trigger within proximity of size variant selector."""

    # --- Category applicability (1) ---
    category_applicable: bool = True
    """Whether size guide is relevant for this product's category."""


# ---------------------------------------------------------------------------
# Compiled regex patterns
# ---------------------------------------------------------------------------

_SIZE_GUIDE_LINK_RE = re.compile(
    r"size\s+chart|size\s+guide|find\s+your\s+size|fit\s+guide|"
    r"measurement\s+guide|sizing\s+help|sizing\s+chart|"
    r"size\s+finder|fit\s+finder|size\s+help|"
    r"view\s+size\s+chart|view\s+size\s+guide",
    re.IGNORECASE,
)

_SIZE_GUIDE_HREF_RE = re.compile(
    r"#size[_-]?chart|#size[_-]?guide|#sizing[_-]?modal|#fit[_-]?guide|"
    r"#sizechart|#sizeguide|#size-modal|#fit-chart",
    re.IGNORECASE,
)

_MODEL_MEASUREMENTS_RE = re.compile(
    r"model\s+(?:is|wears?|wearing|height|measures?)\s*[:\-]?\s*"
    r"(?:\d|[456][\u2019']?\s*\d{1,2})",
    re.IGNORECASE,
)

_FIT_RECOMMENDATION_RE = re.compile(
    r"runs?\s+true\s+to\s+size|runs?\s+(?:small|large|big)|"
    r"order\s+(?:one\s+)?size\s+(?:up|down)|true\s+to\s+size|"
    r"slim\s+fit|regular\s+fit|relaxed\s+fit|loose\s+fit|"
    r"fitted\s+cut|oversized\s+fit|tailored\s+fit",
    re.IGNORECASE,
)

_MEASUREMENT_INSTRUCTIONS_RE = re.compile(
    r"how\s+to\s+measure|measuring\s+guide|measure\s+yourself|"
    r"measurement\s+instructions|find\s+your\s+measurements",
    re.IGNORECASE,
)

_MEASUREMENT_HEADERS_RE = re.compile(
    r"\b(?:chest|waist|hip|hips|length|inseam|bust|shoulder|"
    r"neck|sleeve|thigh|rise|torso|arm)\b",
    re.IGNORECASE,
)

_SIZE_LABELS_RE = re.compile(
    r"\b(?:XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|"
    r"00|0[2468]|1[02468]|2[02]|2[46]|2[89]|3[024]|3[68]|"
    r"4[02]|4[46])\b",
)

_SIZE_LABEL_OPTION_RE = re.compile(
    r"\b(?:size|taille|length|width|dimension)\b",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Category applicability
# ---------------------------------------------------------------------------

_APPLICABLE_CATEGORIES = {"fashion", "fitness", "jewelry"}
_NA_CATEGORIES = {"electronics", "home", "food", "beauty", "other"}


# ---------------------------------------------------------------------------
# Sizing app detection
# ---------------------------------------------------------------------------

# (app_name, css_class_patterns, data_attr_patterns, script_url_patterns)
_SIZE_GUIDE_APPS: list[tuple[str, list[str], list[str], list[str]]] = [
    (
        "kiwisizing",
        ["kiwi-size", "kiwi-sg", "kiwi-sizing"],
        ["data-kiwi"],
        ["kiwisizing.com"],
    ),
    (
        "truefit",
        ["truefit", "tfc-fitrec"],
        ["data-truefit"],
        ["truefit.com"],
    ),
    (
        "sizely",
        ["sizely"],
        [],
        ["sizely.com"],
    ),
    (
        "measmerize",
        ["measmerize"],
        [],
        ["measmerize.com"],
    ),
    (
        "size-ai",
        ["sizeai", "size-ai"],
        [],
        ["size.ai"],
    ),
    (
        "bold-metrics",
        ["bold-metrics", "boldmetrics"],
        [],
        ["boldmetrics.com"],
    ),
    (
        "fit-analytics",
        ["fit-analytics", "fitanalytics"],
        [],
        ["fitanalytics.com"],
    ),
    (
        "mysizeid",
        ["mysizeid", "mysize"],
        [],
        ["mysizeid.com"],
    ),
    (
        "3dlook",
        ["3dlook"],
        [],
        ["3dlook.me"],
    ),
]

# Apps that provide interactive fit finder (not just static charts)
_FIT_FINDER_APPS = {
    "truefit", "measmerize", "size-ai", "bold-metrics",
    "fit-analytics", "mysizeid", "3dlook",
}


def _detect_size_guide_app(soup: BeautifulSoup) -> str | None:
    """Detect known sizing app by CSS classes, data attrs, or script URLs."""
    page_str = str(soup).lower()

    for app_name, class_patterns, data_attrs, script_patterns in _SIZE_GUIDE_APPS:
        # Check CSS classes
        for pattern in class_patterns:
            if soup.find(class_=lambda c: c and any(
                pattern in cls for cls in (c if isinstance(c, list) else [c])
            )):
                return app_name

        # Check data attributes
        for attr in data_attrs:
            if soup.find(attrs={attr: True}):
                return app_name

        # Check script URL patterns
        for pattern in script_patterns:
            if pattern in page_str:
                return app_name

    return None


# ---------------------------------------------------------------------------
# Size guide link detection
# ---------------------------------------------------------------------------


def _detect_size_guide_link(soup: BeautifulSoup) -> bool:
    """Detect text links or buttons pointing to a size chart/guide."""
    # Check <a> and <button> elements for size guide text
    for el in soup.find_all(["a", "button"]):
        text = el.get_text(strip=True)
        if _SIZE_GUIDE_LINK_RE.search(text):
            return True
        # Check href for size-guide fragment identifiers
        href = el.get("href", "")
        if isinstance(href, str) and _SIZE_GUIDE_HREF_RE.search(href):
            return True

    # Check for elements with size-guide-related class names
    if soup.find(class_=lambda c: c and any(
        any(kw in cls.lower() for kw in [
            "size-guide", "size-chart", "sizeguide", "sizechart",
            "fit-guide", "fitguide",
        ]) for cls in (c if isinstance(c, list) else [c])
    )):
        return True

    return False


# ---------------------------------------------------------------------------
# Size guide popup/modal detection
# ---------------------------------------------------------------------------


def _detect_size_guide_popup(soup: BeautifulSoup) -> bool:
    """Detect modal/popup triggers for size guides."""
    # Check for modal triggers with size-related targets
    for el in soup.find_all(attrs={"data-toggle": "modal"}):
        target = el.get("data-target", "") or el.get("href", "")
        if isinstance(target, str) and re.search(
            r"size|fit|measure", target, re.IGNORECASE,
        ):
            return True
        # Check trigger text
        text = el.get_text(strip=True)
        if _SIZE_GUIDE_LINK_RE.search(text):
            return True

    # Check for data-fancybox or data-popup with size-related content
    for attr in ("data-fancybox", "data-popup", "data-modal"):
        for el in soup.find_all(attrs={attr: True}):
            text = el.get_text(strip=True)
            if _SIZE_GUIDE_LINK_RE.search(text):
                return True

    # Check <dialog> elements containing size/measurement content
    for dialog in soup.find_all("dialog"):
        text = dialog.get_text(strip=True)
        if _SIZE_GUIDE_LINK_RE.search(text) or _MEASUREMENT_HEADERS_RE.search(text):
            return True

    # Check modal divs with size-related IDs or classes
    for el in soup.find_all(["div", "section"], class_=lambda c: c and any(
        "modal" in cls.lower()
        for cls in (c if isinstance(c, list) else [c])
    )):
        el_id = (el.get("id") or "").lower()
        if re.search(r"size|fit|measure", el_id):
            return True
        # Check if modal contains size chart content
        text = el.get_text(strip=True)
        if _SIZE_GUIDE_LINK_RE.search(text) and _MEASUREMENT_HEADERS_RE.search(text):
            return True

    return False


# ---------------------------------------------------------------------------
# Measurement table detection
# ---------------------------------------------------------------------------


_SIZE_COLUMN_HEADER_RE = re.compile(r"\bsize\b", re.IGNORECASE)


def _detect_size_chart_table(soup: BeautifulSoup) -> bool:
    """Detect embedded measurement tables with size labels and body measurements."""
    for table in soup.find_all("table"):
        header_cells = table.find_all("th")
        first_row_cells = table.find("tr")
        if first_row_cells:
            first_row_cells = first_row_cells.find_all(["th", "td"])

        all_header_text = " ".join(
            cell.get_text(strip=True) for cell in (header_cells or first_row_cells or [])
        )

        # Check headers for "Size" column header or actual size labels (S/M/L/XL)
        has_size_column = bool(_SIZE_COLUMN_HEADER_RE.search(all_header_text))
        has_size_labels = bool(_SIZE_LABELS_RE.search(all_header_text))
        has_measurement_headers = bool(_MEASUREMENT_HEADERS_RE.search(all_header_text))

        # Also check full table text for size labels and measurement keywords
        table_text = table.get_text()
        if not has_size_labels:
            has_size_labels = bool(_SIZE_LABELS_RE.search(table_text))
        if not has_measurement_headers:
            has_measurement_headers = len(_MEASUREMENT_HEADERS_RE.findall(table_text)) >= 2

        if (has_size_labels or has_size_column) and has_measurement_headers:
            return True

    return False


# ---------------------------------------------------------------------------
# Fit finder detection
# ---------------------------------------------------------------------------


def _detect_fit_finder(soup: BeautifulSoup, app: str | None) -> bool:
    """Detect interactive/AI-powered fit finder tools."""
    # Known interactive fit finder apps
    if app and app in _FIT_FINDER_APPS:
        return True

    # Check for interactive fit finder elements
    for el in soup.find_all(["div", "section", "form"]):
        el_id = (el.get("id") or "").lower()
        classes = el.get("class") or []
        class_str = " ".join(classes).lower() if classes else ""

        if re.search(r"fit[_-]?finder|fit[_-]?quiz|size[_-]?quiz|size[_-]?recommender", el_id):
            return True
        if re.search(r"fit[_-]?finder|fit[_-]?quiz|size[_-]?quiz|size[_-]?recommender", class_str):
            return True

    return False


# ---------------------------------------------------------------------------
# Model measurements detection
# ---------------------------------------------------------------------------


def _detect_model_measurements(soup: BeautifulSoup) -> bool:
    """Detect model measurement text (e.g. 'Model is 5'10\" wearing size M')."""
    page_text = soup.get_text()
    return bool(_MODEL_MEASUREMENTS_RE.search(page_text))


# ---------------------------------------------------------------------------
# Fit recommendation detection
# ---------------------------------------------------------------------------


def _detect_fit_recommendation(soup: BeautifulSoup) -> bool:
    """Detect fit recommendation text (e.g. 'Runs true to size')."""
    page_text = soup.get_text()
    return bool(_FIT_RECOMMENDATION_RE.search(page_text))


# ---------------------------------------------------------------------------
# Measurement instructions detection
# ---------------------------------------------------------------------------


def _detect_measurement_instructions(soup: BeautifulSoup) -> bool:
    """Detect 'How to measure' or measuring guide sections."""
    page_text = soup.get_text()
    if _MEASUREMENT_INSTRUCTIONS_RE.search(page_text):
        return True

    # Check elements with how-to-measure class/id
    if soup.find(id=lambda i: i and re.search(
        r"how[_-]?to[_-]?measure|measuring[_-]?guide", i, re.IGNORECASE,
    )):
        return True

    if soup.find(class_=lambda c: c and any(
        re.search(r"how[_-]?to[_-]?measure|measuring[_-]?guide", cls, re.IGNORECASE)
        for cls in (c if isinstance(c, list) else [c])
    )):
        return True

    return False


# ---------------------------------------------------------------------------
# Near size selector proximity detection
# ---------------------------------------------------------------------------

_SIZE_SELECTOR_FINDERS = [
    # Dawn-style fieldset with Size legend
    lambda s: s.find("fieldset", string=_SIZE_LABEL_OPTION_RE)
    or s.find("legend", string=_SIZE_LABEL_OPTION_RE),
    # Label with "Size" text next to a select
    lambda s: s.find("label", string=_SIZE_LABEL_OPTION_RE),
    # Select with size-related name
    lambda s: s.find("select", attrs={"name": lambda n: n and "size" in n.lower()})
    if s.find("select", attrs={"name": lambda n: n and "size" in n.lower()})
    else None,
    # Variant option div with "size" in data attributes
    lambda s: s.find(attrs={"data-option-name": lambda v: v and "size" in v.lower()})
    if s.find(attrs={"data-option-name": lambda v: v and "size" in v.lower()})
    else None,
]


def _detect_near_size_selector(
    soup: BeautifulSoup, has_any_guide: bool,
) -> bool:
    """Check if size guide elements exist near the size variant selector."""
    if not has_any_guide:
        return False

    size_selector = None
    for finder in _SIZE_SELECTOR_FINDERS:
        try:
            size_selector = finder(soup)
        except Exception:
            continue
        if size_selector:
            break
    if not size_selector:
        return False

    # Walk up to 4 parent levels and check for size guide elements
    current = size_selector
    for _ in range(4):
        parent = current.parent
        if parent is None:
            break
        for descendant in parent.descendants:
            if not isinstance(descendant, Tag):
                continue
            # Check for size guide link text
            if descendant.name in ("a", "button"):
                text = descendant.get_text(strip=True)
                if _SIZE_GUIDE_LINK_RE.search(text):
                    return True
                href = descendant.get("href", "")
                if isinstance(href, str) and _SIZE_GUIDE_HREF_RE.search(href):
                    return True
            # Check CSS classes for size guide indicators
            classes = descendant.get("class") or []
            class_str = " ".join(classes).lower() if classes else ""
            if re.search(
                r"size[_-]?guide|size[_-]?chart|fit[_-]?guide|sizeguide|sizechart",
                class_str,
            ):
                return True
        current = parent

    return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_size_guide(
    html: str,
    product_category: str | None = None,
) -> SizeGuideSignals:
    """Detect size guide signals from rendered product page HTML.

    Scans for size guide links, modal triggers, measurement tables,
    sizing app widgets (KiwiSizing, TrueFit, Sizely, Measmerize, etc.),
    model measurements, and fit recommendations using BeautifulSoup
    DOM inspection and compiled regex patterns.

    Args:
        html: Rendered product page HTML.
        product_category: Optional product category for applicability
            filtering. If None, assumes applicable.

    Returns:
        SizeGuideSignals with extracted signal values.
    """
    signals = SizeGuideSignals()

    # --- Category applicability ---
    if product_category is not None and product_category in _NA_CATEGORIES:
        signals.category_applicable = False
        logger.info(
            "Size guide N/A for category=%s — skipping detection",
            product_category,
        )
        return signals

    if not html:
        return signals

    soup = BeautifulSoup(html, "html.parser")

    # --- App detection ---
    signals.size_guide_app = _detect_size_guide_app(soup)

    # --- Size guide presence ---
    signals.has_size_guide_link = _detect_size_guide_link(soup)
    signals.has_size_guide_popup = _detect_size_guide_popup(soup)
    signals.has_size_chart_table = _detect_size_chart_table(soup)
    signals.has_fit_finder = _detect_fit_finder(soup, signals.size_guide_app)

    # --- Content quality ---
    signals.has_model_measurements = _detect_model_measurements(soup)
    signals.has_fit_recommendation = _detect_fit_recommendation(soup)
    signals.has_measurement_instructions = _detect_measurement_instructions(soup)

    # --- Proximity ---
    has_any_guide = (
        signals.has_size_guide_link
        or signals.has_size_guide_popup
        or signals.size_guide_app is not None
    )
    signals.near_size_selector = _detect_near_size_selector(soup, has_any_guide)

    logger.info(
        "Size guide detected: app=%s link=%s popup=%s table=%s "
        "fit_finder=%s model=%s fit_rec=%s instructions=%s "
        "near_selector=%s applicable=%s",
        signals.size_guide_app,
        signals.has_size_guide_link,
        signals.has_size_guide_popup,
        signals.has_size_chart_table,
        signals.has_fit_finder,
        signals.has_model_measurements,
        signals.has_fit_recommendation,
        signals.has_measurement_instructions,
        signals.near_size_selector,
        signals.category_applicable,
    )

    return signals
