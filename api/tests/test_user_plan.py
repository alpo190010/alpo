"""Tests for GET /user/plan endpoint."""

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_optional, get_current_user_required
from app.database import get_db
from app.main import app
from app.models import User
from app.plans import PLAN_TIERS


# -- Helpers ----------------------------------------------------------------


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
    # Recent reset — prevents maybe_reset_free_credits from firing.
    user.credits_reset_at = datetime.now(timezone.utc)
    user.lemon_subscription_id = None
    user.lemon_customer_id = None
    user.current_period_end = None
    user.lemon_customer_portal_url = None
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    return user


# -- Tests ------------------------------------------------------------------


class TestGetUserPlan:
    """Integration tests for GET /user/plan."""

    def test_returns_plan_for_free_user(self):
        """Default free user → all 6 JSON keys with correct values."""
        user = _make_user()

        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.get("/user/plan")

        assert resp.status_code == 200
        data = resp.json()
        assert data["plan"] == "free"
        assert data["creditsUsed"] == 0
        assert data["creditsLimit"] == 3
        assert data["creditsResetAt"] is not None  # ISO string
        assert data["currentPeriodEnd"] is None
        assert data["hasCreditsRemaining"] is True

        app.dependency_overrides.clear()

    def test_returns_401_for_unauthenticated(self):
        """No auth header → 401 with 'Authentication required'."""
        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_optional] = lambda: None

        client = TestClient(app)
        resp = client.get("/user/plan")

        assert resp.status_code == 401
        assert resp.json()["detail"] == "Authentication required"

        app.dependency_overrides.clear()

    @pytest.mark.parametrize(
        "tier,expected_limit",
        [
            ("free", 3),
            ("starter", 10),
            ("growth", 30),
            ("pro", 100),
        ],
    )
    def test_correct_credits_limit_per_tier(self, tier: str, expected_limit: int):
        """Each tier returns its defined credits limit."""
        user = _make_user(plan_tier=tier)

        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.get("/user/plan")

        assert resp.status_code == 200
        assert resp.json()["creditsLimit"] == expected_limit

        app.dependency_overrides.clear()

    def test_has_credits_remaining_false_at_limit(self):
        """Free user with credits_used=3 → hasCreditsRemaining=False."""
        user = _make_user(credits_used=3)

        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.get("/user/plan")

        assert resp.status_code == 200
        assert resp.json()["hasCreditsRemaining"] is False

        app.dependency_overrides.clear()

    def test_has_credits_remaining_true_under_limit(self):
        """Free user with credits_used=1 → hasCreditsRemaining=True."""
        user = _make_user(credits_used=1)

        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.get("/user/plan")

        assert resp.status_code == 200
        assert resp.json()["hasCreditsRemaining"] is True

        app.dependency_overrides.clear()

    def test_returns_customer_portal_url(self):
        """Default free user → customerPortalUrl is None."""
        user = _make_user()

        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.get("/user/plan")

        assert resp.status_code == 200
        data = resp.json()
        assert "customerPortalUrl" in data
        assert data["customerPortalUrl"] is None

        app.dependency_overrides.clear()

    def test_returns_customer_portal_url_when_set(self):
        """User with portal URL → customerPortalUrl is the URL string."""
        user = _make_user()
        user.lemon_customer_portal_url = "https://portal.example.com"

        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.get("/user/plan")

        assert resp.status_code == 200
        data = resp.json()
        assert data["customerPortalUrl"] == "https://portal.example.com"

        app.dependency_overrides.clear()

    def test_response_includes_user_id(self):
        """Response includes userId matching the authenticated user's UUID."""
        user = _make_user()

        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.get("/user/plan")

        assert resp.status_code == 200
        data = resp.json()
        assert "userId" in data
        assert data["userId"] == str(user.id)

        app.dependency_overrides.clear()
