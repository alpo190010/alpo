"""Page speed signal detector for Shopify product pages.

Detects client-side performance signals from rendered HTML and optional
PageSpeed Insights (PSI) API data. Analyses script bloat, image
optimisation, resource hints, inline CSS weight, and Shopify theme
classification.

Detection uses 2 complementary extraction layers:
  1. HTML analysis (BeautifulSoup DOM inspection)
     a. Script counting and classification (total, third-party, render-
        blocking, known Shopify app CDN)
     b. Image optimisation checks (lazy loading, LCP anti-pattern,
        explicit dimensions, modern formats)
     c. Resource hint detection (preconnect, dns-prefetch, hero preload,
        font-display swap)
     d. Inline CSS measurement (total <style> content in KB)
     e. Shopify theme detection (Dawn / OS 2.0 / Legacy via meta tags
        and inline Shopify.theme references)
  2. PSI API merge (optional dict from PageSpeed Insights response)
     Core Web Vitals, performance score, and field-data metrics are
     copied directly into the signals dataclass when available.

All signals use standard BeautifulSoup DOM inspection consistent with
:pymod:`shipping_detector` and :pymod:`social_proof_detector`.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from urllib.parse import urlparse

from bs4 import BeautifulSoup, Tag

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Signals dataclass
# ---------------------------------------------------------------------------


@dataclass
class PageSpeedDesktopSignals:
    """Lab + field metrics from the PSI **desktop** strategy.

    Mirrors the 9 PSI fields on :class:`PageSpeedSignals` but for the
    desktop Lighthouse run. Mobile is the canonical scoring source —
    desktop is exposed for display only (Mobile/Desktop toggle in the
    UI scorecard) and does not feed the rubric.
    """

    performance_score: int | None = None
    lcp_ms: float | None = None
    cls_value: float | None = None
    tbt_ms: float | None = None
    fcp_ms: float | None = None
    speed_index_ms: float | None = None
    has_field_data: bool = False
    field_lcp_ms: float | None = None
    field_cls_value: float | None = None


@dataclass
class PageSpeedSignals:
    """Page speed signals extracted from a product page.

    23 mobile-canonical fields total:
      * 14 HTML-derived signals (scripts, images, hints, CSS, theme)
      * 9 PSI API signals (Core Web Vitals, field data)

    Plus an optional :attr:`desktop` sub-struct holding the 9 PSI
    fields from the desktop Lighthouse run when available. Desktop is
    display-only — the rubric scores from the mobile fields above.
    """

    # --- Script analysis (4) -----------------------------------------------
    script_count: int = 0
    """Total number of ``<script>`` tags in the document."""

    third_party_script_count: int = 0
    """Scripts loaded from non-Shopify domains."""

    render_blocking_script_count: int = 0
    """``<head>`` scripts without ``async``, ``defer``, or
    ``type="module"`` (includes inline scripts in ``<head>``)."""

    app_script_count: int = 0
    """Scripts from known Shopify app CDNs (judge.me, loox.io, etc.)."""

    # --- Image optimisation (4) --------------------------------------------
    has_lazy_loading: bool = False
    """Any ``<img>`` with ``loading="lazy"``."""

    lcp_image_lazy_loaded: bool = False
    """Hero / LCP product image has ``loading="lazy"`` (bad anti-pattern)."""

    has_explicit_image_dimensions: bool = False
    """More than 50 % of ``<img>`` tags have both ``width`` and ``height``."""

    has_modern_image_formats: bool = False
    """WebP or AVIF detected in ``src``, ``srcset``, or ``type`` attributes."""

    # --- Resource hints (4) ------------------------------------------------
    has_font_display_swap: bool = False
    """``font-display: swap`` found in inline ``<style>`` blocks."""

    has_preconnect_hints: bool = False
    """``<link rel="preconnect">`` present."""

    has_dns_prefetch: bool = False
    """``<link rel="dns-prefetch">`` present."""

    has_hero_preload: bool = False
    """``<link rel="preload" as="image">`` present."""

    # --- Inline CSS & theme (2) --------------------------------------------
    inline_css_kb: float = 0.0
    """Total ``<style>`` content size in KB."""

    detected_theme: str | None = None
    """Shopify theme classification: ``"dawn"``, ``"os2"``, ``"legacy"``,
    or ``None``."""

    # --- PSI API signals (9) -----------------------------------------------
    performance_score: int | None = None
    """Lighthouse performance score (0-100)."""

    lcp_ms: float | None = None
    """Largest Contentful Paint in milliseconds."""

    cls_value: float | None = None
    """Cumulative Layout Shift value."""

    tbt_ms: float | None = None
    """Total Blocking Time in milliseconds."""

    fcp_ms: float | None = None
    """First Contentful Paint in milliseconds."""

    speed_index_ms: float | None = None
    """Speed Index in milliseconds."""

    has_field_data: bool = False
    """Whether CrUX field data is available for this origin."""

    field_lcp_ms: float | None = None
    """Field (CrUX) Largest Contentful Paint in milliseconds."""

    field_cls_value: float | None = None
    """Field (CrUX) Cumulative Layout Shift value."""

    # --- Desktop counterpart (1) -------------------------------------------
    desktop: "PageSpeedDesktopSignals | None" = None
    """Optional sub-struct holding the same 9 PSI fields as above but
    measured under the desktop Lighthouse strategy. ``None`` when the
    desktop PSI call wasn't made or failed (e.g. cached scans pre-dating
    desktop support, missing API key, timeout)."""


# ---------------------------------------------------------------------------
# Constants -- fingerprints & patterns
# ---------------------------------------------------------------------------

# Shopify-native domains (NOT counted as third-party)
_SHOPIFY_NATIVE_DOMAINS: set[str] = {
    "cdn.shopify.com",
    "shopifycdn.net",
    "myshopify.com",
}

# Known Shopify app CDNs (counted as both third-party AND app)
_APP_CDN_DOMAINS: list[str] = [
    "judge.me",
    "loox.io",
    "stamped.io",
    "yotpo.com",
    "hextom.com",
    "klaviyo.com",
    "omnisend.com",
    "privy.com",
    "recharge.com",
    "bold.co",
    "apps.elfsight.com",
    "cdn.smile.io",
    "cdn.justuno.com",
    "cdn.aftership.com",
]

# LCP image selectors (first match wins, ordered by specificity)
_LCP_IMAGE_SELECTORS: list[str] = [
    ".product__media img",
    ".product-featured-media img",
    "[data-product-featured-image]",
    ".product-single__photo img",
    ".product__main-photos img",
    ".product-gallery img",
]

# Fallback class fragments for LCP image heuristic
_PRODUCT_IMAGE_CLASS_FRAGMENTS: list[str] = [
    "product-image",
    "product__image",
    "product-photo",
    "featured-image",
    "product-media",
    "product-img",
]

# Compiled regex patterns
_RE_MODERN_FORMAT = re.compile(r"\.(?:webp|avif)(?:\?|$)", re.IGNORECASE)

_RE_MODERN_TYPE = re.compile(r"image/(?:webp|avif)", re.IGNORECASE)

_RE_FONT_DISPLAY_SWAP = re.compile(r"font-display\s*:\s*swap", re.IGNORECASE)

_RE_SHOPIFY_THEME = re.compile(
    r"Shopify\.theme\s*=\s*\{[^}]*[\"']name[\"']\s*:\s*[\"']([^\"']+)[\"']",
    re.IGNORECASE,
)

# Theme name classifications
_LEGACY_THEMES: set[str] = {
    "debut", "brooklyn", "narrative", "supply",
}

_OS2_THEMES: set[str] = {
    "sense", "craft", "crave", "taste", "ride", "colorblock", "studio",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _is_shopify_native(hostname: str) -> bool:
    """Return True if *hostname* belongs to a Shopify-native domain."""
    hostname = hostname.lower()
    return any(hostname == d or hostname.endswith("." + d) for d in _SHOPIFY_NATIVE_DOMAINS)


def _is_app_cdn(hostname: str) -> bool:
    """Return True if *hostname* belongs to a known Shopify app CDN."""
    hostname = hostname.lower()
    return any(hostname == d or hostname.endswith("." + d) for d in _APP_CDN_DOMAINS)


def _has_class_fragment(tag: Tag, fragments: list[str]) -> bool:
    """Check if any of the tag's CSS classes contain any of the fragments."""
    classes = tag.get("class", [])
    if isinstance(classes, str):
        classes = [classes]
    class_str = " ".join(classes).lower()
    return any(frag in class_str for frag in fragments)


# ---------------------------------------------------------------------------
# Layer 1a: Script counting and classification
# ---------------------------------------------------------------------------


def _count_scripts(soup: BeautifulSoup) -> tuple[int, int, int, int]:
    """Count and classify ``<script>`` tags.

    Returns:
        Tuple of ``(total, third_party, render_blocking, app)``.
    """
    total = 0
    third_party = 0
    render_blocking = 0
    app = 0

    head = soup.find("head")

    for script in soup.find_all("script"):
        total += 1
        src = script.get("src")

        if src:
            # Classify by domain
            try:
                hostname = urlparse(str(src)).hostname or ""
            except Exception:
                hostname = ""

            if hostname and not _is_shopify_native(hostname):
                third_party += 1
                if _is_app_cdn(hostname):
                    app += 1

        # Render-blocking: in <head> without async/defer/type="module"
        if head and script in head.descendants:
            has_async = script.get("async") is not None
            has_defer = script.get("defer") is not None
            has_module = str(script.get("type", "")).lower() == "module"
            if not (has_async or has_defer or has_module):
                render_blocking += 1

    return total, third_party, render_blocking, app


# ---------------------------------------------------------------------------
# Layer 1b: Image optimisation checks
# ---------------------------------------------------------------------------


def _detect_image_optimization(
    soup: BeautifulSoup,
) -> tuple[bool, bool, bool, bool]:
    """Check image optimisation best practices.

    Returns:
        Tuple of ``(has_lazy_loading, lcp_image_lazy_loaded,
        has_explicit_image_dimensions, has_modern_image_formats)``.
    """
    has_lazy = False
    lcp_lazy = False
    has_dimensions = False
    has_modern = False

    imgs = soup.find_all("img")

    # --- Lazy loading ---
    for img in imgs:
        if str(img.get("loading", "")).lower() == "lazy":
            has_lazy = True
            break

    # --- LCP image lazy-loaded (anti-pattern) ---
    lcp_img: Tag | None = None

    # Try specific Shopify selectors first
    for selector in _LCP_IMAGE_SELECTORS:
        found = soup.select_one(selector)
        if found:
            # selector may target the <img> directly or a parent
            lcp_img = found if found.name == "img" else found.find("img")
            if lcp_img:
                break

    # Fallback: first <img> with a product-related class
    if not lcp_img:
        for img in imgs:
            if _has_class_fragment(img, _PRODUCT_IMAGE_CLASS_FRAGMENTS):
                lcp_img = img
                break

    # Fallback: first large <img> in <main> or <body>
    if not lcp_img:
        main = soup.find("main") or soup.find("body")
        if main:
            for img in main.find_all("img", limit=5):
                # Heuristic: consider any early image as potential LCP
                lcp_img = img
                break

    if lcp_img and str(lcp_img.get("loading", "")).lower() == "lazy":
        lcp_lazy = True

    # --- Explicit dimensions ---
    if imgs:
        with_dims = sum(
            1 for img in imgs if img.get("width") and img.get("height")
        )
        has_dimensions = with_dims > len(imgs) / 2

    # --- Modern image formats ---
    # Check <img> src and srcset
    for img in imgs:
        for attr in ("src", "srcset"):
            val = str(img.get(attr, ""))
            if _RE_MODERN_FORMAT.search(val):
                has_modern = True
                break
        if has_modern:
            break

    # Check <source> elements (e.g. inside <picture>)
    if not has_modern:
        for source in soup.find_all("source"):
            src_type = str(source.get("type", ""))
            if _RE_MODERN_TYPE.search(src_type):
                has_modern = True
                break
            for attr in ("src", "srcset"):
                val = str(source.get(attr, ""))
                if _RE_MODERN_FORMAT.search(val):
                    has_modern = True
                    break
            if has_modern:
                break

    return has_lazy, lcp_lazy, has_dimensions, has_modern


# ---------------------------------------------------------------------------
# Layer 1c: Resource hint detection
# ---------------------------------------------------------------------------


def _detect_resource_hints(
    soup: BeautifulSoup,
) -> tuple[bool, bool, bool, bool]:
    """Check performance resource hints.

    Returns:
        Tuple of ``(has_preconnect_hints, has_dns_prefetch,
        has_hero_preload, has_font_display_swap)``.
    """
    has_preconnect = False
    has_dns_prefetch = False
    has_hero_preload = False
    has_font_swap = False

    for link in soup.find_all("link"):
        rel = link.get("rel", [])
        if isinstance(rel, str):
            rel = [rel]
        rel_str = " ".join(rel).lower()

        if "preconnect" in rel_str:
            has_preconnect = True
        if "dns-prefetch" in rel_str:
            has_dns_prefetch = True
        if "preload" in rel_str and str(link.get("as", "")).lower() == "image":
            has_hero_preload = True

    # font-display: swap in inline <style> blocks
    for style in soup.find_all("style"):
        content = style.string or ""
        if _RE_FONT_DISPLAY_SWAP.search(content):
            has_font_swap = True
            break

    # font-display: swap in <link> stylesheet attributes (rare but valid)
    if not has_font_swap:
        for link in soup.find_all("link", rel="stylesheet"):
            if "font-display" in str(link.get("style", "")).lower():
                has_font_swap = True
                break

    return has_preconnect, has_dns_prefetch, has_hero_preload, has_font_swap


# ---------------------------------------------------------------------------
# Layer 1d: Inline CSS measurement
# ---------------------------------------------------------------------------


def _measure_inline_css(soup: BeautifulSoup) -> float:
    """Sum all ``<style>`` tag content lengths and return size in KB."""
    total_bytes = 0
    for style in soup.find_all("style"):
        content = style.string or ""
        total_bytes += len(content.encode("utf-8"))
    return round(total_bytes / 1024, 2)


# ---------------------------------------------------------------------------
# Layer 1e: Shopify theme detection
# ---------------------------------------------------------------------------


def _detect_theme(soup: BeautifulSoup) -> str | None:
    """Detect and classify the Shopify theme.

    Checks ``<meta name="theme-name">`` and ``Shopify.theme`` in inline
    scripts.  Classifies as ``"dawn"``, ``"os2"``, ``"legacy"``, or
    ``None``.
    """
    theme_name: str | None = None

    # Check <meta name="theme-name" content="...">
    meta = soup.find("meta", attrs={"name": "theme-name"})
    if meta and meta.get("content"):
        theme_name = str(meta["content"]).strip()

    # Fallback: parse Shopify.theme from inline scripts
    if not theme_name:
        for script in soup.find_all("script"):
            if not script.string:
                continue
            m = _RE_SHOPIFY_THEME.search(script.string)
            if m:
                theme_name = m.group(1).strip()
                break

    if not theme_name:
        return None

    normalised = theme_name.lower()

    if normalised == "dawn":
        return "dawn"
    if normalised in _LEGACY_THEMES:
        return "legacy"
    if normalised in _OS2_THEMES:
        return "os2"

    # Unknown theme -- no classification
    return None


# ---------------------------------------------------------------------------
# Layer 2: PSI API merge
# ---------------------------------------------------------------------------


def _merge_psi_data(
    psi_data: dict | None, signals: PageSpeedSignals
) -> None:
    """Copy PSI API fields into the signals dataclass.

    Uses ``.get()`` with ``None`` defaults so missing fields are
    gracefully handled.
    """
    if not isinstance(psi_data, dict):
        return

    signals.performance_score = psi_data.get("performance_score")
    signals.lcp_ms = psi_data.get("lcp_ms")
    signals.cls_value = psi_data.get("cls_value")
    signals.tbt_ms = psi_data.get("tbt_ms")
    signals.fcp_ms = psi_data.get("fcp_ms")
    signals.speed_index_ms = psi_data.get("speed_index_ms")
    signals.has_field_data = psi_data.get("has_field_data", False)
    signals.field_lcp_ms = psi_data.get("field_lcp_ms")
    signals.field_cls_value = psi_data.get("field_cls_value")


def _build_desktop_signals(
    psi_data: dict | None,
) -> PageSpeedDesktopSignals | None:
    """Build a :class:`PageSpeedDesktopSignals` from desktop PSI data.

    Returns ``None`` when the input isn't a usable PSI dict so callers
    can serialise the absence as a JSON null (rather than an empty
    struct). Mirrors the field shape produced by ``_parse_response``.
    """
    if not isinstance(psi_data, dict):
        return None
    return PageSpeedDesktopSignals(
        performance_score=psi_data.get("performance_score"),
        lcp_ms=psi_data.get("lcp_ms"),
        cls_value=psi_data.get("cls_value"),
        tbt_ms=psi_data.get("tbt_ms"),
        fcp_ms=psi_data.get("fcp_ms"),
        speed_index_ms=psi_data.get("speed_index_ms"),
        has_field_data=psi_data.get("has_field_data", False),
        field_lcp_ms=psi_data.get("field_lcp_ms"),
        field_cls_value=psi_data.get("field_cls_value"),
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_page_speed(
    html: str,
    psi_data: dict | None = None,
    desktop_psi_data: dict | None = None,
) -> PageSpeedSignals:
    """Detect page speed signals from rendered product page HTML.

    Analyses script bloat, image optimisation, resource hints, inline CSS
    weight, Shopify theme classification, and optionally merges PageSpeed
    Insights API data.

    Args:
        html: Rendered HTML string from the product page.
        psi_data: Optional dict of pre-fetched PSI API metrics for the
            **mobile** strategy. Drives the canonical metric fields and
            the rubric.
        desktop_psi_data: Optional dict of pre-fetched PSI API metrics
            for the **desktop** strategy. Surfaces in the
            :attr:`PageSpeedSignals.desktop` sub-struct for display only;
            does not affect scoring.

    Returns:
        Populated :class:`PageSpeedSignals` instance (never raises).
    """
    signals = PageSpeedSignals()
    signals.desktop = _build_desktop_signals(desktop_psi_data)

    if not html:
        _merge_psi_data(psi_data, signals)
        return signals

    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception:
        logger.exception("page_speed: failed to parse HTML")
        _merge_psi_data(psi_data, signals)
        return signals

    # Layer 1a: Script counting and classification
    (
        signals.script_count,
        signals.third_party_script_count,
        signals.render_blocking_script_count,
        signals.app_script_count,
    ) = _count_scripts(soup)

    # Layer 1b: Image optimisation checks
    (
        signals.has_lazy_loading,
        signals.lcp_image_lazy_loaded,
        signals.has_explicit_image_dimensions,
        signals.has_modern_image_formats,
    ) = _detect_image_optimization(soup)

    # Layer 1c: Resource hint detection
    (
        signals.has_preconnect_hints,
        signals.has_dns_prefetch,
        signals.has_hero_preload,
        signals.has_font_display_swap,
    ) = _detect_resource_hints(soup)

    # Layer 1d: Inline CSS measurement
    signals.inline_css_kb = _measure_inline_css(soup)

    # Layer 1e: Shopify theme detection
    signals.detected_theme = _detect_theme(soup)

    # Layer 2: PSI API merge
    _merge_psi_data(psi_data, signals)

    logger.info(
        "page_speed signals: scripts=%d 3p=%d blocking=%d apps=%d "
        "lazy=%s lcp_lazy=%s dims=%s modern=%s "
        "preconnect=%s dns=%s preload=%s font_swap=%s "
        "css_kb=%.2f theme=%s perf=%s lcp=%s cls=%s tbt=%s",
        signals.script_count,
        signals.third_party_script_count,
        signals.render_blocking_script_count,
        signals.app_script_count,
        signals.has_lazy_loading,
        signals.lcp_image_lazy_loaded,
        signals.has_explicit_image_dimensions,
        signals.has_modern_image_formats,
        signals.has_preconnect_hints,
        signals.has_dns_prefetch,
        signals.has_hero_preload,
        signals.has_font_display_swap,
        signals.inline_css_kb,
        signals.detected_theme,
        signals.performance_score,
        signals.lcp_ms,
        signals.cls_value,
        signals.tbt_ms,
    )

    return signals
