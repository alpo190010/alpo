"""Tests for Content Freshness detector and rubric."""

import pytest
from dataclasses import fields, is_dataclass
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.services.content_freshness_detector import (
    ContentFreshnessSignals,
    detect_content_freshness,
)
from app.services.content_freshness_rubric import (
    score_content_freshness,
    get_content_freshness_tips,
)


# ── Helpers ──────────────────────────────────────────────────────


def _iso_days_ago(days: int) -> str:
    dt = datetime.now(tz=timezone.utc) - timedelta(days=days)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ── HTML Fixtures ────────────────────────────────────────────────


def _empty_html() -> str:
    return "<html><head></head><body></body></html>"


def _current_copyright_html() -> str:
    year = datetime.now().year
    return f"""
    <html><head></head><body>
      <main><p>Great product.</p></main>
      <footer><p>&copy; {year} My Store. All rights reserved.</p></footer>
    </body></html>
    """


def _outdated_copyright_html() -> str:
    return """
    <html><head></head><body>
      <main><p>Great product.</p></main>
      <footer><p>&copy; 2022 My Store. All rights reserved.</p></footer>
    </body></html>
    """


def _copyright_range_html() -> str:
    year = datetime.now().year
    return f"""
    <html><head></head><body>
      <main><p>Great product.</p></main>
      <footer><p>Copyright 2018–{year} My Store</p></footer>
    </body></html>
    """


def _expired_promo_html() -> str:
    last_year = datetime.now().year - 1
    return f"""
    <html><head></head><body>
      <main>
        <div class="banner">Black Friday {last_year} Sale - Save 50%!</div>
        <p>Shop our best deals.</p>
      </main>
    </body></html>
    """


def _current_promo_html() -> str:
    year = datetime.now().year
    return f"""
    <html><head></head><body>
      <main>
        <div class="banner">Black Friday {year} Sale - Save 50%!</div>
        <p>Shop our best deals.</p>
      </main>
    </body></html>
    """


def _summer_keywords_html() -> str:
    return """
    <html><head></head><body>
      <main>
        <h2>Summer Sale - Up to 70% Off!</h2>
        <p>Get your summer collection favorites.</p>
      </main>
    </body></html>
    """


def _winter_keywords_html() -> str:
    return """
    <html><head></head><body>
      <main>
        <h2>Winter Sale - Cozy Deals!</h2>
        <p>Browse our winter collection.</p>
      </main>
    </body></html>
    """


def _new_label_fresh_html() -> str:
    date_pub = _iso_days_ago(30)
    return f"""
    <html><head>
      <script type="application/ld+json">
      {{"@type": "Product", "name": "Widget", "datePublished": "{date_pub}"}}
      </script>
    </head><body>
      <span class="badge">New</span>
      <main><p>Amazing new product.</p></main>
    </body></html>
    """


def _new_label_stale_html() -> str:
    date_pub = _iso_days_ago(180)
    return f"""
    <html><head>
      <script type="application/ld+json">
      {{"@type": "Product", "name": "Widget", "datePublished": "{date_pub}"}}
      </script>
    </head><body>
      <span class="badge">New</span>
      <main><p>Amazing new product.</p></main>
    </body></html>
    """


def _fresh_reviews_html() -> str:
    review_date = _iso_days_ago(15)
    return f"""
    <html><head>
      <script type="application/ld+json">
      {{
        "@type": "Product",
        "name": "Widget",
        "review": [
          {{"@type": "Review", "datePublished": "{review_date}", "reviewBody": "Great!"}}
        ]
      }}
      </script>
    </head><body>
      <main><p>Product page.</p></main>
    </body></html>
    """


def _stale_reviews_html() -> str:
    review_date = _iso_days_ago(400)
    return f"""
    <html><head>
      <script type="application/ld+json">
      {{
        "@type": "Product",
        "name": "Widget",
        "review": [
          {{"@type": "Review", "datePublished": "{review_date}", "reviewBody": "Decent."}}
        ]
      }}
      </script>
    </head><body>
      <main><p>Product page.</p></main>
    </body></html>
    """


def _warning_reviews_html() -> str:
    review_date = _iso_days_ago(200)
    return f"""
    <html><head>
      <script type="application/ld+json">
      {{
        "@type": "Product",
        "name": "Widget",
        "review": [
          {{"@type": "Review", "datePublished": "{review_date}", "reviewBody": "Ok."}}
        ]
      }}
      </script>
    </head><body>
      <main><p>Product page.</p></main>
    </body></html>
    """


def _schema_date_modified_html() -> str:
    dm = _iso_days_ago(10)
    return f"""
    <html><head>
      <script type="application/ld+json">
      {{"@type": "Product", "name": "Widget", "dateModified": "{dm}"}}
      </script>
    </head><body>
      <main><p>Product page.</p></main>
    </body></html>
    """


def _time_elements_html() -> str:
    recent = _iso_days_ago(5)
    old = _iso_days_ago(200)
    return f"""
    <html><head></head><body>
      <main>
        <p>Posted: <time datetime="{recent}">5 days ago</time></p>
        <p>Updated: <time datetime="{old}">200 days ago</time></p>
      </main>
    </body></html>
    """


def _review_in_time_element_html() -> str:
    review_date = _iso_days_ago(20)
    return f"""
    <html><head></head><body>
      <main><p>Product page.</p></main>
      <div class="jdgm-rev">
        <time datetime="{review_date}">20 days ago</time>
        <p>Great product!</p>
      </div>
    </body></html>
    """


def _full_fresh_html() -> str:
    year = datetime.now().year
    dm = _iso_days_ago(5)
    review_date = _iso_days_ago(10)
    recent_time = _iso_days_ago(3)
    return f"""
    <html><head>
      <script type="application/ld+json">
      {{
        "@type": "Product",
        "name": "Premium Widget",
        "dateModified": "{dm}",
        "review": [
          {{"@type": "Review", "datePublished": "{review_date}", "reviewBody": "Love it!"}}
        ]
      }}
      </script>
    </head><body>
      <main>
        <p>Our best product.</p>
        <time datetime="{recent_time}">Updated recently</time>
      </main>
      <footer><p>&copy; {year} Great Store</p></footer>
    </body></html>
    """


# ── API Data Fixtures ────────────────────────────────────────────


def _fresh_api_data() -> dict:
    dt = datetime.now(tz=timezone.utc) - timedelta(days=7)
    return {
        "last_modified_header": dt.strftime("%a, %d %b %Y %H:%M:%S GMT"),
        "last_modified_date_iso": dt.isoformat(),
    }


def _stale_api_data() -> dict:
    dt = datetime.now(tz=timezone.utc) - timedelta(days=400)
    return {
        "last_modified_header": dt.strftime("%a, %d %b %Y %H:%M:%S GMT"),
        "last_modified_date_iso": dt.isoformat(),
    }


# ── Test Classes ─────────────────────────────────────────────────


class TestDataclass:
    def test_is_dataclass(self):
        assert is_dataclass(ContentFreshnessSignals)

    def test_field_count(self):
        assert len(fields(ContentFreshnessSignals)) == 19

    def test_defaults(self):
        s = ContentFreshnessSignals()
        assert s.copyright_year is None
        assert s.has_expired_promotion is False
        assert s.has_seasonal_mismatch is False
        assert s.has_new_label is False
        assert s.review_staleness is None
        assert s.time_element_count == 0
        assert s.freshest_signal_age_days is None


class TestDetection:
    def test_empty_html_defaults(self):
        signals = detect_content_freshness(_empty_html())
        assert signals.copyright_year is None
        assert signals.has_expired_promotion is False
        assert signals.has_seasonal_mismatch is False
        assert signals.has_new_label is False
        assert signals.review_staleness is None

    def test_current_copyright_year(self):
        signals = detect_content_freshness(_current_copyright_html())
        assert signals.copyright_year == datetime.now().year
        assert signals.copyright_year_is_current is True

    def test_outdated_copyright_year(self):
        signals = detect_content_freshness(_outdated_copyright_html())
        assert signals.copyright_year == 2022
        assert signals.copyright_year_is_current is False

    def test_copyright_range_uses_latest(self):
        signals = detect_content_freshness(_copyright_range_html())
        assert signals.copyright_year == datetime.now().year
        assert signals.copyright_year_is_current is True

    def test_expired_promotion_detected(self):
        signals = detect_content_freshness(_expired_promo_html())
        assert signals.has_expired_promotion is True
        assert signals.expired_promotion_text is not None
        assert "black friday" in signals.expired_promotion_text.lower()

    def test_current_promotion_not_flagged(self):
        signals = detect_content_freshness(_current_promo_html())
        assert signals.has_expired_promotion is False

    def test_seasonal_mismatch_summer_in_winter(self):
        """Summer keywords should be flagged in winter months."""
        with patch("app.services.content_freshness_detector.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2026, 1, 15, tzinfo=timezone.utc)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            signals = detect_content_freshness(_summer_keywords_html())
        assert signals.has_seasonal_mismatch is True

    def test_seasonal_mismatch_winter_in_summer(self):
        """Winter keywords should be flagged in summer months."""
        with patch("app.services.content_freshness_detector.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2026, 7, 15, tzinfo=timezone.utc)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            signals = detect_content_freshness(_winter_keywords_html())
        assert signals.has_seasonal_mismatch is True

    def test_no_seasonal_mismatch_in_correct_season(self):
        """Summer keywords in summer should not be flagged."""
        with patch("app.services.content_freshness_detector.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2026, 7, 15, tzinfo=timezone.utc)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            signals = detect_content_freshness(_summer_keywords_html())
        assert signals.has_seasonal_mismatch is False

    def test_new_label_fresh(self):
        signals = detect_content_freshness(_new_label_fresh_html())
        assert signals.has_new_label is True
        assert signals.new_label_is_stale is False

    def test_new_label_stale(self):
        signals = detect_content_freshness(_new_label_stale_html())
        assert signals.has_new_label is True
        assert signals.new_label_is_stale is True

    def test_fresh_reviews(self):
        signals = detect_content_freshness(_fresh_reviews_html())
        assert signals.review_staleness == "fresh"
        assert signals.review_age_days is not None
        assert signals.review_age_days <= 20

    def test_stale_reviews_critical(self):
        signals = detect_content_freshness(_stale_reviews_html())
        assert signals.review_staleness == "critical"
        assert signals.review_age_days is not None
        assert signals.review_age_days > 365

    def test_warning_reviews(self):
        signals = detect_content_freshness(_warning_reviews_html())
        assert signals.review_staleness == "warning"

    def test_review_fallback_to_time_element(self):
        signals = detect_content_freshness(_review_in_time_element_html())
        assert signals.review_staleness == "fresh"
        assert signals.review_age_days is not None

    def test_schema_date_modified(self):
        signals = detect_content_freshness(_schema_date_modified_html())
        assert signals.date_modified_iso is not None
        assert signals.date_modified_age_days is not None
        assert signals.date_modified_age_days <= 15

    def test_time_elements(self):
        signals = detect_content_freshness(_time_elements_html())
        assert signals.time_element_count == 2
        assert signals.most_recent_time_age_days is not None
        assert signals.most_recent_time_age_days <= 10

    def test_api_data_merge(self):
        signals = detect_content_freshness(_empty_html(), _fresh_api_data())
        assert signals.last_modified_header is not None
        assert signals.last_modified_age_days is not None
        assert signals.last_modified_age_days <= 10

    def test_api_data_none(self):
        signals = detect_content_freshness(_empty_html(), None)
        assert signals.last_modified_header is None
        assert signals.last_modified_age_days is None

    def test_freshest_signal_computed(self):
        signals = detect_content_freshness(_full_fresh_html(), _fresh_api_data())
        assert signals.freshest_signal_age_days is not None
        assert signals.freshest_signal_age_days <= 10


class TestScoring:
    def test_path_a_all_fresh(self):
        signals = detect_content_freshness(_full_fresh_html(), _fresh_api_data())
        score = score_content_freshness(signals)
        assert score >= 85

    def test_path_a_stale_api(self):
        signals = detect_content_freshness(_empty_html(), _stale_api_data())
        score = score_content_freshness(signals)
        # Stale API data + empty HTML → lower score
        assert score < 70

    def test_path_b_all_fresh(self):
        signals = detect_content_freshness(_full_fresh_html())
        score = score_content_freshness(signals)
        assert score >= 80

    def test_path_b_empty_html(self):
        signals = detect_content_freshness(_empty_html())
        score = score_content_freshness(signals)
        # Neutral defaults for "not found" fields
        assert 25 <= score <= 65

    def test_score_clamped_0_100(self):
        signals = detect_content_freshness(_full_fresh_html(), _fresh_api_data())
        score = score_content_freshness(signals)
        assert 0 <= score <= 100

    def test_expired_promo_hurts_score(self):
        clean = detect_content_freshness(_current_promo_html())
        dirty = detect_content_freshness(_expired_promo_html())
        assert score_content_freshness(clean) > score_content_freshness(dirty)

    def test_path_selection_a(self):
        """Path A chosen when API data is present."""
        signals = detect_content_freshness(_empty_html(), _fresh_api_data())
        assert signals.last_modified_age_days is not None
        # Score should include the Last-Modified contribution
        score = score_content_freshness(signals)
        assert score > 0

    def test_path_selection_b(self):
        """Path B chosen when API data is absent."""
        signals = detect_content_freshness(_empty_html(), None)
        assert signals.last_modified_age_days is None


class TestTips:
    def test_expired_promo_tip(self):
        signals = detect_content_freshness(_expired_promo_html())
        tips = get_content_freshness_tips(signals)
        assert any("expired" in t.lower() for t in tips)

    def test_outdated_copyright_tip(self):
        signals = detect_content_freshness(_outdated_copyright_html())
        tips = get_content_freshness_tips(signals)
        assert any("copyright" in t.lower() for t in tips)

    def test_stale_reviews_critical_tip(self):
        signals = detect_content_freshness(_stale_reviews_html())
        tips = get_content_freshness_tips(signals)
        assert any("12 months" in t for t in tips)

    def test_stale_reviews_warning_tip(self):
        signals = detect_content_freshness(_warning_reviews_html())
        tips = get_content_freshness_tips(signals)
        assert any("90 days" in t for t in tips)

    def test_max_3_tips(self):
        signals = detect_content_freshness(_empty_html())
        tips = get_content_freshness_tips(signals)
        assert len(tips) <= 3

    def test_congratulatory_tip(self):
        signals = detect_content_freshness(_full_fresh_html(), _fresh_api_data())
        tips = get_content_freshness_tips(signals)
        assert any("strong content freshness" in t.lower() for t in tips)

    def test_no_date_modified_tip(self):
        signals = detect_content_freshness(_empty_html())
        tips = get_content_freshness_tips(signals)
        assert any("dateModified" in t for t in tips)

    def test_new_label_stale_tip(self):
        signals = detect_content_freshness(_new_label_stale_html())
        tips = get_content_freshness_tips(signals)
        assert any("new" in t.lower() and "badge" in t.lower() for t in tips)
