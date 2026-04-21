"""Tests for in-memory scan deduplication lock.

Unit tests for try_acquire_scan / release_scan functions, and
an integration test proving the /analyze endpoint returns 409
on duplicate in-flight scans for the same authenticated user.
"""

import asyncio
import time
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import get_current_user_optional
from app.database import get_db
from app.models import User
from app.services.scan_dedup import (
    LOCK_TTL_SECONDS,
    _in_flight,
    release_scan,
    try_acquire_scan,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_in_flight():
    """Clear the in-flight dict before and after every test."""
    _in_flight.clear()
    yield
    _in_flight.clear()


# ===========================================================================
# Unit tests — try_acquire_scan / release_scan
# ===========================================================================


class TestTryAcquireScan:
    """Unit tests for try_acquire_scan."""

    def test_acquire_succeeds_first_call(self):
        assert try_acquire_scan("https://example.com", "user-1") is True

    def test_acquire_fails_duplicate(self):
        try_acquire_scan("https://example.com", "user-1")
        assert try_acquire_scan("https://example.com", "user-1") is False

    def test_release_then_reacquire(self):
        try_acquire_scan("https://example.com", "user-1")
        release_scan("https://example.com", "user-1")
        assert try_acquire_scan("https://example.com", "user-1") is True

    def test_stale_entry_auto_expires(self):
        """An entry older than LOCK_TTL_SECONDS is treated as expired."""
        # Manually insert a stale entry
        key = "https://example.com:user-1"
        _in_flight[key] = time.time() - (LOCK_TTL_SECONDS + 1)

        # Should succeed because the existing entry is stale
        assert try_acquire_scan("https://example.com", "user-1") is True

    def test_stale_entries_cleaned_on_acquire(self):
        """Stale entries from other keys are evicted during acquire."""
        _in_flight["https://old.com:user-old"] = time.time() - (LOCK_TTL_SECONDS + 10)
        _in_flight["https://fresh.com:user-fresh"] = time.time()

        try_acquire_scan("https://new.com", "user-new")

        assert "https://old.com:user-old" not in _in_flight
        assert "https://fresh.com:user-fresh" in _in_flight
        assert "https://new.com:user-new" in _in_flight

    def test_different_url_same_user_independent(self):
        """Different URLs for the same user are independent locks."""
        assert try_acquire_scan("https://a.com", "user-1") is True
        assert try_acquire_scan("https://b.com", "user-1") is True

    def test_same_url_different_user_independent(self):
        """Same URL for different users are independent locks."""
        assert try_acquire_scan("https://example.com", "user-1") is True
        assert try_acquire_scan("https://example.com", "user-2") is True

    def test_anonymous_user_always_true(self):
        """user_id=None always returns True and never creates a lock."""
        assert try_acquire_scan("https://example.com", None) is True
        assert try_acquire_scan("https://example.com", None) is True
        assert len(_in_flight) == 0


class TestReleaseScan:
    """Unit tests for release_scan."""

    def test_release_removes_key(self):
        try_acquire_scan("https://example.com", "user-1")
        assert len(_in_flight) == 1
        release_scan("https://example.com", "user-1")
        assert len(_in_flight) == 0

    def test_release_nonexistent_key_noop(self):
        """Releasing a key that doesn't exist is a silent no-op."""
        release_scan("https://nonexistent.com", "user-1")  # should not raise

    def test_release_none_user_noop(self):
        """Releasing with user_id=None is a no-op — no error."""
        release_scan("https://example.com", None)  # should not raise


# ===========================================================================
# Integration test — 409 via HTTP
# ===========================================================================


def _make_user(plan_tier: str = "free", credits_used: int = 0) -> User:
    """Build a User ORM instance with plan fields set."""
    user = User()
    user.id = uuid.uuid4()
    user.google_sub = "google-sub-test"
    user.email = "dedup-test@example.com"
    user.name = "Dedup Tester"
    user.picture = None
    user.plan_tier = plan_tier
    user.credits_used = credits_used
    user.credits_reset_at = datetime.now(timezone.utc)
    user.paddle_subscription_id = None
    user.paddle_customer_id = None
    user.current_period_end = None
    user.paddle_customer_portal_url = None
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    return user


def _mock_db():
    """Return a MagicMock simulating a SQLAlchemy Session."""
    session = MagicMock()
    session.query.return_value.filter.return_value.first.return_value = None
    row = MagicMock()
    row.__getitem__ = MagicMock(return_value=str(uuid.uuid4()))
    session.execute.return_value.fetchone.return_value = row
    return session


class TestAnalyze409Integration:
    """Integration test: /analyze returns 409 for duplicate in-flight scans."""

    @pytest.fixture(autouse=True)
    def _cleanup_overrides(self):
        yield
        app.dependency_overrides.clear()

    def test_duplicate_scan_returns_409(self):
        """If a scan is already in-flight for the same URL+user, return 409."""
        user = _make_user()
        db = _mock_db()

        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user_optional] = lambda: user

        url = "https://example.com/product"

        # Simulate an in-flight scan by pre-acquiring the lock
        try_acquire_scan(url, str(user.id))

        client = TestClient(app)
        resp = client.post("/analyze", json={"url": url})

        assert resp.status_code == 409
        body = resp.json()
        assert "already in progress" in body["error"]

        # Clean up the lock
        release_scan(url, str(user.id))

    def test_first_scan_not_blocked(self):
        """A scan with no in-flight duplicate proceeds normally (not 409)."""
        user = _make_user()
        db = _mock_db()

        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user_optional] = lambda: user

        client = TestClient(app)

        # Patch the heavy processing to avoid real network calls
        _VALID_HTML = "<html><body>" + ("x" * 200) + "</body></html>"

        with (
            patch("app.routers.analyze.render_page", new_callable=AsyncMock, return_value=_VALID_HTML),
            patch("app.routers.analyze.measure_mobile_cta", new_callable=AsyncMock, return_value=None),
            patch("app.routers.analyze.fetch_ai_discoverability_data", new_callable=AsyncMock, return_value=None),
            patch("app.routers.analyze.fetch_content_freshness_data", new_callable=AsyncMock, return_value=None),
            patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock, return_value=None),
            patch("app.routers.analyze.fetch_pagespeed_insights", new_callable=AsyncMock, return_value=None),
            patch("app.routers.analyze.settings") as mock_settings,
        ):
            mock_settings.google_pagespeed_api_key = None
            resp = client.post("/analyze", json={"url": "https://example.com/product"})

        # Should NOT be 409; the endpoint proceeds with analysis
        assert resp.status_code != 409
        # Lock should have been released via finally
        assert len(_in_flight) == 0

    def test_anonymous_user_skips_dedup(self):
        """Anonymous user (no auth) is never blocked by dedup."""
        db = _mock_db()

        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user_optional] = lambda: None

        url = "https://example.com/product"

        # Pre-acquire a lock under a fake user ID to prove anon isn't affected
        try_acquire_scan(url, "some-other-user")

        client = TestClient(app)

        _VALID_HTML = "<html><body>" + ("x" * 200) + "</body></html>"

        with (
            patch("app.routers.analyze.render_page", new_callable=AsyncMock, return_value=_VALID_HTML),
            patch("app.routers.analyze.measure_mobile_cta", new_callable=AsyncMock, return_value=None),
            patch("app.routers.analyze.fetch_ai_discoverability_data", new_callable=AsyncMock, return_value=None),
            patch("app.routers.analyze.fetch_content_freshness_data", new_callable=AsyncMock, return_value=None),
            patch("app.routers.analyze.run_axe_scan", new_callable=AsyncMock, return_value=None),
            patch("app.routers.analyze.fetch_pagespeed_insights", new_callable=AsyncMock, return_value=None),
            patch("app.routers.analyze.settings") as mock_settings,
        ):
            mock_settings.google_pagespeed_api_key = None
            resp = client.post("/analyze", json={"url": "https://example.com/product"})

        # Anonymous user should never get 409
        assert resp.status_code != 409

        release_scan(url, "some-other-user")
