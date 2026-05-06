"""Tests for admin user management API endpoints.

Covers all three endpoints:
  GET  /admin/users           — paginated list with search & filter (R109)
  GET  /admin/users/{user_id} — full user detail (R110)
  PATCH /admin/users/{user_id} — edit user with self-demotion protection (R110, R111)
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_admin, get_current_user_optional, get_current_user_required
from app.database import get_db
from app.main import app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(scan_count: int = 0, analysis_count: int = 0, **overrides):
    """Build a mock user with all fields set for serialisation.

    Uses MagicMock so dynamic relationships (.scans.count(), .product_analyses.count())
    work without a real SQLAlchemy session.
    """
    defaults = {
        "id": uuid.uuid4(),
        "email": "user@example.com",
        "name": "Test User",
        "role": "user",
        "email_verified": False,
        "password_hash": "hashed_pw_123",
        "picture": None,
        "google_sub": None,
        "pro_waitlist": False,
        "paddle_customer_portal_url": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    defaults.update(overrides)

    user = MagicMock()
    for k, v in defaults.items():
        setattr(user, k, v)

    # Mock dynamic relationships for _user_detail_dict
    scans_mock = MagicMock()
    scans_mock.count.return_value = scan_count
    user.scans = scans_mock

    analyses_mock = MagicMock()
    analyses_mock.count.return_value = analysis_count
    user.product_analyses = analyses_mock

    return user


def _make_admin(**overrides):
    """Convenience: admin user for auth dependency."""
    defaults = {"role": "admin", "email": "admin@example.com", "name": "Admin User"}
    defaults.update(overrides)
    return _make_user(**defaults)


def _mock_db_for_list(users, total=None):
    """Mock DB session that supports the chained query pattern for list endpoint."""
    mock_db = MagicMock()
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    # Support arbitrary filter/order_by/offset/limit chaining
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.offset.return_value = mock_query
    mock_query.limit.return_value = mock_query
    # Terminal values
    mock_query.count.return_value = total if total is not None else len(users)
    mock_query.all.return_value = users
    return mock_db


def _mock_db_for_detail(user):
    """Mock DB session that returns a single user from .first()."""
    mock_db = MagicMock()
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.first.return_value = user
    return mock_db


# ---------------------------------------------------------------------------
# GET /admin/users
# ---------------------------------------------------------------------------


class TestListUsers:
    """Tests for GET /admin/users (R109)."""

    def setup_method(self):
        app.dependency_overrides.clear()

    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_list_users_returns_paginated_results(self):
        """Returns paginated user list with users, total, page, per_page."""
        users = [_make_user(email=f"user{i}@example.com") for i in range(2)]
        admin = _make_admin()

        app.dependency_overrides[get_db] = lambda: _mock_db_for_list(users)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/users")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["users"]) == 2
        assert data["total"] == 2
        assert data["page"] == 1
        assert data["per_page"] == 20

    def test_list_users_search_filter(self):
        """Search param triggers ILIKE filter on email/name."""
        users = [_make_user(email="match@example.com")]
        admin = _make_admin()
        mock_db = _mock_db_for_list(users)

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/users?search=match")

        assert resp.status_code == 200
        # filter() was called at least once (search triggers or_/ilike)
        assert mock_db.query.return_value.filter.called

    def test_list_users_role_filter(self):
        """Role param triggers exact filter."""
        users = [_make_user(role="admin")]
        admin = _make_admin()
        mock_db = _mock_db_for_list(users)

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/users?role=admin")

        assert resp.status_code == 200
        assert mock_db.query.return_value.filter.called

    def test_list_users_empty_results(self):
        """Empty user list returns empty array with total=0."""
        admin = _make_admin()

        app.dependency_overrides[get_db] = lambda: _mock_db_for_list([])
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/users")

        assert resp.status_code == 200
        data = resp.json()
        assert data["users"] == []
        assert data["total"] == 0

    def test_list_users_search_no_results(self):
        """Search with no matches returns empty list."""
        admin = _make_admin()
        mock_db = _mock_db_for_list([], total=0)

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/users?search=nonexistent")

        assert resp.status_code == 200
        data = resp.json()
        assert data["users"] == []
        assert data["total"] == 0

    def test_list_users_returns_401_unauthenticated(self):
        """No auth → 401 via get_current_user_required."""
        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_optional] = lambda: None

        client = TestClient(app)
        resp = client.get("/admin/users")

        assert resp.status_code == 401
        assert resp.json()["detail"] == "Authentication required"

    def test_list_users_returns_403_non_admin(self):
        """Non-admin user → 403 via get_current_user_admin."""
        non_admin = _make_user(role="user")

        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_required] = lambda: non_admin

        client = TestClient(app)
        resp = client.get("/admin/users")

        assert resp.status_code == 403
        assert resp.json()["detail"] == "Admin access required"


# ---------------------------------------------------------------------------
# GET /admin/users/{user_id}
# ---------------------------------------------------------------------------


class TestGetUserDetail:
    """Tests for GET /admin/users/{user_id} (R110)."""

    def setup_method(self):
        app.dependency_overrides.clear()

    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_get_user_detail_success(self):
        """Returns full user detail with all expected fields."""
        user_id = uuid.uuid4()
        user = _make_user(
            id=user_id,
            email="detail@example.com",
            scan_count=5,
            analysis_count=3,
        )
        admin = _make_admin()

        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(user)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get(f"/admin/users/{user_id}")

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(user_id)
        assert data["email"] == "detail@example.com"
        assert data["scan_count"] == 5
        assert data["analysis_count"] == 3
        assert "google_linked" in data
        assert "role" in data
        assert "paid_stores" in data
        assert "plan_tier" not in data
        assert "store_quota" not in data

    def test_get_user_detail_excludes_password_hash(self):
        """Response must NOT include password_hash."""
        user_id = uuid.uuid4()
        user = _make_user(id=user_id, password_hash="secret_hash_value")
        admin = _make_admin()

        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(user)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get(f"/admin/users/{user_id}")

        assert resp.status_code == 200
        assert "password_hash" not in resp.json()

    def test_get_user_detail_includes_scan_count(self):
        """Detail includes scan_count from dynamic relationship."""
        user_id = uuid.uuid4()
        user = _make_user(id=user_id, scan_count=10)
        admin = _make_admin()

        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(user)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get(f"/admin/users/{user_id}")

        assert resp.status_code == 200
        assert resp.json()["scan_count"] == 10

    def test_get_user_detail_google_linked(self):
        """google_linked=True when google_sub is set."""
        user_id = uuid.uuid4()
        user = _make_user(id=user_id, google_sub="google-sub-123")
        admin = _make_admin()

        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(user)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get(f"/admin/users/{user_id}")

        assert resp.status_code == 200
        assert resp.json()["google_linked"] is True

    def test_get_user_detail_not_found(self):
        """Non-existent user → 404."""
        user_id = uuid.uuid4()
        admin = _make_admin()

        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(None)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get(f"/admin/users/{user_id}")

        assert resp.status_code == 404
        assert resp.json()["detail"] == "User not found"

    def test_get_user_detail_invalid_uuid(self):
        """Invalid UUID path param → 400."""
        admin = _make_admin()

        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/users/not-a-uuid")

        assert resp.status_code == 400
        assert resp.json()["detail"] == "Invalid user ID format"


# ---------------------------------------------------------------------------
# PATCH /admin/users/{user_id}
# ---------------------------------------------------------------------------


class TestUpdateUser:
    """Tests for PATCH /admin/users/{user_id} (R110, R111)."""

    def setup_method(self):
        app.dependency_overrides.clear()

    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_edit_user_role_promotion(self):
        """PATCH role to admin → 200."""
        user_id = uuid.uuid4()
        user = _make_user(id=user_id, role="user")
        admin = _make_admin()

        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(user)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.patch(f"/admin/users/{user_id}", json={"role": "admin"})

        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"

    def test_edit_user_email_verified_toggle(self):
        """PATCH email_verified → 200 with updated value."""
        user_id = uuid.uuid4()
        user = _make_user(id=user_id, email_verified=False)
        admin = _make_admin()

        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(user)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.patch(f"/admin/users/{user_id}", json={"email_verified": True})

        assert resp.status_code == 200
        assert resp.json()["email_verified"] is True

    def test_edit_user_invalid_role(self):
        """PATCH invalid role → 400."""
        user_id = uuid.uuid4()
        user = _make_user(id=user_id)
        admin = _make_admin()

        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(user)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.patch(f"/admin/users/{user_id}", json={"role": "superadmin"})

        assert resp.status_code == 400
        assert "Invalid role" in resp.json()["detail"]

    def test_edit_user_self_demotion_blocked(self):
        """Admin cannot remove own admin role → 400 (R111)."""
        admin_id = uuid.uuid4()
        admin = _make_admin(id=admin_id)
        # Target user = the admin themselves (same ID in DB)
        target = _make_user(id=admin_id, role="admin", email="admin@example.com")

        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(target)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.patch(f"/admin/users/{admin_id}", json={"role": "user"})

        assert resp.status_code == 400
        assert resp.json()["detail"] == "Cannot remove your own admin role"

    def test_edit_user_self_admin_noop_allowed(self):
        """Admin setting own role to 'admin' (no change) is allowed."""
        admin_id = uuid.uuid4()
        admin = _make_admin(id=admin_id)
        target = _make_user(id=admin_id, role="admin", email="admin@example.com")

        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(target)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.patch(f"/admin/users/{admin_id}", json={"role": "admin"})

        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"

    def test_edit_user_not_found(self):
        """PATCH non-existent user → 404."""
        user_id = uuid.uuid4()
        admin = _make_admin()

        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(None)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.patch(f"/admin/users/{user_id}", json={"role": "admin"})

        assert resp.status_code == 404
        assert resp.json()["detail"] == "User not found"

    def test_edit_user_invalid_uuid(self):
        """PATCH with invalid UUID → 400."""
        admin = _make_admin()

        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.patch("/admin/users/not-a-uuid", json={"role": "admin"})

        assert resp.status_code == 400
        assert resp.json()["detail"] == "Invalid user ID format"


# ---------------------------------------------------------------------------
# PUT /admin/users/{user_id}/store-subscriptions
# DELETE /admin/users/{user_id}/store-subscriptions/{store_domain}
# ---------------------------------------------------------------------------


class TestAdminStoreSubscriptions:
    """Admin grants/revokes per-store paid plans for any user."""

    def setup_method(self):
        app.dependency_overrides.clear()

    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_upsert_creates_subscription_with_default_period(self):
        """PUT with no current_period_end → default 1-year window."""
        from unittest.mock import patch

        user_id = uuid.uuid4()
        user = _make_user(id=user_id)
        admin = _make_admin()
        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(user)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        with patch("app.routers.admin_users.upsert_subscription") as mock_upsert:
            client = TestClient(app)
            resp = client.put(
                f"/admin/users/{user_id}/store-subscriptions",
                json={
                    "store_domain": "  Example.COM  ",
                    "plan_tier": "fixes",
                },
            )

        assert resp.status_code == 200
        mock_upsert.assert_called_once()
        kwargs = mock_upsert.call_args.kwargs
        # Domain is normalized.
        assert kwargs["store_domain"] == "example.com"
        assert kwargs["plan_tier"] == "fixes"
        assert kwargs["user_id"] == user.id
        # Default period_end ~365 days out.
        from datetime import timedelta
        delta = kwargs["current_period_end"] - datetime.now(timezone.utc)
        assert timedelta(days=364) < delta < timedelta(days=366)

    def test_upsert_with_explicit_period_end(self):
        from unittest.mock import patch

        user_id = uuid.uuid4()
        user = _make_user(id=user_id)
        admin = _make_admin()
        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(user)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        with patch("app.routers.admin_users.upsert_subscription") as mock_upsert:
            client = TestClient(app)
            resp = client.put(
                f"/admin/users/{user_id}/store-subscriptions",
                json={
                    "store_domain": "shop.com",
                    "plan_tier": "insights",
                    "current_period_end": "2030-01-01T00:00:00+00:00",
                },
            )

        assert resp.status_code == 200
        kwargs = mock_upsert.call_args.kwargs
        assert kwargs["current_period_end"] == datetime(
            2030, 1, 1, tzinfo=timezone.utc
        )
        assert kwargs["plan_tier"] == "insights"

    def test_upsert_invalid_tier_returns_422(self):
        """Pydantic Literal validation rejects unknown tiers (422)."""
        user_id = uuid.uuid4()
        user = _make_user(id=user_id)
        admin = _make_admin()
        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(user)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.put(
            f"/admin/users/{user_id}/store-subscriptions",
            json={"store_domain": "shop.com", "plan_tier": "platinum"},
        )
        assert resp.status_code == 422

    def test_upsert_free_deletes_existing_subscription(self):
        """``plan_tier="free"`` revokes the row (free = no subscription)."""
        from unittest.mock import patch

        user_id = uuid.uuid4()
        user = _make_user(id=user_id)
        admin = _make_admin()
        existing = MagicMock()
        mock_db = MagicMock()

        def query_side_effect(model):
            from app.models import StoreSubscription, User as UserModel

            chain = MagicMock()
            if model is UserModel:
                chain.filter.return_value.first.return_value = user
            elif model is StoreSubscription:
                chain.filter.return_value.first.return_value = existing
            else:
                chain.filter.return_value.first.return_value = None
            return chain

        mock_db.query.side_effect = query_side_effect
        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        with patch(
            "app.services.store_subscriptions.delete_subscription"
        ) as mock_del, patch(
            "app.routers.admin_users.upsert_subscription"
        ) as mock_upsert:
            client = TestClient(app)
            resp = client.put(
                f"/admin/users/{user_id}/store-subscriptions",
                json={"store_domain": "shop.com", "plan_tier": "free"},
            )

        assert resp.status_code == 200
        mock_del.assert_called_once()
        assert mock_del.call_args.args[0] is existing
        mock_upsert.assert_not_called()

    def test_upsert_free_when_no_existing_row_is_noop(self):
        """``free`` on a domain with no row returns 200 without errors."""
        from unittest.mock import patch

        user_id = uuid.uuid4()
        user = _make_user(id=user_id)
        admin = _make_admin()
        mock_db = MagicMock()

        def query_side_effect(model):
            from app.models import StoreSubscription, User as UserModel

            chain = MagicMock()
            if model is UserModel:
                chain.filter.return_value.first.return_value = user
            elif model is StoreSubscription:
                chain.filter.return_value.first.return_value = None
            else:
                chain.filter.return_value.first.return_value = None
            return chain

        mock_db.query.side_effect = query_side_effect
        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        with patch(
            "app.services.store_subscriptions.delete_subscription"
        ) as mock_del:
            client = TestClient(app)
            resp = client.put(
                f"/admin/users/{user_id}/store-subscriptions",
                json={"store_domain": "shop.com", "plan_tier": "free"},
            )

        assert resp.status_code == 200
        mock_del.assert_not_called()

    def test_upsert_user_not_found_returns_404(self):
        admin = _make_admin()
        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(None)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.put(
            f"/admin/users/{uuid.uuid4()}/store-subscriptions",
            json={"store_domain": "shop.com", "plan_tier": "fixes"},
        )
        assert resp.status_code == 404

    def test_upsert_invalid_uuid_returns_400(self):
        admin = _make_admin()
        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.put(
            "/admin/users/not-a-uuid/store-subscriptions",
            json={"store_domain": "shop.com", "plan_tier": "fixes"},
        )
        assert resp.status_code == 400

    def test_revoke_deletes_active_subscription(self):
        from unittest.mock import patch

        user_id = uuid.uuid4()
        user = _make_user(id=user_id)
        admin = _make_admin()
        app.dependency_overrides[get_db] = lambda: _mock_db_for_detail(user)
        app.dependency_overrides[get_current_user_admin] = lambda: admin
        sub = MagicMock()

        with patch(
            "app.routers.admin_users.get_active_subscription", return_value=sub
        ), patch("app.routers.admin_users.delete_subscription") as mock_del:
            client = TestClient(app)
            resp = client.delete(
                f"/admin/users/{user_id}/store-subscriptions/EXAMPLE.com"
            )

        assert resp.status_code == 204
        mock_del.assert_called_once()
        # First arg is the subscription row.
        assert mock_del.call_args.args[0] is sub

    def test_revoke_missing_returns_404(self):
        from unittest.mock import patch

        user_id = uuid.uuid4()
        user = _make_user(id=user_id)
        admin = _make_admin()
        mock_db = MagicMock()

        def query_side_effect(model):
            from app.models import StoreSubscription, User as UserModel

            chain = MagicMock()
            if model is UserModel:
                chain.filter.return_value.first.return_value = user
            elif model is StoreSubscription:
                chain.filter.return_value.first.return_value = None
            else:
                chain.filter.return_value.first.return_value = None
            return chain

        mock_db.query.side_effect = query_side_effect
        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        with patch(
            "app.routers.admin_users.get_active_subscription", return_value=None
        ):
            client = TestClient(app)
            resp = client.delete(
                f"/admin/users/{user_id}/store-subscriptions/missing.com"
            )

        assert resp.status_code == 404

