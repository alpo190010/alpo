"""Tests for GET /store/{domain}/products — paginated catalog browsing.

Covers the auth gate (free vs paid), DB-cache hit/miss, and the lazy
Shopify fetch fallback for pages 2+.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_required
from app.database import get_db
from app.main import app
from app.models import User


# ---- helpers ---------------------------------------------------------------


def _make_user(plan_tier: str = "free") -> User:
    user = User()
    user.id = uuid.uuid4()
    user.google_sub = "google-sub-test"
    user.email = "test@example.com"
    user.name = "Test User"
    user.picture = None
    user.plan_tier = plan_tier
    user.credits_used = 0
    user.credits_reset_at = datetime.now(timezone.utc)
    user.paddle_subscription_id = None
    user.paddle_customer_id = None
    user.current_period_end = None
    user.paddle_customer_portal_url = None
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    return user


def _make_store(
    id_=None,
    domain="example.com",
    name="Example Store",
    product_count: int | None = 50,
):
    store = MagicMock()
    store.id = id_ or uuid.uuid4()
    store.domain = domain
    store.name = name
    store.product_count = product_count
    store.updated_at = datetime(2025, 6, 15, 12, 0, 0)
    store.created_at = datetime(2025, 1, 1)
    return store


def _make_product(store_id, url, slug, image=None, id_=None):
    p = MagicMock()
    p.id = id_ or uuid.uuid4()
    p.store_id = store_id
    p.url = url
    p.slug = slug
    p.image = image
    return p


def _mock_session(*, store, cached_products=None, id_lookup_rows=None):
    """Build a MagicMock Session matching the queries the route makes.

    Order of expected ``db.query(...)`` calls:
      1. ``query(Store)`` → store lookup (or None)
      2. ``query(StoreProduct).filter(...).order_by(...).offset(...).limit(...).all()``
         → cached page slice
      3. (lazy fetch path only) ``query(StoreProduct.url, StoreProduct.id)
         .filter(...).filter(...).all()`` → ID lookup post-insert
    """
    session = MagicMock()

    store_q = MagicMock()
    store_q.filter.return_value.first.return_value = store

    cached_q = MagicMock()
    cached_q.filter.return_value.order_by.return_value.offset.return_value.limit.return_value.all.return_value = (
        cached_products or []
    )

    id_lookup_q = MagicMock()
    id_lookup_q.filter.return_value.filter.return_value.all.return_value = (
        id_lookup_rows or []
    )

    session.query.side_effect = [store_q, cached_q, id_lookup_q]
    return session


def _get_client(db, user):
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user_required] = lambda: user
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


# ---- tests -----------------------------------------------------------------


class TestPaginationGate:
    def test_free_user_page_1_returns_200(self):
        """Page 1 is always accessible — same data /store/{domain} returns."""
        store = _make_store()
        cached = [_make_product(store.id, f"u{i}", f"S{i}") for i in range(10)]
        session = _mock_session(store=store, cached_products=cached)
        client = _get_client(session, _make_user("free"))

        resp = client.get("/store/example.com/products?page=1")
        assert resp.status_code == 200
        body = resp.json()
        assert body["currentPage"] == 1
        assert len(body["products"]) == 10
        assert body["canPaginate"] is False

    def test_free_user_page_2_returns_403_pagination_locked(self):
        store = _make_store()
        session = _mock_session(store=store)
        client = _get_client(session, _make_user("free"))

        resp = client.get("/store/example.com/products?page=2")
        assert resp.status_code == 403
        body = resp.json()
        assert body["errorCode"] == "pagination_locked"
        assert body["planTier"] == "free"

    def test_starter_user_page_2_allowed(self):
        store = _make_store(product_count=25)
        cached = [_make_product(store.id, f"u{i}", f"S{i}") for i in range(10)]
        session = _mock_session(store=store, cached_products=cached)
        client = _get_client(session, _make_user("starter"))

        resp = client.get("/store/example.com/products?page=2")
        assert resp.status_code == 200
        body = resp.json()
        assert body["currentPage"] == 2
        assert body["canPaginate"] is True
        assert body["totalPages"] == 3  # ceil(25/10)


class TestErrorEnvelopes:
    def test_store_not_found(self):
        session = _mock_session(store=None)
        client = _get_client(session, _make_user("starter"))

        resp = client.get("/store/missing.com/products?page=1")
        assert resp.status_code == 404
        assert "not found" in resp.json()["error"].lower()

    def test_invalid_page_zero(self):
        session = _mock_session(store=_make_store())
        client = _get_client(session, _make_user("starter"))

        resp = client.get("/store/example.com/products?page=0")
        assert resp.status_code == 400

    def test_invalid_page_negative(self):
        session = _mock_session(store=_make_store())
        client = _get_client(session, _make_user("starter"))

        resp = client.get("/store/example.com/products?page=-1")
        assert resp.status_code == 400


class TestLazyFetchPath:
    @patch(
        "app.routers.store._try_shopify_json_page",
        new_callable=AsyncMock,
    )
    def test_cache_miss_triggers_shopify_fetch(self, mock_fetch):
        """Page > 1 with empty DB cache → Shopify fetch + insert + return."""
        store = _make_store(product_count=25)
        # Cache miss for page 2
        session = _mock_session(
            store=store,
            cached_products=[],  # cache miss
            id_lookup_rows=[
                ("https://example.com/products/handle-11", uuid.uuid4()),
                ("https://example.com/products/handle-12", uuid.uuid4()),
            ],
        )
        mock_fetch.return_value = [
            {
                "url": "https://example.com/products/handle-11",
                "slug": "Item 11",
                "image": "https://cdn/i11.jpg",
            },
            {
                "url": "https://example.com/products/handle-12",
                "slug": "Item 12",
                "image": "https://cdn/i12.jpg",
            },
        ]

        client = _get_client(session, _make_user("starter"))
        resp = client.get("/store/example.com/products?page=2")

        assert resp.status_code == 200
        body = resp.json()
        assert len(body["products"]) == 2
        assert body["products"][0]["slug"] == "Item 11"
        # Shopify was hit with page=2, page_size=10
        mock_fetch.assert_awaited_once()
        kwargs = mock_fetch.call_args.kwargs
        assert kwargs.get("page") == 2
        assert kwargs.get("page_size") == 10
        # DB execute (insert) and commit were called for caching
        assert session.execute.called
        assert session.commit.called

    @patch(
        "app.routers.store._try_shopify_json_page",
        new_callable=AsyncMock,
    )
    def test_page_out_of_range_returns_404(self, mock_fetch):
        """Cache miss + Shopify returns empty → 404 page_out_of_range."""
        store = _make_store(product_count=25)
        session = _mock_session(store=store, cached_products=[])
        mock_fetch.return_value = []

        client = _get_client(session, _make_user("starter"))
        resp = client.get("/store/example.com/products?page=99")

        assert resp.status_code == 404
        assert resp.json()["errorCode"] == "page_out_of_range"


class TestResponseShape:
    def test_canonical_envelope_fields(self):
        store = _make_store(product_count=47)
        cached = [_make_product(store.id, f"u{i}", f"S{i}") for i in range(10)]
        session = _mock_session(store=store, cached_products=cached)
        client = _get_client(session, _make_user("starter"))

        resp = client.get("/store/example.com/products?page=1")
        body = resp.json()

        # Every required field present
        assert set(body.keys()) >= {
            "products",
            "productCount",
            "currentPage",
            "totalPages",
            "canPaginate",
        }
        assert body["productCount"] == 47
        assert body["totalPages"] == 5  # ceil(47/10)
        assert body["currentPage"] == 1
        assert body["canPaginate"] is True

    def test_unknown_count_yields_null_total_pages(self):
        store = _make_store(product_count=None)
        cached = [_make_product(store.id, f"u{i}", f"S{i}") for i in range(3)]
        session = _mock_session(store=store, cached_products=cached)
        client = _get_client(session, _make_user("starter"))

        resp = client.get("/store/example.com/products?page=1")
        body = resp.json()
        assert body["productCount"] is None
        assert body["totalPages"] is None


class TestAuthRequirement:
    def test_no_auth_returns_401(self):
        """Unauthenticated callers get 401 via get_current_user_required."""
        session = _mock_session(store=_make_store())
        # Don't override get_current_user_required → real auth runs and fails
        app.dependency_overrides[get_db] = lambda: session
        client = TestClient(app)

        resp = client.get("/store/example.com/products?page=1")
        assert resp.status_code == 401
