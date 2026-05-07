"""Shopify platform detection.

Determines whether a given URL/HTML pair belongs to a Shopify store.
Used by the analysis orchestrator to decide which dimensions to run:
non-Shopify sites skip the 5 dimensions whose detectors are tuned for
Shopify-specific apps and DOM elements (checkout, social proof, cross
sell, size guide, variant UX).

Detection is intentionally conservative — false positives would
re-introduce the original problem (Shopify-specific dimensions
producing junk scores on non-Shopify sites), so the bar is
"definitive Shopify evidence."
"""

from __future__ import annotations

import logging
import re
import urllib.parse

import httpx

logger = logging.getLogger(__name__)


_SHOPIFY_NATIVE_DOMAINS: set[str] = {
    "cdn.shopify.com",
    "shopifycdn.net",
    "myshopify.com",
}


_HTML_MARKER_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"cdn\.shopify\.com", re.IGNORECASE),
    re.compile(r"\bShopify\.shop\b"),
    re.compile(r"\bShopify\.theme\s*=\s*\{"),
    re.compile(r"<meta\s+name=[\"']shopify-checkout-api-token[\"']", re.IGNORECASE),
    re.compile(r"<shopify-[a-z]", re.IGNORECASE),
)


def _is_shopify_native(hostname: str) -> bool:
    """Return True if *hostname* belongs to a Shopify-native domain."""
    hostname = hostname.lower()
    return any(
        hostname == d or hostname.endswith("." + d) for d in _SHOPIFY_NATIVE_DOMAINS
    )


def _has_shopify_html_marker(html: str) -> bool:
    if not html:
        return False
    return any(p.search(html) for p in _HTML_MARKER_PATTERNS)


async def _probe_products_json(origin: str, timeout: float = 3.0) -> bool:
    """Probe ``{origin}/products.json`` for a Shopify-shaped response.

    Returns True only when the endpoint returns 200 with a JSON body
    that has a ``"products"`` array. Any error / non-Shopify response
    yields False.
    """
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            r = await client.get(
                f"{origin.rstrip('/')}/products.json",
                params={"limit": 1, "page": 1},
            )
            if r.status_code != 200:
                return False
            data = r.json()
            return isinstance(data, dict) and isinstance(data.get("products"), list)
    except Exception:
        return False


async def is_shopify(
    hostname: str,
    html: str,
    *,
    url: str | None = None,
    probe_products_json: bool = False,
) -> bool:
    """Return True if the page belongs to a Shopify store.

    Three signals, evaluated in order. Stops at the first definitive
    answer:

    1. **Hostname** matches a Shopify-native domain (myshopify.com,
       cdn.shopify.com, shopifycdn.net).
    2. **Rendered HTML** contains a Shopify marker (cdn.shopify.com
       reference, ``Shopify.shop`` global, ``Shopify.theme = {``,
       ``<meta name="shopify-checkout-api-token">``, ``<shopify-...>``
       custom element).
    3. *(Optional)* HTTP probe of ``/products.json`` — only when both
       prior checks were inconclusive *and* the caller opts in via
       ``probe_products_json=True``. Used by the analyze orchestrator
       to catch custom-domain Shopify stores that cloak Shopify
       markers in their theme.
    """
    if hostname and _is_shopify_native(hostname):
        return True
    if _has_shopify_html_marker(html):
        return True
    if probe_products_json and url:
        try:
            parsed = urllib.parse.urlparse(url)
            if parsed.scheme and parsed.hostname:
                origin = f"{parsed.scheme}://{parsed.hostname}"
                if parsed.port:
                    origin += f":{parsed.port}"
                if await _probe_products_json(origin):
                    return True
        except Exception:
            logger.debug("Shopify products.json probe failed for %s", url, exc_info=True)
    return False


# Dimensions that depend on Shopify-specific apps, endpoints, or DOM
# elements. On non-Shopify sites these produce noise rather than signal,
# so the orchestrator omits them from the report.
SHOPIFY_ONLY_DIMENSIONS: frozenset[str] = frozenset(
    {
        "socialProof",
        "checkout",
        "crossSell",
        "sizeGuide",
        "variantUx",
    }
)
