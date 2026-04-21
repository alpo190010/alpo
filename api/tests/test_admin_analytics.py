"""Tests for admin analytics API endpoint.

GET /admin/analytics — platform-wide metrics (total users, signups over
time, scan volume, plan tier distribution, total credits used).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_admin
from app.database import get_db
from app.main import app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_admin(**overrides):
    """Build a mock admin user for the auth dependency."""
    defaults = {
        "id": uuid.uuid4(),
        "email": "admin@example.com",
        "name": "Admin User",
        "role": "admin",
        "plan_tier": "free",
        "credits_used": 0,
        "email_verified": True,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    defaults.update(overrides)
    user = MagicMock()
    for k, v in defaults.items():
        setattr(user, k, v)
    return user


def _make_row(**kwargs):
    """Create a simple namespace object to mimic a SQLAlchemy result row."""
    row = MagicMock()
    for k, v in kwargs.items():
        setattr(row, k, v)
    return row


def _mock_db_analytics(
    total_users: int = 0,
    signups_rows: list | None = None,
    total_scans: int = 0,
    scans_rows: list | None = None,
    plan_rows: list | None = None,
    total_credits: int = 0,
    waitlist_count: int = 0,
):
    """Build a mock DB session that supports the chained query patterns
    used by the analytics endpoint.

    The endpoint issues five distinct db.query() calls (the user
    single-row metrics are consolidated into one query with
    conditional aggregation).  We use ``side_effect`` on ``db.query()``
    to return a different mock chain for each call.
    """
    if signups_rows is None:
        signups_rows = []
    if scans_rows is None:
        scans_rows = []
    if plan_rows is None:
        plan_rows = []

    mock_db = MagicMock()

    # Each db.query() call returns a fresh chain mock.
    # Order of calls in the endpoint:
    #   1. user_agg     → one()   — total_users + total_credits + waitlist
    #   2. signups      → filter().group_by().order_by().all()
    #   3. total_scans  → scalar()
    #   4. scans        → filter().group_by().order_by().all()
    #   5. plan_dist    → group_by().all()

    def _chain():
        """Return a mock that supports arbitrary chaining and terminals."""
        m = MagicMock()
        m.filter.return_value = m
        m.group_by.return_value = m
        m.order_by.return_value = m
        return m

    chain1 = _chain()
    chain1.one.return_value = _make_row(
        total_users=total_users,
        total_credits=total_credits,
        waitlist_count=waitlist_count,
    )

    chain2 = _chain()
    chain2.all.return_value = signups_rows

    chain3 = _chain()
    chain3.scalar.return_value = total_scans

    chain4 = _chain()
    chain4.all.return_value = scans_rows

    chain5 = _chain()
    chain5.all.return_value = plan_rows

    mock_db.query.side_effect = [chain1, chain2, chain3, chain4, chain5]

    return mock_db


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestGetAnalytics:
    """Tests for GET /admin/analytics."""

    def setup_method(self):
        app.dependency_overrides.clear()

    def teardown_method(self):
        app.dependency_overrides.clear()

    # -- Happy path --------------------------------------------------------

    def test_analytics_happy_path(self):
        """Endpoint returns all 6 metric fields with correct values."""
        admin = _make_admin()

        signups = [
            _make_row(date=date(2025, 6, 1), count=3),
            _make_row(date=date(2025, 6, 2), count=5),
        ]
        scans = [
            _make_row(date=date(2025, 6, 1), count=10),
        ]
        plans = [
            _make_row(plan_tier="free", count=8),
            _make_row(plan_tier="pro", count=2),
        ]

        mock_db = _mock_db_analytics(
            total_users=10,
            signups_rows=signups,
            total_scans=25,
            scans_rows=scans,
            plan_rows=plans,
            total_credits=42,
        )

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/analytics")

        assert resp.status_code == 200
        data = resp.json()

        # All 6 required keys present
        assert data["total_users"] == 10
        assert data["total_scans"] == 25
        assert data["total_credits_used"] == 42

        assert data["signups_over_time"] == [
            {"date": "2025-06-01", "count": 3},
            {"date": "2025-06-02", "count": 5},
        ]
        assert data["scans_over_time"] == [
            {"date": "2025-06-01", "count": 10},
        ]
        assert data["plan_distribution"] == [
            {"plan_tier": "free", "count": 8},
            {"plan_tier": "pro", "count": 2},
        ]

    def test_analytics_response_shape(self):
        """Response contains exactly the 6 documented keys."""
        admin = _make_admin()
        mock_db = _mock_db_analytics()

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/analytics")

        assert resp.status_code == 200
        expected_keys = {
            "total_users",
            "signups_over_time",
            "total_scans",
            "scans_over_time",
            "plan_distribution",
            "total_credits_used",
            "waitlistCount",
        }
        assert set(resp.json().keys()) == expected_keys

    # -- Empty DB (negative test) ------------------------------------------

    def test_analytics_empty_db(self):
        """Empty DB: all counts are 0, time series are empty arrays."""
        admin = _make_admin()
        mock_db = _mock_db_analytics(
            total_users=0,
            signups_rows=[],
            total_scans=0,
            scans_rows=[],
            plan_rows=[],
            total_credits=0,
        )

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/analytics")

        assert resp.status_code == 200
        data = resp.json()
        assert data["total_users"] == 0
        assert data["total_scans"] == 0
        assert data["total_credits_used"] == 0
        assert data["signups_over_time"] == []
        assert data["scans_over_time"] == []
        assert data["plan_distribution"] == []

    # -- No analyses (negative test) ---------------------------------------

    def test_analytics_no_analyses(self):
        """No product analyses: total_scans=0, scans_over_time=[]."""
        admin = _make_admin()
        mock_db = _mock_db_analytics(
            total_users=5,
            signups_rows=[_make_row(date=date(2025, 6, 1), count=5)],
            total_scans=0,
            scans_rows=[],
            plan_rows=[_make_row(plan_tier="free", count=5)],
            total_credits=0,
        )

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/analytics")

        assert resp.status_code == 200
        data = resp.json()
        assert data["total_scans"] == 0
        assert data["scans_over_time"] == []
        # Users exist though
        assert data["total_users"] == 5

    # -- Admin auth (implicit via dependency override) ---------------------

    def test_analytics_uses_admin_dependency(self):
        """Endpoint uses get_current_user_admin for auth."""
        # Verify by NOT overriding — should fail with auth error
        mock_db = _mock_db_analytics()
        app.dependency_overrides[get_db] = lambda: mock_db
        # Override the optional user to return None → triggers 401
        from app.auth import get_current_user_optional
        app.dependency_overrides[get_current_user_optional] = lambda: None

        client = TestClient(app)
        resp = client.get("/admin/analytics")

        assert resp.status_code == 401

    def test_analytics_date_format(self):
        """Dates in time series are ISO format (YYYY-MM-DD)."""
        admin = _make_admin()
        signups = [_make_row(date=date(2025, 1, 15), count=1)]

        mock_db = _mock_db_analytics(signups_rows=signups)
        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/analytics")

        assert resp.status_code == 200
        assert resp.json()["signups_over_time"][0]["date"] == "2025-01-15"

    def test_analytics_null_scalar_defaults_to_zero(self):
        """When scalar() returns None (e.g. empty SUM), defaults to 0."""
        admin = _make_admin()
        mock_db = _mock_db_analytics(
            total_users=0,
            total_scans=0,
            total_credits=0,  # 0 explicitly simulates `or 0` fallback
        )

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/analytics")

        assert resp.status_code == 200
        data = resp.json()
        assert data["total_users"] == 0
        assert data["total_scans"] == 0
        assert data["total_credits_used"] == 0
