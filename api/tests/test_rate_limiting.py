"""Tests for per-IP rate limiting on all 7 public POST endpoints.

Each test fires requests exceeding the configured rate limit for the endpoint
and asserts HTTP 429 with a Retry-After header. The limiter is reset between
tests to prevent cross-contamination.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_optional, get_current_user_required
from app.database import get_db
from app.main import app
from app.models import User
from app.rate_limit import limiter


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _cleanup_overrides():
    """Clean up dependency overrides after each test."""
    yield
    app.dependency_overrides.clear()


def _mock_db() -> MagicMock:
    session = MagicMock()
    session.query.return_value.filter.return_value.first.return_value = None
    row = MagicMock()
    row.__getitem__ = MagicMock(return_value=str(uuid.uuid4()))
    session.execute.return_value.fetchone.return_value = row
    return session


def _make_user(**kwargs) -> User:
    defaults = dict(
        email="test@example.com",
        name="Test",
        password_hash="$2b$12$hashed",
        email_verified=True,
        google_sub=None,
        picture=None,
        role="user",
        plan_tier="free",
        credits_used=0,
        verification_token=None,
        verification_token_expires_at=None,
        reset_token=None,
        reset_token_expires_at=None,
        paddle_subscription_id=None,
        paddle_customer_id=None,
        current_period_end=None,
        paddle_customer_portal_url=None,
    )
    defaults.update(kwargs)
    user = User()
    user.id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    user.created_at = now
    user.updated_at = now
    user.credits_reset_at = now
    for k, v in defaults.items():
        setattr(user, k, v)
    return user


def _client_with_mocks(auth_dep=get_current_user_optional, user=None) -> TestClient:
    """Return a TestClient with DB mocked out and optional user override."""
    app.dependency_overrides[get_db] = lambda: _mock_db()
    if user is not None:
        app.dependency_overrides[auth_dep] = lambda: user
    else:
        app.dependency_overrides[auth_dep] = lambda: None
    return TestClient(app)


# ---------------------------------------------------------------------------
# /analyze — 5/minute
# ---------------------------------------------------------------------------


class TestRateLimitAnalyze:
    """POST /analyze is rate-limited to 5 requests/minute.

    We intentionally send an invalid URL so the endpoint returns 400 early
    (after validate_url) without hitting complex detector logic. This still
    consumes a rate-limit slot since the limiter decorator runs first.
    """

    def test_429_after_5_requests(self):
        client = _client_with_mocks()
        # Use an SSRF-blocked URL so validate_url returns an error fast
        payload = {"url": "http://localhost/evil"}
        for _ in range(5):
            resp = client.post("/analyze", json=payload)
            assert resp.status_code == 400  # SSRF blocked
        # 6th request must be rate-limited
        resp = client.post("/analyze", json=payload)
        assert resp.status_code == 429
        assert "Retry-After" in resp.headers


# ---------------------------------------------------------------------------
# /discover-products — 5/minute
# ---------------------------------------------------------------------------


class TestRateLimitDiscoverProducts:
    """POST /discover-products is rate-limited to 5 requests/minute."""

    @patch("app.routers.discover_products.validate_url", return_value=("https://shop.example.com", None))
    @patch("app.routers.discover_products._try_shopify_json", return_value=[])
    @patch("app.routers.discover_products._try_html_scraping", return_value={"products": [], "storeName": "", "isProductPage": False})
    @patch("app.routers.discover_products._persist_store_and_products", return_value=None)
    def test_429_after_5_requests(self, *mocks):
        client = _client_with_mocks()
        payload = {"url": "https://shop.example.com"}
        for _ in range(5):
            client.post("/discover-products", json=payload)
        resp = client.post("/discover-products", json=payload)
        assert resp.status_code == 429
        assert "Retry-After" in resp.headers


# ---------------------------------------------------------------------------
# /auth/signup — 5/minute
# ---------------------------------------------------------------------------


class TestRateLimitSignup:
    """POST /auth/signup is rate-limited to 5 requests/minute."""

    @patch("app.routers.auth_routes.send_email", return_value=True)
    @patch("app.routers.auth_routes.hash_password", return_value="$2b$12$hashed")
    @patch("app.routers.auth_routes.generate_token", return_value="token123")
    @patch("app.routers.auth_routes.validate_password", return_value=None)
    def test_429_after_5_requests(self, mock_validate, mock_token, mock_hash, mock_email):
        db = _mock_db()
        # Make unique emails for each signup so the 409 conflict doesn't interfere
        app.dependency_overrides[get_db] = lambda: db
        client = TestClient(app)
        for i in range(5):
            client.post("/auth/signup", json={
                "email": f"user{i}@example.com",
                "password": "StrongPass1!",
                "name": "Test",
            })
        resp = client.post("/auth/signup", json={
            "email": "user99@example.com",
            "password": "StrongPass1!",
            "name": "Test",
        })
        assert resp.status_code == 429
        assert "Retry-After" in resp.headers


# ---------------------------------------------------------------------------
# /auth/login — 10/minute
# ---------------------------------------------------------------------------


class TestRateLimitLogin:
    """POST /auth/login is rate-limited to 10 requests/minute."""

    def test_429_after_10_requests(self):
        db = _mock_db()
        app.dependency_overrides[get_db] = lambda: db
        client = TestClient(app)
        payload = {"email": "user@example.com", "password": "whatever"}
        for _ in range(10):
            client.post("/auth/login", json=payload)
        resp = client.post("/auth/login", json=payload)
        assert resp.status_code == 429
        assert "Retry-After" in resp.headers


# ---------------------------------------------------------------------------
# /auth/forgot-password — 3/minute
# ---------------------------------------------------------------------------


class TestRateLimitForgotPassword:
    """POST /auth/forgot-password is rate-limited to 3 requests/minute."""

    def test_429_after_3_requests(self):
        db = _mock_db()
        app.dependency_overrides[get_db] = lambda: db
        client = TestClient(app)
        payload = {"email": "user@example.com"}
        for _ in range(3):
            client.post("/auth/forgot-password", json=payload)
        resp = client.post("/auth/forgot-password", json=payload)
        assert resp.status_code == 429
        assert "Retry-After" in resp.headers


# ---------------------------------------------------------------------------
# /request-report — 5/minute
# ---------------------------------------------------------------------------


class TestRateLimitRequestReport:
    """POST /request-report is rate-limited to 5 requests/minute."""

    def test_429_after_5_requests(self):
        db = _mock_db()
        app.dependency_overrides[get_db] = lambda: db
        client = TestClient(app)
        payload = {
            "email": "user@example.com",
            "url": "https://example.com/product",
            "score": 72,
        }
        for _ in range(5):
            client.post("/request-report", json=payload)
        resp = client.post("/request-report", json=payload)
        assert resp.status_code == 429
        assert "Retry-After" in resp.headers


# ---------------------------------------------------------------------------
# /send-report-now — 5/minute
# ---------------------------------------------------------------------------


class TestRateLimitSendReportNow:
    """POST /send-report-now is rate-limited to 5 requests/minute."""

    @patch("app.routers.send_report_now.send_email", return_value=True)
    def test_429_after_5_requests(self, mock_send):
        client = TestClient(app)
        payload = {
            "email": "user@example.com",
            "url": "https://example.com/product",
            "score": 72,
            "tips": ["Tip 1"],
            "categories": {"pageSpeed": 80},
        }
        for _ in range(5):
            client.post("/send-report-now", json=payload)
        resp = client.post("/send-report-now", json=payload)
        assert resp.status_code == 429
        assert "Retry-After" in resp.headers


# ---------------------------------------------------------------------------
# Negative tests
# ---------------------------------------------------------------------------


class TestRateLimitNegative:
    """Rate limiter produces clean 429 (not 500) and does not interfere with
    single-request happy paths."""

    def test_single_request_not_rate_limited(self):
        """A single request within the window must not be rate-limited."""
        db = _mock_db()
        app.dependency_overrides[get_db] = lambda: db
        client = TestClient(app)
        resp = client.post("/auth/forgot-password", json={"email": "a@b.com"})
        assert resp.status_code != 429

    def test_429_is_not_500(self):
        """Exceeding the rate limit returns 429, not 500 — the slowapi handler
        catches RateLimitExceeded cleanly before the global exception handler."""
        db = _mock_db()
        app.dependency_overrides[get_db] = lambda: db
        client = TestClient(app)
        for _ in range(4):
            client.post("/auth/forgot-password", json={"email": "a@b.com"})
        resp = client.post("/auth/forgot-password", json={"email": "a@b.com"})
        assert resp.status_code == 429
        assert resp.status_code != 500
