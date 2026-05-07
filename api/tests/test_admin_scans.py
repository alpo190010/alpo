"""Tests for admin scanned-domain audit endpoints.

Covers:
  GET  /admin/scans                  — paginated domain aggregate
  POST /admin/scans/{domain}/rescan  — re-run store-wide analysis
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.auth import (
    get_current_user_admin,
    get_current_user_optional,
    get_current_user_required,
)
from app.database import get_db
from app.main import app


def _make_admin():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.role = "admin"
    user.email = "admin@example.com"
    user.name = "Admin"
    return user


def _make_user(role: str = "user", email: str = "user@example.com"):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.role = role
    user.email = email
    user.name = "User"
    return user


def _make_aggregate_row(
    *,
    domain: str = "example.com",
    scan_count: int = 3,
    unique_users: int = 2,
):
    """Build a row matching the aggregate shape returned by base.all()."""
    row = MagicMock()
    row.domain = domain
    row.scan_count = scan_count
    row.unique_users = unique_users
    row.last_scanned_at = datetime.now(timezone.utc)
    return row


def _mock_db_for_list(aggregate_rows, total=None, sa_rows=None, pa_rows=None):
    """Mock DB for the list_scanned_domains query.

    The endpoint issues three queries:
      1. base aggregate (group by domain) -> .count() + .all()
      2. StoreAnalysis subquery / latest-per-domain -> .all()
      3. ProductAnalysis subquery / latest-per-domain -> .all()
    """
    sa_rows = sa_rows or []
    pa_rows = pa_rows or []

    aggregate_q = MagicMock()
    aggregate_q.group_by.return_value = aggregate_q
    aggregate_q.filter.return_value = aggregate_q
    aggregate_q.having.return_value = aggregate_q
    aggregate_q.order_by.return_value = aggregate_q
    aggregate_q.offset.return_value = aggregate_q
    aggregate_q.limit.return_value = aggregate_q
    aggregate_q.count.return_value = (
        total if total is not None else len(aggregate_rows)
    )
    aggregate_q.all.return_value = aggregate_rows

    sa_subquery_q = MagicMock()
    sa_subquery_q.filter.return_value = sa_subquery_q
    sa_subquery_q.subquery.return_value = MagicMock()

    sa_latest_q = MagicMock()
    sa_latest_q.filter.return_value = sa_latest_q
    sa_latest_q.all.return_value = sa_rows

    pa_subquery_q = MagicMock()
    pa_subquery_q.filter.return_value = pa_subquery_q
    pa_subquery_q.subquery.return_value = MagicMock()

    pa_latest_q = MagicMock()
    pa_latest_q.filter.return_value = pa_latest_q
    pa_latest_q.all.return_value = pa_rows

    queries = iter([
        aggregate_q,    # base aggregate query (used for .count + .all)
        sa_subquery_q,  # StoreAnalysis subquery (.subquery())
        sa_latest_q,    # StoreAnalysis latest-per-domain (.all())
        pa_subquery_q,  # ProductAnalysis subquery (.subquery())
        pa_latest_q,    # ProductAnalysis latest-per-domain (.all())
    ])

    mock_db = MagicMock()
    mock_db.query.side_effect = lambda *args, **kwargs: next(queries)
    return mock_db


def _mock_db_for_rescan(*, sa_row=None, pa_row=None, scan_row=None, store_row=None):
    """Mock DB for the rescan endpoint.

    The endpoint issues up to four queries:
      1. StoreAnalysis lookup
      2. ProductAnalysis lookup (only if SA missing)
      3. Scan lookup (only if both missing)
      4. Store lookup (only when 1-3 all missing)
    """
    queries = iter([
        sa_row,
        pa_row,
        scan_row,
        store_row,
    ])

    def _query_side_effect(*args, **kwargs):
        q = MagicMock()
        q.filter.return_value = q
        q.order_by.return_value = q
        try:
            q.first.return_value = next(queries)
        except StopIteration:
            q.first.return_value = None
        return q

    mock_db = MagicMock()
    mock_db.query.side_effect = _query_side_effect
    return mock_db


# ---------------------------------------------------------------------------
# GET /admin/scans
# ---------------------------------------------------------------------------


class TestListScannedDomains:
    def setup_method(self):
        app.dependency_overrides.clear()

    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_returns_paginated_domain_rows(self):
        admin = _make_admin()
        rows = [
            _make_aggregate_row(domain="allbirds.com", scan_count=12),
            _make_aggregate_row(domain="example.com", scan_count=3),
        ]
        app.dependency_overrides[get_db] = lambda: _mock_db_for_list(rows)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/scans")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["scans"]) == 2
        assert data["scans"][0]["domain"] == "allbirds.com"
        assert data["scans"][0]["scanCount"] == 12
        assert data["total"] == 2
        assert data["page"] == 1
        assert data["perPage"] == 25

    def test_response_carries_platform_and_score_from_store_analysis(self):
        admin = _make_admin()
        rows = [_make_aggregate_row(domain="allbirds.com")]

        sa_row = MagicMock()
        sa_row.dom = "allbirds.com"
        sa_row.score = 87
        sa_row.is_shopify = True
        sa_row.user_id = uuid.uuid4()

        app.dependency_overrides[get_db] = lambda: _mock_db_for_list(rows, sa_rows=[sa_row])
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/scans")

        assert resp.status_code == 200
        scan = resp.json()["scans"][0]
        assert scan["isShopify"] is True
        assert scan["latestScore"] == 87

    def test_falls_back_to_product_analysis_when_no_store_analysis(self):
        admin = _make_admin()
        rows = [_make_aggregate_row(domain="aiei.ge")]

        pa_row = MagicMock()
        pa_row.dom = "aiei.ge"
        pa_row.score = 42
        pa_row.is_shopify = False

        app.dependency_overrides[get_db] = lambda: _mock_db_for_list(
            rows, sa_rows=[], pa_rows=[pa_row]
        )
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/scans")

        scan = resp.json()["scans"][0]
        assert scan["isShopify"] is False
        assert scan["latestScore"] == 42

    def test_unknown_platform_when_no_analysis_row(self):
        admin = _make_admin()
        rows = [_make_aggregate_row(domain="anon-only.com")]

        app.dependency_overrides[get_db] = lambda: _mock_db_for_list(rows)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/scans")

        scan = resp.json()["scans"][0]
        assert scan["isShopify"] is None

    def test_is_shopify_filter_excludes_non_matching(self):
        admin = _make_admin()
        rows = [
            _make_aggregate_row(domain="shop.com"),
            _make_aggregate_row(domain="generic.com"),
        ]
        sa_rows = [
            MagicMock(dom="shop.com", score=80, is_shopify=True, user_id=uuid.uuid4()),
            MagicMock(dom="generic.com", score=50, is_shopify=False, user_id=uuid.uuid4()),
        ]

        app.dependency_overrides[get_db] = lambda: _mock_db_for_list(rows, sa_rows=sa_rows)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.get("/admin/scans?is_shopify=false")

        scans = resp.json()["scans"]
        assert len(scans) == 1
        assert scans[0]["domain"] == "generic.com"
        assert scans[0]["isShopify"] is False

    def test_returns_403_for_non_admin(self):
        non_admin = _make_user(role="user")
        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_required] = lambda: non_admin

        client = TestClient(app)
        resp = client.get("/admin/scans")

        assert resp.status_code == 403

    def test_returns_401_unauthenticated(self):
        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_optional] = lambda: None

        client = TestClient(app)
        resp = client.get("/admin/scans")

        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /admin/scans/{domain}/rescan
# ---------------------------------------------------------------------------


class TestRescanDomain:
    def setup_method(self):
        app.dependency_overrides.clear()

    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_rescan_uses_store_analysis_row(self):
        admin = _make_admin()
        sa = MagicMock()
        sa.user_id = uuid.uuid4()
        sa.analyzed_url = "https://allbirds.com/products/wool-runners"

        app.dependency_overrides[get_db] = lambda: _mock_db_for_rescan(sa_row=sa)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        with patch(
            "app.routers.admin_scans._run_store_wide_analysis",
            new_callable=AsyncMock,
            return_value={
                "score": 87,
                "isShopify": True,
                "skippedDimensions": [],
                "updatedAt": "2026-05-08T00:00:00Z",
            },
        ) as mock_run:
            client = TestClient(app)
            resp = client.post("/admin/scans/allbirds.com/rescan")

        assert resp.status_code == 200
        body = resp.json()
        assert body["domain"] == "allbirds.com"
        assert body["score"] == 87
        assert body["isShopify"] is True
        # Orchestrator was called with the SA row's data + force=True
        kwargs = mock_run.call_args.kwargs
        assert kwargs["domain"] == "allbirds.com"
        assert kwargs["product_url"] == sa.analyzed_url
        assert kwargs["user_id"] == sa.user_id
        assert kwargs["force"] is True

    def test_rescan_falls_back_to_product_analysis(self):
        admin = _make_admin()
        pa = MagicMock()
        pa.user_id = uuid.uuid4()
        pa.product_url = "https://aiei.ge/products/x"

        app.dependency_overrides[get_db] = lambda: _mock_db_for_rescan(
            sa_row=None, pa_row=pa
        )
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        with patch(
            "app.routers.admin_scans._run_store_wide_analysis",
            new_callable=AsyncMock,
            return_value={
                "score": 60,
                "isShopify": False,
                "skippedDimensions": ["checkout"],
                "updatedAt": "2026-05-08T00:00:00Z",
            },
        ) as mock_run:
            client = TestClient(app)
            resp = client.post("/admin/scans/aiei.ge/rescan")

        assert resp.status_code == 200
        body = resp.json()
        assert body["isShopify"] is False
        kwargs = mock_run.call_args.kwargs
        assert kwargs["product_url"] == pa.product_url
        assert kwargs["user_id"] == pa.user_id

    def test_rescan_anonymous_only_returns_409(self):
        admin = _make_admin()
        store = MagicMock()
        store.id = uuid.uuid4()

        # No StoreAnalysis, no ProductAnalysis, no authenticated Scan, but
        # a Store record exists -> 409
        app.dependency_overrides[get_db] = lambda: _mock_db_for_rescan(
            sa_row=None, pa_row=None, scan_row=None, store_row=store
        )
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.post("/admin/scans/anon-only.com/rescan")

        assert resp.status_code == 409
        assert "anonymous" in resp.json()["detail"].lower()

    def test_rescan_unknown_domain_returns_404(self):
        admin = _make_admin()
        app.dependency_overrides[get_db] = lambda: _mock_db_for_rescan(
            sa_row=None, pa_row=None, scan_row=None, store_row=None
        )
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        client = TestClient(app)
        resp = client.post("/admin/scans/never-seen.com/rescan")

        assert resp.status_code == 404

    def test_rescan_propagates_orchestrator_failure(self):
        admin = _make_admin()
        sa = MagicMock()
        sa.user_id = uuid.uuid4()
        sa.analyzed_url = "https://broken.com/products/x"

        app.dependency_overrides[get_db] = lambda: _mock_db_for_rescan(sa_row=sa)
        app.dependency_overrides[get_current_user_admin] = lambda: admin

        with patch(
            "app.routers.admin_scans._run_store_wide_analysis",
            new_callable=AsyncMock,
            return_value=None,
        ):
            client = TestClient(app)
            resp = client.post("/admin/scans/broken.com/rescan")

        assert resp.status_code == 502

    def test_rescan_returns_403_for_non_admin(self):
        non_admin = _make_user(role="user")
        app.dependency_overrides[get_db] = lambda: MagicMock()
        app.dependency_overrides[get_current_user_required] = lambda: non_admin

        client = TestClient(app)
        resp = client.post("/admin/scans/allbirds.com/rescan")

        assert resp.status_code == 403
