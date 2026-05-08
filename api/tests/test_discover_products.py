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
    user.paddle_subscription_id = None
    user.paddle_customer_id = None
    user.current_period_end = None
    user.paddle_customer_portal_url = None
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


@pytest.mark.parametrize(
    "raw, expected_domain",
    [
        # ``www.`` and case are folded so ``www.example.com`` and ``EXAMPLE.com``
        # collapse to the same key as ``example.com`` — the unique ``stores.domain``
        # constraint then prevents the dashboard from showing two cards for the
        # same site.
        ("https://www.example.com", "example.com"),
        ("https://WWW.EXAMPLE.com", "example.com"),
        ("https://EXAMPLE.com", "example.com"),
        ("www.example.com/products/x", "example.com"),
        # subdomains other than ``www.`` are preserved
        ("https://shop.example.com", "shop.example.com"),
    ],
)
def test_parse_url_normalizes_domain(raw: str, expected_domain: str):
    """``_parse_url`` returns a canonical store key (lowercased, www-stripped)."""
    from app.routers.discover_products import _parse_url

    _, domain = _parse_url(raw)
    assert domain == expected_domain


def test_parse_url_keeps_origin_for_outbound_fetch():
    """``origin`` keeps the user-typed host so httpx can resolve apex/www DNS.

    The ``domain`` is normalised for DB writes, but ``origin`` stays unchanged
    so ``_try_shopify_json``, ``_fetch_page_title``, ``fetch_product_count``,
    and ``discover_pages`` hit the host the user actually pointed at — httpx's
    ``follow_redirects=True`` then handles apex→www at the network layer.
    """
    from app.routers.discover_products import _parse_url

    origin, domain = _parse_url("https://www.aiei.ge")
    assert origin == "https://www.aiei.ge"
    assert domain == "aiei.ge"


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
    # checkout chain (legacy PDP-only + new merged rubric)
    patch(f"{_DP}.get_checkout_tips", return_value=[]),
    patch(f"{_DP}.score_checkout", return_value=50),
    patch(f"{_DP}.detect_checkout", return_value=CheckoutSignals()),
    patch(f"{_DP}.get_merged_checkout_tips", return_value=[]),
    patch(f"{_DP}.score_merged_checkout", return_value=50),
    patch(f"{_DP}.list_merged_checkout_checks", return_value=[]),
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
    assert isinstance(sa["tips"], dict)
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


@patch(f"{_DP}.discover_pages", new_callable=AsyncMock, return_value=[])
@patch(f"{_DP}._run_store_wide_analysis", new_callable=AsyncMock, return_value={
    "score": 64,
    "categories": {"title": 80, "accessibility": 70},
    "tips": {},
    "signals": {},
    "checks": {},
    "analyzedUrl": "https://example.com",
    "updatedAt": "2026-05-08T00:00:00Z",
    "isShopify": False,
    "isEcommerce": False,
    "skippedDimensions": sorted(
        {"socialProof", "checkout", "crossSell", "sizeGuide", "variantUx",
         "pricing", "shipping", "socialCommerce", "structuredData"}
    ),
})
@patch(f"{_DP}._try_html_scraping", new_callable=AsyncMock)
@patch(f"{_DP}._try_shopify_json", new_callable=AsyncMock, return_value=[])
def test_no_products_authenticated_falls_back_to_homepage(
    mock_shopify, mock_html, mock_run_swa, mock_discover_pages
):
    """Auth + 0 products + no sitemap → synthesize home entry and run store-wide analysis.

    Without this fallback, /scan/{domain} on a non-Shopify site dead-ends at
    "No products found". The fallback turns it into a useful homepage report
    with the non-Shopify banner.
    """
    mock_html.return_value = {
        "products": [],
        "storeName": "Aiei",
        "isProductPage": False,
    }

    user = _make_user()
    client = _get_client(user_override=user)
    resp = client.post("/discover-products", json={"url": "https://aiei.ge"})

    assert resp.status_code == 200
    data = resp.json()

    # Synthesized home entry replaces the empty list
    assert len(data["products"]) == 1
    assert data["products"][0]["slug"] == "home"
    assert data["products"][0]["url"] == "https://aiei.ge"

    # Marker so the frontend can tweak copy if it wants
    assert data["homeFallback"] is True

    # Store-wide analysis ran against the homepage URL — this is what
    # writes is_shopify=False to the StoreAnalysis row that drives the banner.
    mock_run_swa.assert_called_once()
    kwargs = mock_run_swa.call_args.kwargs
    args = mock_run_swa.call_args.args
    # _run_store_wide_analysis(domain, product_url, user_id, db, ...)
    assert args[0] == "aiei.ge"
    assert args[1] == "https://aiei.ge"

    sa = data["storeAnalysis"]
    assert sa is not None
    assert sa["isShopify"] is False
    # Non-Shopify homepage fallback also flips the right tab from
    # "Products" to "Pages" — drives the ProductListings entityLabel
    # branch.
    assert sa["isEcommerce"] is False
    # Non-ecommerce sites use the curated NON_ECOMMERCE_DIMENSIONS set:
    # 9 universal dimensions stay active, the other 9 are skipped (the
    # 5 Shopify-only ones plus pricing, shipping, socialCommerce,
    # structuredData).
    skipped = set(sa["skippedDimensions"])
    assert {"socialProof", "checkout", "crossSell", "sizeGuide", "variantUx"} <= skipped
    assert {"pricing", "shipping", "socialCommerce", "structuredData"} <= skipped
    assert len(skipped) == 9

    app.dependency_overrides.clear()


@patch(
    f"{_DP}.discover_pages",
    new_callable=AsyncMock,
    return_value=[
        {"url": "https://aiei.ge", "slug": "home", "image": ""},
        {"url": "https://aiei.ge/about", "slug": "about", "image": ""},
        {"url": "https://aiei.ge/contact", "slug": "contact", "image": ""},
    ],
)
@patch(f"{_DP}._run_store_wide_analysis", new_callable=AsyncMock, return_value={
    "score": 71,
    "categories": {"title": 80},
    "tips": {},
    "signals": {},
    "checks": {},
    "analyzedUrl": "https://aiei.ge",
    "updatedAt": "2026-05-08T00:00:00Z",
    "isShopify": False,
    "isEcommerce": False,
    "skippedDimensions": ["socialProof", "checkout", "crossSell", "sizeGuide", "variantUx"],
})
@patch(f"{_DP}._try_html_scraping", new_callable=AsyncMock)
@patch(f"{_DP}._try_shopify_json", new_callable=AsyncMock, return_value=[])
def test_no_products_authenticated_falls_back_to_sitemap(
    mock_shopify, mock_html, mock_run_swa, mock_discover_pages
):
    """Auth + 0 products + sitemap returns N pages → use those, skip synthetic-home.

    This is the win-state: the user lands on /scan/{domain}, the
    Pages tab shows real pages from the site (about, contact, …), and
    they can pick any one to analyze. ``homeFallback`` stays False so
    the frontend can distinguish the two empty-product scenarios.
    """
    mock_html.return_value = {
        "products": [],
        "storeName": "Aiei",
        "isProductPage": False,
    }

    user = _make_user()
    client = _get_client(user_override=user)
    resp = client.post("/discover-products", json={"url": "https://aiei.ge"})

    assert resp.status_code == 200
    data = resp.json()

    slugs = [p["slug"] for p in data["products"]]
    assert slugs == ["home", "about", "contact"]
    assert data["homeFallback"] is False

    # Store-wide analysis runs against the first sitemap entry — typically
    # the homepage when the sitemap had it, else the highest-ranked path.
    args = mock_run_swa.call_args.args
    assert args[0] == "aiei.ge"
    assert args[1] == "https://aiei.ge"

    mock_discover_pages.assert_awaited_once()
    sa = data["storeAnalysis"]
    assert sa is not None
    assert sa["isEcommerce"] is False

    app.dependency_overrides.clear()


@patch(f"{_DP}._try_html_scraping", new_callable=AsyncMock)
@patch(f"{_DP}._try_shopify_json", new_callable=AsyncMock, return_value=[])
def test_no_products_anonymous_returns_empty(mock_shopify, mock_html):
    """Anonymous + 0 products → unchanged empty behavior (no synthetic fallback).

    StoreAnalysis has a NOT NULL user_id FK, so we can't persist a row for
    anonymous users. Keep the existing empty-state path until we add a
    different persistence strategy.
    """
    mock_html.return_value = {
        "products": [],
        "storeName": "",
        "isProductPage": False,
    }

    client = _get_client(user_override="anonymous")
    resp = client.post("/discover-products", json={"url": "https://example.com"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["products"] == []
    assert data["storeAnalysis"] is None
    assert data.get("homeFallback") is False

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


# ---- _store_analysis_dict legacy-default behavior ---------------------

from app.routers.discover_products import _store_analysis_dict
from app.services.platform_detector import (
    ALL_DIMENSIONS,
    NON_ECOMMERCE_DIMENSIONS,
    SHOPIFY_ONLY_DIMENSIONS,
)


def _stub_store_row(*, is_shopify, is_ecommerce):
    """Build a minimal StoreAnalysis-like row for serialization tests."""
    row = MagicMock()
    row.score = 70
    row.categories = {}
    row.tips = {}
    row.signals = {}
    row.checks = {}
    row.analyzed_url = "https://example.com"
    row.updated_at = None
    row.is_shopify = is_shopify
    row.is_ecommerce = is_ecommerce
    return row


def test_store_analysis_dict_legacy_non_shopify_uses_non_ecommerce_skip():
    """Legacy non-Shopify (is_ecommerce=NULL) → broader 9-key skip set.

    Reproduces the user-reported bug where shipping/pricing/etc. cards
    rendered on non-ecommerce sites because legacy NULL defaulted to
    ecommerce=True.
    """
    row = _stub_store_row(is_shopify=False, is_ecommerce=None)
    out = _store_analysis_dict(row)
    assert out["isShopify"] is False
    assert out["isEcommerce"] is False
    skipped = set(out["skippedDimensions"])
    assert skipped == set(ALL_DIMENSIONS) - set(NON_ECOMMERCE_DIMENSIONS)
    assert "shipping" in skipped
    assert "pricing" in skipped
    assert "structuredData" in skipped
    assert "socialCommerce" in skipped


def test_store_analysis_dict_legacy_shopify_runs_all_dimensions():
    """Legacy Shopify (is_ecommerce=NULL) → empty skip set.

    Pre-existing behavior preserved — Shopify rows always get all 18
    dimensions regardless of when they were scanned.
    """
    row = _stub_store_row(is_shopify=True, is_ecommerce=None)
    out = _store_analysis_dict(row)
    assert out["isShopify"] is True
    assert out["isEcommerce"] is True
    assert out["skippedDimensions"] == []


def test_store_analysis_dict_explicit_non_ecommerce_keeps_full_skip():
    """Fresh non-ecommerce row (is_ecommerce=False) → 9-key skip set."""
    row = _stub_store_row(is_shopify=False, is_ecommerce=False)
    out = _store_analysis_dict(row)
    assert out["isEcommerce"] is False
    skipped = set(out["skippedDimensions"])
    assert skipped == set(ALL_DIMENSIONS) - set(NON_ECOMMERCE_DIMENSIONS)


def test_store_analysis_dict_explicit_non_shopify_ecommerce_skips_only_shopify():
    """WooCommerce-shaped row (is_shopify=False, is_ecommerce=True) →
    SHOPIFY_ONLY skip set, not the broader non-ecommerce one. Confirms
    explicit values still take precedence over the legacy default.
    """
    row = _stub_store_row(is_shopify=False, is_ecommerce=True)
    out = _store_analysis_dict(row)
    assert set(out["skippedDimensions"]) == set(SHOPIFY_ONLY_DIMENSIONS)


# ---- Platform-detection stickiness ------------------------------------
# When the user just deleted-and-rescanned a non-ecommerce site, the
# auto-rescan effect would re-run detection on a different page's HTML
# and flip is_ecommerce False → True, swapping the UI tab from "Pages"
# back to "Products" mid-session. The fix: when an existing
# StoreAnalysis row already has is_shopify / is_ecommerce populated,
# reuse them across runs instead of re-detecting.


_NON_ECOMMERCE_PRIOR_PRODUCTS = [
    {"url": "https://aiei.ge", "slug": "home", "image": ""},
]


@patch(
    f"{_DP}.is_ecommerce",
    side_effect=AssertionError(
        "is_ecommerce must NOT be called when the prior row already "
        "has it set — the value is sticky across rescans."
    ),
)
@patch(f"{_DP}._fetch_page_title", new_callable=AsyncMock, return_value="Aiei")
@patch(
    f"{_DP}._try_shopify_json",
    new_callable=AsyncMock,
    return_value=_NON_ECOMMERCE_PRIOR_PRODUCTS,
)
def test_run_store_wide_analysis_reuses_cached_platform_detection(
    mock_shopify, mock_title, mock_is_ecommerce, *patches
):
    """Sticky platform detection: prior row's values win, detectors aren't called.

    Reproduces the fix for the user-reported flip: scan, see "Pages" +
    9 dims; ~5s later auto-rescan flips to "Products" + ecommerce dims.
    Root cause: _run_store_wide_analysis re-ran is_ecommerce on a
    different URL during rescan and the verdict flipped.
    """
    user = _make_user()
    db_session = _mock_db()

    # Pre-populate the StoreAnalysis row that the new cache-first
    # platform-detection block will read off. MagicMock auto-creates
    # attributes, so we pin the relevant ones explicitly.
    prior_row = MagicMock()
    prior_row.is_shopify = False
    prior_row.is_ecommerce = False
    prior_row.updated_at = datetime.now(timezone.utc)  # fresh row
    prior_row.tips = {}  # dict-shape, not legacy list

    # The orchestrator queries the row twice: once for the freshness
    # cache check (returning a stale-or-fresh row) and again for
    # platform detection. Return the same row both times.
    db_session.query.return_value.filter.return_value.filter.return_value.first.return_value = prior_row

    def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    client = _get_client(user_override=user)
    resp = client.post("/discover-products", json={"url": "https://aiei.ge"})
    app.dependency_overrides.clear()

    # The conftest autouse fixture sets is_shopify -> True. If the new
    # code is missing, is_shopify_for_run would be True, which would
    # then make is_ecommerce_for_run True via the short-circuit OR.
    # The sticky-cache fix preserves the persisted False / False on
    # both flags, regardless of the autouse mock.
    assert resp.status_code == 200
    # The is_ecommerce side_effect AssertionError above triggers the
    # test failure if the live detector is called — the assertion on
    # this line is just a defensive double-check.
    mock_is_ecommerce.assert_not_called()
