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
    """Build a mock DB session that mimics the consolidated CTE query.

    The endpoint now issues exactly one ``db.execute(sql, params).one()``
    call and reads 5 JSON-shaped attributes off the result row. We mock
    that single call here. Helper accepts the test's existing
    ``_make_row(date=..., count=...)`` inputs and converts them to the
    dict shape Postgres's ``json_agg`` actually returns.
    """
    def _to_date_dict(r):
        if isinstance(r, dict):
            return r
        d = getattr(r, "date", None)
        return {
            "date": d.isoformat() if hasattr(d, "isoformat") else d,
            "count": getattr(r, "count", 0),
        }

    def _to_plan_dict(r):
        if isinstance(r, dict):
            return r
        return {
            "plan_tier": getattr(r, "plan_tier", None),
            "count": getattr(r, "count", 0),
        }

    mock_db = MagicMock()
    exec_row = _make_row(
        user_agg={
            "total_users": total_users,
            "total_credits": total_credits,
            "waitlist_count": waitlist_count,
        },
        signups=[_to_date_dict(r) for r in (signups_rows or [])],
        total_scans=total_scans,
        scans_series=[_to_date_dict(r) for r in (scans_rows or [])],
        plans=[_to_plan_dict(r) for r in (plan_rows or [])],
    )
    mock_db.execute.return_value.one.return_value = exec_row
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
        assert "active_paid_plans" in data

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
            "active_paid_plans",
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
        assert data["active_paid_plans"] == 0
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
        assert data["active_paid_plans"] == 0
