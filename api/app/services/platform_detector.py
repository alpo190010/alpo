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


# The full set of scoring dimensions the orchestrator can run. Used as
# the universe set when deriving "skipped" lists per platform tier.
ALL_DIMENSIONS: frozenset[str] = frozenset(
    {
        "title",
        "description",
        "images",
        "pricing",
        "mobileCta",
        "trust",
        "pageSpeed",
        "structuredData",
        "crossSell",
        "variantUx",
        "sizeGuide",
        "socialCommerce",
        "accessibility",
        "contentFreshness",
        "checkout",
        "aiDiscoverability",
        "shipping",
        "socialProof",
    }
)


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


# The first-class dimension set for non-ecommerce sites (SaaS landing,
# blog, portfolio, corporate). Any rubric that assumes a transactional
# purchase context — pricing tactics, shipping, checkout, social-commerce
# embeds, Product structured data — is excluded because it would score
# near zero for reasons the user can't act on.
#
# ``trust`` stays in the set: its rubric mixes ecommerce signals
# (payment icons, money-back) with universal ones (live chat, contact
# info, SSL). The score will skew lower on non-ecommerce sites, but the
# diagnostic prose still applies.
NON_ECOMMERCE_DIMENSIONS: frozenset[str] = frozenset(
    {
        "title",
        "description",
        "images",
        "mobileCta",
        "trust",
        "pageSpeed",
        "aiDiscoverability",
        "accessibility",
        "contentFreshness",
    }
)


# Ecommerce fingerprints — used to decide whether the analyzed URL belongs
# to a site that actually sells things. The bar is permissive: any one of
# these signals flips the verdict to True. False positives just mean we
# show the "Products" tab on a site that has no products, which is fine.
# False negatives are also fine — we'd show "Pages" on an ecommerce site,
# which the user can manually correct via rescan.
_ECOMMERCE_PRODUCT_PATH_RE = re.compile(r"/products/[^/]+", re.IGNORECASE)
_ECOMMERCE_CART_TEXT_RE = re.compile(
    r"add[\s\-_]*to[\s\-_]*cart|AddToCart|product-form",
    re.IGNORECASE,
)
_ECOMMERCE_JSONLD_PRODUCT_RE = re.compile(
    r'"@type"\s*:\s*"Product"', re.IGNORECASE
)
_ECOMMERCE_DOM_MARKER_RE = re.compile(
    r"<shopify-accelerated-checkout|"
    r"shopify-payment-button|"
    r'name=["\']add-to-cart["\']|'
    r'class=["\'][^"\']*\b(?:add-to-cart|product-form|product__form|buy-now)\b',
    re.IGNORECASE,
)


def is_ecommerce(html: str, url: str | None = None) -> bool:
    """Return True if the page looks like part of an ecommerce site.

    Combines the cheapest signals available without re-running detector
    chains: regex match for JSON-LD ``Product`` schema, an Add-to-cart /
    Buy-now button or product-form marker in the DOM, or a Shopify-style
    ``/products/<slug>`` URL path with cart text in the HTML.

    Used to decide whether ``/scan/{domain}`` should label its right tab
    "Products" or "Pages". Permissive on purpose — better to misidentify
    a SaaS pricing page as ecommerce (still useful) than to hide the
    Products tab on a real store.
    """
    if not html:
        return False

    # Strong: JSON-LD Product schema, almost always means ecommerce.
    if _ECOMMERCE_JSONLD_PRODUCT_RE.search(html):
        return True

    # Strong: explicit cart/checkout button markup.
    if _ECOMMERCE_DOM_MARKER_RE.search(html):
        return True

    # Weak combo: /products/<slug> URL path AND cart text in body.
    if url:
        try:
            parsed = urllib.parse.urlparse(url)
            if _ECOMMERCE_PRODUCT_PATH_RE.search(parsed.path or ""):
                if _ECOMMERCE_CART_TEXT_RE.search(html):
                    return True
        except Exception:
            pass

    return False
