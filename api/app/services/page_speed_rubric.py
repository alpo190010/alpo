"""Scoring rubric and tip selector for page speed signals.

Converts :class:`PageSpeedSignals` into a deterministic 0–100 score
using weighted criteria derived from Google Web Vitals, Deloitte,
Amazon latency research, and Shopify theme performance benchmarks,
and selects up to 3 prioritised improvement tips.

Two scoring paths are used depending on whether PageSpeed Insights
API data is available (Path A) or only HTML-derived signals exist
(Path B).
"""

from __future__ import annotations

from app.services.page_speed_detector import PageSpeedSignals


# ---------------------------------------------------------------------------
# Scoring rubric
# ---------------------------------------------------------------------------


def score_page_speed(signals: PageSpeedSignals) -> int:
    """Compute a 0–100 page speed score from extracted signals.

    Path A — PSI data available (performance_score is not None):

        Performance score (0–100 mapped):           25 pts
        LCP quality (<= 2500ms good):               20 pts
        CLS quality (<= 0.1 good):                  10 pts
        TBT quality (<= 200ms good):                10 pts
        Script/app bloat (third-party count):        15 pts
        Image optimisation practices:                10 pts
        Technical practices (hints, fonts, CSS):     10 pts

    Path B — HTML-only (performance_score is None):

        Script/app bloat (third-party count):        30 pts
        Image optimisation practices:                25 pts
        Technical practices (hints, fonts, CSS):     25 pts
        Theme quality (detected theme):              10 pts
        Resource hints (preconnect, prefetch):       10 pts

    Returns:
        Integer clamped to 0–100.
    """
    if signals.performance_score is not None:
        score = _score_path_a(signals)
    else:
        score = _score_path_b(signals)

    return max(0, min(100, score))


def _score_path_a(signals: PageSpeedSignals) -> int:
    """Score with full PSI data available."""
    score = 0

    # Performance score (25 pts)
    if signals.performance_score >= 90:
        score += 25
    elif signals.performance_score >= 50:
        score += 5 + round(20 * (signals.performance_score - 50) / 40)
    else:
        score += 5

    # LCP quality (20 pts)
    if signals.lcp_ms is not None and signals.lcp_ms <= 2500:
        score += 20
    elif signals.lcp_ms is not None and signals.lcp_ms <= 4000:
        score += 10

    # CLS quality (10 pts)
    if signals.cls_value is not None and signals.cls_value <= 0.1:
        score += 10
    elif signals.cls_value is not None and signals.cls_value <= 0.25:
        score += 5

    # TBT quality (10 pts)
    if signals.tbt_ms is not None and signals.tbt_ms <= 200:
        score += 10
    elif signals.tbt_ms is not None and signals.tbt_ms <= 600:
        score += 5

    # Script/app bloat (15 pts)
    if signals.third_party_script_count <= 5:
        score += 15
    elif signals.third_party_script_count <= 10:
        score += 10
    elif signals.third_party_script_count <= 15:
        score += 5

    # Image optimisation (10 pts — 2.5 each)
    if signals.has_modern_image_formats:
        score += 2.5
    if signals.has_explicit_image_dimensions:
        score += 2.5
    if signals.has_hero_preload:
        score += 2.5
    if not signals.lcp_image_lazy_loaded:
        score += 2.5

    # Technical practices (10 pts)
    if signals.has_preconnect_hints:
        score += 3
    if signals.has_font_display_swap:
        score += 3
    if signals.has_dns_prefetch:
        score += 2
    if signals.inline_css_kb < 10:
        score += 2

    return int(score)


def _score_path_b(signals: PageSpeedSignals) -> int:
    """Score with HTML-only signals (no PSI data)."""
    score = 0

    # Script/app bloat (30 pts)
    if signals.third_party_script_count <= 5:
        score += 30
    elif signals.third_party_script_count <= 10:
        score += 20
    elif signals.third_party_script_count <= 15:
        score += 10

    # Image optimisation (25 pts)
    if signals.has_modern_image_formats:
        score += 7
    if signals.has_explicit_image_dimensions:
        score += 6
    if signals.has_hero_preload:
        score += 6
    if not signals.lcp_image_lazy_loaded:
        score += 6

    # Technical practices (25 pts)
    if signals.has_preconnect_hints:
        score += 7
    if signals.has_font_display_swap:
        score += 7
    if signals.has_dns_prefetch:
        score += 5
    if signals.inline_css_kb < 10:
        score += 6

    # Theme quality (10 pts)
    if signals.detected_theme == "dawn":
        score += 10
    elif signals.detected_theme == "os2":
        score += 7
    elif signals.detected_theme == "legacy":
        score += 3
    elif signals.detected_theme is None:
        score += 5

    # Resource hints (10 pts)
    if signals.has_preconnect_hints:
        score += 4
    if signals.has_dns_prefetch:
        score += 3
    if signals.has_hero_preload:
        score += 3

    return score


# ---------------------------------------------------------------------------
# Tip selector
# ---------------------------------------------------------------------------

# Tips ordered by impact priority (highest first).  Each entry is a
# (condition_callable, tip_or_callable) pair.  The condition receives
# the signals *and* the computed score.  The tip element is either a
# static string or a callable(signals, score) -> str for tips that
# include dynamic signal values.

_TIP_RULES: list[tuple] = [
    # 1. App bloat — too many third-party scripts
    (
        lambda s, _score: s.third_party_script_count > 10,
        lambda s, _score: (
            f"Your page loads {s.third_party_script_count} third-party "
            f"scripts \u2014 every 100ms of latency costs 1% in sales "
            f"(Amazon). Audit unused Shopify apps to cut script bloat"
        ),
    ),
    # 2. LCP above threshold
    (
        lambda s, _score: s.lcp_ms is not None and s.lcp_ms > 2500,
        lambda s, _score: (
            f"LCP is {s.lcp_ms / 1000:.1f}s \u2014 above the 2.5s "
            f"'good' threshold. Ensure the hero image uses "
            f"fetchpriority='high' and is never lazy-loaded (Deloitte: "
            f"100ms improvement = 8.4% conversion lift)"
        ),
    ),
    # 3. Render-blocking scripts
    (
        lambda s, _score: s.render_blocking_script_count > 3,
        lambda s, _score: (
            f"{s.render_blocking_script_count} scripts in <head> lack "
            f"async/defer \u2014 render-blocking JavaScript is the #1 "
            f"cause of slow Largest Contentful Paint on Shopify"
        ),
    ),
    # 4. CLS above threshold
    (
        lambda s, _score: s.cls_value is not None and s.cls_value > 0.1,
        lambda s, _score: (
            f"CLS is {s.cls_value:.2f} \u2014 above the 0.1 'good' "
            f"threshold. Add explicit width/height to all images and "
            f"embed slots to prevent layout shifts"
        ),
    ),
    # 5. LCP image lazy-loaded (anti-pattern)
    (
        lambda s, _score: s.lcp_image_lazy_loaded,
        (
            "Hero product image has loading='lazy' \u2014 this "
            "anti-pattern delays LCP. Remove it and add "
            "fetchpriority='high' instead"
        ),
    ),
    # 6. No preconnect hints with many third-party scripts
    (
        lambda s, _score: (
            not s.has_preconnect_hints and s.third_party_script_count > 3
        ),
        (
            "Add <link rel='preconnect'> for third-party domains to "
            "cut DNS/TLS handshake time by 100\u2013300ms per origin"
        ),
    ),
    # 7. Too many app scripts
    (
        lambda s, _score: s.app_script_count > 5,
        (
            "Consider replacing UI apps with Shopify OS 2.0 native "
            "features (metafields, metaobjects, Flow) \u2014 can "
            "eliminate 30\u201350% of app overhead with zero performance "
            "cost"
        ),
    ),
    # 8. Congratulatory — strong page speed
    (
        lambda s, score: score >= 80,
        (
            "Strong technical foundation \u2014 your page speed "
            "outperforms 53% of Shopify stores. Consider edge caching "
            "and predictive prefetching for further gains"
        ),
    ),
]


def get_page_speed_tips(signals: PageSpeedSignals) -> list[str]:
    """Return up to 3 research-backed page speed improvement tips.

    Tips are selected based on which page speed signals are missing or
    weak, prioritised by conversion impact (most impactful first).

    Args:
        signals: Extracted page speed signals.

    Returns:
        A list of 0–3 tip strings.
    """
    score = score_page_speed(signals)
    tips: list[str] = []

    for condition, tip in _TIP_RULES:
        if condition(signals, score):
            tips.append(tip(signals, score) if callable(tip) else tip)
            if len(tips) >= 3:
                break

    return tips


# ---------------------------------------------------------------------------
# Per-check breakdown (for UI "What's working / What's missing" lists)
# ---------------------------------------------------------------------------


def list_page_speed_checks(signals: PageSpeedSignals) -> list[dict]:
    """Enumerate page speed pass/fail checks.

    Path A (PSI data available) exposes performance score + Core Web
    Vitals checks alongside HTML-derived checks. Path B (HTML-only) omits
    the PSI-specific checks. Weights follow the active rubric path.
    """
    has_psi = signals.performance_score is not None
    checks: list[dict] = []

    if has_psi:
        checks.append({
            "id": "performance_score_good",
            "label": "Lighthouse performance score 90+",
            "passed": bool(
                signals.performance_score is not None
                and signals.performance_score >= 90
            ),
            "weight": 25,
            "remediation": (
                "Work through the specific fixes below — modern image "
                "formats, script deferral, preconnect, and hero preload "
                "typically recover 20–40 Lighthouse points on Shopify "
                "stores."
            ),
        })
        checks.append({
            "id": "lcp_good",
            "label": "LCP under 2.5s (Largest Contentful Paint)",
            "passed": bool(
                signals.lcp_ms is not None and signals.lcp_ms <= 2500
            ),
            "weight": 20,
            "remediation": (
                "Preload the hero image, remove lazy-loading from "
                "above-fold content, and serve a responsive srcset with "
                "AVIF/WebP. LCP > 2.5s roughly doubles bounce rate."
            ),
        })
        checks.append({
            "id": "cls_good",
            "label": "CLS under 0.1 (Cumulative Layout Shift)",
            "passed": bool(
                signals.cls_value is not None and signals.cls_value <= 0.1
            ),
            "weight": 10,
            "remediation": (
                "Add explicit width/height on every image and iframe "
                "so the browser reserves space. Reserve space for "
                "dynamic banners, review widgets, and cookie consent "
                "too — they're the usual CLS offenders."
            ),
        })
        checks.append({
            "id": "tbt_good",
            "label": "TBT under 200ms (Total Blocking Time)",
            "passed": bool(
                signals.tbt_ms is not None and signals.tbt_ms <= 200
            ),
            "weight": 10,
            "remediation": (
                "Defer non-critical third-party scripts (Klaviyo, "
                "ReCharge, chat widgets) until user interaction or a "
                "requestIdleCallback. Use async/defer on <script> tags."
            ),
        })

    script_weight = 15 if has_psi else 30
    checks.append({
        "id": "script_count_low",
        "label": "5 or fewer third-party scripts",
        "passed": signals.third_party_script_count <= 5,
        "weight": script_weight,
        "remediation": (
            "Audit installed Shopify apps — each typically injects a "
            "third-party script. Remove apps you don't use, and defer "
            "the rest until interaction. Target ≤5 global scripts."
        ),
    })

    image_weight = 2 if has_psi else 6
    checks.extend([
        {
            "id": "modern_image_formats",
            "label": "Modern image formats (WebP / AVIF)",
            "passed": bool(signals.has_modern_image_formats),
            "weight": image_weight + (1 if has_psi else 1),
            "remediation": (
                "Use Shopify's {{ image | image_url: format: 'webp' }} "
                "filter (or a responsive <picture> with AVIF → WebP → "
                "JPG fallback). Cuts hero-image bytes 40–70%."
            ),
        },
        {
            "id": "explicit_image_dimensions",
            "label": "Explicit width/height on images",
            "passed": bool(signals.has_explicit_image_dimensions),
            "weight": image_weight + (1 if has_psi else 0),
            "remediation": (
                "Add width and height attributes (or an aspect-ratio "
                "CSS rule) to every <img>. Browsers need this to "
                "reserve space and avoid layout shift."
            ),
        },
        {
            "id": "hero_preload",
            "label": "Hero image preloaded",
            "passed": bool(signals.has_hero_preload),
            "weight": image_weight + (1 if has_psi else 0),
            "remediation": (
                "Add `<link rel=\"preload\" as=\"image\" "
                "href=\"{{ product.featured_image | image_url }}\">` "
                "in <head>. Shaves 200–500ms off LCP on mobile."
            ),
            "code": (
                "<!-- theme.liquid <head> -->\n"
                "{%- if template.name == 'product' and product.featured_image -%}\n"
                "  <link rel=\"preload\" as=\"image\"\n"
                "        href=\"https:{{ product.featured_image | image_url: width: 1200 }}\"\n"
                "        imagesrcset=\"https:{{ product.featured_image | image_url: width: 800 }} 800w,\n"
                "                     https:{{ product.featured_image | image_url: width: 1600 }} 1600w\">\n"
                "{%- endif -%}"
            ),
        },
        {
            "id": "lcp_not_lazy",
            "label": "Hero image not lazy-loaded",
            "passed": not signals.lcp_image_lazy_loaded,
            "weight": image_weight + (1 if has_psi else 0),
            "remediation": (
                "Remove loading=\"lazy\" from your hero / above-fold "
                "image. Lazy-loaded LCP images are one of the top "
                "Lighthouse penalties on Shopify themes."
            ),
        },
    ])

    checks.extend([
        {
            "id": "preconnect_hints",
            "label": "Preconnect hints for third-party origins",
            "passed": bool(signals.has_preconnect_hints),
            "weight": 3 if has_psi else 7,
            "remediation": (
                "Add `<link rel=\"preconnect\" href=\"https://cdn."
                "shopify.com\" crossorigin>` and one for fonts.gstatic.com "
                "in <head>. Parallelizes handshakes that otherwise "
                "block hero content."
            ),
            "code": (
                "<!-- theme.liquid <head> -->\n"
                "<link rel=\"preconnect\" href=\"https://cdn.shopify.com\" crossorigin>\n"
                "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>"
            ),
        },
        {
            "id": "font_display_swap",
            "label": "font-display: swap on custom fonts",
            "passed": bool(signals.has_font_display_swap),
            "weight": 3 if has_psi else 7,
            "remediation": (
                "Add `font-display: swap;` to every @font-face "
                "declaration so text renders with the fallback while "
                "the custom font loads. Prevents invisible text "
                "(FOIT) on slow connections."
            ),
            "code": (
                "/* Add to every @font-face in your theme CSS */\n"
                "@font-face {\n"
                "  font-family: 'YourFont';\n"
                "  src: url('...') format('woff2');\n"
                "  font-display: swap;\n"
                "}"
            ),
        },
        {
            "id": "dns_prefetch",
            "label": "DNS prefetch for third-party domains",
            "passed": bool(signals.has_dns_prefetch),
            "weight": 2 if has_psi else 5,
            "remediation": (
                "Add `<link rel=\"dns-prefetch\" href=\"//example.com\">` "
                "for third-party domains your page calls (analytics, "
                "fonts, review widgets). Cheap — usually saves 50–200ms."
            ),
            "code": (
                "<!-- theme.liquid <head> -->\n"
                "<link rel=\"dns-prefetch\" href=\"//www.google-analytics.com\">\n"
                "<link rel=\"dns-prefetch\" href=\"//static.klaviyo.com\">\n"
                "<link rel=\"dns-prefetch\" href=\"//widget.trustpilot.com\">"
            ),
        },
        {
            "id": "inline_css_small",
            "label": "Inline CSS under 10KB",
            "passed": signals.inline_css_kb < 10,
            "weight": 2 if has_psi else 6,
            "remediation": (
                "Move large inline <style> blocks out into external "
                "stylesheets so they can be cached across pages. "
                "Inline only the above-the-fold critical CSS."
            ),
        },
    ])

    if not has_psi:
        checks.append({
            "id": "modern_theme",
            "label": "Modern Shopify theme (Dawn / OS 2.0)",
            "passed": signals.detected_theme in {"dawn", "os2"},
            "weight": 10,
            "remediation": (
                "Migrate to a Shopify 2.0 theme (Dawn, Sense, Ride, "
                "or a third-party OS 2.0 theme). Legacy 1.0 themes "
                "lack modern image handling, native sections, and "
                "are structurally slower."
            ),
        })

    return checks
