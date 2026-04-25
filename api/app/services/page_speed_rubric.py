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
            f"Your page loads {s.third_party_script_count} app scripts "
            f"\u2014 every 100ms of delay costs ~1% in sales (Amazon). "
            f"Open your Shopify Apps list and remove anything you no "
            f"longer use to speed things up"
        ),
    ),
    # 2. LCP above threshold
    (
        lambda s, _score: s.lcp_ms is not None and s.lcp_ms > 2500,
        lambda s, _score: (
            f"Your main product image takes {s.lcp_ms / 1000:.1f}s to "
            f"appear \u2014 the goal is under 2.5s. Make it load first, "
            f"and don't set it to load only when scrolled into view "
            f"(Deloitte: every 100ms faster = 8.4% more sales)"
        ),
    ),
    # 3. Render-blocking scripts
    (
        lambda s, _score: s.render_blocking_script_count > 3,
        lambda s, _score: (
            f"{s.render_blocking_script_count} app scripts run before "
            f"your page can show \u2014 this is the #1 cause of slow "
            f"product images on Shopify. Most apps can be set to load "
            f"after the page appears"
        ),
    ),
    # 4. CLS above threshold
    (
        lambda s, _score: s.cls_value is not None and s.cls_value > 0.1,
        lambda s, _score: (
            f"Your page jumps around as it loads (shift score "
            f"{s.cls_value:.2f}, target under 0.1). Reserve space for "
            f"images, banners, review widgets, and cookie pop-ups so "
            f"they don't push content around when they appear"
        ),
    ),
    # 5. LCP image lazy-loaded (anti-pattern)
    (
        lambda s, _score: s.lcp_image_lazy_loaded,
        (
            "Your main product image is set to load slowly \u2014 "
            "that delays everything. Tell your theme to load it first "
            "instead. Often a one-line theme change for a developer."
        ),
    ),
    # 6. No preconnect hints with many third-party scripts
    (
        lambda s, _score: (
            not s.has_preconnect_hints and s.third_party_script_count > 3
        ),
        (
            "Tell the browser to start connecting to outside services "
            "(fonts, analytics, reviews) early instead of when they're "
            "first needed \u2014 saves 100\u2013300ms per service"
        ),
    ),
    # 7. Too many app scripts
    (
        lambda s, _score: s.app_script_count > 5,
        (
            "Consider replacing some UI apps with Shopify's built-in "
            "tools (metafields, metaobjects, Flow) \u2014 can cut app "
            "overhead 30\u201350% with the same features"
        ),
    ),
    # 8. Congratulatory — strong page speed
    (
        lambda s, score: score >= 80,
        (
            "Strong speed foundation \u2014 your store loads faster "
            "than 53% of Shopify stores. Next-level wins come from "
            "edge caching and prefetching the next page shoppers will "
            "click"
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
            "label": "Speed score 90 or higher (Google mobile test)",
            "passed": bool(
                signals.performance_score is not None
                and signals.performance_score >= 90
            ),
            "weight": 25,
            "remediation": (
                "Work through the specific fixes below — using modern "
                "image formats, loading apps after the page appears, "
                "and pre-connecting to outside services typically "
                "recovers 20–40 points on Google's speed test for "
                "Shopify stores."
            ),
        })
        checks.append({
            "id": "lcp_good",
            "label": "Main product image appears in under 2.5 seconds",
            "passed": bool(
                signals.lcp_ms is not None and signals.lcp_ms <= 2500
            ),
            "weight": 20,
            "remediation": (
                "Tell your theme to load the main product image first, "
                "don't set it to load only when scrolled into view, and "
                "serve modern compressed image formats (WebP or AVIF). "
                "When this image takes longer than 2.5 seconds, "
                "shoppers leave at roughly twice the rate."
            ),
        })
        checks.append({
            "id": "cls_good",
            "label": "Page stays still as it loads",
            "passed": bool(
                signals.cls_value is not None and signals.cls_value <= 0.1
            ),
            "weight": 10,
            "remediation": (
                "Reserve space for every image and embedded widget "
                "before they finish loading, so nothing pushes content "
                "around when it appears. The usual culprits: rotating "
                "banners, review widgets, and cookie consent pop-ups."
            ),
        })
        checks.append({
            "id": "tbt_good",
            "label": "Page responds quickly to clicks and taps",
            "passed": bool(
                signals.tbt_ms is not None and signals.tbt_ms <= 200
            ),
            "weight": 10,
            "remediation": (
                "Set non-essential apps (email pop-ups, subscription "
                "tools, chat widgets) to load after the page appears, "
                "or only when a shopper interacts with them. This stops "
                "them from freezing the page during the first few "
                "seconds."
            ),
        })

    script_weight = 15 if has_psi else 30
    checks.append({
        "id": "script_count_low",
        "label": "5 or fewer app scripts loading on the page",
        "passed": signals.third_party_script_count <= 5,
        "weight": script_weight,
        "remediation": (
            "Open your Shopify Apps list. Each installed app usually "
            "adds one or more scripts that run on every page. Uninstall "
            "anything you don't actively use, and ask your theme "
            "developer to delay the rest until a shopper interacts with "
            "them. Aim for 5 or fewer."
        ),
    })

    image_weight = 2 if has_psi else 6
    checks.extend([
        {
            "id": "modern_image_formats",
            "label": "Images served in modern compressed formats",
            "passed": bool(signals.has_modern_image_formats),
            "weight": image_weight + (1 if has_psi else 1),
            "remediation": (
                "Ask your theme to serve images in WebP or AVIF instead "
                "of JPEG or PNG. The new formats cut image file size "
                "40–70% with no visible difference. Most modern Shopify "
                "themes do this automatically — your theme developer "
                "can flip it on if it isn't already."
            ),
        },
        {
            "id": "explicit_image_dimensions",
            "label": "Image sizes set so the page doesn't jump",
            "passed": bool(signals.has_explicit_image_dimensions),
            "weight": image_weight + (1 if has_psi else 0),
            "remediation": (
                "Tell the browser how big each image should be before "
                "it loads. That way the page reserves the space and "
                "doesn't jump around when images arrive. Modern themes "
                "do this automatically — your theme developer can fix "
                "any that don't."
            ),
        },
        {
            "id": "hero_preload",
            "label": "Main product image loads first",
            "passed": bool(signals.has_hero_preload),
            "weight": image_weight + (1 if has_psi else 0),
            "remediation": (
                "Tell the browser to start loading your main product "
                "image right away, instead of after other resources. "
                "This shaves 200–500ms off the time the image appears "
                "on mobile. Your theme developer can add a single line "
                "to your theme code to enable it."
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
            "label": "Main product image isn't set to load slowly",
            "passed": not signals.lcp_image_lazy_loaded,
            "weight": image_weight + (1 if has_psi else 0),
            "remediation": (
                "Your main product image is configured to wait until "
                "shoppers scroll before loading. That's the wrong "
                "setting for the most important image on the page. "
                "Your theme developer can change one line so it loads "
                "right away — one of the highest-impact speed fixes "
                "for Shopify."
            ),
        },
    ])

    checks.extend([
        {
            "id": "preconnect_hints",
            "label": "Browser connects to outside services early",
            "passed": bool(signals.has_preconnect_hints),
            "weight": 3 if has_psi else 7,
            "remediation": (
                "Tell the browser to start opening connections to "
                "Shopify's image servers and Google Fonts as early as "
                "possible. Otherwise these connections happen one at a "
                "time and slow down your main product image. Your theme "
                "developer adds two lines to your theme."
            ),
            "code": (
                "<!-- theme.liquid <head> -->\n"
                "<link rel=\"preconnect\" href=\"https://cdn.shopify.com\" crossorigin>\n"
                "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>"
            ),
        },
        {
            "id": "font_display_swap",
            "label": "Text shows immediately while custom fonts load",
            "passed": bool(signals.has_font_display_swap),
            "weight": 3 if has_psi else 7,
            "remediation": (
                "Tell your custom fonts to show readable backup text "
                "right away while they finish downloading. Without "
                "this, shoppers on slow connections see blank space "
                "where your text should be. Your theme developer adds "
                "one line to each custom font."
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
            "label": "Browser pre-resolves outside service addresses",
            "passed": bool(signals.has_dns_prefetch),
            "weight": 2 if has_psi else 5,
            "remediation": (
                "Pre-announce to the browser the outside services your "
                "page uses — analytics, fonts, review widgets — so it "
                "looks them up early. Cheap fix that usually saves "
                "50–200ms. Your theme developer adds one line per "
                "service."
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
            "label": "Page styles stay small and reusable",
            "passed": signals.inline_css_kb < 10,
            "weight": 2 if has_psi else 6,
            "remediation": (
                "Your theme has more than 10KB of design rules baked "
                "into every page. Moving most of them into a shared "
                "file lets the browser cache them once and reuse them, "
                "speeding up every page after the first. Your theme "
                "developer can do this in 30 minutes."
            ),
        },
    ])

    if not has_psi:
        checks.append({
            "id": "modern_theme",
            "label": "Running a modern Shopify theme",
            "passed": signals.detected_theme in {"dawn", "os2"},
            "weight": 10,
            "remediation": (
                "Move to one of Shopify's current themes (Dawn, Sense, "
                "Ride, or any modern third-party theme). Older themes "
                "are slower from the ground up — they don't handle "
                "images efficiently, can't use Shopify's newer "
                "section-based layouts, and miss out on speed "
                "improvements Shopify ships every year."
            ),
        })

    return checks
