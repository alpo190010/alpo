"""Tests for page speed detector, rubric, and tip selector."""

from app.services.page_speed_detector import PageSpeedSignals, detect_page_speed
from app.services.page_speed_rubric import get_page_speed_tips, score_page_speed


# ---------------------------------------------------------------------------
# HTML fixtures
# ---------------------------------------------------------------------------


def _empty_html() -> str:
    return "<html><body><h1>Product Title</h1><p>Some description.</p></body></html>"


def _bloated_html() -> str:
    return """<html><head>
    <script src="https://cdn.judge.me/widget.js"></script>
    <script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>
    <script src="https://loox.io/widget/loox.js"></script>
    <script src="https://stamped.io/assets/stamped.js"></script>
    <script src="https://cdn.yotpo.com/yotpo.js"></script>
    <script src="https://hextom.com/bar.js"></script>
    <script src="https://apps.elfsight.com/widget.js"></script>
    <script src="https://cdn.smile.io/loyalty.js"></script>
    <script src="https://cdn.justuno.com/popup.js"></script>
    <script src="https://cdn.aftership.com/track.js"></script>
    <script src="https://privy.com/widget.js"></script>
    <script src="https://recharge.com/sub.js"></script>
    <script src="https://bold.co/bold.js"></script>
    <script>var x = 1;</script>
    </head><body>
    <h1>Bloated Page</h1>
    <img src="product.jpg">
    </body></html>"""


def _optimized_html() -> str:
    return """<html><head>
    <meta name="theme-name" content="Dawn">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="dns-prefetch" href="//cdn.shopify.com">
    <link rel="preload" as="image" href="hero.webp">
    <style>@font-face { font-family: 'Custom'; font-display: swap; }</style>
    <script src="https://cdn.shopify.com/main.js" async></script>
    <script src="https://cdn.shopify.com/theme.js" defer></script>
    </head><body>
    <h1>Optimized Product</h1>
    <main>
    <div class="product__media">
        <img src="hero.webp" width="800" height="600"
             srcset="hero.webp 800w, hero-sm.webp 400w">
    </div>
    <img src="thumb1.jpg" width="100" height="100" loading="lazy">
    <img src="thumb2.jpg" width="100" height="100" loading="lazy">
    </main>
    </body></html>"""


def _lazy_lcp_html() -> str:
    return """<html><body>
    <div class="product__media">
        <img src="hero.jpg" loading="lazy" width="800" height="600">
    </div>
    </body></html>"""


def _modern_images_html() -> str:
    return """<html><body>
    <picture>
        <source type="image/webp" srcset="hero.webp">
        <img src="hero.jpg" srcset="hero.avif 1x" width="800" height="600">
    </picture>
    </body></html>"""


def _dawn_theme_html() -> str:
    return """<html><head>
    <meta name="theme-name" content="Dawn">
    </head><body><h1>Product</h1></body></html>"""


def _legacy_theme_html() -> str:
    return """<html><head>
    <meta name="theme-name" content="Debut">
    </head><body><h1>Product</h1></body></html>"""


# ---------------------------------------------------------------------------
# Detection tests
# ---------------------------------------------------------------------------


class TestDetection:
    def test_empty_html_default_signals(self):
        signals = detect_page_speed(_empty_html())
        assert signals.script_count == 0
        assert signals.third_party_script_count == 0
        assert signals.has_lazy_loading is False
        assert signals.detected_theme is None

    def test_script_counting(self):
        signals = detect_page_speed(_bloated_html())
        assert signals.script_count >= 14
        assert signals.third_party_script_count >= 12
        assert signals.render_blocking_script_count >= 13
        assert signals.app_script_count >= 10

    def test_optimized_page_signals(self):
        signals = detect_page_speed(_optimized_html())
        assert signals.has_preconnect_hints is True
        assert signals.has_dns_prefetch is True
        assert signals.has_hero_preload is True
        assert signals.has_font_display_swap is True
        assert signals.has_modern_image_formats is True
        assert signals.has_explicit_image_dimensions is True

    def test_lcp_lazy_load_flagged(self):
        signals = detect_page_speed(_lazy_lcp_html())
        assert signals.lcp_image_lazy_loaded is True

    def test_modern_image_formats_detected(self):
        signals = detect_page_speed(_modern_images_html())
        assert signals.has_modern_image_formats is True

    def test_dawn_theme_detected(self):
        signals = detect_page_speed(_dawn_theme_html())
        assert signals.detected_theme == "dawn"

    def test_legacy_theme_detected(self):
        signals = detect_page_speed(_legacy_theme_html())
        assert signals.detected_theme == "legacy"

    def test_psi_data_merged(self):
        psi = {
            "performance_score": 85,
            "lcp_ms": 2200.0,
            "cls_value": 0.05,
            "tbt_ms": 150.0,
            "fcp_ms": 1800.0,
            "speed_index_ms": 3200.0,
            "has_field_data": True,
            "field_lcp_ms": 2400.0,
            "field_cls_value": 0.08,
        }
        signals = detect_page_speed(_empty_html(), psi_data=psi)
        assert signals.performance_score == 85
        assert signals.lcp_ms == 2200.0
        assert signals.has_field_data is True

    def test_psi_data_none_graceful(self):
        signals = detect_page_speed(_empty_html(), psi_data=None)
        assert signals.performance_score is None
        assert signals.lcp_ms is None
        assert signals.has_field_data is False


# ---------------------------------------------------------------------------
# Scoring tests
# ---------------------------------------------------------------------------


class TestScoring:
    def test_empty_signals_score_zero_or_low(self):
        """Empty signals get baseline points (no LCP lazy + low CSS + theme)."""
        score = score_page_speed(PageSpeedSignals())
        # Path B: +30 (<=5 3p) +6 (no lcp lazy) +6 (css<10) +5 (theme None)
        # = at least some points, but well below 50
        assert 0 <= score <= 60

    def test_perfect_psi_html_max_score(self):
        signals = PageSpeedSignals(
            script_count=3,
            third_party_script_count=2,
            render_blocking_script_count=0,
            app_script_count=0,
            has_lazy_loading=True,
            lcp_image_lazy_loaded=False,
            has_explicit_image_dimensions=True,
            has_modern_image_formats=True,
            has_font_display_swap=True,
            has_preconnect_hints=True,
            has_dns_prefetch=True,
            has_hero_preload=True,
            inline_css_kb=2.0,
            detected_theme="dawn",
            performance_score=95,
            lcp_ms=1500.0,
            cls_value=0.02,
            tbt_ms=100.0,
        )
        assert score_page_speed(signals) == 100

    def test_perfect_html_only_max_score(self):
        signals = PageSpeedSignals(
            script_count=3,
            third_party_script_count=2,
            render_blocking_script_count=0,
            app_script_count=0,
            has_lazy_loading=True,
            lcp_image_lazy_loaded=False,
            has_explicit_image_dimensions=True,
            has_modern_image_formats=True,
            has_font_display_swap=True,
            has_preconnect_hints=True,
            has_dns_prefetch=True,
            has_hero_preload=True,
            inline_css_kb=2.0,
            detected_theme="dawn",
        )
        assert score_page_speed(signals) == 100

    def test_psi_path_performance_score_tiers(self):
        # 90+ -> 25 pts
        s90 = PageSpeedSignals(performance_score=92, lcp_ms=5000.0)
        # 70 -> proportional between 5 and 25
        s70 = PageSpeedSignals(performance_score=70, lcp_ms=5000.0)
        # 30 -> 5 pts
        s30 = PageSpeedSignals(performance_score=30, lcp_ms=5000.0)

        score_90 = score_page_speed(s90)
        score_70 = score_page_speed(s70)
        score_30 = score_page_speed(s30)

        assert score_90 > score_70 > score_30

    def test_psi_path_lcp_tiers(self):
        good = PageSpeedSignals(performance_score=50, lcp_ms=2000.0)
        mid = PageSpeedSignals(performance_score=50, lcp_ms=3000.0)
        poor = PageSpeedSignals(performance_score=50, lcp_ms=5000.0)

        assert score_page_speed(good) > score_page_speed(mid) > score_page_speed(poor)

    def test_html_path_script_bloat_tiers(self):
        s5 = PageSpeedSignals(third_party_script_count=5)
        s8 = PageSpeedSignals(third_party_script_count=8)
        s12 = PageSpeedSignals(third_party_script_count=12)
        s20 = PageSpeedSignals(third_party_script_count=20)

        assert score_page_speed(s5) > score_page_speed(s8)
        assert score_page_speed(s8) > score_page_speed(s12)
        assert score_page_speed(s12) > score_page_speed(s20)

    def test_score_always_clamped(self):
        low = score_page_speed(PageSpeedSignals())
        high = score_page_speed(PageSpeedSignals(
            performance_score=100,
            third_party_script_count=0,
            has_modern_image_formats=True,
            has_explicit_image_dimensions=True,
            has_hero_preload=True,
            has_preconnect_hints=True,
            has_dns_prefetch=True,
            has_font_display_swap=True,
            lcp_ms=1000.0,
            cls_value=0.01,
            tbt_ms=50.0,
        ))
        assert 0 <= low <= 100
        assert 0 <= high <= 100


# ---------------------------------------------------------------------------
# Tip tests
# ---------------------------------------------------------------------------


class TestTipSelection:
    def test_max_3_tips(self):
        """Construct signals that trigger all 8 rules, verify len <= 3."""
        signals = PageSpeedSignals(
            third_party_script_count=15,
            render_blocking_script_count=6,
            app_script_count=8,
            lcp_image_lazy_loaded=True,
            has_preconnect_hints=False,
            performance_score=95,
            lcp_ms=4000.0,
            cls_value=0.3,
        )
        tips = get_page_speed_tips(signals)
        assert len(tips) <= 3

    def test_bloat_tip_triggered(self):
        signals = PageSpeedSignals(third_party_script_count=15)
        tips = get_page_speed_tips(signals)
        assert any("15" in t for t in tips)

    def test_lcp_tip_with_value(self):
        signals = PageSpeedSignals(performance_score=50, lcp_ms=4000.0)
        tips = get_page_speed_tips(signals)
        assert any("4.0s" in t for t in tips)

    def test_render_blocking_tip(self):
        signals = PageSpeedSignals(
            render_blocking_script_count=6,
            third_party_script_count=2,
        )
        tips = get_page_speed_tips(signals)
        assert any("6" in t and "before your page" in t.lower() for t in tips)

    def test_congratulatory_tip(self):
        signals = PageSpeedSignals(
            third_party_script_count=2,
            render_blocking_script_count=0,
            app_script_count=0,
            lcp_image_lazy_loaded=False,
            has_preconnect_hints=True,
            has_modern_image_formats=True,
            has_explicit_image_dimensions=True,
            has_hero_preload=True,
            has_font_display_swap=True,
            has_dns_prefetch=True,
            inline_css_kb=2.0,
            detected_theme="dawn",
        )
        tips = get_page_speed_tips(signals)
        assert any("strong" in t.lower() or "outperform" in t.lower() for t in tips)

    def test_no_tips_for_moderate_page(self):
        """Middle-of-road signals that don't trigger any rule."""
        signals = PageSpeedSignals(
            third_party_script_count=8,
            render_blocking_script_count=2,
            app_script_count=3,
            lcp_image_lazy_loaded=False,
            has_preconnect_hints=True,
            performance_score=75,
            lcp_ms=2200.0,
            cls_value=0.08,
            tbt_ms=180.0,
        )
        tips = get_page_speed_tips(signals)
        assert len(tips) == 0


# ---------------------------------------------------------------------------
# End-to-end tests
# ---------------------------------------------------------------------------


class TestEndToEnd:
    def test_full_pipeline_with_psi(self):
        psi = {
            "performance_score": 92,
            "lcp_ms": 1800.0,
            "cls_value": 0.03,
            "tbt_ms": 120.0,
            "fcp_ms": 1200.0,
            "speed_index_ms": 2500.0,
            "has_field_data": True,
            "field_lcp_ms": 2000.0,
            "field_cls_value": 0.05,
        }
        signals = detect_page_speed(_optimized_html(), psi_data=psi)
        score = score_page_speed(signals)
        tips = get_page_speed_tips(signals)

        assert signals.performance_score == 92
        assert signals.has_preconnect_hints is True
        assert score >= 80
        assert isinstance(tips, list)

    def test_full_pipeline_html_only(self):
        signals = detect_page_speed(_optimized_html())
        score = score_page_speed(signals)
        tips = get_page_speed_tips(signals)

        assert signals.performance_score is None
        assert score >= 70
        assert isinstance(tips, list)

    def test_empty_html_pipeline(self):
        signals = detect_page_speed(_empty_html())
        score = score_page_speed(signals)
        tips = get_page_speed_tips(signals)

        assert isinstance(signals, PageSpeedSignals)
        assert 0 <= score <= 100
        assert isinstance(tips, list)
