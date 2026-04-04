"""Unit tests for social_commerce_detector and social_commerce_rubric.

Covers R007 requirements: Instagram/TikTok/Pinterest embed detection,
UGC gallery app detection, deterministic 0–100 scoring, and
research-cited tip selection (max 3).
"""

from dataclasses import fields, is_dataclass

import pytest

from app.services.social_commerce_detector import (
    SocialCommerceSignals,
    detect_social_commerce,
)
from app.services.social_commerce_rubric import (
    get_social_commerce_tips,
    score_social_commerce,
)


# ---------------------------------------------------------------------------
# HTML fixture helpers — minimal but realistic product page fragments
# ---------------------------------------------------------------------------


def _empty_html() -> str:
    """Baseline page with no social commerce signals."""
    return "<html><body><h1>Product</h1></body></html>"


def _instagram_html() -> str:
    """Page with Instagram embed: blockquote + data attribute + embed.js."""
    return (
        "<html><body>"
        '<blockquote class="instagram-media"'
        ' data-instgrm-permalink="https://www.instagram.com/p/ABC123/">'
        "  <p>Instagram post</p>"
        "</blockquote>"
        '<script src="https://www.instagram.com/embed.js"></script>'
        "</body></html>"
    )


def _tiktok_html() -> str:
    """Page with TikTok embed: blockquote + analytics script."""
    return (
        "<html><body>"
        '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@user/video/123">'
        "  <p>TikTok video</p>"
        "</blockquote>"
        '<script src="https://analytics.tiktok.com/i18n/pixel/sdk.js"></script>'
        "</body></html>"
    )


def _pinterest_html() -> str:
    """Page with Pinterest: pintrk script + s.pinimg.com + Rich Pins meta."""
    return (
        "<html><head>"
        '<meta property="og:type" content="product">'
        "</head><body>"
        '<script src="https://s.pinimg.com/ct/lib/pintrk.js"></script>'
        "</body></html>"
    )


def _ugc_gallery_html(app: str = "snapwidget") -> str:
    """Parameterized helper returning script src for given UGC gallery app."""
    app_domains = {
        "snapwidget": "snapwidget.com",
        "embedsocial": "embedsocial.com",
        "flockler": "flockler.com",
        "sociablekit": "sociablekit.com",
        "lightwidget": "lightwidget.com",
        "mintt": "mintt.co",
    }
    domain = app_domains[app]
    return (
        "<html><body>"
        f'<script src="https://cdn.{domain}/widget.js"></script>'
        "</body></html>"
    )


def _combined_html() -> str:
    """Page with all 3 platforms + UGC gallery present."""
    return (
        "<html><head>"
        '<meta property="og:type" content="product">'
        "</head><body>"
        # Instagram
        '<blockquote class="instagram-media"'
        ' data-instgrm-permalink="https://www.instagram.com/p/ABC123/">'
        "  <p>Instagram post</p>"
        "</blockquote>"
        '<script src="https://www.instagram.com/embed.js"></script>'
        # TikTok
        '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@user/video/123">'
        "  <p>TikTok video</p>"
        "</blockquote>"
        '<script src="https://analytics.tiktok.com/i18n/pixel/sdk.js"></script>'
        # Pinterest
        '<script src="https://s.pinimg.com/ct/lib/pintrk.js"></script>'
        # UGC gallery (SnapWidget)
        '<script src="https://cdn.snapwidget.com/widget.js"></script>'
        "</body></html>"
    )


# ---------------------------------------------------------------------------
# Helper to build signals directly for rubric tests
# ---------------------------------------------------------------------------


def _all_true_signals() -> SocialCommerceSignals:
    """Signals with every boolean True and max platform count."""
    return SocialCommerceSignals(
        has_instagram_embed=True,
        has_tiktok_embed=True,
        has_pinterest=True,
        has_ugc_gallery=True,
        ugc_gallery_app="SnapWidget",
        platform_count=3,
    )


# ---------------------------------------------------------------------------
# 1. TestDetection
# ---------------------------------------------------------------------------


class TestDetection:
    """Detection of individual social commerce signals from HTML."""

    def test_empty_html_no_signals(self):
        """Empty page → every boolean signal is False, platform_count 0."""
        signals = detect_social_commerce(_empty_html())
        assert signals.has_instagram_embed is False
        assert signals.has_tiktok_embed is False
        assert signals.has_pinterest is False
        assert signals.has_ugc_gallery is False
        assert signals.ugc_gallery_app is None
        assert signals.platform_count == 0

    def test_empty_string_returns_defaults(self):
        """Empty string input returns all-default signals safely."""
        signals = detect_social_commerce("")
        assert signals.has_instagram_embed is False
        assert signals.has_tiktok_embed is False
        assert signals.has_pinterest is False
        assert signals.has_ugc_gallery is False
        assert signals.ugc_gallery_app is None
        assert signals.platform_count == 0

    def test_instagram_detected(self):
        """Instagram embed HTML triggers has_instagram_embed."""
        signals = detect_social_commerce(_instagram_html())
        assert signals.has_instagram_embed is True

    def test_tiktok_detected(self):
        """TikTok embed HTML triggers has_tiktok_embed."""
        signals = detect_social_commerce(_tiktok_html())
        assert signals.has_tiktok_embed is True

    def test_pinterest_detected(self):
        """Pinterest HTML triggers has_pinterest."""
        signals = detect_social_commerce(_pinterest_html())
        assert signals.has_pinterest is True

    def test_ugc_gallery_detected(self):
        """Gallery HTML triggers has_ugc_gallery and sets ugc_gallery_app."""
        signals = detect_social_commerce(_ugc_gallery_html("snapwidget"))
        assert signals.has_ugc_gallery is True
        assert signals.ugc_gallery_app == "SnapWidget"

    def test_gallery_app_names(self):
        """Each of the 6 gallery apps returns the correct display name."""
        expected = {
            "snapwidget": "SnapWidget",
            "embedsocial": "EmbedSocial",
            "flockler": "Flockler",
            "sociablekit": "SociableKit",
            "lightwidget": "LightWidget",
            "mintt": "Mintt Studio",
        }
        for app_key, expected_name in expected.items():
            signals = detect_social_commerce(_ugc_gallery_html(app_key))
            assert signals.has_ugc_gallery is True, f"{app_key} not detected"
            assert signals.ugc_gallery_app == expected_name, (
                f"{app_key}: expected '{expected_name}', got '{signals.ugc_gallery_app}'"
            )

    def test_combined_html_all_true(self):
        """Combined fixture sets all platform bools and UGC to True."""
        signals = detect_social_commerce(_combined_html())
        assert signals.has_instagram_embed is True
        assert signals.has_tiktok_embed is True
        assert signals.has_pinterest is True
        assert signals.has_ugc_gallery is True
        assert signals.ugc_gallery_app == "SnapWidget"

    def test_platform_count_accuracy(self):
        """platform_count matches sum of platform bools."""
        signals = detect_social_commerce(_combined_html())
        expected = sum([
            signals.has_instagram_embed,
            signals.has_tiktok_embed,
            signals.has_pinterest,
        ])
        assert signals.platform_count == expected
        assert signals.platform_count == 3

    def test_instagram_not_tiktok(self):
        """Instagram HTML does not trigger TikTok detection."""
        signals = detect_social_commerce(_instagram_html())
        assert signals.has_instagram_embed is True
        assert signals.has_tiktok_embed is False


# ---------------------------------------------------------------------------
# 2. TestScoring
# ---------------------------------------------------------------------------


class TestScoring:
    """Deterministic 0–100 scoring from SocialCommerceSignals."""

    def test_empty_signals_score_0(self):
        """Default signals → score 0."""
        assert score_social_commerce(SocialCommerceSignals()) == 0

    def test_all_signals_max_score(self):
        """All bools True → score 100."""
        assert score_social_commerce(_all_true_signals()) == 100

    def test_single_platform_score(self):
        """One platform (Instagram) → 30 pts (any-platform-embed bucket)."""
        s = SocialCommerceSignals(has_instagram_embed=True, platform_count=1)
        assert score_social_commerce(s) == 30

    def test_ugc_gallery_only(self):
        """UGC gallery alone → 25 pts."""
        s = SocialCommerceSignals(has_ugc_gallery=True, ugc_gallery_app="SnapWidget")
        assert score_social_commerce(s) == 25

    def test_score_scales_with_platforms(self):
        """More platforms → higher score."""
        # 1 platform (Instagram only): 30
        s1 = SocialCommerceSignals(has_instagram_embed=True, platform_count=1)
        # 2 platforms (Instagram + TikTok): 30 + 15 + 10 = 55
        s2 = SocialCommerceSignals(
            has_instagram_embed=True,
            has_tiktok_embed=True,
            platform_count=2,
        )
        # 3 platforms (all): 30 + 15 + 10 + 10 + 10 = 75
        s3 = SocialCommerceSignals(
            has_instagram_embed=True,
            has_tiktok_embed=True,
            has_pinterest=True,
            platform_count=3,
        )
        score1 = score_social_commerce(s1)
        score2 = score_social_commerce(s2)
        score3 = score_social_commerce(s3)
        assert score1 < score2 < score3
        assert score1 == 30
        assert score2 == 55
        assert score3 == 75

    def test_score_clamped(self):
        """Score is always clamped within [0, 100]."""
        assert score_social_commerce(SocialCommerceSignals()) >= 0
        assert score_social_commerce(_all_true_signals()) <= 100


# ---------------------------------------------------------------------------
# 3. TestTipSelection
# ---------------------------------------------------------------------------


class TestTipSelection:
    """Tip ordering, max count, citations, and content verification."""

    def test_empty_signals_3_tips(self):
        """Empty signals → 3 improvement tips returned."""
        tips = get_social_commerce_tips(SocialCommerceSignals())
        assert len(tips) == 3

    def test_max_3_tips_enforced(self):
        """Never more than 3 tips regardless of missing signals."""
        tips = get_social_commerce_tips(SocialCommerceSignals())
        assert len(tips) <= 3

    def test_full_signals_congratulatory(self):
        """All signals (score >= 80) → congratulatory tip only."""
        tips = get_social_commerce_tips(_all_true_signals())
        assert len(tips) == 1
        assert "Excellent" in tips[0]

    def test_tips_are_strings(self):
        """All tips are non-empty strings with meaningful content."""
        tips = get_social_commerce_tips(SocialCommerceSignals())
        assert all(isinstance(t, str) for t in tips)
        assert all(len(t) > 10 for t in tips)

    def test_tips_have_citations(self):
        """Improvement tips contain parenthetical research citations."""
        tips = get_social_commerce_tips(SocialCommerceSignals())
        for tip in tips:
            assert "(" in tip and ")" in tip, f"Missing citation in: {tip}"

    def test_tip_priority_order(self):
        """First tip is about adding embeds (highest-priority recommendation)."""
        tips = get_social_commerce_tips(SocialCommerceSignals())
        assert len(tips) == 3
        # First tip: add embeds
        assert "embed" in tips[0].lower()
        # Second tip: add TikTok
        assert "tiktok" in tips[1].lower()
        # Third tip: enable Pinterest
        assert "pinterest" in tips[2].lower()


# ---------------------------------------------------------------------------
# 4. TestDataclassStructure
# ---------------------------------------------------------------------------


class TestDataclassStructure:
    """SocialCommerceSignals dataclass invariants."""

    def test_is_dataclass(self):
        """SocialCommerceSignals is a dataclass."""
        assert is_dataclass(SocialCommerceSignals)

    def test_field_count(self):
        """6 fields: 3 platform + 2 UGC + 1 aggregate."""
        assert len(fields(SocialCommerceSignals)) == 6

    def test_defaults(self):
        """All bools False, ugc_gallery_app None, platform_count 0."""
        s = SocialCommerceSignals()
        assert s.has_instagram_embed is False
        assert s.has_tiktok_embed is False
        assert s.has_pinterest is False
        assert s.has_ugc_gallery is False
        assert s.ugc_gallery_app is None
        assert s.platform_count == 0


# ---------------------------------------------------------------------------
# 5. TestEndToEnd
# ---------------------------------------------------------------------------


class TestEndToEnd:
    """Full pipeline: HTML → detect → score → tips."""

    def test_combined_html_high_score_congratulatory(self):
        """Combined HTML → score 100, only congratulatory tip."""
        signals = detect_social_commerce(_combined_html())
        assert score_social_commerce(signals) == 100
        tips = get_social_commerce_tips(signals)
        assert len(tips) == 1
        assert "Excellent" in tips[0]

    def test_empty_html_zero_score_with_tips(self):
        """Empty HTML → score 0, 3 improvement tips."""
        signals = detect_social_commerce(_empty_html())
        assert score_social_commerce(signals) == 0
        tips = get_social_commerce_tips(signals)
        assert len(tips) == 3

    def test_single_platform_mid_range(self):
        """Instagram HTML → mid-range score (30) with improvement tips."""
        signals = detect_social_commerce(_instagram_html())
        score = score_social_commerce(signals)
        # has_instagram_embed=True → 30 pts (any platform embed)
        assert score == 30
        assert 0 < score < 100
        tips = get_social_commerce_tips(signals)
        assert 0 < len(tips) <= 3

    def test_detect_score_tips_pipeline_consistent(self):
        """detect → score → tips pipeline produces consistent typed results."""
        signals = detect_social_commerce(_combined_html())
        score = score_social_commerce(signals)
        tips = get_social_commerce_tips(signals)
        assert isinstance(signals, SocialCommerceSignals)
        assert isinstance(score, int)
        assert score == 100
        assert isinstance(tips, list)
        assert all(isinstance(t, str) for t in tips)
