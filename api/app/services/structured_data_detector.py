"""Structured data (JSON-LD) signal detector for Shopify product pages.

Extracts Product, BreadcrumbList, and Organization schema signals from
``<script type="application/ld+json">`` blocks.  Detects common Shopify
errors (duplicate products, currency symbols in price, bare availability
values, missing brand).

Pattern follows :pymod:`social_proof_detector` — parse → flatten → inspect.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Common currency symbols that should NOT appear in schema.org ``price``.
_CURRENCY_SYMBOLS = re.compile(r"[$€£¥₹₩₽₪₫₿¢]")


# ---------------------------------------------------------------------------
# Signals dataclass
# ---------------------------------------------------------------------------


@dataclass
class StructuredDataSignals:
    """Structured data signals extracted from a product page's JSON-LD.

    22 fields total:
      • 17 boolean presence flags
      • 4 error signals (3 bool + 1 int)
      • 1 int counter
    """

    # --- Product presence flags (17) ---------------------------------
    has_product_schema: bool = False
    """At least one ``@type: "Product"`` node was found."""

    has_name: bool = False
    """Product has a ``name`` field."""

    has_image: bool = False
    """Product has an ``image`` field."""

    has_description: bool = False
    """Product has a ``description`` field."""

    has_offers: bool = False
    """Product has an ``offers`` field."""

    has_price: bool = False
    """An Offer contains a ``price`` value."""

    price_amount: float | None = None
    """The numeric price value extracted from the first Offer (if any)."""

    has_price_currency: bool = False
    """An Offer contains a ``priceCurrency`` value."""

    has_availability: bool = False
    """An Offer contains an ``availability`` value."""

    has_brand: bool = False
    """Product has a ``brand`` (string or object with ``name``)."""

    has_sku: bool = False
    """Product has a ``sku`` field."""

    has_gtin: bool = False
    """Product has any GTIN variant (``gtin``, ``gtin8``–``gtin14``, ``isbn``)."""

    has_aggregate_rating: bool = False
    """Product has an ``aggregateRating`` field."""

    has_price_valid_until: bool = False
    """An Offer contains ``priceValidUntil``."""

    has_shipping_details: bool = False
    """An Offer or Product contains ``shippingDetails``."""

    has_return_policy: bool = False
    """An Offer or Product contains ``hasMerchantReturnPolicy``."""

    has_breadcrumb_list: bool = False
    """A ``BreadcrumbList`` schema node was found."""

    has_organization: bool = False
    """An ``Organization`` schema node was found."""

    # --- Error signals (3 bool + 1 int) ------------------------------
    has_missing_brand: bool = False
    """A Product exists but has no ``brand``."""

    has_currency_in_price: bool = False
    """Price string contains a currency symbol (``$``, ``€``, etc.)."""

    has_invalid_availability: bool = False
    """Availability is not a full ``https://schema.org/`` URL."""

    json_parse_errors: int = 0
    """Count of ``<script type="application/ld+json">`` blocks that
    failed ``json.loads``."""

    # --- Counter (1 int) ---------------------------------------------
    duplicate_product_count: int = 0
    """Total number of Product nodes found (>1 means duplicates)."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _flatten_jsonld(data: object) -> list[dict]:
    """Flatten JSON-LD into a list of typed objects.

    Handles plain objects, arrays, and ``@graph`` wrappers.
    """
    if isinstance(data, list):
        result: list[dict] = []
        for item in data:
            result.extend(_flatten_jsonld(item))
        return result
    if isinstance(data, dict):
        graph = data.get("@graph")
        if isinstance(graph, list):
            return _flatten_jsonld(graph)
        return [data]
    return []


def _has_type(item: dict, target: str) -> bool:
    """Check whether *item*'s ``@type`` matches *target*.

    Handles ``@type`` as both a plain string and a list
    (e.g. ``["Product", "IndividualProduct"]``).
    """
    raw = item.get("@type", "")
    types = raw if isinstance(raw, list) else [raw]
    return target in types


def _get_first_offer(product: dict) -> dict | None:
    """Return the first Offer object from *product*, or ``None``.

    Handles ``offers`` as a single dict or a list.
    """
    offers = product.get("offers")
    if isinstance(offers, dict):
        return offers
    if isinstance(offers, list) and offers:
        first = offers[0]
        return first if isinstance(first, dict) else None
    return None


def _check_currency_in_price(price_value: object) -> bool:
    """Return ``True`` if *price_value* contains a currency symbol."""
    if not isinstance(price_value, str):
        price_value = str(price_value) if price_value is not None else ""
    return bool(_CURRENCY_SYMBOLS.search(price_value))


def _check_invalid_availability(availability: object) -> bool:
    """Return ``True`` if *availability* is not a full schema.org URL."""
    if not isinstance(availability, str) or not availability:
        return False
    return not (
        availability.startswith("https://schema.org/")
        or availability.startswith("http://schema.org/")
    )


# ---------------------------------------------------------------------------
# Product field extraction
# ---------------------------------------------------------------------------


def _extract_product_signals(
    product: dict,
    signals: StructuredDataSignals,
) -> None:
    """Populate *signals* from the first ``Product`` node."""
    signals.has_product_schema = True

    # Simple presence checks
    if product.get("name"):
        signals.has_name = True
    if product.get("image"):
        signals.has_image = True
    if product.get("description"):
        signals.has_description = True

    # --- Offers ---
    offer = _get_first_offer(product)
    if offer is not None:
        signals.has_offers = True

        price = offer.get("price")
        if price is not None and str(price).strip() != "":
            signals.has_price = True
            # Extract numeric price from the first offer
            if signals.price_amount is None:
                try:
                    signals.price_amount = float(str(price).replace(",", ""))
                except (ValueError, TypeError):
                    pass
            if _check_currency_in_price(price):
                signals.has_currency_in_price = True

        if offer.get("priceCurrency"):
            signals.has_price_currency = True

        availability = offer.get("availability")
        if availability:
            signals.has_availability = True
            if _check_invalid_availability(availability):
                signals.has_invalid_availability = True

        if offer.get("priceValidUntil"):
            signals.has_price_valid_until = True

        # shippingDetails / hasMerchantReturnPolicy may be on Offer or Product
        if "shippingDetails" in offer or "shippingDetails" in product:
            signals.has_shipping_details = True
        if (
            "hasMerchantReturnPolicy" in offer
            or "hasMerchantReturnPolicy" in product
        ):
            signals.has_return_policy = True
    else:
        # Check Product-level extras even if no offer
        if "shippingDetails" in product:
            signals.has_shipping_details = True
        if "hasMerchantReturnPolicy" in product:
            signals.has_return_policy = True

    # --- Brand ---
    brand = product.get("brand")
    if brand:
        if isinstance(brand, str):
            signals.has_brand = True
        elif isinstance(brand, dict) and brand.get("name"):
            signals.has_brand = True

    if not signals.has_brand:
        signals.has_missing_brand = True

    # --- Identifiers ---
    if product.get("sku"):
        signals.has_sku = True

    gtin_keys = ("gtin", "gtin8", "gtin12", "gtin13", "gtin14", "isbn")
    if any(product.get(k) for k in gtin_keys):
        signals.has_gtin = True

    # --- Aggregate rating ---
    if product.get("aggregateRating"):
        signals.has_aggregate_rating = True


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_structured_data(html: str) -> StructuredDataSignals:
    """Detect structured data signals from rendered product page HTML.

    Parses all ``<script type="application/ld+json">`` blocks, flattens
    ``@graph`` wrappers, and inspects typed nodes for Product,
    BreadcrumbList, and Organization schemas.
    """
    signals = StructuredDataSignals()

    if not html:
        return signals

    soup = BeautifulSoup(html, "html.parser")

    # Collect all typed objects across every JSON-LD block
    all_items: list[dict] = []

    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            signals.json_parse_errors += 1
            logger.debug("Malformed JSON-LD block skipped")
            continue

        all_items.extend(_flatten_jsonld(data))

    # --- Count Product nodes ---
    product_nodes = [item for item in all_items if _has_type(item, "Product")]
    signals.duplicate_product_count = len(product_nodes)

    # --- Process first Product ---
    if product_nodes:
        _extract_product_signals(product_nodes[0], signals)

    # --- Ancillary schemas ---
    for item in all_items:
        if _has_type(item, "BreadcrumbList"):
            signals.has_breadcrumb_list = True
        if _has_type(item, "Organization"):
            signals.has_organization = True

    logger.info(
        "Structured data detected: product=%s name=%s offers=%s breadcrumb=%s org=%s duplicates=%d errors=%d",
        signals.has_product_schema,
        signals.has_name,
        signals.has_offers,
        signals.has_breadcrumb_list,
        signals.has_organization,
        signals.duplicate_product_count,
        signals.json_parse_errors,
    )

    return signals
