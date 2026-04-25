"""Tests for app.services.shopify_sitemap.

Pure XML parsing tests run against in-line fixtures.  ``fetch_product_count``
is exercised end-to-end with a mocked httpx client to simulate the sitemap-
first / /products.json-fallback chain.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.shopify_sitemap import (
    _count_product_urls,
    _parse_sitemap_index,
    fetch_product_count,
    total_pages_for,
)


# ---- XML fixtures ----------------------------------------------------------

SITEMAP_INDEX_SINGLE = """<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://shop.example.com/sitemap_pages_1.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://shop.example.com/sitemap_products_1.xml</loc>
  </sitemap>
</sitemapindex>"""

SITEMAP_INDEX_MULTI = """<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://shop.example.com/sitemap_products_1.xml</loc></sitemap>
  <sitemap><loc>https://shop.example.com/sitemap_products_2.xml</loc></sitemap>
  <sitemap><loc>https://shop.example.com/sitemap_products_3.xml</loc></sitemap>
  <sitemap><loc>https://shop.example.com/sitemap_collections_1.xml.gz</loc></sitemap>
</sitemapindex>"""

PRODUCTS_SITEMAP = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://shop.example.com/products/widget-a</loc></url>
  <url><loc>https://shop.example.com/products/widget-b</loc></url>
  <url><loc>https://shop.example.com/products/widget-c</loc></url>
  <url><loc>https://shop.example.com/collections/all</loc></url>
</urlset>"""


# ---- _parse_sitemap_index --------------------------------------------------


class TestParseSitemapIndex:
    def test_single_product_sitemap_extracted(self):
        locs = _parse_sitemap_index(SITEMAP_INDEX_SINGLE)
        assert locs == ["https://shop.example.com/sitemap_products_1.xml"]

    def test_multi_skips_gz_and_non_product_files(self):
        locs = _parse_sitemap_index(SITEMAP_INDEX_MULTI)
        assert len(locs) == 3
        assert all("/sitemap_products_" in u for u in locs)
        assert not any(u.endswith(".gz") for u in locs)

    def test_malformed_xml_returns_empty(self):
        assert _parse_sitemap_index("not xml at all") == []

    def test_empty_index_returns_empty(self):
        empty = (
            '<?xml version="1.0"?>'
            '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>'
        )
        assert _parse_sitemap_index(empty) == []


# ---- _count_product_urls ---------------------------------------------------


class TestCountProductUrls:
    def test_filters_to_product_handle_paths(self):
        """Only ``/products/<handle>`` entries count; collections etc. skipped."""
        assert _count_product_urls(PRODUCTS_SITEMAP) == 3

    def test_malformed_xml_returns_zero(self):
        assert _count_product_urls("garbage") == 0


# ---- total_pages_for -------------------------------------------------------


class TestTotalPagesFor:
    @pytest.mark.parametrize(
        "count,expected",
        [
            (None, None),
            (0, None),
            (-1, None),
            (1, 1),
            (10, 1),
            (11, 2),
            (247, 25),
        ],
    )
    def test_default_page_size_10(self, count, expected):
        assert total_pages_for(count) == expected

    def test_custom_page_size(self):
        assert total_pages_for(100, page_size=20) == 5
        assert total_pages_for(101, page_size=20) == 6


# ---- fetch_product_count ---------------------------------------------------


def _mock_response(status_code: int, text: str = "", json_data=None):
    resp = MagicMock()
    resp.status_code = status_code
    resp.text = text
    resp.json = MagicMock(return_value=json_data)
    return resp


def _patched_client(responder):
    """Patch httpx.AsyncClient with a mock that dispatches to ``responder``.

    ``responder`` is callable ``(url, params) -> mock Response``.
    """
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None

    async def _get(url, params=None, headers=None):
        return responder(url, params)

    mock_client.get = _get
    return patch(
        "app.services.shopify_sitemap.httpx.AsyncClient",
        return_value=mock_client,
    )


@pytest.mark.asyncio
async def test_fetch_product_count_via_single_sitemap():
    """sitemap.xml → 1 product sitemap → 3 products."""

    def responder(url, params=None):
        if url.endswith("/sitemap.xml"):
            return _mock_response(200, SITEMAP_INDEX_SINGLE)
        if url.endswith("/sitemap_products_1.xml"):
            return _mock_response(200, PRODUCTS_SITEMAP)
        return _mock_response(404)

    with _patched_client(responder):
        count = await fetch_product_count("https://shop.example.com")
    assert count == 3


@pytest.mark.asyncio
async def test_fetch_product_count_falls_back_to_products_json():
    """No sitemap → /products.json paginated count (250 + 47 = 297)."""

    def responder(url, params=None):
        if url.endswith("/sitemap.xml"):
            return _mock_response(404)
        if url.endswith("/products.json"):
            page = (params or {}).get("page", 1)
            if page == 1:
                return _mock_response(200, json_data={"products": [{}] * 250})
            if page == 2:
                return _mock_response(200, json_data={"products": [{}] * 47})
            return _mock_response(200, json_data={"products": []})
        return _mock_response(404)

    with _patched_client(responder):
        count = await fetch_product_count("https://shop.example.com")
    assert count == 297


@pytest.mark.asyncio
async def test_fetch_product_count_total_failure_returns_none():
    """Both sitemap and /products.json 404 → None."""

    def responder(url, params=None):
        return _mock_response(404)

    with _patched_client(responder):
        count = await fetch_product_count("https://nothing.example.com")
    assert count is None


@pytest.mark.asyncio
async def test_fetch_product_count_empty_sitemap_falls_back():
    """Sitemap exists but has no product files → fall through to /products.json."""

    sitemap_no_products = (
        '<?xml version="1.0"?>'
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        "<sitemap><loc>https://shop.example.com/sitemap_pages_1.xml</loc></sitemap>"
        "</sitemapindex>"
    )

    def responder(url, params=None):
        if url.endswith("/sitemap.xml"):
            return _mock_response(200, sitemap_no_products)
        if url.endswith("/products.json"):
            return _mock_response(200, json_data={"products": [{}] * 5})
        return _mock_response(404)

    with _patched_client(responder):
        count = await fetch_product_count("https://shop.example.com")
    assert count == 5
