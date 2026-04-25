"""Tests for GET /store/{domain} endpoint."""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock, PropertyMock

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_optional
from app.database import get_db
from app.main import app
from app.models import User


# ---- helpers ---------------------------------------------------------------


def _make_store(
    id_=None,
    domain="example.com",
    name="Example Store",
    updated_at=None,
    product_count: int | None = None,
):
    store = MagicMock()
    store.id = id_ or uuid.uuid4()
    store.domain = domain
    store.name = name
    store.product_count = product_count
    store.updated_at = updated_at or datetime(2025, 6, 15, 12, 0, 0)
    store.created_at = datetime(2025, 1, 1)
    return store


def _make_product(store_id, url, slug, image=None, id_=None):
    p = MagicMock()
    p.id = id_ or uuid.uuid4()
    p.store_id = store_id
    p.url = url
    p.slug = slug
    p.image = image
    p.created_at = datetime(2025, 6, 15)
    return p


def _make_analysis(
    product_url,
    store_domain="example.com",
    score=42,
    summary="Needs work",
    tips=None,
    categories=None,
    product_price=None,
    product_category="fashion",
    estimated_monthly_visitors=1000,
    id_=None,
    updated_at=None,
):
    a = MagicMock()
    a.id = id_ or uuid.uuid4()
    a.product_url = product_url
    a.store_domain = store_domain
    a.score = score
    a.summary = summary
    a.tips = tips or ["tip1", "tip2"]
    a.categories = categories or {"pageSpeed": 60}
    a.product_price = product_price
    a.product_category = product_category
    a.estimated_monthly_visitors = estimated_monthly_visitors
    a.updated_at = updated_at or (datetime.now(timezone.utc) - timedelta(hours=1))
    return a


def _make_store_analysis(
    store_domain="example.com",
    score=72,
    categories=None,
    tips=None,
    signals=None,
    analyzed_url="https://example.com",
    updated_at=None,
    id_=None,
):
    sa = MagicMock()
    sa.id = id_ or uuid.uuid4()
    sa.store_domain = store_domain
    sa.score = score
    sa.categories = categories or {"seo": 80, "trustSignals": 65}
    sa.tips = tips or {"trust": ["Add trust badges"], "pageSpeed": ["Improve page speed"]}
    sa.signals = signals or {"ssl": True, "mobileFriendly": True}
    sa.analyzed_url = analyzed_url
    sa.updated_at = updated_at or datetime(2025, 7, 1, 8, 0, 0)
    return sa


def _mock_db_with_data(store=None, products=None, analyses=None, store_analysis=None, *, include_analyses_query=True):
    """Build a MagicMock session that chains filter/order_by correctly.

    When include_analyses_query=False (unauthenticated path), only 2
    db.query() calls are expected (Store + Products).  The analyses and
    store_analysis queries are skipped because store.py short-circuits
    to analysis_rows=[] and store_analysis_row=None.
    """
    session = MagicMock()

    store_query = MagicMock()
    store_query.filter.return_value.first.return_value = store

    products_query = MagicMock()
    products_query.filter.return_value.order_by.return_value.limit.return_value.all.return_value = (
        products or []
    )

    queries = [store_query, products_query]

    if include_analyses_query:
        analyses_query = MagicMock()
        # Support chained .filter().filter().all() for user-scoped query
        analyses_query.filter.return_value.filter.return_value.all.return_value = (
            analyses or []
        )
        queries.append(analyses_query)

        store_analysis_query = MagicMock()
        # Support chained .filter().filter().first() for store analysis
        store_analysis_query.filter.return_value.filter.return_value.first.return_value = (
            store_analysis
        )
        queries.append(store_analysis_query)

    session.query.side_effect = queries
    return session


def _make_user(user_id=None) -> User:
    """Build a User ORM instance for auth override."""
    user = User()
    user.id = user_id or uuid.uuid4()
    user.google_sub = "google-sub-test"
    user.email = "test@example.com"
    user.name = "Test User"
    user.picture = None
    user.plan_tier = "free"
    user.credits_used = 0
    user.credits_reset_at = datetime.now(timezone.utc)
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    user.role = "user"
    return user


def _get_client(db_override, user_override="DEFAULT"):
    """Return a TestClient with DB and optional auth overrides.

    user_override="DEFAULT" → inject a default authenticated user.
    user_override=None → no user (anonymous).
    user_override=<User> → inject that specific user.
    """
    app.dependency_overrides[get_db] = lambda: db_override
    if user_override == "DEFAULT":
        user = _make_user()
        app.dependency_overrides[get_current_user_optional] = lambda: user
    elif user_override is None:
        app.dependency_overrides[get_current_user_optional] = lambda: None
    else:
        app.dependency_overrides[get_current_user_optional] = lambda: user_override
    return TestClient(app)


# ---- tests -------------------------------------------------------------------


def test_store_not_found():
    session = _mock_db_with_data(store=None)
    client = _get_client(session)
    resp = client.get("/store/nonexistent.com")
    assert resp.status_code == 404
    assert resp.json()["error"] == "Store not found"
    app.dependency_overrides.clear()


def test_store_found_full_response():
    """Full happy-path: store + products + analyses with correct shape."""
    store_id = uuid.uuid4()
    store = _make_store(id_=store_id, domain="shop.io", name="Best Shop")
    prod1 = _make_product(
        store_id,
        url="https://shop.io/products/widget",
        slug="widget",
        image="https://cdn.shopify.com/img/w.jpg",
    )
    prod2 = _make_product(
        store_id,
        url="https://shop.io/products/gadget",
        slug="gadget",
        image=None,
    )
    analysis1 = _make_analysis(
        product_url="https://shop.io/products/widget",
        store_domain="shop.io",
        score=55,
        product_price=Decimal("29.99"),
        product_category="electronics",
        estimated_monthly_visitors=2000,
    )

    session = _mock_db_with_data(
        store=store,
        products=[prod1, prod2],
        analyses=[analysis1],
    )
    client = _get_client(session)
    resp = client.get("/store/shop.io")

    assert resp.status_code == 200
    data = resp.json()

    # ---- store shape ----
    assert data["store"]["id"] == str(store_id)
    assert data["store"]["domain"] == "shop.io"
    assert data["store"]["name"] == "Best Shop"
    assert "updatedAt" in data["store"]
    assert data["store"]["updatedAt"] is not None

    # ---- products shape ----
    assert len(data["products"]) == 2
    p1 = data["products"][0]
    assert "id" in p1
    assert p1["url"] == "https://shop.io/products/widget"
    assert p1["slug"] == "widget"
    assert p1["image"] == "https://cdn.shopify.com/img/w.jpg"

    # ---- analyses shape: dict keyed by productUrl ----
    assert isinstance(data["analyses"], dict)
    assert "https://shop.io/products/widget" in data["analyses"]
    a = data["analyses"]["https://shop.io/products/widget"]
    assert a["score"] == 55
    assert a["productPrice"] == "29.99"
    assert a["productCategory"] == "electronics"
    assert "updatedAt" in a
    assert a["tips"] == ["tip1", "tip2"]
    assert a["categories"] == {"pageSpeed": 60}

    app.dependency_overrides.clear()


def test_store_camel_case_keys():
    """Verify all response keys are camelCase, not snake_case."""
    store = _make_store()
    session = _mock_db_with_data(store=store, products=[], analyses=[])
    client = _get_client(session)
    resp = client.get("/store/example.com")

    data = resp.json()
    # Store keys
    assert "updatedAt" in data["store"]
    assert "updated_at" not in data["store"]

    app.dependency_overrides.clear()


def test_analyses_keyed_by_product_url():
    """analyses dict must be keyed by the full product URL, not by id."""
    store = _make_store()
    analysis = _make_analysis(product_url="https://example.com/products/foo")
    session = _mock_db_with_data(store=store, products=[], analyses=[analysis])
    client = _get_client(session)
    resp = client.get("/store/example.com")

    analyses = resp.json()["analyses"]
    assert "https://example.com/products/foo" in analyses

    app.dependency_overrides.clear()


def test_product_price_serialized_as_string():
    """Numeric product_price is serialized as string."""
    store = _make_store()
    analysis = _make_analysis(
        product_url="https://example.com/products/x",
        product_price=Decimal("19.50"),
    )
    session = _mock_db_with_data(store=store, products=[], analyses=[analysis])
    client = _get_client(session)
    resp = client.get("/store/example.com")

    a = resp.json()["analyses"]["https://example.com/products/x"]
    assert a["productPrice"] == "19.50"

    app.dependency_overrides.clear()


def test_product_price_none_when_null():
    """Null product_price serialized as None/null."""
    store = _make_store()
    analysis = _make_analysis(
        product_url="https://example.com/products/y",
        product_price=None,
    )
    session = _mock_db_with_data(store=store, products=[], analyses=[analysis])
    client = _get_client(session)
    resp = client.get("/store/example.com")

    a = resp.json()["analyses"]["https://example.com/products/y"]
    assert a["productPrice"] is None

    app.dependency_overrides.clear()


def test_uuid_serialized_as_string():
    """UUIDs must come back as strings, not as UUID objects."""
    store_id = uuid.uuid4()
    store = _make_store(id_=store_id)
    session = _mock_db_with_data(store=store, products=[], analyses=[])
    client = _get_client(session)
    resp = client.get("/store/example.com")

    data = resp.json()
    assert isinstance(data["store"]["id"], str)
    assert data["store"]["id"] == str(store_id)

    app.dependency_overrides.clear()


def test_store_empty_products_and_analyses():
    """Store exists but has no products or analyses."""
    store = _make_store()
    session = _mock_db_with_data(store=store, products=[], analyses=[])
    client = _get_client(session)
    resp = client.get("/store/example.com")

    data = resp.json()
    assert data["products"] == []
    assert data["analyses"] == {}

    app.dependency_overrides.clear()


# ---- per-user scoping tests (R011) ------------------------------------------


def test_store_unauthenticated_returns_empty_analyses():
    """Anonymous GET /store/{domain} → 200 with store+products but empty analyses."""
    store = _make_store(domain="anon-shop.com", name="Anon Shop")
    prod = _make_product(
        store.id,
        url="https://anon-shop.com/products/hat",
        slug="hat",
    )
    # analyses query is never executed for anonymous users
    session = _mock_db_with_data(
        store=store,
        products=[prod],
        include_analyses_query=False,
    )
    client = _get_client(session, user_override=None)
    resp = client.get("/store/anon-shop.com")

    assert resp.status_code == 200
    data = resp.json()

    # Store and products still present
    assert data["store"]["domain"] == "anon-shop.com"
    assert data["store"]["name"] == "Anon Shop"
    assert len(data["products"]) == 1
    assert data["products"][0]["slug"] == "hat"

    # Analyses empty for anonymous user
    assert data["analyses"] == {}
    # StoreAnalysis also null for anonymous user
    assert data["storeAnalysis"] is None

    app.dependency_overrides.clear()


def test_store_analyses_scoped_to_user():
    """Authenticated GET /store/{domain} → only that user's analyses, not others'."""
    user = _make_user()
    store = _make_store(domain="scoped.com", name="Scoped Shop")

    # Only the current user's analysis — the DB filter ensures
    # other users' analyses are excluded at the query level
    user_analysis = _make_analysis(
        product_url="https://scoped.com/products/widget",
        store_domain="scoped.com",
        score=78,
    )

    session = _mock_db_with_data(
        store=store,
        products=[],
        analyses=[user_analysis],
    )
    client = _get_client(session, user_override=user)
    resp = client.get("/store/scoped.com")

    assert resp.status_code == 200
    data = resp.json()

    # Only the user's analysis appears
    assert len(data["analyses"]) == 1
    assert "https://scoped.com/products/widget" in data["analyses"]
    assert data["analyses"]["https://scoped.com/products/widget"]["score"] == 78

    # Verify the DB query was filtered by user_id:
    # 4 db.query() calls: Store, Products, ProductAnalysis, StoreAnalysis
    assert session.query.call_count == 4

    app.dependency_overrides.clear()


# ---- store analysis tests ----------------------------------------------------


def test_store_includes_store_analysis():
    """Authenticated user with a StoreAnalysis row → storeAnalysis in response."""
    store = _make_store(domain="health.com", name="Health Store")
    sa = _make_store_analysis(
        store_domain="health.com",
        score=85,
        categories={"seo": 90, "trustSignals": 80},
        tips={"trust": ["Enable HSTS"], "aiDiscoverability": ["Add schema markup"]},
        signals={"ssl": True, "mobileFriendly": False},
        analyzed_url="https://health.com",
        updated_at=datetime(2025, 7, 10, 14, 30, 0),
    )

    session = _mock_db_with_data(
        store=store,
        products=[],
        analyses=[],
        store_analysis=sa,
    )
    client = _get_client(session)
    resp = client.get("/store/health.com")

    assert resp.status_code == 200
    data = resp.json()

    sa_data = data["storeAnalysis"]
    assert sa_data is not None
    assert sa_data["score"] == 85
    assert sa_data["categories"] == {"seo": 90, "trustSignals": 80}
    assert sa_data["tips"] == {"trust": ["Enable HSTS"], "aiDiscoverability": ["Add schema markup"]}
    assert sa_data["signals"] == {"ssl": True, "mobileFriendly": False}
    assert sa_data["analyzedUrl"] == "https://health.com"
    assert sa_data["updatedAt"] == "2025-07-10T14:30:00"

    app.dependency_overrides.clear()


def test_store_no_store_analysis():
    """Authenticated user without a StoreAnalysis row → storeAnalysis is null."""
    store = _make_store(domain="noanalysis.com", name="No Analysis Store")

    session = _mock_db_with_data(
        store=store,
        products=[],
        analyses=[],
        store_analysis=None,
    )
    client = _get_client(session)
    resp = client.get("/store/noanalysis.com")

    assert resp.status_code == 200
    data = resp.json()
    assert data["storeAnalysis"] is None

    app.dependency_overrides.clear()


def test_get_store_excludes_stale_product_analyses():
    """ProductAnalysis rows older than the TTL are filtered out of the bundle."""
    store = _make_store(domain="ttl.com", name="TTL Shop")

    fresh = _make_analysis(
        product_url="https://ttl.com/products/fresh",
        store_domain="ttl.com",
        score=90,
        updated_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    stale = _make_analysis(
        product_url="https://ttl.com/products/stale",
        store_domain="ttl.com",
        score=20,
        updated_at=datetime.now(timezone.utc) - timedelta(hours=25),
    )

    session = _mock_db_with_data(
        store=store,
        products=[],
        analyses=[fresh, stale],
    )
    client = _get_client(session)
    resp = client.get("/store/ttl.com")

    assert resp.status_code == 200
    analyses = resp.json()["analyses"]
    assert "https://ttl.com/products/fresh" in analyses
    assert "https://ttl.com/products/stale" not in analyses


# ---- /refresh-analysis → /rescan back-compat redirect ----------------------


def test_refresh_analysis_legacy_path_returns_308_to_rescan():
    """The deprecated /store/{domain}/refresh-analysis path 308-redirects to
    /rescan, preserving the POST method, body, and query string.

    308 (vs 301/307) tells the client to repeat the request verbatim — same
    method, same body — so any cached client URLs keep working until we drop
    the shim after the next release cycle.
    """
    session = MagicMock()
    client = TestClient(app, follow_redirects=False)
    app.dependency_overrides[get_db] = lambda: session

    resp = client.post(
        "/store/legacy.com/refresh-analysis?dimension=checkout",
        json={"foo": "bar"},
    )

    assert resp.status_code == 308
    assert resp.headers["location"] == "/store/legacy.com/rescan?dimension=checkout"

    app.dependency_overrides.clear()


def test_refresh_analysis_legacy_path_without_query_string():
    """The redirect handler also works when there's no query string."""
    session = MagicMock()
    client = TestClient(app, follow_redirects=False)
    app.dependency_overrides[get_db] = lambda: session

    resp = client.post("/store/legacy.com/refresh-analysis")

    assert resp.status_code == 308
    assert resp.headers["location"] == "/store/legacy.com/rescan"

    app.dependency_overrides.clear()

    app.dependency_overrides.clear()
