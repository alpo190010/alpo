"""Tests for POST /discover-products endpoint."""

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch, AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_optional
from app.database import get_db
from app.main import app
from app.models import User


# ---- helpers ---------------------------------------------------------------

def _mock_db():
    """Return a MagicMock that simulates a SQLAlchemy Session."""
    session = MagicMock()
    row = MagicMock()
    row.__getitem__ = MagicMock(return_value="fake-store-uuid")
    session.execute.return_value.fetchone.return_value = row
    return session


def _make_user(plan_tier: str = "free", credits_used: int = 0) -> User:
    """Build a User ORM instance for auth injection."""
    user = User()
    user.id = uuid.uuid4()
    user.google_sub = "google-sub-test"
    user.email = "test@example.com"
    user.name = "Test User"
    user.picture = None
    user.plan_tier = plan_tier
    user.credits_used = credits_used
    user.credits_reset_at = datetime.now(timezone.utc)
    user.lemon_subscription_id = None
    user.lemon_customer_id = None
    user.current_period_end = None
    user.lemon_customer_portal_url = None
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    return user


def _get_client(db_override=None, user_override="anonymous"):
    """Return TestClient with DB and auth overrides.

    user_override controls the auth injection:
      - "anonymous" (default) → None (anonymous, no store-wide analysis)
      - None → explicitly injects None
      - User instance → injects that user
    """
    if db_override is not None:
        app.dependency_overrides[get_db] = lambda: db_override
    else:
        app.dependency_overrides[get_db] = lambda: _mock_db()

    if user_override == "anonymous" or user_override is None:
        app.dependency_overrides[get_current_user_optional] = lambda: None
    else:
        app.dependency_overrides[get_current_user_optional] = lambda: user_override

    return TestClient(app)


def _shopify_json_response(products=None):
    """Build a fake Shopify /products.json payload."""
    if products is None:
        products = [
            {
                "title": "Cool T-Shirt",
                "handle": "cool-t-shirt",
                "images": [{"src": "https://cdn.shopify.com/img/cool.jpg"}],
            },
            {
                "title": "Nice Pants",
                "handle": "nice-pants",
                "images": [{"src": "//cdn.shopify.com/img/pants.png"}],
            },
        ]
    return httpx.Response(200, json={"products": products})


def _html_page(title="Test Store – Home", product_links=None, has_cart=False):
    """Build a fake HTML page with optional product links."""
    links_html = ""
    if product_links:
        for href, img in product_links:
            img_tag = f'<img src="{img}" />' if img else ""
            links_html += f'{img_tag}<a href="{href}">Product</a>\n'
    cart = '<form class="product-form">add to cart</form>' if has_cart else ""
    return f"<html><head><title>{title}</title></head><body>{links_html}{cart}</body></html>"


# ---- validation tests -------------------------------------------------------


def test_missing_url():
    """Missing URL field is rejected by Pydantic validation (422)."""
    client = _get_client()
    resp = client.post("/discover-products", json={})
    assert resp.status_code == 422
    app.dependency_overrides.clear()


def test_empty_url():
    """Empty string URL is rejected by Pydantic min_length=1 (422)."""
    client = _get_client()
    resp = client.post("/discover-products", json={"url": ""})
    assert resp.status_code == 422
    app.dependency_overrides.clear()


def test_non_string_url():
    """Non-string URL is rejected by Pydantic type validation (422)."""
    client = _get_client()
    resp = client.post("/discover-products", json={"url": 123})
    assert resp.status_code == 422
    app.dependency_overrides.clear()


def test_ssrf_localhost_blocked():
    """Localhost URL is blocked by SSRF validator (400)."""
    client = _get_client()
    resp = client.post("/discover-products", json={"url": "http://localhost/admin"})
    assert resp.status_code == 400
    assert "Internal" in resp.json()["error"]
    app.dependency_overrides.clear()


def test_ssrf_private_ip_blocked():
    """Private IP URL is blocked by SSRF validator (400)."""
    client = _get_client()
    resp = client.post("/discover-products", json={"url": "http://192.168.1.1/"})
    assert resp.status_code == 400
    assert "Internal" in resp.json()["error"]
    app.dependency_overrides.clear()


# ---- Shopify JSON strategy --------------------------------------------------


@patch("app.routers.discover_products._fetch_page_title", new_callable=AsyncMock)
@patch("app.routers.discover_products._try_shopify_json", new_callable=AsyncMock)
def test_shopify_json_success(mock_shopify, mock_title):
    """Shopify JSON returns products → response uses those products."""
    mock_shopify.return_value = [
        {
            "url": "https://example.com/products/cool-t-shirt",
            "slug": "Cool T-Shirt",
            "image": "https://cdn.shopify.com/img/cool_180x.jpg",
        },
        {
            "url": "https://example.com/products/nice-pants",
            "slug": "Nice Pants",
            "image": "https://cdn.shopify.com/img/pants_180x.png",
        },
    ]
    mock_title.return_value = "Test Store"

    mock_session = _mock_db()
    client = _get_client(db_override=mock_session)
    resp = client.post("/discover-products", json={"url": "https://example.com"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["storeName"] == "Test Store"
    assert data["isProductPage"] is False
    assert len(data["products"]) == 2
    assert data["products"][0]["slug"] == "Cool T-Shirt"
    # storeId present (from DB mock)
    assert data["storeId"] is not None
    # DB was used
    assert mock_session.execute.called

    app.dependency_overrides.clear()


def test_shopify_cdn_thumbnail_suffix():
    """Shopify CDN images get _180x thumbnail suffix."""
    from app.routers.discover_products import _thumb

    assert "_180x.jpg" in _thumb("https://cdn.shopify.com/img/product.jpg")
    assert "_180x.png" in _thumb("https://cdn.shopify.com/img/product.png")
    assert "_180x.webp" in _thumb("https://cdn.shopify.com/img/product.webp")
    # Non-Shopify CDN left alone
    assert "_180x" not in _thumb("https://other.com/img/product.jpg")


def test_double_slash_prefix_fixed():
    """Images starting with // get https: prefix."""
    from app.routers.discover_products import _thumb

    result = _thumb("//cdn.shopify.com/img/product.jpg")
    assert result.startswith("https:")
    assert not result.startswith("//")


# ---- HTML scraping fallback --------------------------------------------------


@patch("app.routers.discover_products._try_html_scraping", new_callable=AsyncMock)
@patch("app.routers.discover_products._try_shopify_json", new_callable=AsyncMock)
def test_html_fallback_when_shopify_empty(mock_shopify, mock_html):
    """When Shopify JSON returns empty, fall back to HTML scraping."""
    mock_shopify.return_value = []
    mock_html.return_value = {
        "products": [
            {
                "url": "https://example.com/products/widget",
                "slug": "widget",
                "image": "https://example.com/img/widget.jpg",
            }
        ],
        "storeName": "Widget Store",
        "isProductPage": False,
    }

    client = _get_client()
    resp = client.post("/discover-products", json={"url": "https://example.com"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["storeName"] == "Widget Store"
    assert len(data["products"]) == 1
    assert data["products"][0]["slug"] == "widget"
    assert "storeId" in data

    app.dependency_overrides.clear()


@patch("app.routers.discover_products._try_html_scraping", new_callable=AsyncMock)
@patch("app.routers.discover_products._try_shopify_json", new_callable=AsyncMock)
def test_is_product_page_detected(mock_shopify, mock_html):
    """HTML scraping detects product page correctly."""
    mock_shopify.return_value = []
    mock_html.return_value = {
        "products": [],
        "storeName": "Some Store",
        "isProductPage": True,
    }

    client = _get_client()
    resp = client.post(
        "/discover-products",
        json={"url": "https://example.com/products/some-item"},
    )

    assert resp.status_code == 200
    assert resp.json()["isProductPage"] is True

    app.dependency_overrides.clear()


# ---- URL parsing / scheme prepend -------------------------------------------


def test_url_without_scheme():
    """URLs without http(s) get https:// prepended."""
    from app.routers.discover_products import _parse_url

    origin, domain = _parse_url("example.com/shop")
    assert origin == "https://example.com"
    assert domain == "example.com"


def test_url_with_scheme():
    from app.routers.discover_products import _parse_url

    origin, domain = _parse_url("https://mystore.io")
    assert origin == "https://mystore.io"
    assert domain == "mystore.io"


# ---- fetch failure -----------------------------------------------------------


@patch("app.routers.discover_products._try_html_scraping", new_callable=AsyncMock)
@patch("app.routers.discover_products._try_shopify_json", new_callable=AsyncMock)
def test_fetch_failure_returns_400(mock_shopify, mock_html):
    """When both strategies raise, return 400."""
    mock_shopify.return_value = []
    mock_html.side_effect = Exception("connection refused")

    client = _get_client()
    resp = client.post("/discover-products", json={"url": "https://example.com"})

    assert resp.status_code == 400
    assert "Could not fetch" in resp.json()["error"]

    app.dependency_overrides.clear()


# ---- DB persistence failure --------------------------------------------------


@patch("app.routers.discover_products._try_shopify_json", new_callable=AsyncMock)
@patch("app.routers.discover_products._fetch_page_title", new_callable=AsyncMock)
def test_db_failure_returns_null_store_id(mock_title, mock_shopify):
    """When DB upsert fails, storeId is None but response still returns."""
    mock_shopify.return_value = [
        {
            "url": "https://example.com/products/item",
            "slug": "Item",
            "image": "",
        }
    ]
    mock_title.return_value = "Shop"

    broken_session = MagicMock()
    broken_session.execute.side_effect = Exception("DB down")
    broken_session.rollback = MagicMock()

    client = _get_client(db_override=broken_session)
    resp = client.post("/discover-products", json={"url": "https://example.com"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["storeId"] is None
    assert len(data["products"]) == 1

    app.dependency_overrides.clear()


# ---- camelCase response keys ------------------------------------------------


@patch("app.routers.discover_products._try_shopify_json", new_callable=AsyncMock)
@patch("app.routers.discover_products._fetch_page_title", new_callable=AsyncMock)
def test_response_keys_are_camel_case(mock_title, mock_shopify):
    mock_shopify.return_value = [
        {"url": "https://x.com/products/a", "slug": "A", "image": ""}
    ]
    mock_title.return_value = "Store"

    client = _get_client()
    resp = client.post("/discover-products", json={"url": "https://x.com"})

    data = resp.json()
    assert "storeName" in data
    assert "isProductPage" in data
    assert "storeId" in data
    assert "products" in data

    app.dependency_overrides.clear()


# ---- Store-wide analysis tests -----------------------------------------------

# Import signal dataclasses for default instances used in mocks
from app.services.checkout_detector import CheckoutSignals
from app.services.shipping_detector import ShippingSignals
from app.services.trust_detector import TrustSignals
from app.services.social_commerce_detector import SocialCommerceSignals
from app.services.accessibility_detector import AccessibilitySignals
from app.services.ai_discoverability_detector import AiDiscoverabilitySignals
from app.services.page_speed_detector import PageSpeedSignals

# Shared patch prefix
_DP = "app.routers.discover_products"

# Patch stack for the 7 detect/score/tips chains + 4 async external calls.
# The decorator order (bottom → top) maps to function-arg order (left → right).
_STORE_ANALYSIS_PATCHES = [
    # External async calls
    patch(f"{_DP}.fetch_ai_discoverability_data", new_callable=AsyncMock, return_value=None),
    patch(f"{_DP}.fetch_pagespeed_insights", new_callable=AsyncMock, return_value=None),
    patch(f"{_DP}.run_axe_scan", new_callable=AsyncMock, return_value=None),
    patch(f"{_DP}.render_page", new_callable=AsyncMock, return_value="<html><body>mock</body></html>"),
    # pageSpeed chain
    patch(f"{_DP}.get_page_speed_tips", return_value=[]),
    patch(f"{_DP}.score_page_speed", return_value=50),
    patch(f"{_DP}.detect_page_speed", return_value=PageSpeedSignals()),
    # aiDiscoverability chain
    patch(f"{_DP}.get_ai_discoverability_tips", return_value=[]),
    patch(f"{_DP}.score_ai_discoverability", return_value=50),
    patch(f"{_DP}.detect_ai_discoverability", return_value=AiDiscoverabilitySignals()),
    # accessibility chain
    patch(f"{_DP}.get_accessibility_tips", return_value=[]),
    patch(f"{_DP}.score_accessibility", return_value=50),
    patch(f"{_DP}.detect_accessibility", return_value=AccessibilitySignals()),
    # socialCommerce chain
    patch(f"{_DP}.get_social_commerce_tips", return_value=[]),
    patch(f"{_DP}.score_social_commerce", return_value=50),
    patch(f"{_DP}.detect_social_commerce", return_value=SocialCommerceSignals()),
    # trust chain
    patch(f"{_DP}.get_trust_tips", return_value=[]),
    patch(f"{_DP}.score_trust", return_value=50),
    patch(f"{_DP}.detect_trust", return_value=TrustSignals()),
    # shipping chain
    patch(f"{_DP}.get_shipping_tips", return_value=[]),
    patch(f"{_DP}.score_shipping", return_value=50),
    patch(f"{_DP}.detect_shipping", return_value=ShippingSignals()),
    # checkout chain
    patch(f"{_DP}.get_checkout_tips", return_value=[]),
    patch(f"{_DP}.score_checkout", return_value=50),
    patch(f"{_DP}.detect_checkout", return_value=CheckoutSignals()),
]

_PRODUCTS = [
    {
        "url": "https://example.com/products/cool-t-shirt",
        "slug": "Cool T-Shirt",
        "image": "https://cdn.shopify.com/img/cool_180x.jpg",
    },
]


def _apply_patches(func):
    """Apply the full store-analysis patch stack to a test function."""
    for p in _STORE_ANALYSIS_PATCHES:
        func = p(func)
    return func


@patch(f"{_DP}._fetch_page_title", new_callable=AsyncMock, return_value="Test Store")
@patch(f"{_DP}._try_shopify_json", new_callable=AsyncMock, return_value=_PRODUCTS)
def test_store_analysis_authenticated_user_with_products(mock_shopify, mock_title, *mocks):
    """Authenticated user + products → storeAnalysis present with expected shape."""
    user = _make_user()
    client = _get_client(user_override=user)
    resp = client.post("/discover-products", json={"url": "https://example.com"})

    assert resp.status_code == 200
    data = resp.json()

    sa = data["storeAnalysis"]
    assert sa is not None
    assert isinstance(sa["score"], int)
    assert isinstance(sa["categories"], dict)
    assert isinstance(sa["tips"], list)
    assert isinstance(sa["signals"], dict)
    assert "analyzedUrl" in sa

    # Verify 7 store-wide category keys
    expected_keys = {
        "checkout", "shipping", "trust", "socialCommerce",
        "accessibility", "aiDiscoverability", "pageSpeed",
    }
    assert set(sa["categories"].keys()) == expected_keys
    assert set(sa["signals"].keys()) == expected_keys

    # All scores are 50 from mocks → weighted average should be 50
    assert sa["score"] == 50

    app.dependency_overrides.clear()


# Apply the store-analysis patches via wrapper
test_store_analysis_authenticated_user_with_products = _apply_patches(
    test_store_analysis_authenticated_user_with_products
)


@patch(f"{_DP}._fetch_page_title", new_callable=AsyncMock, return_value="Test Store")
@patch(f"{_DP}._try_shopify_json", new_callable=AsyncMock, return_value=_PRODUCTS)
def test_store_analysis_anonymous_user_returns_none(mock_shopify, mock_title):
    """Anonymous user → storeAnalysis is None, products still returned."""
    client = _get_client()  # default = anonymous (None)
    resp = client.post("/discover-products", json={"url": "https://example.com"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["storeAnalysis"] is None
    assert len(data["products"]) == 1
    assert data["storeName"] == "Test Store"

    app.dependency_overrides.clear()


@patch(f"{_DP}._try_html_scraping", new_callable=AsyncMock)
@patch(f"{_DP}._try_shopify_json", new_callable=AsyncMock, return_value=[])
def test_store_analysis_no_products_returns_none(mock_shopify, mock_html):
    """No products discovered → storeAnalysis is None even for authenticated user."""
    mock_html.return_value = {
        "products": [],
        "storeName": "Empty Store",
        "isProductPage": False,
    }

    user = _make_user()
    client = _get_client(user_override=user)
    resp = client.post("/discover-products", json={"url": "https://example.com"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["storeAnalysis"] is None
    assert data["storeName"] == "Empty Store"

    app.dependency_overrides.clear()


@patch(f"{_DP}.render_page", new_callable=AsyncMock, side_effect=Exception("Playwright crashed"))
@patch(f"{_DP}._fetch_page_title", new_callable=AsyncMock, return_value="Test Store")
@patch(f"{_DP}._try_shopify_json", new_callable=AsyncMock, return_value=_PRODUCTS)
def test_store_analysis_render_page_failure_returns_none(mock_shopify, mock_title, mock_render):
    """render_page failure → storeAnalysis is None, products still intact."""
    user = _make_user()
    client = _get_client(user_override=user)
    resp = client.post("/discover-products", json={"url": "https://example.com"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["storeAnalysis"] is None
    assert len(data["products"]) == 1
    assert data["storeName"] == "Test Store"

    app.dependency_overrides.clear()


@patch(f"{_DP}._fetch_page_title", new_callable=AsyncMock, return_value="Test Store")
@patch(f"{_DP}._try_shopify_json", new_callable=AsyncMock, return_value=_PRODUCTS)
def test_store_analysis_db_upsert_failure_still_returns_analysis(mock_shopify, mock_title, *mocks):
    """DB upsert failure for StoreAnalysis → analysis result still returned in response."""
    # Use a DB mock that succeeds for store persist but fails on the second execute (StoreAnalysis upsert)
    db_session = _mock_db()
    call_count = 0
    original_execute = db_session.execute

    def _execute_side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        # First execute = store upsert (succeed), second = StoreAnalysis upsert (fail)
        if call_count >= 2:
            raise Exception("StoreAnalysis DB down")
        return original_execute(*args, **kwargs)

    db_session.execute.side_effect = _execute_side_effect

    user = _make_user()
    client = _get_client(db_override=db_session, user_override=user)
    resp = client.post("/discover-products", json={"url": "https://example.com"})

    assert resp.status_code == 200
    data = resp.json()
    # Store analysis should still be returned even though DB upsert failed
    # (the outer try/except in _run_store_wide_analysis catches DB errors
    # but returns the computed result)
    # Actually — the inner try/except around DB upsert catches it and continues,
    # so storeAnalysis should be present with score/categories/tips/signals.
    sa = data["storeAnalysis"]
    assert sa is not None
    assert isinstance(sa["score"], int)
    assert "categories" in sa
    assert "signals" in sa

    app.dependency_overrides.clear()


# Apply the store-analysis patches via wrapper
test_store_analysis_db_upsert_failure_still_returns_analysis = _apply_patches(
    test_store_analysis_db_upsert_failure_still_returns_analysis
)
