"""Tests for POST /analyze endpoint."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_optional, get_current_user_required
from app.database import get_db
from app.main import app
from app.models import User
from app.services.scoring import (
    CATEGORY_KEYS,
    STORE_WIDE_KEYS,
    build_category_scores,
    compute_weighted_score,
)
from app.services.structured_data_detector import StructuredDataSignals
from app.services.checkout_detector import CheckoutSignals
from app.services.accessibility_detector import AccessibilitySignals
from app.services.social_commerce_detector import SocialCommerceSignals
from app.services.social_proof_detector import SocialProofSignals
from app.services.pricing_detector import PricingSignals
from app.services.images_detector import ImageSignals
from app.services.title_detector import TitleSignals
from app.services.description_detector import DescriptionSignals
from app.services.mobile_cta_detector import MobileCtaSignals
from app.services.cross_sell_detector import CrossSellSignals
from app.services.variant_ux_detector import VariantUxSignals
from app.services.size_guide_detector import SizeGuideSignals
from app.services.content_freshness_detector import ContentFreshnessSignals
from app.services.shipping_detector import ShippingSignals
from app.services.trust_detector import TrustSignals
from app.services.page_speed_detector import PageSpeedSignals
from app.services.ai_discoverability_detector import AiDiscoverabilitySignals

# --- Test fixtures / helpers ---

_VALID_HTML = "<html><body>" + ("x" * 200) + "</body></html>"

_AI_RESPONSE = {
    "score": 42,
    "summary": "Test summary",
    "tips": ["tip1", "tip2"],
    "categories": {"pageSpeed": 65, "images": 80},
    "productPrice": 29.99,
    "productCategory": "fashion",

}


def _make_user(plan_tier: str = "free", credits_used: int = 0) -> User:
    """Build a User ORM instance with plan fields set."""
    user = User()
    user.id = uuid.uuid4()
    user.google_sub = "google-sub-test"
    user.email = "test@example.com"
    user.name = "Test User"
    user.picture = None
    user.plan_tier = plan_tier
    user.credits_used = credits_used
    user.credits_reset_at = datetime.now(timezone.utc)
    user.lemon_subscription_id = None
    user.lemon_customer_id = None
    user.current_period_end = None
    user.lemon_customer_portal_url = None
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    return user


def _mock_db():
    """Return a MagicMock that simulates a SQLAlchemy Session."""
    session = MagicMock()
    # Make execute().fetchone() return a row with a UUID
    row = MagicMock()
    row.__getitem__ = MagicMock(return_value="fake-uuid-1234")
    session.execute.return_value.fetchone.return_value = row
    return session


def _get_client(db_override=None, user_override=None):
    """Return a TestClient with DB and auth overrides.

    By default injects a mock DB and an authenticated free-tier user
    with credits remaining.  Overrides get_current_user_optional since
    the /analyze endpoint uses optional auth.
    """
    if db_override is not None:
        app.dependency_overrides[get_db] = lambda: db_override
    else:
        app.dependency_overrides[get_db] = lambda: _mock_db()

    if user_override is not None:
        app.dependency_overrides[get_current_user_optional] = lambda: user_override
    else:
        app.dependency_overrides[get_current_user_optional] = lambda: _make_user()

    client = TestClient(app)
    return client


# --- Auth / credit enforcement tests ---


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=50)
@patch("app.routers.analyze.detect_checkout", return_value=CheckoutSignals())
@patch("app.routers.analyze.get_structured_data_tips", return_value=[])
@patch("app.routers.analyze.score_structured_data", return_value=50)
@patch("app.routers.analyze.detect_structured_data", return_value=StructuredDataSignals())
@patch("app.routers.analyze.get_social_proof_tips", return_value=["tip1"])
@patch("app.routers.analyze.score_social_proof", return_value=50)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_anonymous_user_allowed(mock_fetch, mock_detect, mock_sp_score, mock_sp_tips, mock_sd_detect, mock_sd_score, mock_sd_tips, mock_co_detect, mock_co_score, mock_co_tips, mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan):
    """POST /analyze without auth → 200 (anonymous access allowed)."""
    mock_fetch.return_value = _VALID_HTML
    app.dependency_overrides[get_db] = lambda: _mock_db()
    app.dependency_overrides[get_current_user_optional] = lambda: None

    client = TestClient(app)
    resp = client.post("/analyze", json={"url": "http://example.com/product"})
    assert resp.status_code == 200

    app.dependency_overrides.clear()


def test_analyze_returns_403_when_credits_exhausted():
    """POST /analyze with exhausted credits → 403 with plan info."""
    user = _make_user(plan_tier="free", credits_used=3)  # free limit = 3
    client = _get_client(user_override=user)

    resp = client.post("/analyze", json={"url": "http://example.com"})
    assert resp.status_code == 403
    data = resp.json()
    assert data["error"] == "Credit limit reached"
    assert data["plan"] == "free"
    assert data["creditsUsed"] == 3
    assert data["creditsLimit"] == 3

    app.dependency_overrides.clear()


def test_analyze_returns_403_at_exact_limit():
    """Credits exactly at limit → 403 (boundary condition)."""
    user = _make_user(plan_tier="starter", credits_used=10)  # starter limit = 10
    client = _get_client(user_override=user)

    resp = client.post("/analyze", json={"url": "http://example.com"})
    assert resp.status_code == 403
    data = resp.json()
    assert data["error"] == "Credit limit reached"
    assert data["plan"] == "starter"
    assert data["creditsUsed"] == 10
    assert data["creditsLimit"] == 10

    app.dependency_overrides.clear()


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=50)
@patch("app.routers.analyze.detect_checkout", return_value=CheckoutSignals())
@patch("app.routers.analyze.get_structured_data_tips", return_value=[])
@patch("app.routers.analyze.score_structured_data", return_value=50)
@patch("app.routers.analyze.detect_structured_data", return_value=StructuredDataSignals())
@patch("app.routers.analyze.get_social_proof_tips", return_value=[])
@patch("app.routers.analyze.score_social_proof", return_value=0)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.call_openrouter", new_callable=AsyncMock)
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_consumes_credit_on_success(mock_fetch, mock_ai, mock_detect, mock_sp_score, mock_sp_tips, mock_sd_detect, mock_sd_score, mock_sd_tips, mock_co_detect, mock_co_score, mock_co_tips, mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan):
    """Credit is incremented only after successful analysis."""
    mock_fetch.return_value = _VALID_HTML
    mock_ai.return_value = _AI_RESPONSE

    user = _make_user(plan_tier="free", credits_used=0)
    assert user.credits_used == 0

    mock_session = _mock_db()
    client = _get_client(db_override=mock_session, user_override=user)

    with patch("app.routers.analyze.settings") as mock_settings:
        mock_settings.openai_api_key = "test-key"
        resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    # increment_credits sets user.credits_used += 1
    assert user.credits_used == 1

    app.dependency_overrides.clear()


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=50)
@patch("app.routers.analyze.detect_checkout", return_value=CheckoutSignals())
@patch("app.routers.analyze.get_structured_data_tips", return_value=[])
@patch("app.routers.analyze.score_structured_data", return_value=50)
@patch("app.routers.analyze.detect_structured_data", return_value=StructuredDataSignals())
@patch("app.routers.analyze.get_social_proof_tips", return_value=[])
@patch("app.routers.analyze.score_social_proof", return_value=0)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.call_openrouter", new_callable=AsyncMock)
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_returns_credits_remaining(mock_fetch, mock_ai, mock_detect, mock_sp_score, mock_sp_tips, mock_sd_detect, mock_sd_score, mock_sd_tips, mock_co_detect, mock_co_score, mock_co_tips, mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan):
    """Successful response includes creditsRemaining field."""
    mock_fetch.return_value = _VALID_HTML
    mock_ai.return_value = _AI_RESPONSE

    user = _make_user(plan_tier="free", credits_used=1)  # limit=3, used=1, after success used=2 → remaining=1
    mock_session = _mock_db()
    client = _get_client(db_override=mock_session, user_override=user)

    with patch("app.routers.analyze.settings") as mock_settings:
        mock_settings.openai_api_key = "test-key"
        resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    data = resp.json()
    assert "creditsRemaining" in data
    # After increment: credits_used=2, limit=3, remaining=1
    assert data["creditsRemaining"] == 1

    app.dependency_overrides.clear()


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=50)
@patch("app.routers.analyze.detect_checkout", return_value=CheckoutSignals())
@patch("app.routers.analyze.get_structured_data_tips", return_value=[])
@patch("app.routers.analyze.score_structured_data", return_value=50)
@patch("app.routers.analyze.detect_structured_data", return_value=StructuredDataSignals())
@patch("app.routers.analyze.get_social_proof_tips", return_value=[])
@patch("app.routers.analyze.score_social_proof", return_value=0)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_no_credit_consumed_on_render_failure(mock_fetch, mock_detect, mock_sp_score, mock_sp_tips, mock_sd_detect, mock_sd_score, mock_sd_tips, mock_co_detect, mock_co_score, mock_co_tips, mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan):
    """Render failure → no credit consumed."""
    mock_fetch.side_effect = Exception("connection refused")

    user = _make_user(plan_tier="free", credits_used=0)
    client = _get_client(user_override=user)

    resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 400
    # Credit should NOT have been consumed
    assert user.credits_used == 0

    app.dependency_overrides.clear()


def test_analyze_one_below_limit_allowed():
    """Credits one below limit → request proceeds (boundary condition)."""
    user = _make_user(plan_tier="free", credits_used=2)  # limit=3, used=2 → allowed
    client = _get_client(user_override=user)

    # URL validation should pass, then it'll fail at render_page (not mocked),
    # but the point is it doesn't return 403.
    with patch("app.routers.analyze.render_page", new_callable=AsyncMock) as mock_fetch, \
         patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock):
        mock_fetch.side_effect = Exception("connection refused")
        resp = client.post("/analyze", json={"url": "http://example.com"})

    # Should get 400 (fetch failure), NOT 403 (credit limit)
    assert resp.status_code == 400
    assert "Could not fetch" in resp.json()["error"]

    app.dependency_overrides.clear()


# --- URL validation tests ---


def test_analyze_missing_url():
    client = _get_client()
    # Empty body
    resp = client.post("/analyze", json={})
    assert resp.status_code == 400
    assert "URL is required" in resp.json()["error"]

    # Empty string
    resp = client.post("/analyze", json={"url": ""})
    assert resp.status_code == 400
    assert "URL is required" in resp.json()["error"]

    app.dependency_overrides.clear()


def test_analyze_invalid_url_format():
    client = _get_client()
    resp = client.post("/analyze", json={"url": "not-a-url"})
    assert resp.status_code == 400
    assert "Invalid URL" in resp.json()["error"]

    app.dependency_overrides.clear()


def test_analyze_localhost_blocked():
    client = _get_client()
    resp = client.post("/analyze", json={"url": "http://localhost/admin"})
    assert resp.status_code == 400
    assert "Internal" in resp.json()["error"]

    app.dependency_overrides.clear()


def test_analyze_private_ip_blocked():
    client = _get_client()
    resp = client.post("/analyze", json={"url": "http://192.168.1.1/"})
    assert resp.status_code == 400
    assert "Internal" in resp.json()["error"]

    app.dependency_overrides.clear()


def test_analyze_url_too_long():
    client = _get_client()
    long_url = "http://example.com/" + "a" * 2100
    resp = client.post("/analyze", json={"url": long_url})
    assert resp.status_code == 400
    assert "too long" in resp.json()["error"]

    app.dependency_overrides.clear()


def test_analyze_non_http_protocol():
    client = _get_client()
    resp = client.post("/analyze", json={"url": "ftp://example.com/file"})
    assert resp.status_code == 400
    assert "HTTP/HTTPS" in resp.json()["error"]

    app.dependency_overrides.clear()


# --- Service-level error tests ---


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_fetch_failure(mock_fetch, mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan):
    mock_fetch.side_effect = Exception("connection refused")
    client = _get_client()
    resp = client.post("/analyze", json={"url": "http://example.com"})
    assert resp.status_code == 400
    assert "Could not fetch" in resp.json()["error"]

    app.dependency_overrides.clear()


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_page_too_small(mock_fetch, mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan):
    mock_fetch.return_value = "<html>hi</html>"  # < 100 chars
    client = _get_client()
    resp = client.post("/analyze", json={"url": "http://example.com"})
    assert resp.status_code == 400
    assert "empty or too small" in resp.json()["error"]

    app.dependency_overrides.clear()


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=50)
@patch("app.routers.analyze.detect_checkout", return_value=CheckoutSignals())
@patch("app.routers.analyze.get_structured_data_tips", return_value=[])
@patch("app.routers.analyze.score_structured_data", return_value=50)
@patch("app.routers.analyze.detect_structured_data", return_value=StructuredDataSignals())
@patch("app.routers.analyze.get_social_proof_tips", return_value=[])
@patch("app.routers.analyze.score_social_proof", return_value=0)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_missing_api_key_still_succeeds(mock_fetch, mock_detect, mock_sp_score, mock_sp_tips, mock_sd_detect, mock_sd_score, mock_sd_tips, mock_co_detect, mock_co_score, mock_co_tips, mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan):
    """AI is disabled — missing API key no longer blocks analysis."""
    mock_fetch.return_value = _VALID_HTML
    client = _get_client()
    resp = client.post("/analyze", json={"url": "http://example.com/product"})
    # Should succeed since AI is disabled (mock scores used)
    assert resp.status_code == 200

    app.dependency_overrides.clear()


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=50)
@patch("app.routers.analyze.detect_checkout", return_value=CheckoutSignals())
@patch("app.routers.analyze.get_structured_data_tips", return_value=[])
@patch("app.routers.analyze.score_structured_data", return_value=50)
@patch("app.routers.analyze.detect_structured_data", return_value=StructuredDataSignals())
@patch("app.routers.analyze.get_social_proof_tips", return_value=[])
@patch("app.routers.analyze.score_social_proof", return_value=0)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_ai_not_called(mock_fetch, mock_detect, mock_sp_score, mock_sp_tips, mock_sd_detect, mock_sd_score, mock_sd_tips, mock_co_detect, mock_co_score, mock_co_tips, mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan):
    """AI is disabled — call_openrouter should not be invoked."""
    mock_fetch.return_value = _VALID_HTML
    client = _get_client()

    with patch("app.routers.analyze.call_openrouter", new_callable=AsyncMock) as mock_ai:
        resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    mock_ai.assert_not_called()

    app.dependency_overrides.clear()


# --- Happy-path success test ---


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=50)
@patch("app.routers.analyze.detect_checkout", return_value=CheckoutSignals())
@patch("app.routers.analyze.get_structured_data_tips", return_value=[])
@patch("app.routers.analyze.score_structured_data", return_value=50)
@patch("app.routers.analyze.detect_structured_data", return_value=StructuredDataSignals())
@patch("app.routers.analyze.get_social_proof_tips", return_value=["Add photo reviews"])
@patch("app.routers.analyze.score_social_proof", return_value=75)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_success(mock_fetch, mock_detect, mock_sp_score, mock_sp_tips, mock_sd_detect, mock_sd_score, mock_sd_tips, mock_co_detect, mock_co_score, mock_co_tips, mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan):
    mock_fetch.return_value = _VALID_HTML

    mock_session = _mock_db()
    user = _make_user()
    client = _get_client(db_override=mock_session, user_override=user)

    resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    data = resp.json()

    # Core fields present
    assert "summary" in data
    assert "categories" in data
    assert "signals" in data
    assert "creditsRemaining" in data

    # socialProof comes from deterministic rubric
    cats = data["categories"]
    assert cats["socialProof"] == 75

    # structuredData comes from deterministic rubric
    assert cats["structuredData"] == 50

    # Overall score is weighted average (int 0-100)
    assert isinstance(data["score"], int)
    assert 0 <= data["score"] <= 100

    # Social proof tip is first
    assert data["tips"][0] == "Add photo reviews"

    # DB was called
    assert mock_session.add.called  # Scan insert
    assert mock_session.execute.called  # ProductAnalysis upsert

    app.dependency_overrides.clear()


# --- Score clamping edge cases ---


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=50)
@patch("app.routers.analyze.detect_checkout", return_value=CheckoutSignals())
@patch("app.routers.analyze.get_structured_data_tips", return_value=[])
@patch("app.routers.analyze.score_structured_data", return_value=50)
@patch("app.routers.analyze.detect_structured_data", return_value=StructuredDataSignals())
@patch("app.routers.analyze.get_social_proof_tips", return_value=[])
@patch("app.routers.analyze.score_social_proof", return_value=0)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_score_clamping(mock_fetch, mock_detect, mock_sp_score, mock_sp_tips, mock_sd_detect, mock_sd_score, mock_sd_tips, mock_co_detect, mock_co_score, mock_co_tips, mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan):
    mock_fetch.return_value = _VALID_HTML
    client = _get_client()
    resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    data = resp.json()
    # Score equals sp_score (0), clamped within 0-100
    assert 0 <= data["score"] <= 100

    app.dependency_overrides.clear()


# --- Hybrid pipeline tests ---


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=50)
@patch("app.routers.analyze.detect_checkout", return_value=CheckoutSignals())
@patch("app.routers.analyze.get_structured_data_tips", return_value=[])
@patch("app.routers.analyze.score_structured_data", return_value=50)
@patch("app.routers.analyze.detect_structured_data", return_value=StructuredDataSignals())
@patch("app.routers.analyze.get_social_proof_tips", return_value=[])
@patch("app.routers.analyze.score_social_proof", return_value=0)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_score_equals_social_proof(mock_fetch, mock_detect, mock_sp_score, mock_sp_tips, mock_sd_detect, mock_sd_score, mock_sd_tips, mock_co_detect, mock_co_score, mock_co_tips, mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan):
    """Overall score is weighted average; categories include both live dimensions."""
    mock_sp_score.return_value = 65
    mock_fetch.return_value = _VALID_HTML
    client = _get_client()
    resp = client.post("/analyze", json={"url": "http://example.com/product"})
    assert resp.status_code == 200
    data = resp.json()
    # Score is weighted average (int 0-100), not just SP
    assert isinstance(data["score"], int)
    assert 0 <= data["score"] <= 100
    assert data["categories"]["socialProof"] == 65
    assert data["categories"]["structuredData"] == 50

    app.dependency_overrides.clear()


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=50)
@patch("app.routers.analyze.detect_checkout", return_value=CheckoutSignals())
@patch("app.routers.analyze.get_structured_data_tips", return_value=["SD tip 1"])
@patch("app.routers.analyze.score_structured_data", return_value=50)
@patch("app.routers.analyze.detect_structured_data", return_value=StructuredDataSignals())
@patch("app.routers.analyze.get_social_proof_tips", return_value=["SP tip 1", "SP tip 2"])
@patch("app.routers.analyze.score_social_proof", return_value=60)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_tips_from_social_proof(mock_fetch, mock_detect, mock_sp_score, mock_sp_tips, mock_sd_detect, mock_sd_score, mock_sd_tips, mock_co_detect, mock_co_score, mock_co_tips, mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan):
    """Tips combine SP + SD tips (AI is disabled)."""
    mock_fetch.return_value = _VALID_HTML
    client = _get_client()
    resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    data = resp.json()
    tips = data["tips"]
    # SP tips come first, then SD tips
    assert tips[0] == "SP tip 1"
    assert tips[1] == "SP tip 2"
    assert tips[2] == "SD tip 1"

    app.dependency_overrides.clear()


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=50)
@patch("app.routers.analyze.detect_checkout", return_value=CheckoutSignals())
@patch("app.routers.analyze.get_structured_data_tips", return_value=[])
@patch("app.routers.analyze.score_structured_data", return_value=50)
@patch("app.routers.analyze.detect_structured_data", return_value=StructuredDataSignals())
@patch("app.routers.analyze.get_social_proof_tips", return_value=[])
@patch("app.routers.analyze.score_social_proof", return_value=85)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_signals_in_response(mock_fetch, mock_detect, mock_sp_score, mock_sp_tips, mock_sd_detect, mock_sd_score, mock_sd_tips, mock_co_detect, mock_co_score, mock_co_tips, mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan):
    """Response includes signals.socialProof with detector output."""
    from app.services.social_proof_detector import SocialProofSignals
    mock_detect.return_value = SocialProofSignals(
        review_app="yotpo-v3",
        star_rating=4.5,
        review_count=114,
        has_photo_reviews=False,
        has_video_reviews=False,
        star_rating_above_fold=True,
        has_review_filtering=False,
    )
    mock_fetch.return_value = _VALID_HTML
    mock_session = _mock_db()
    user = _make_user()
    client = _get_client(db_override=mock_session, user_override=user)
    resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    data = resp.json()
    signals = data["signals"]["socialProof"]
    assert signals["reviewApp"] == "yotpo-v3"
    assert signals["starRating"] == 4.5
    assert signals["reviewCount"] == 114
    assert signals["starRatingAboveFold"] is True

    app.dependency_overrides.clear()


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=50)
@patch("app.routers.analyze.detect_checkout", return_value=CheckoutSignals())
@patch("app.routers.analyze.get_structured_data_tips", return_value=[])
@patch("app.routers.analyze.score_structured_data", return_value=85)
@patch("app.routers.analyze.detect_structured_data")
@patch("app.routers.analyze.get_social_proof_tips", return_value=[])
@patch("app.routers.analyze.score_social_proof", return_value=50)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_structured_data_signals_in_response(mock_fetch, mock_detect, mock_sp_score, mock_sp_tips, mock_sd_detect, mock_sd_score, mock_sd_tips, mock_co_detect, mock_co_score, mock_co_tips, mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan):
    """Response includes signals.structuredData with all 22 camelCase fields."""
    mock_sd_detect.return_value = StructuredDataSignals(
        has_product_schema=True,
        has_name=True,
        has_image=True,
        has_description=True,
        has_offers=True,
        has_price=True,
        has_price_currency=True,
        has_availability=True,
        has_brand=True,
        has_sku=True,
        has_gtin=False,
        has_aggregate_rating=True,
        has_price_valid_until=False,
        has_shipping_details=True,
        has_return_policy=False,
        has_breadcrumb_list=True,
        has_organization=True,
        has_missing_brand=False,
        has_currency_in_price=False,
        has_invalid_availability=False,
        json_parse_errors=0,
        duplicate_product_count=1,
    )
    mock_fetch.return_value = _VALID_HTML
    mock_session = _mock_db()
    user = _make_user()
    client = _get_client(db_override=mock_session, user_override=user)
    resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    data = resp.json()

    sd = data["signals"]["structuredData"]

    # All 22 camelCase fields present
    expected_keys = [
        "hasProductSchema", "hasName", "hasImage", "hasDescription",
        "hasOffers", "hasPrice", "hasPriceCurrency", "hasAvailability",
        "hasBrand", "hasSku", "hasGtin", "hasAggregateRating",
        "hasPriceValidUntil", "hasShippingDetails", "hasReturnPolicy",
        "hasBreadcrumbList", "hasOrganization", "hasMissingBrand",
        "hasCurrencyInPrice", "hasInvalidAvailability",
        "jsonParseErrors", "duplicateProductCount",
    ]
    for key in expected_keys:
        assert key in sd, f"Missing key: {key}"

    # Spot-check values
    assert sd["hasProductSchema"] is True
    assert sd["hasName"] is True
    assert sd["hasBrand"] is True
    assert sd["hasGtin"] is False
    assert sd["hasMissingBrand"] is False
    assert sd["jsonParseErrors"] == 0
    assert sd["duplicateProductCount"] == 1

    app.dependency_overrides.clear()


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=65)
@patch("app.routers.analyze.detect_checkout")
@patch("app.routers.analyze.get_structured_data_tips", return_value=[])
@patch("app.routers.analyze.score_structured_data", return_value=50)
@patch("app.routers.analyze.detect_structured_data", return_value=StructuredDataSignals())
@patch("app.routers.analyze.get_social_proof_tips", return_value=[])
@patch("app.routers.analyze.score_social_proof", return_value=50)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_checkout_signals_in_response(mock_fetch, mock_detect, mock_sp_score, mock_sp_tips, mock_sd_detect, mock_sd_score, mock_sd_tips, mock_co_detect, mock_co_score, mock_co_tips, mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan):
    """Response includes signals.checkout with all 11 camelCase fields."""
    mock_co_detect.return_value = CheckoutSignals(
        has_accelerated_checkout=True,
        has_dynamic_checkout_button=True,
        has_paypal=False,
        has_klarna=True,
        has_afterpay=False,
        has_affirm=False,
        has_sezzle=False,
        payment_method_count=3,
        has_drawer_cart=True,
        has_ajax_cart=True,
        has_sticky_checkout=False,
    )
    mock_fetch.return_value = _VALID_HTML
    mock_session = _mock_db()
    user = _make_user()
    client = _get_client(db_override=mock_session, user_override=user)
    resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    data = resp.json()

    co = data["signals"]["checkout"]

    # All 11 camelCase fields present
    expected_keys = [
        "hasAcceleratedCheckout", "hasDynamicCheckoutButton", "hasPaypal",
        "hasKlarna", "hasAfterpay", "hasAffirm", "hasSezzle",
        "paymentMethodCount", "hasDrawerCart", "hasAjaxCart", "hasStickyCheckout",
    ]
    for key in expected_keys:
        assert key in co, f"Missing key: {key}"

    # Spot-check values
    assert co["hasAcceleratedCheckout"] is True
    assert co["hasDynamicCheckoutButton"] is True
    assert co["hasPaypal"] is False
    assert co["hasKlarna"] is True
    assert co["paymentMethodCount"] == 3
    assert co["hasDrawerCart"] is True
    assert co["hasStickyCheckout"] is False

    # Checkout category score comes from mocked score_checkout
    assert data["categories"]["checkout"] == 65

    app.dependency_overrides.clear()


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.get_accessibility_tips", return_value=["Fix contrast"])
@patch("app.routers.analyze.score_accessibility", return_value=72)
@patch("app.routers.analyze.detect_accessibility")
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=50)
@patch("app.routers.analyze.detect_checkout", return_value=CheckoutSignals())
@patch("app.routers.analyze.get_structured_data_tips", return_value=[])
@patch("app.routers.analyze.score_structured_data", return_value=50)
@patch("app.routers.analyze.detect_structured_data", return_value=StructuredDataSignals())
@patch("app.routers.analyze.get_social_proof_tips", return_value=[])
@patch("app.routers.analyze.score_social_proof", return_value=50)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_accessibility_signals_in_response(
    mock_fetch, mock_detect, mock_sp_score, mock_sp_tips,
    mock_sd_detect, mock_sd_score, mock_sd_tips,
    mock_co_detect, mock_co_score, mock_co_tips,
    mock_ac_detect, mock_ac_score, mock_ac_tips,
    mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan,
):
    """Response includes signals.accessibility with all 13 camelCase fields."""
    mock_ac_detect.return_value = AccessibilitySignals(
        contrast_violations=5,
        alt_text_violations=3,
        form_label_violations=2,
        empty_link_violations=1,
        empty_button_violations=0,
        document_language_violations=1,
        total_violations=8,
        total_nodes_affected=12,
        critical_count=2,
        serious_count=3,
        moderate_count=2,
        minor_count=1,
        scan_completed=True,
    )
    mock_fetch.return_value = _VALID_HTML
    mock_session = _mock_db()
    user = _make_user()
    client = _get_client(db_override=mock_session, user_override=user)
    resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    data = resp.json()

    ac = data["signals"]["accessibility"]

    # All 13 camelCase fields present
    expected_keys = [
        "contrastViolations", "altTextViolations", "formLabelViolations",
        "emptyLinkViolations", "emptyButtonViolations", "documentLanguageViolations",
        "totalViolations", "totalNodesAffected",
        "criticalCount", "seriousCount", "moderateCount", "minorCount",
        "scanCompleted",
    ]
    for key in expected_keys:
        assert key in ac, f"Missing key: {key}"

    # Spot-check values
    assert ac["contrastViolations"] == 5
    assert ac["altTextViolations"] == 3
    assert ac["formLabelViolations"] == 2
    assert ac["emptyLinkViolations"] == 1
    assert ac["emptyButtonViolations"] == 0
    assert ac["documentLanguageViolations"] == 1
    assert ac["totalViolations"] == 8
    assert ac["totalNodesAffected"] == 12
    assert ac["criticalCount"] == 2
    assert ac["seriousCount"] == 3
    assert ac["moderateCount"] == 2
    assert ac["minorCount"] == 1
    assert ac["scanCompleted"] is True

    # Accessibility category score comes from mocked score_accessibility
    assert data["categories"]["accessibility"] == 72

    # Accessibility tips included in response
    assert "Fix contrast" in data["tips"]

    # dimensionTips includes accessibility
    assert data["dimensionTips"]["accessibility"] == ["Fix contrast"]

    app.dependency_overrides.clear()


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=["Add TikTok embed"])
@patch("app.routers.analyze.score_social_commerce", return_value=68)
@patch("app.routers.analyze.detect_social_commerce")
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=50)
@patch("app.routers.analyze.detect_checkout", return_value=CheckoutSignals())
@patch("app.routers.analyze.get_structured_data_tips", return_value=[])
@patch("app.routers.analyze.score_structured_data", return_value=50)
@patch("app.routers.analyze.detect_structured_data", return_value=StructuredDataSignals())
@patch("app.routers.analyze.get_social_proof_tips", return_value=[])
@patch("app.routers.analyze.score_social_proof", return_value=50)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_social_commerce_signals_in_response(
    mock_fetch, mock_detect, mock_sp_score, mock_sp_tips,
    mock_sd_detect, mock_sd_score, mock_sd_tips,
    mock_co_detect, mock_co_score, mock_co_tips,
    mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan,
):
    """Response includes signals.socialCommerce with all 6 camelCase fields."""
    mock_sc_detect.return_value = SocialCommerceSignals(
        has_instagram_embed=True,
        has_tiktok_embed=False,
        has_pinterest=True,
        has_ugc_gallery=True,
        ugc_gallery_app="loox",
        platform_count=2,
    )
    mock_fetch.return_value = _VALID_HTML
    mock_session = _mock_db()
    user = _make_user()
    client = _get_client(db_override=mock_session, user_override=user)
    resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    data = resp.json()

    sc = data["signals"]["socialCommerce"]

    # All 6 camelCase fields present
    expected_keys = [
        "hasInstagramEmbed", "hasTiktokEmbed", "hasPinterest",
        "hasUgcGallery", "ugcGalleryApp", "platformCount",
    ]
    for key in expected_keys:
        assert key in sc, f"Missing key: {key}"

    # Spot-check values
    assert sc["hasInstagramEmbed"] is True
    assert sc["hasTiktokEmbed"] is False
    assert sc["hasPinterest"] is True
    assert sc["hasUgcGallery"] is True
    assert sc["ugcGalleryApp"] == "loox"
    assert sc["platformCount"] == 2

    # Social commerce category score comes from mocked score_social_commerce
    assert data["categories"]["socialCommerce"] == 68

    # Social commerce tips included in response
    assert "Add TikTok embed" in data["tips"]

    # dimensionTips includes socialCommerce
    assert data["dimensionTips"]["socialCommerce"] == ["Add TikTok embed"]

    app.dependency_overrides.clear()


# --- GET /analysis per-user scoping tests (R012) ---


def test_get_cached_analysis_returns_own():
    """GET /analysis returns the authenticated user's own cached analysis."""
    user = _make_user()
    mock_session = MagicMock()

    # Simulate a ProductAnalysis row belonging to this user
    mock_row = MagicMock()
    mock_row.score = 75
    mock_row.summary = "Good product page"
    mock_row.tips = ["Add reviews"]
    mock_row.categories = {"socialProof": 60}
    mock_row.product_price = "29.99"
    mock_row.product_category = "fashion"
    mock_row.signals = {"socialProof": {}}
    mock_row.id = uuid.uuid4()

    mock_session.query.return_value.filter.return_value.filter.return_value.first.return_value = mock_row

    app.dependency_overrides[get_db] = lambda: mock_session
    app.dependency_overrides[get_current_user_required] = lambda: user

    client = TestClient(app)
    resp = client.get("/analysis", params={"url": "http://example.com/product"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["score"] == 75
    assert data["summary"] == "Good product page"
    assert data["analysisId"] == str(mock_row.id)

    app.dependency_overrides.clear()


def test_get_cached_analysis_404_for_other_user():
    """GET /analysis returns 404 when no analysis exists for this user (even if another user has one)."""
    user = _make_user()
    mock_session = MagicMock()

    # first() returns None — no row matching (product_url, user_id)
    mock_session.query.return_value.filter.return_value.filter.return_value.first.return_value = None

    app.dependency_overrides[get_db] = lambda: mock_session
    app.dependency_overrides[get_current_user_required] = lambda: user

    client = TestClient(app)
    resp = client.get("/analysis", params={"url": "http://example.com/product"})

    assert resp.status_code == 404
    assert resp.json()["error"] == "No cached analysis"

    app.dependency_overrides.clear()


def test_get_cached_analysis_401_unauthenticated():
    """GET /analysis without auth returns 401."""
    mock_session = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_session
    # Do NOT override get_current_user_required — let it raise 401
    # But we need get_current_user_optional to return None so the chain works
    app.dependency_overrides[get_current_user_optional] = lambda: None

    client = TestClient(app)
    resp = client.get("/analysis", params={"url": "http://example.com/product"})

    assert resp.status_code == 401

    app.dependency_overrides.clear()


# --- POST /analyze anonymous upsert skip test (R013) ---


@patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock)
@patch("app.routers.analyze.get_social_commerce_tips", return_value=[])
@patch("app.routers.analyze.score_social_commerce", return_value=50)
@patch("app.routers.analyze.detect_social_commerce", return_value=SocialCommerceSignals())
@patch("app.routers.analyze.get_checkout_tips", return_value=[])
@patch("app.routers.analyze.score_checkout", return_value=50)
@patch("app.routers.analyze.detect_checkout", return_value=CheckoutSignals())
@patch("app.routers.analyze.get_structured_data_tips", return_value=[])
@patch("app.routers.analyze.score_structured_data", return_value=50)
@patch("app.routers.analyze.detect_structured_data", return_value=StructuredDataSignals())
@patch("app.routers.analyze.get_social_proof_tips", return_value=["tip1"])
@patch("app.routers.analyze.score_social_proof", return_value=50)
@patch("app.routers.analyze.detect_social_proof")
@patch("app.routers.analyze.render_page", new_callable=AsyncMock)
def test_analyze_anonymous_skips_upsert(
    mock_fetch, mock_detect, mock_sp_score, mock_sp_tips,
    mock_sd_detect, mock_sd_score, mock_sd_tips,
    mock_co_detect, mock_co_score, mock_co_tips,
    mock_sc_detect, mock_sc_score, mock_sc_tips, mock_axe_scan,
):
    """POST /analyze as anonymous user returns 200 but does NOT attempt DB upsert."""
    mock_fetch.return_value = _VALID_HTML

    mock_session = _mock_db()
    app.dependency_overrides[get_db] = lambda: mock_session
    app.dependency_overrides[get_current_user_optional] = lambda: None

    client = TestClient(app)
    resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200

    # The upsert uses db.execute(stmt) — for anonymous users this should NOT be called.
    # db.add is still called for the Scan row, but db.execute should be skipped.
    mock_session.execute.assert_not_called()

    app.dependency_overrides.clear()


# --- StoreAnalysis cache tests (R037) ---

_AR = "app.routers.analyze"

# All 18 detector/scorer/tips patches needed for the /analyze endpoint.
# Applied in reverse order (outermost decorator = last in list = first positional arg).
_ANALYZE_PATCHES = [
    # --- Async API calls ---
    patch(f"{_AR}.run_axe_scan", new_callable=AsyncMock, return_value=None),
    patch(f"{_AR}.fetch_pagespeed_insights", new_callable=AsyncMock, return_value=None),
    patch(f"{_AR}.fetch_ai_discoverability_data", new_callable=AsyncMock, return_value=None),
    patch(f"{_AR}.fetch_content_freshness_data", new_callable=AsyncMock, return_value=None),
    patch(f"{_AR}.measure_mobile_cta", new_callable=AsyncMock, return_value=None),
    patch(f"{_AR}.render_page", new_callable=AsyncMock, return_value=_VALID_HTML),
    # --- Store-wide detector chains (7 dimensions) ---
    # socialCommerce
    patch(f"{_AR}.get_social_commerce_tips", return_value=["sc tip"]),
    patch(f"{_AR}.score_social_commerce", return_value=50),
    patch(f"{_AR}.detect_social_commerce", return_value=SocialCommerceSignals()),
    # accessibility
    patch(f"{_AR}.get_accessibility_tips", return_value=["ac tip"]),
    patch(f"{_AR}.score_accessibility", return_value=50),
    patch(f"{_AR}.detect_accessibility", return_value=AccessibilitySignals()),
    # trust
    patch(f"{_AR}.get_trust_tips", return_value=["tr tip"]),
    patch(f"{_AR}.score_trust", return_value=50),
    patch(f"{_AR}.detect_trust", return_value=TrustSignals()),
    # shipping
    patch(f"{_AR}.get_shipping_tips", return_value=["sh tip"]),
    patch(f"{_AR}.score_shipping", return_value=50),
    patch(f"{_AR}.detect_shipping", return_value=ShippingSignals()),
    # checkout
    patch(f"{_AR}.get_checkout_tips", return_value=["co tip"]),
    patch(f"{_AR}.score_checkout", return_value=50),
    patch(f"{_AR}.detect_checkout", return_value=CheckoutSignals()),
    # pageSpeed
    patch(f"{_AR}.get_page_speed_tips", return_value=["ps tip"]),
    patch(f"{_AR}.score_page_speed", return_value=50),
    patch(f"{_AR}.detect_page_speed", return_value=PageSpeedSignals()),
    # aiDiscoverability
    patch(f"{_AR}.get_ai_discoverability_tips", return_value=["ad tip"]),
    patch(f"{_AR}.score_ai_discoverability", return_value=50),
    patch(f"{_AR}.detect_ai_discoverability", return_value=AiDiscoverabilitySignals()),
    # --- Product-level detector chains (11 dimensions) ---
    # contentFreshness
    patch(f"{_AR}.get_content_freshness_tips", return_value=["cf tip"]),
    patch(f"{_AR}.score_content_freshness", return_value=60),
    patch(f"{_AR}.detect_content_freshness", return_value=ContentFreshnessSignals()),
    # sizeGuide
    patch(f"{_AR}.get_size_guide_tips", return_value=[]),
    patch(f"{_AR}.score_size_guide", return_value=60),
    patch(f"{_AR}.detect_size_guide", return_value=SizeGuideSignals()),
    # variantUx
    patch(f"{_AR}.get_variant_ux_tips", return_value=[]),
    patch(f"{_AR}.score_variant_ux", return_value=60),
    patch(f"{_AR}.detect_variant_ux", return_value=VariantUxSignals()),
    # crossSell
    patch(f"{_AR}.get_cross_sell_tips", return_value=[]),
    patch(f"{_AR}.score_cross_sell", return_value=60),
    patch(f"{_AR}.detect_cross_sell", return_value=CrossSellSignals()),
    # mobileCta
    patch(f"{_AR}.get_mobile_cta_tips", return_value=[]),
    patch(f"{_AR}.score_mobile_cta", return_value=60),
    patch(f"{_AR}.detect_mobile_cta", return_value=MobileCtaSignals()),
    # description
    patch(f"{_AR}.get_description_tips", return_value=[]),
    patch(f"{_AR}.score_description", return_value=60),
    patch(f"{_AR}.detect_description", return_value=DescriptionSignals()),
    # title
    patch(f"{_AR}.get_title_tips", return_value=[]),
    patch(f"{_AR}.score_title", return_value=60),
    patch(f"{_AR}.detect_title", return_value=TitleSignals()),
    # images
    patch(f"{_AR}.get_images_tips", return_value=[]),
    patch(f"{_AR}.score_images", return_value=60),
    patch(f"{_AR}.detect_images", return_value=ImageSignals()),
    # pricing
    patch(f"{_AR}.get_pricing_tips", return_value=[]),
    patch(f"{_AR}.score_pricing", return_value=60),
    patch(f"{_AR}.detect_pricing", return_value=PricingSignals()),
    # structuredData
    patch(f"{_AR}.get_structured_data_tips", return_value=[]),
    patch(f"{_AR}.score_structured_data", return_value=60),
    patch(f"{_AR}.detect_structured_data", return_value=StructuredDataSignals()),
    # socialProof
    patch(f"{_AR}.get_social_proof_tips", return_value=["sp tip"]),
    patch(f"{_AR}.score_social_proof", return_value=60),
    patch(f"{_AR}.detect_social_proof", return_value=SocialProofSignals()),
]


def _apply_analyze_patches(func):
    """Apply the full 18-detector + async-API patch stack to a test function."""
    for p in _ANALYZE_PATCHES:
        func = p(func)
    return func


def _make_store_cache(updated_at=None):
    """Build a mock StoreAnalysis row for cache tests."""
    cache = MagicMock()
    cache.updated_at = updated_at or datetime.now(timezone.utc)
    cache.categories = {
        "checkout": 80,
        "shipping": 80,
        "trust": 80,
        "pageSpeed": 80,
        "aiDiscoverability": 80,
        "accessibility": 80,
        "socialCommerce": 80,
    }
    cache.tips = {
        "checkout": ["cached co tip"],
        "shipping": ["cached sh tip"],
        "trust": ["cached tr tip"],
        "pageSpeed": ["cached ps tip"],
        "aiDiscoverability": ["cached ad tip"],
        "accessibility": ["cached ac tip"],
        "socialCommerce": ["cached sc tip"],
    }
    cache.signals = {
        "checkout": {"hasAcceleratedCheckout": True},
        "shipping": {"hasFreeShipping": True},
        "trust": {"trustBadgeCount": 3},
        "pageSpeed": {"scriptCount": 5},
        "aiDiscoverability": {"robotsTxtExists": True},
        "accessibility": {"totalViolations": 2},
        "socialCommerce": {"hasInstagramEmbed": True},
    }
    return cache


def _configure_db_cache(mock_session, cache_obj):
    """Wire up mock_session.query(StoreAnalysis).filter().filter().first() to return cache_obj."""
    mock_session.query.return_value.filter.return_value.filter.return_value.first.return_value = cache_obj


def test_analyze_cache_hit_skips_store_detectors(*mocks):
    """Authenticated user + fresh StoreAnalysis → 7 store-wide detectors NOT called,
    response has all 18 category keys (7 from cache=80, 11 from fresh=60)."""
    mock_session = _mock_db()
    user = _make_user()
    store_cache = _make_store_cache()
    _configure_db_cache(mock_session, store_cache)

    client = _get_client(db_override=mock_session, user_override=user)
    resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    data = resp.json()

    # All 18 category keys present
    assert set(data["categories"].keys()) == set(CATEGORY_KEYS)

    # Store-wide keys should come from cache (value=80)
    for key in STORE_WIDE_KEYS:
        assert data["categories"][key] == 80, f"Expected cache value 80 for {key}, got {data['categories'][key]}"

    # Product-level keys should come from fresh computation (mocked at 60)
    product_keys = [k for k in CATEGORY_KEYS if k not in STORE_WIDE_KEYS]
    for key in product_keys:
        assert data["categories"][key] == 60, f"Expected fresh value 60 for {key}, got {data['categories'][key]}"

    # All 18 dimensionTips keys present
    assert set(data["dimensionTips"].keys()) == set(CATEGORY_KEYS)

    # Store-wide tips come from cache
    assert data["dimensionTips"]["checkout"] == ["cached co tip"]
    assert data["dimensionTips"]["shipping"] == ["cached sh tip"]

    # All 18 signals keys present
    assert set(data["signals"].keys()) == set(CATEGORY_KEYS)

    # Store-wide signals come from cache
    assert data["signals"]["checkout"] == {"hasAcceleratedCheckout": True}
    assert data["signals"]["shipping"] == {"hasFreeShipping": True}

    app.dependency_overrides.clear()


test_analyze_cache_hit_skips_store_detectors = _apply_analyze_patches(
    test_analyze_cache_hit_skips_store_detectors
)


def test_analyze_cache_miss_runs_all_detectors(*mocks):
    """Authenticated user + no StoreAnalysis row → all 18 detectors called, status 200."""
    mock_session = _mock_db()
    user = _make_user()
    # Cache miss: query returns None
    _configure_db_cache(mock_session, None)

    client = _get_client(db_override=mock_session, user_override=user)
    resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    data = resp.json()

    # All 18 keys present — all from fresh computation
    assert set(data["categories"].keys()) == set(CATEGORY_KEYS)

    # Store-wide keys come from mocked detectors (value=50)
    for key in STORE_WIDE_KEYS:
        assert data["categories"][key] == 50, f"Expected fresh value 50 for {key}, got {data['categories'][key]}"

    # Product-level keys from mocked detectors (value=60)
    product_keys = [k for k in CATEGORY_KEYS if k not in STORE_WIDE_KEYS]
    for key in product_keys:
        assert data["categories"][key] == 60, f"Expected fresh value 60 for {key}, got {data['categories'][key]}"

    app.dependency_overrides.clear()


test_analyze_cache_miss_runs_all_detectors = _apply_analyze_patches(
    test_analyze_cache_miss_runs_all_detectors
)


def test_analyze_stale_cache_runs_all_detectors(*mocks):
    """Authenticated user + stale StoreAnalysis (8 days old) → all detectors called (cache ignored)."""
    mock_session = _mock_db()
    user = _make_user()
    # Stale cache: updated_at = 8 days ago
    stale_cache = _make_store_cache(updated_at=datetime.now(timezone.utc) - timedelta(days=8))
    _configure_db_cache(mock_session, stale_cache)

    client = _get_client(db_override=mock_session, user_override=user)
    resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    data = resp.json()

    # All 18 keys present
    assert set(data["categories"].keys()) == set(CATEGORY_KEYS)

    # Store-wide keys should be from fresh detectors (50), NOT from stale cache (80)
    for key in STORE_WIDE_KEYS:
        assert data["categories"][key] == 50, f"Stale cache should be ignored for {key}, got {data['categories'][key]}"

    app.dependency_overrides.clear()


test_analyze_stale_cache_runs_all_detectors = _apply_analyze_patches(
    test_analyze_stale_cache_runs_all_detectors
)


def test_analyze_anonymous_no_cache_lookup(*mocks):
    """Anonymous user → db.query(StoreAnalysis) never called, all 18 detectors run."""
    mock_session = _mock_db()
    # DO NOT configure cache — we want to verify query is never called for cache
    # Reset query mock so we can track calls
    mock_session.query.reset_mock()

    app.dependency_overrides[get_db] = lambda: mock_session
    app.dependency_overrides[get_current_user_optional] = lambda: None

    client = TestClient(app)
    resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    data = resp.json()

    # All 18 keys present
    assert set(data["categories"].keys()) == set(CATEGORY_KEYS)

    # Store-wide keys from fresh detectors (50), product-level from fresh (60)
    for key in STORE_WIDE_KEYS:
        assert data["categories"][key] == 50

    # Verify: db.query was NOT called with StoreAnalysis
    # (it may be called for Scan insert via db.add, but query() should not include StoreAnalysis)
    from app.models import StoreAnalysis
    for call in mock_session.query.call_args_list:
        assert call.args[0] is not StoreAnalysis, (
            "db.query(StoreAnalysis) should not be called for anonymous users"
        )

    app.dependency_overrides.clear()


test_analyze_anonymous_no_cache_lookup = _apply_analyze_patches(
    test_analyze_anonymous_no_cache_lookup
)


def test_analyze_cache_hit_response_shape_identical(*mocks):
    """Cache hit path returns response with identical top-level keys as no-cache path."""
    mock_session = _mock_db()
    user = _make_user()
    store_cache = _make_store_cache()
    _configure_db_cache(mock_session, store_cache)

    client = _get_client(db_override=mock_session, user_override=user)
    resp = client.post("/analyze", json={"url": "http://example.com/product"})

    assert resp.status_code == 200
    data = resp.json()

    # All required top-level keys present
    required_keys = {
        "score", "categories", "dimensionTips", "signals", "tips",
        "productPrice", "productCategory", "timings", "analysisId",
    }
    for key in required_keys:
        assert key in data, f"Missing top-level key: {key}"

    # Type checks
    assert isinstance(data["score"], int)
    assert 0 <= data["score"] <= 100
    assert isinstance(data["categories"], dict)
    assert len(data["categories"]) == 18
    assert isinstance(data["dimensionTips"], dict)
    assert len(data["dimensionTips"]) == 18
    assert isinstance(data["signals"], dict)
    assert len(data["signals"]) == 18
    assert isinstance(data["tips"], list)
    assert isinstance(data["timings"], dict)

    # Timings should have 0 for cached store-wide dimensions
    for key in STORE_WIDE_KEYS:
        assert data["timings"][key] == 0, f"Cached dimension {key} should have timing=0"

    app.dependency_overrides.clear()


test_analyze_cache_hit_response_shape_identical = _apply_analyze_patches(
    test_analyze_cache_hit_response_shape_identical
)
