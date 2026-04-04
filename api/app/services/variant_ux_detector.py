"""Variant UX & stock signal detector for Shopify product pages.

Detects variant selector types (visual swatches, pill buttons, dropdowns),
option-type classification (color vs size), swatch apps (KiwiSizing, Swatchy,
CSA, Dawn native), stock level indicators (precise counts vs vague urgency),
out-of-stock handling, notify-me forms, and variant-image linking.

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
class VariantUxSignals:
    """Variant UX & stock signals extracted from a product page.

    15 fields total:
      - 1 variant presence field
      - 3 selector type fields
      - 3 option classification fields
      - 3 stock signal fields
      - 2 out-of-stock handling fields
      - 2 app & feature fields
      - 1 penalty detection field
    """

    # --- Variant presence (1) ---
    has_variants: bool = False
    """Any variant options found in the product form."""

    # --- Selector types (3) ---
    has_visual_swatches: bool = False
    """Color/pattern swatches with visual preview (background-color/image)."""

    has_pill_buttons: bool = False
    """Radio buttons styled as pills or chips."""

    has_dropdown_selectors: bool = False
    """<select> dropdown elements for variant options."""

    # --- Option classification (3) ---
    color_selector_type: str | None = None
    """Selector type for color/pattern options: "swatch" | "pill" | "dropdown" | None."""

    size_selector_type: str | None = None
    """Selector type for size options: "pill" | "dropdown" | None."""

    option_group_count: int = 0
    """Number of distinct option groups (Color, Size, Material, etc.)."""

    # --- Stock signals (3) ---
    has_stock_indicator: bool = False
    """Any stock level display on page."""

    has_precise_stock_count: bool = False
    """Precise number present, e.g. "Only 3 left"."""

    has_low_stock_urgency: bool = False
    """Vague urgency messaging: "Hurry", "Running low", "Almost gone"."""

    # --- Out-of-stock handling (2) ---
    has_sold_out_handling: bool = False
    """Unavailable variants visually marked (disabled, strikethrough, etc.)."""

    has_notify_me: bool = False
    """Back-in-stock notification form present."""

    # --- App & features (2) ---
    swatch_app: str | None = None
    """Detected swatch app name, e.g. "kiwisizing", "swatchy", "dawn-native"."""

    has_variant_image_link: bool = False
    """Swatches linked to product images via data attributes."""

    # --- Penalty detection (1) ---
    color_uses_dropdown: bool = False
    """Color/pattern option uses a dropdown selector (anti-pattern)."""


# ---------------------------------------------------------------------------
# Compiled regex patterns
# ---------------------------------------------------------------------------

_COLOR_LABEL_RE = re.compile(
    r"\b(?:colou?r|pattern|print|shade|finish)\b", re.IGNORECASE,
)

_SIZE_LABEL_RE = re.compile(
    r"\b(?:size|taille|length|width|dimension)\b", re.IGNORECASE,
)

_STOCK_PRECISE_RE = re.compile(
    r"(?:only\s+)?(\d{1,3})\s+(?:left|remaining|in\s+stock|available)\b",
    re.IGNORECASE,
)

_STOCK_URGENCY_RE = re.compile(
    r"\b(?:hurry|running\s+low|almost\s+gone|selling\s+fast|low\s+stock|"
    r"limited\s+(?:stock|supply|availability)|few\s+left|last\s+chance)\b",
    re.IGNORECASE,
)

_NOTIFY_ME_RE = re.compile(
    r"\b(?:notify\s+me|back\s+in\s+stock|email\s+when\s+available|"
    r"waitlist|stock\s+alert|restock\s+notification)\b",
    re.IGNORECASE,
)

_SOLD_OUT_RE = re.compile(
    r"\b(?:sold\s+out|out\s+of\s+stock|unavailable|coming\s+soon)\b",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Swatch app detection
# ---------------------------------------------------------------------------

# (app_name, css_class_patterns, data_attr_patterns, script_url_patterns)
_SWATCH_APPS: list[tuple[str, list[str], list[str], list[str]]] = [
    (
        "kiwisizing",
        ["kiwi-"],
        ["data-kiwi"],
        ["kiwisizing.com"],
    ),
    (
        "swatchy",
        ["swatchy"],
        [],
        ["swatchy"],
    ),
    (
        "csa",
        ["csa-"],
        [],
        ["color-swatch-app"],
    ),
    (
        "variant-image-automator",
        ["via-"],
        [],
        ["variant-image-automator"],
    ),
]


def _detect_swatch_app(soup: BeautifulSoup) -> str | None:
    """Detect known swatch app by CSS classes, data attrs, or script URLs."""
    # Dawn native detection via custom element
    if soup.find("variant-picker"):
        return "dawn-native"

    page_str = str(soup).lower()

    for app_name, class_patterns, data_attrs, script_patterns in _SWATCH_APPS:
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
# Product form locator
# ---------------------------------------------------------------------------


def _find_product_form(soup: BeautifulSoup) -> Tag | None:
    """Locate the product form container to scope variant detection.

    Cascades through Shopify-standard, Dawn-specific, and generic selectors.
    """
    # Priority 1: Standard Shopify cart form
    form = soup.find("form", action=lambda a: a and "/cart/add" in a)
    if form and isinstance(form, Tag):
        return form

    # Priority 2: Dawn product-form class
    form = soup.find(class_="product-form")
    if form and isinstance(form, Tag):
        return form

    # Priority 3: Dawn product-form custom element
    form = soup.find("product-form")
    if form and isinstance(form, Tag):
        return form

    # Priority 4: Generic product-form class match
    form = soup.find(class_=lambda c: c and any(
        "product-form" in cls for cls in (c if isinstance(c, list) else [c])
    ))
    if form and isinstance(form, Tag):
        return form

    return None


# ---------------------------------------------------------------------------
# Variant presence detection
# ---------------------------------------------------------------------------


def _detect_has_variants(form: Tag | None, soup: BeautifulSoup) -> bool:
    """Check if the product page has variant options."""
    if form is None:
        # Fallback: check for variant-picker anywhere on page
        if soup.find("variant-picker") or soup.find("variant-radios") or soup.find("variant-selects"):
            return True
        return False

    # Dawn custom elements
    if form.find("variant-picker") or form.find("variant-radios") or form.find("variant-selects"):
        return True

    # Select elements with option-like names
    for select in form.find_all("select"):
        name = (select.get("name") or "").lower()
        el_id = (select.get("id") or "").lower()
        if "option" in name or "option" in el_id or "singleoptionselector" in el_id:
            return True

    # Radio inputs within fieldsets (Dawn pill pattern)
    if form.find("input", attrs={"type": "radio"}):
        return True

    # Dawn product-form__input containers
    if form.find(class_=lambda c: c and any(
        "product-form__input" in cls
        for cls in (c if isinstance(c, list) else [c])
    )):
        return True

    # Data attributes for variant options
    if form.find(attrs={"data-option-index": True}) or form.find(attrs={"data-option-position": True}):
        return True

    return False


# ---------------------------------------------------------------------------
# Selector type detection
# ---------------------------------------------------------------------------


def _detect_visual_swatches(form: Tag | None, soup: BeautifulSoup) -> bool:
    """Detect color/pattern swatches with visual preview."""
    scope = form or soup

    # Dawn native swatch
    if scope.find(class_=lambda c: c and any(
        "product-form__input--swatch" in cls
        for cls in (c if isinstance(c, list) else [c])
    )):
        return True

    # Generic swatch classes
    _SWATCH_KEYWORDS = ["swatch", "color-swatch", "variant-swatch"]
    if scope.find(class_=lambda c: c and any(
        any(cls.lower() == kw or cls.lower().startswith(kw + "-")
            or cls.lower().endswith("-" + kw)
            for kw in _SWATCH_KEYWORDS)
        for cls in (c if isinstance(c, list) else [c])
    )):
        return True

    # data-swatch attribute
    if scope.find(attrs={"data-swatch": True}):
        return True

    # Elements with background-color or background-image inline styles
    # within option containers
    for el in scope.find_all(style=lambda s: s and (
        "background-color" in s or "background-image" in s
    )):
        # Verify it's within a variant context (not just any styled element)
        parent = el.parent
        if parent and isinstance(parent, Tag):
            parent_classes = " ".join(parent.get("class") or []).lower()
            if any(kw in parent_classes for kw in [
                "swatch", "option", "variant", "color", "product-form",
            ]):
                return True
            # Check grandparent too
            grandparent = parent.parent
            if grandparent and isinstance(grandparent, Tag):
                gp_classes = " ".join(grandparent.get("class") or []).lower()
                if any(kw in gp_classes for kw in [
                    "swatch", "option", "variant", "color", "product-form",
                ]):
                    return True

    return False


def _detect_pill_buttons(form: Tag | None) -> bool:
    """Detect radio buttons styled as pills or chips."""
    if form is None:
        return False

    # Dawn native pill
    if form.find(class_=lambda c: c and any(
        "product-form__input--pill" in cls
        for cls in (c if isinstance(c, list) else [c])
    )):
        return True

    # Radio inputs with adjacent labels (pill pattern)
    radios = form.find_all("input", attrs={"type": "radio"})
    if radios:
        # Check if radios have labels (styled as pills)
        for radio in radios:
            # Adjacent label or wrapping label
            if radio.find_parent("label") or (
                radio.get("id") and form.find("label", attrs={"for": radio.get("id")})
            ):
                return True

    # Pill/chip class patterns
    _PILL_KEYWORDS = ["pill", "chip", "option-btn", "size-btn", "variant-btn"]
    if form.find(class_=lambda c: c and any(
        any(cls.lower() == kw or cls.lower().startswith(kw + "-")
            or cls.lower().endswith("-" + kw)
            for kw in _PILL_KEYWORDS)
        for cls in (c if isinstance(c, list) else [c])
    )):
        return True

    return False


def _detect_dropdown_selectors(form: Tag | None) -> bool:
    """Detect <select> dropdown elements for variant options."""
    if form is None:
        return False

    # Dawn native dropdown
    if form.find(class_=lambda c: c and any(
        "product-form__input--dropdown" in cls
        for cls in (c if isinstance(c, list) else [c])
    )):
        return True

    # Select elements within option containers
    for select in form.find_all("select"):
        name = (select.get("name") or "").lower()
        el_id = (select.get("id") or "").lower()
        if "option" in name or "option" in el_id or "singleoptionselector" in el_id:
            return True
        # Select within a product-form__input or fieldset
        parent = select.find_parent(class_=lambda c: c and any(
            "product-form__input" in cls or "option" in cls.lower()
            for cls in (c if isinstance(c, list) else [c])
        ))
        if parent:
            return True

    return False


# ---------------------------------------------------------------------------
# Option type classification
# ---------------------------------------------------------------------------


def _find_option_groups(form: Tag | None, soup: BeautifulSoup) -> list[Tag]:
    """Find all distinct option group containers."""
    scope = form or soup
    groups: list[Tag] = []
    seen_ids: set[int] = set()

    # Strategy 1: Dawn product-form__input containers
    for el in scope.find_all(class_=lambda c: c and any(
        cls.startswith("product-form__input")
        for cls in (c if isinstance(c, list) else [c])
    )):
        if isinstance(el, Tag) and id(el) not in seen_ids:
            # Skip if this is a child of another product-form__input
            parent_pfi = el.find_parent(class_=lambda c: c and any(
                cls.startswith("product-form__input")
                for cls in (c if isinstance(c, list) else [c])
            ))
            if parent_pfi is None:
                groups.append(el)
                seen_ids.add(id(el))

    if groups:
        return groups

    # Strategy 2: Fieldsets within the form
    for fieldset in scope.find_all("fieldset"):
        if isinstance(fieldset, Tag) and id(fieldset) not in seen_ids:
            groups.append(fieldset)
            seen_ids.add(id(fieldset))

    if groups:
        return groups

    # Strategy 3: Containers with data-option-index
    for el in scope.find_all(attrs={"data-option-index": True}):
        if isinstance(el, Tag) and id(el) not in seen_ids:
            groups.append(el)
            seen_ids.add(id(el))

    return groups


def _get_group_label(group: Tag) -> str:
    """Extract label text from an option group container."""
    # Check legend (inside fieldset)
    legend = group.find("legend")
    if legend:
        return legend.get_text(strip=True)

    # Check label element
    label = group.find("label")
    if label:
        # Skip labels that are for specific radio inputs (swatch labels)
        if not label.get("for") or label.find("input"):
            # This is a group-level label
            text = label.get_text(strip=True)
            if text and len(text) < 50:
                return text

    # Check heading elements
    for tag in ("h2", "h3", "h4", "h5", "span", "p"):
        heading = group.find(tag)
        if heading:
            text = heading.get_text(strip=True)
            if text and len(text) < 50:
                return text

    return ""


def _get_group_selector_type(group: Tag) -> str:
    """Determine the selector type used within an option group."""
    # Check for swatch indicators
    if group.find(class_=lambda c: c and any(
        any(kw in cls.lower() for kw in ["swatch", "color-swatch", "variant-swatch"])
        for cls in (c if isinstance(c, list) else [c])
    )):
        return "swatch"

    if group.find(attrs={"data-swatch": True}):
        return "swatch"

    if group.find(style=lambda s: s and "background-color" in s):
        return "swatch"

    # Dawn swatch
    if group.find(class_=lambda c: c and any(
        "product-form__input--swatch" in cls
        for cls in (c if isinstance(c, list) else [c])
    )):
        return "swatch"

    # Check for pill/radio indicators
    if group.find(class_=lambda c: c and any(
        "product-form__input--pill" in cls
        for cls in (c if isinstance(c, list) else [c])
    )):
        return "pill"

    if group.find("input", attrs={"type": "radio"}):
        return "pill"

    # Check for dropdown
    if group.find("select"):
        return "dropdown"

    if group.find(class_=lambda c: c and any(
        "product-form__input--dropdown" in cls
        for cls in (c if isinstance(c, list) else [c])
    )):
        return "dropdown"

    return "dropdown"  # Default fallback


def _classify_option_groups(
    form: Tag | None, soup: BeautifulSoup,
) -> tuple[str | None, str | None, int]:
    """Classify option groups by type and return per-category selector types.

    Returns:
        (color_selector_type, size_selector_type, option_group_count)
    """
    groups = _find_option_groups(form, soup)
    if not groups:
        return None, None, 0

    color_type: str | None = None
    size_type: str | None = None

    for group in groups:
        label = _get_group_label(group)
        selector = _get_group_selector_type(group)

        if _COLOR_LABEL_RE.search(label):
            color_type = selector
        elif _SIZE_LABEL_RE.search(label):
            size_type = selector

    return color_type, size_type, len(groups)


# ---------------------------------------------------------------------------
# Stock level detection
# ---------------------------------------------------------------------------


def _detect_stock_signals(
    soup: BeautifulSoup,
) -> tuple[bool, bool, bool]:
    """Detect stock level indicators.

    Returns:
        (has_stock_indicator, has_precise_stock_count, has_low_stock_urgency)
    """
    has_indicator = False
    has_precise = False
    has_urgency = False

    page_text = soup.get_text()

    # Precise stock counts: "Only 3 left", "5 in stock"
    if _STOCK_PRECISE_RE.search(page_text):
        has_indicator = True
        has_precise = True

    # Urgency messaging: "Hurry", "Running low", "Almost gone"
    if _STOCK_URGENCY_RE.search(page_text):
        has_indicator = True
        has_urgency = True

    # DOM-level stock attributes
    if soup.find(attrs={"data-inventory": True}):
        has_indicator = True
    if soup.find(attrs={"data-stock-count": True}):
        has_indicator = True

    # Stock-related CSS classes
    _STOCK_CLASSES = ["stock-badge", "inventory-level", "low-stock", "stock-count", "inventory-count"]
    if soup.find(class_=lambda c: c and any(
        any(cls.lower() == kw or cls.lower().startswith(kw + "-")
            or cls.lower().endswith("-" + kw)
            for kw in _STOCK_CLASSES)
        for cls in (c if isinstance(c, list) else [c])
    )):
        has_indicator = True

    return has_indicator, has_precise, has_urgency


# ---------------------------------------------------------------------------
# Out-of-stock handling
# ---------------------------------------------------------------------------


def _detect_sold_out_handling(form: Tag | None, soup: BeautifulSoup) -> bool:
    """Detect visual handling of unavailable/sold-out variants."""
    scope = form or soup

    # Disabled options in select elements
    for select in scope.find_all("select"):
        if select.find("option", attrs={"disabled": True}):
            return True

    # Disabled radio inputs
    if scope.find("input", attrs={"type": "radio", "disabled": True}):
        return True

    # Sold-out / unavailable classes on variant elements
    _OOS_KEYWORDS = ["unavailable", "sold-out", "out-of-stock", "disabled"]
    for el in scope.find_all(class_=lambda c: c and any(
        any(kw in cls.lower() for kw in _OOS_KEYWORDS)
        for cls in (c if isinstance(c, list) else [c])
    )):
        if isinstance(el, Tag):
            return True

    # Sold-out text within variant-adjacent elements
    for el in scope.find_all(["span", "div", "p", "label"]):
        text = el.get_text(strip=True)
        if len(text) < 80 and _SOLD_OUT_RE.search(text):
            return True

    # data-available="false"
    if scope.find(attrs={"data-available": "false"}):
        return True

    return False


def _detect_notify_me(soup: BeautifulSoup) -> bool:
    """Detect back-in-stock notification forms."""
    page_text = soup.get_text()
    if _NOTIFY_ME_RE.search(page_text):
        return True

    # Klaviyo back-in-stock widget
    if soup.find(class_=lambda c: c and any(
        "klaviyo-bis" in cls.lower() or "back-in-stock" in cls.lower()
        or "notify-form" in cls.lower() or "waitlist-form" in cls.lower()
        for cls in (c if isinstance(c, list) else [c])
    )):
        return True

    return False


# ---------------------------------------------------------------------------
# Variant-image linking
# ---------------------------------------------------------------------------


def _detect_variant_image_link(form: Tag | None, soup: BeautifulSoup) -> bool:
    """Detect swatches linked to product images via data attributes."""
    scope = form or soup

    # data-variant-image or data-media-id on swatch-like elements
    if scope.find(attrs={"data-variant-image": True}):
        return True
    if scope.find(attrs={"data-media-id": True}):
        return True

    # data-image or data-src on swatch elements
    for el in scope.find_all(class_=lambda c: c and any(
        "swatch" in cls.lower()
        for cls in (c if isinstance(c, list) else [c])
    )):
        if el.get("data-image") or el.get("data-src"):
            return True

    # Swatch elements with background-image pointing to product images
    for el in scope.find_all(style=lambda s: s and "background-image" in s):
        style = el.get("style", "")
        if "cdn.shopify" in style or "/products/" in style:
            return True

    # Labels wrapping images within variant contexts
    for label in scope.find_all("label"):
        classes = " ".join(label.get("class") or []).lower()
        if any(kw in classes for kw in ["swatch", "color", "variant"]):
            if label.find("img"):
                return True

    return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_variant_ux(html: str) -> VariantUxSignals:
    """Detect variant UX & stock signals from rendered product page HTML.

    Scans for variant selector types (swatches, pills, dropdowns), option
    classification (color vs size), swatch apps, stock indicators, out-of-
    stock handling, and variant-image linking using BeautifulSoup DOM
    inspection and compiled regex patterns.
    """
    signals = VariantUxSignals()

    if not html:
        return signals

    soup = BeautifulSoup(html, "html.parser")

    # --- Product form scoping ---
    form = _find_product_form(soup)

    # --- Swatch app detection (before variant check — informs presence) ---
    signals.swatch_app = _detect_swatch_app(soup)

    # --- Variant presence ---
    signals.has_variants = _detect_has_variants(form, soup)

    # Swatch app presence implies variants exist
    if signals.swatch_app and not signals.has_variants:
        signals.has_variants = True

    if not signals.has_variants:
        # No variants: return early with defaults
        return signals

    # --- Selector type detection ---
    signals.has_visual_swatches = _detect_visual_swatches(form, soup)
    signals.has_pill_buttons = _detect_pill_buttons(form)
    signals.has_dropdown_selectors = _detect_dropdown_selectors(form)

    # --- Option classification ---
    color_type, size_type, group_count = _classify_option_groups(form, soup)
    signals.color_selector_type = color_type
    signals.size_selector_type = size_type
    signals.option_group_count = group_count

    # --- Derive penalty field ---
    signals.color_uses_dropdown = color_type == "dropdown"

    # --- Stock signals ---
    has_stock, has_precise, has_urgency = _detect_stock_signals(soup)
    signals.has_stock_indicator = has_stock
    signals.has_precise_stock_count = has_precise
    signals.has_low_stock_urgency = has_urgency

    # --- Out-of-stock handling ---
    signals.has_sold_out_handling = _detect_sold_out_handling(form, soup)
    signals.has_notify_me = _detect_notify_me(soup)

    # --- Variant-image linking ---
    signals.has_variant_image_link = _detect_variant_image_link(form, soup)

    logger.info(
        "Variant UX detected: variants=%s swatches=%s pills=%s dropdowns=%s "
        "color_type=%s size_type=%s groups=%d stock=%s precise=%s "
        "urgency=%s sold_out=%s notify=%s app=%s img_link=%s "
        "color_dropdown=%s",
        signals.has_variants,
        signals.has_visual_swatches,
        signals.has_pill_buttons,
        signals.has_dropdown_selectors,
        signals.color_selector_type,
        signals.size_selector_type,
        signals.option_group_count,
        signals.has_stock_indicator,
        signals.has_precise_stock_count,
        signals.has_low_stock_urgency,
        signals.has_sold_out_handling,
        signals.has_notify_me,
        signals.swatch_app,
        signals.has_variant_image_link,
        signals.color_uses_dropdown,
    )

    return signals
