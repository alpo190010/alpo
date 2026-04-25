"""Tests for AI discoverability detector and rubric."""

import pytest
from dataclasses import is_dataclass

from app.services.ai_discoverability_detector import (
    AiDiscoverabilitySignals,
    detect_ai_discoverability,
)
from app.services.ai_discoverability_rubric import (
    score_ai_discoverability,
    get_ai_discoverability_tips,
)


# ── HTML Fixtures ────────────────────────────────────────────────


def _empty_html() -> str:
    return "<html><head></head><body></body></html>"


def _full_og_html() -> str:
    return """
    <html><head>
      <meta property="og:type" content="product" />
      <meta property="og:title" content="Amazing Widget" />
      <meta property="og:description" content="The best widget you'll ever buy" />
      <meta property="og:image" content="https://cdn.example.com/widget.jpg" />
      <meta property="product:price:amount" content="29.99" />
      <meta property="product:price:currency" content="USD" />
    </head><body>
      <div class="product__description">
        <p>A great product for everyday use.</p>
      </div>
    </body></html>
    """


def _faq_jsonld_html() -> str:
    return """
    <html><head>
      <meta property="og:title" content="Widget" />
      <script type="application/ld+json">
      {
        "@type": "FAQPage",
        "mainEntity": [
          {"@type": "Question", "name": "What size is it?", "acceptedAnswer": {"text": "10cm x 5cm"}}
        ]
      }
      </script>
    </head><body>
      <div class="product__description"><p>Nice product.</p></div>
    </body></html>
    """


def _faq_accordion_html() -> str:
    return """
    <html><head>
      <meta property="og:title" content="Widget" />
    </head><body>
      <div class="product__description"><p>Nice product.</p></div>
      <div class="faq">
        <details><summary>What materials is it made of?</summary><p>Premium cotton and polyester blend.</p></details>
        <details><summary>How do I wash it?</summary><p>Machine wash cold.</p></details>
      </div>
    </body></html>
    """


def _spec_rich_html() -> str:
    return """
    <html><head>
      <meta property="og:type" content="product" />
      <meta property="og:title" content="Premium Jacket" />
      <meta property="og:description" content="Handcrafted leather jacket" />
      <meta property="og:image" content="https://cdn.example.com/jacket.jpg" />
      <meta property="product:price:amount" content="199.99" />
      <meta property="product:price:currency" content="USD" />
    </head><body>
      <div class="product__description">
        <h2>Product Details</h2>
        <ul>
          <li>Weight: 2.5 lbs</li>
          <li>Dimensions: 24 x 18 x 3 inches</li>
          <li>Material: genuine leather with cotton lining</li>
          <li>Thickness: 1.2mm premium cowhide</li>
        </ul>
        <table>
          <tr><th>Specification</th><th>Value</th></tr>
          <tr><td>Material</td><td>Leather</td></tr>
          <tr><td>Weight</td><td>2.5 lbs</td></tr>
          <tr><td>Dimensions</td><td>24 x 18 x 3 in</td></tr>
        </table>
      </div>
      <div class="faq">
        <h3>Is this jacket waterproof?</h3>
        <p>Yes, it's treated with a water-resistant coating.</p>
      </div>
    </body></html>
    """


def _no_og_html() -> str:
    return """
    <html><head><title>Some Product</title></head><body>
      <div class="product__description">
        <p>This is a great product made from cotton and weighing 500g with dimensions of 10cm x 20cm.</p>
      </div>
    </body></html>
    """


def _heading_question_html() -> str:
    return """
    <html><head>
      <meta property="og:title" content="Widget" />
    </head><body>
      <div class="product__description"><p>Nice product.</p></div>
      <h3>What are the dimensions of this product?</h3>
      <p>The product measures 10cm x 5cm x 2cm.</p>
    </body></html>
    """


def _graph_faq_html() -> str:
    return """
    <html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {"@type": "Product", "name": "Widget"},
          {"@type": "FAQPage", "mainEntity": []}
        ]
      }
      </script>
    </head><body>
      <div class="product__description"><p>Nice product.</p></div>
    </body></html>
    """


# ── API data fixtures ────────────────────────────────────────────


def _full_api_data() -> dict:
    return {
        "robots_txt_exists": True,
        "ai_search_bots": {
            "OAI-SearchBot": True,
            "PerplexityBot": True,
            "Claude-SearchBot": True,
        },
        "ai_training_bots": {
            "GPTBot": True,
            "Google-Extended": True,
            "ClaudeBot": True,
            "CCBot": True,
        },
        "has_wildcard_block": False,
        "llms_txt_exists": True,
    }


def _blocked_api_data() -> dict:
    return {
        "robots_txt_exists": True,
        "ai_search_bots": {
            "OAI-SearchBot": False,
            "PerplexityBot": False,
            "Claude-SearchBot": False,
        },
        "ai_training_bots": {
            "GPTBot": False,
            "Google-Extended": False,
            "ClaudeBot": False,
            "CCBot": False,
        },
        "has_wildcard_block": True,
        "llms_txt_exists": False,
    }


# ── Detection Tests ──────────────────────────────────────────────


class TestDetection:
    def test_empty_html_defaults(self):
        signals = detect_ai_discoverability(_empty_html())
        assert signals.og_tag_count == 0
        assert signals.has_og_type is False
        assert signals.has_faq_content is False
        assert signals.spec_mention_count == 0
        assert signals.robots_txt_exists is None
        assert signals.llms_txt_exists is None

    def test_og_tag_detection(self):
        signals = detect_ai_discoverability(_full_og_html())
        assert signals.has_og_type is True
        assert signals.has_og_title is True
        assert signals.has_og_description is True
        assert signals.has_og_image is True
        assert signals.og_tag_count == 6

    def test_product_price_og_tags(self):
        signals = detect_ai_discoverability(_full_og_html())
        assert signals.has_product_price_amount is True
        assert signals.has_product_price_currency is True

    def test_faq_jsonld_detection(self):
        signals = detect_ai_discoverability(_faq_jsonld_html())
        assert signals.has_faq_content is True

    def test_faq_accordion_detection(self):
        signals = detect_ai_discoverability(_faq_accordion_html())
        assert signals.has_faq_content is True

    def test_faq_heading_question_detection(self):
        signals = detect_ai_discoverability(_heading_question_html())
        assert signals.has_faq_content is True

    def test_faq_graph_detection(self):
        signals = detect_ai_discoverability(_graph_faq_html())
        assert signals.has_faq_content is True

    def test_spec_table_detection(self):
        signals = detect_ai_discoverability(_spec_rich_html())
        assert signals.has_spec_table is True
        assert signals.has_structured_specs is True

    def test_measurement_detection(self):
        signals = detect_ai_discoverability(_spec_rich_html())
        assert signals.has_measurement_units is True
        assert signals.spec_mention_count > 0

    def test_material_regex(self):
        signals = detect_ai_discoverability(_spec_rich_html())
        # "leather" and "cotton" should be detected
        assert signals.spec_mention_count >= 2

    def test_entity_density(self):
        signals = detect_ai_discoverability(_spec_rich_html())
        assert signals.entity_density_score > 0

    def test_structured_list_specs(self):
        signals = detect_ai_discoverability(_spec_rich_html())
        assert signals.has_structured_specs is True

    def test_no_og_html(self):
        signals = detect_ai_discoverability(_no_og_html())
        assert signals.has_og_type is False
        assert signals.has_og_title is False
        assert signals.og_tag_count == 0
        # But should still detect specs in description
        assert signals.spec_mention_count > 0

    def test_api_data_merge(self):
        signals = detect_ai_discoverability(_empty_html(), _full_api_data())
        assert signals.robots_txt_exists is True
        assert signals.llms_txt_exists is True
        assert signals.ai_search_bots_allowed_count == 3
        assert signals.ai_training_bots_blocked_count == 4
        assert signals.has_oai_searchbot_allowed is True
        assert signals.has_perplexitybot_allowed is True
        assert signals.has_claude_searchbot_allowed is True
        assert signals.has_wildcard_block is False

    def test_api_data_blocked(self):
        signals = detect_ai_discoverability(_empty_html(), _blocked_api_data())
        assert signals.ai_search_bots_allowed_count == 0
        assert signals.ai_training_bots_blocked_count == 0
        assert signals.has_wildcard_block is True

    def test_api_data_none(self):
        signals = detect_ai_discoverability(_full_og_html(), None)
        assert signals.robots_txt_exists is None
        assert signals.llms_txt_exists is None
        # OG tags should still be detected
        assert signals.has_og_title is True


# ── Dataclass Tests ──────────────────────────────────────────────


class TestDataclass:
    def test_is_dataclass(self):
        assert is_dataclass(AiDiscoverabilitySignals)

    def test_field_count(self):
        s = AiDiscoverabilitySignals()
        assert len(s.__dataclass_fields__) == 21

    def test_defaults(self):
        s = AiDiscoverabilitySignals()
        assert s.robots_txt_exists is None
        assert s.llms_txt_exists is None
        assert s.og_tag_count == 0
        assert s.entity_density_score == 0.0


# ── Scoring Tests ────────────────────────────────────────────────


class TestScoring:
    def test_path_a_perfect_score(self):
        """Full data, all optimal -> high score."""
        signals = detect_ai_discoverability(_spec_rich_html(), _full_api_data())
        score = score_ai_discoverability(signals)
        assert score >= 80

    def test_path_a_blocked_bots_low_score(self):
        """Search bots blocked, no llms.txt, wildcard block -> low score."""
        signals = detect_ai_discoverability(_empty_html(), _blocked_api_data())
        score = score_ai_discoverability(signals)
        assert score <= 20

    def test_path_b_full_og(self):
        """HTML-only with all OG tags -> moderate score."""
        signals = detect_ai_discoverability(_full_og_html())
        score = score_ai_discoverability(signals)
        assert 20 <= score <= 50

    def test_path_b_spec_rich(self):
        """HTML-only with rich specs + OG tags -> high score."""
        signals = detect_ai_discoverability(_spec_rich_html())
        score = score_ai_discoverability(signals)
        assert score >= 50

    def test_path_b_empty_html(self):
        """HTML-only with nothing -> 0."""
        signals = detect_ai_discoverability(_empty_html())
        score = score_ai_discoverability(signals)
        assert score == 0

    def test_score_clamped_0_100(self):
        """Score should always be in 0-100 range."""
        signals = AiDiscoverabilitySignals()
        score = score_ai_discoverability(signals)
        assert 0 <= score <= 100

    def test_wildcard_penalty(self):
        """Wildcard block should reduce score."""
        api_good = _full_api_data()
        api_wildcard = _full_api_data()
        api_wildcard["has_wildcard_block"] = True

        s1 = detect_ai_discoverability(_full_og_html(), api_good)
        s2 = detect_ai_discoverability(_full_og_html(), api_wildcard)

        assert score_ai_discoverability(s1) > score_ai_discoverability(s2)


# ── Tip Selection Tests ──────────────────────────────────────────


class TestTips:
    def test_no_og_tags_tip(self):
        tips = get_ai_discoverability_tips(detect_ai_discoverability(_empty_html()))
        # Should mention sharing/AI tools picking up product info
        assert any(
            "shar" in t.lower() or "ai chat" in t.lower() or "ai shopping" in t.lower()
            for t in tips
        )

    def test_bots_blocked_tip(self):
        signals = detect_ai_discoverability(_empty_html(), _blocked_api_data())
        tips = get_ai_discoverability_tips(signals)
        # Should call out the bot-blocking situation in plain language
        assert any(
            "bot" in t.lower() or "robot" in t.lower() or "ai shopping" in t.lower()
            for t in tips
        )

    def test_max_3_tips(self):
        signals = detect_ai_discoverability(_empty_html(), _blocked_api_data())
        tips = get_ai_discoverability_tips(signals)
        assert len(tips) <= 3

    def test_congratulatory_tip(self):
        signals = detect_ai_discoverability(_spec_rich_html(), _full_api_data())
        tips = get_ai_discoverability_tips(signals)
        if score_ai_discoverability(signals) >= 80:
            assert any("Strong AI discoverability" in t for t in tips)

    def test_missing_price_og_tip(self):
        html = """
        <html><head>
          <meta property="og:type" content="product" />
          <meta property="og:title" content="Widget" />
          <meta property="og:description" content="Nice widget" />
          <meta property="og:image" content="https://cdn.example.com/img.jpg" />
        </head><body><div class="product__description"><p>Nice.</p></div></body></html>
        """
        signals = detect_ai_discoverability(html)
        tips = get_ai_discoverability_tips(signals)
        # Tip should mention the price/currency outcome (no longer the raw tag name)
        assert any(
            "price" in t.lower() and "currency" in t.lower() for t in tips
        )

    def test_no_faq_tip(self):
        signals = detect_ai_discoverability(_full_og_html(), _full_api_data())
        tips = get_ai_discoverability_tips(signals)
        assert any("FAQ" in t for t in tips)


# ── End-to-End Tests ─────────────────────────────────────────────


class TestEndToEnd:
    def test_full_pipeline_with_api_data(self):
        signals = detect_ai_discoverability(_spec_rich_html(), _full_api_data())
        score = score_ai_discoverability(signals)
        tips = get_ai_discoverability_tips(signals)

        assert 0 <= score <= 100
        assert isinstance(tips, list)
        assert len(tips) <= 3

    def test_full_pipeline_html_only(self):
        signals = detect_ai_discoverability(_spec_rich_html())
        score = score_ai_discoverability(signals)
        tips = get_ai_discoverability_tips(signals)

        assert 0 <= score <= 100
        assert isinstance(tips, list)
        assert len(tips) <= 3
        # Should have some score from OG tags + specs
        assert score > 0
