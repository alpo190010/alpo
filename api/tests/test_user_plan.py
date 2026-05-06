"""Tests for GET /user/plan endpoint (per-store paid stores response)."""

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.auth import get_current_user_optional, get_current_user_required
from app.database import get_db
from app.main import app
from app.models import User


# -- Helpers ----------------------------------------------------------------


def _make_user(pro_waitlist: bool = False) -> User:
    user = User()
    user.id = uuid.uuid4()
    user.google_sub = "google-sub-test"
    user.email = "test@example.com"
    user.name = "Test User"
    user.picture = None
    user.pro_waitlist = pro_waitlist
    user.paddle_customer_portal_url = None
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    return user


# -- Tests ------------------------------------------------------------------


class TestGetUserPlan:
    """Integration tests for GET /user/plan."""

    def test_returns_empty_paid_stores_for_free_user(self):
        """Default user with no subscriptions → empty paidStores list."""
        user = _make_user()

        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.get("/user/plan")

        assert resp.status_code == 200
        data = resp.json()
        assert data["userId"] == str(user.id)
        assert data["paidStores"] == []
        assert data["hasSubscription"] is False
        assert data["customerPortalUrl"] is None

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

    def test_returns_paid_stores_when_present(self):
        """User with active subscriptions → paidStores populated."""
        user = _make_user()
        paid = [
            {
                "domain": "example.com",
                "tier": "fixes",
                "currentPeriodEnd": "2027-05-06T00:00:00+00:00",
            },
        ]

        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_required] = lambda: user

        with patch(
            "app.routers.user_plan.list_paid_stores",
            return_value=paid,
        ):
            client = TestClient(app)
            resp = client.get("/user/plan")

        assert resp.status_code == 200
        data = resp.json()
        assert data["paidStores"] == paid
        assert data["hasSubscription"] is True

        app.dependency_overrides.clear()

    def test_returns_customer_portal_url_when_set(self):
        user = _make_user()
        user.paddle_customer_portal_url = "https://portal.example.com"

        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_required] = lambda: user

        client = TestClient(app)
        resp = client.get("/user/plan")

        assert resp.status_code == 200
        data = resp.json()
        assert data["customerPortalUrl"] == "https://portal.example.com"

        app.dependency_overrides.clear()
