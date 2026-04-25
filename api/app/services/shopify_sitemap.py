"""Shopify product-count fetcher.

Counts a store's total catalog via:

1. The product sitemap (``{origin}/sitemap.xml`` index →
   ``sitemap_products_*.xml`` files), summing ``<url>`` entries whose
   ``<loc>`` is a product page.
2. Fallback: ``/products.json?limit=250&page=N`` paginated until a
   short page or the page cap.

Returns ``None`` when neither path yields a count.  Never raises — log
at WARNING and degrade.  The caller persists ``None`` as NULL on
``stores.product_count``; the UI renders that as ``?``.
"""
from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET

import httpx

logger = logging.getLogger(__name__)

# Shopify sitemaps shard at ~5,000 URLs per file; cap at 6 files
# (~30k products) to bound work.  Past that the count is approximate.
_MAX_PRODUCT_SITEMAPS = 6

# /products.json fallback: 10 pages × 250 = 2,500 product cap.
_MAX_PRODUCTS_JSON_PAGES = 10
_PRODUCTS_JSON_LIMIT = 250

_SM_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

_SITEMAP_TIMEOUT = 6.0
_PRODUCTS_JSON_TIMEOUT = 8.0

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# Product sitemap files are named sitemap_products_1.xml, _2.xml, …
_PRODUCT_SITEMAP_RE = re.compile(r"/sitemap_products_\d+\.xml(?:\?|$)")
# A real product entry has at least one path segment after /products/
_PRODUCT_PATH_RE = re.compile(r"/products/[^/?#]+")


async def fetch_product_count(origin: str) -> int | None:
    """Return total product count for the store at *origin*, or None."""
    sitemap_count = await _count_via_sitemap(origin)
    if sitemap_count is not None:
        return sitemap_count
    return await _count_via_products_json(origin)


def total_pages_for(product_count: int | None, page_size: int = 10) -> int | None:
    """Pages required to display ``product_count`` items at ``page_size`` per page.

    Returns ``None`` when the count is unknown (frontend renders no
    pagination controls).  ``0`` count is also treated as unknown — there
    is nothing to paginate.
    """
    if product_count is None or product_count <= 0:
        return None
    return max(1, (product_count + page_size - 1) // page_size)


async def _count_via_sitemap(origin: str) -> int | None:
    try:
        async with httpx.AsyncClient(timeout=_SITEMAP_TIMEOUT) as client:
            index_resp = await client.get(
                f"{origin}/sitemap.xml",
                headers={"User-Agent": _USER_AGENT, "Accept": "application/xml"},
            )
            if index_resp.status_code != 200:
                return None

            product_sitemaps = _parse_sitemap_index(index_resp.text)
            if not product_sitemaps:
                return None

            total = 0
            for sm_url in product_sitemaps[:_MAX_PRODUCT_SITEMAPS]:
                resp = await client.get(
                    sm_url,
                    headers={"User-Agent": _USER_AGENT, "Accept": "application/xml"},
                )
                if resp.status_code != 200:
                    continue
                total += _count_product_urls(resp.text)
            return total or None
    except Exception:
        logger.warning(
            "sitemap product count failed origin=%s", origin, exc_info=True
        )
        return None


def _parse_sitemap_index(xml_text: str) -> list[str]:
    """Return URLs of ``sitemap_products_*.xml`` entries (skip .xml.gz)."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    locs: list[str] = []
    for sitemap in root.findall("sm:sitemap", _SM_NS):
        loc_el = sitemap.find("sm:loc", _SM_NS)
        if loc_el is None or not loc_el.text:
            continue
        loc = loc_el.text.strip()
        if loc.endswith(".xml.gz"):
            continue
        if _PRODUCT_SITEMAP_RE.search(loc):
            locs.append(loc)
    return locs


def _count_product_urls(xml_text: str) -> int:
    """Count <url> entries whose <loc> is a `/products/<handle>` URL."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return 0
    count = 0
    for url_el in root.findall("sm:url", _SM_NS):
        loc_el = url_el.find("sm:loc", _SM_NS)
        if loc_el is None or not loc_el.text:
            continue
        if _PRODUCT_PATH_RE.search(loc_el.text):
            count += 1
    return count


async def _count_via_products_json(origin: str) -> int | None:
    total = 0
    try:
        async with httpx.AsyncClient(timeout=_PRODUCTS_JSON_TIMEOUT) as client:
            for page in range(1, _MAX_PRODUCTS_JSON_PAGES + 1):
                resp = await client.get(
                    f"{origin}/products.json",
                    params={"limit": _PRODUCTS_JSON_LIMIT, "page": page},
                    headers={
                        "User-Agent": _USER_AGENT,
                        "Accept": "application/json",
                    },
                )
                if resp.status_code != 200:
                    return total or None
                products = (resp.json() or {}).get("products") or []
                count = len(products)
                total += count
                if count < _PRODUCTS_JSON_LIMIT:
                    return total
            return total
    except Exception:
        logger.warning(
            "/products.json paginated count failed origin=%s",
            origin,
            exc_info=True,
        )
        return total or None
