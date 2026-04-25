"""POST /discover-products — find products on a store via Shopify JSON or HTML scraping."""

import asyncio
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.auth import get_current_user_optional
from app.config import settings
from app.database import get_db
from app.models import Store, StoreAnalysis, StoreProduct, User
from app.services.dimension_fixes import gate_store_analysis_for_free_tier
from app.services.entitlement import (
    can_paginate,
    quota_exhausted_response,
    user_has_store_slot_for,
)
from app.services.shopify_sitemap import fetch_product_count, total_pages_for
from app.services.page_renderer import render_page
from app.services.accessibility_scanner import run_axe_scan
from app.services.page_speed_api import fetch_pagespeed_insights
from app.services.ai_discoverability_api import fetch_ai_discoverability_data
from app.services.checkout_detector import detect_checkout, combine_signals
from app.services.checkout_flow_simulator import simulate_checkout_flow
from app.services.checkout_page_parser import unreached
from app.services.shipping_detector import detect_shipping
from app.services.trust_detector import detect_trust
from app.services.social_commerce_detector import detect_social_commerce
from app.services.accessibility_detector import detect_accessibility
from app.services.ai_discoverability_detector import detect_ai_discoverability
from app.services.page_speed_detector import detect_page_speed
from app.services.checkout_rubric import (
    score_checkout,
    get_checkout_tips,
    list_checkout_checks,
    score_merged_checkout,
    get_merged_checkout_tips,
    list_merged_checkout_checks,
)
from app.services.shipping_rubric import (
    score_shipping,
    get_shipping_tips,
    list_shipping_checks,
)
from app.services.trust_rubric import (
    score_trust,
    get_trust_tips,
    list_trust_checks,
)
from app.services.social_commerce_rubric import (
    score_social_commerce,
    get_social_commerce_tips,
    list_social_commerce_checks,
)
from app.services.accessibility_rubric import (
    score_accessibility,
    get_accessibility_tips,
    list_accessibility_checks,
)
from app.services.ai_discoverability_rubric import (
    score_ai_discoverability,
    get_ai_discoverability_tips,
    list_ai_discoverability_checks,
)
from app.services.page_speed_rubric import (
    score_page_speed,
    get_page_speed_tips,
    list_page_speed_checks,
)
from app.services.scoring import STORE_WIDE_KEYS, IMPACT_WEIGHTS, clamp_score
from app.services.url_validator import validate_url

from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter()


class DiscoverProductsRequest(BaseModel):
    url: str = Field(..., min_length=1)

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def _parse_url(raw: str) -> tuple[str, str]:
    """Normalise URL, return (origin, domain). Raises ValueError on bad input."""
    url = raw if raw.startswith("http") else f"https://{raw}"
    parsed = urlparse(url)
    if not parsed.hostname:
        raise ValueError("bad url")
    origin = f"{parsed.scheme}://{parsed.hostname}"
    if parsed.port:
        origin += f":{parsed.port}"
    return origin, parsed.hostname


# ---------------------------------------------------------------------------
# Timing helper — records elapsed ms per-coroutine, safe inside asyncio.gather
# ---------------------------------------------------------------------------


async def _timed(label: str, coro, timings: dict[str, float]):
    """Await ``coro`` and record its elapsed ms under ``label`` in ``timings``.

    Works inside ``asyncio.gather(..., return_exceptions=True)``: the
    ``finally`` clause ensures the timing is captured even when the wrapped
    coroutine raises, so slow-then-failing dependencies remain visible.
    """
    t0 = time.perf_counter()
    try:
        return await coro
    finally:
        timings[label] = round((time.perf_counter() - t0) , 3)


# ---------------------------------------------------------------------------
# Strategy 1: Shopify /products.json
# ---------------------------------------------------------------------------

_CDN_RE = re.compile(r"(\.(jpg|jpeg|png|webp|avif))", re.IGNORECASE)


def _thumb(src: str) -> str:
    """Apply Shopify CDN 180-px thumbnail suffix and ensure https prefix."""
    img = src
    if img and "cdn.shopify.com" in img:
        img = _CDN_RE.sub(r"_180x\1", img, count=1)
    if img.startswith("//"):
        img = f"https:{img}"
    return img


async def _try_shopify_json(origin: str) -> list[dict]:
    """Fetch first page of /products.json (10 items)."""
    return await _try_shopify_json_page(origin, page=1, page_size=10)


async def _try_shopify_json_page(
    origin: str, page: int, page_size: int = 10
) -> list[dict]:
    """Fetch /products.json?page=N&limit=K. Returns list of {url, slug, image}.

    Shopify's /products.json supports `page` and `limit` query params; for
    paginated browsing we request 10 items per page so page boundaries
    align with the in-DB slice produced by ``GET /store/{domain}/products``.
    """
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{origin}/products.json",
                params={"limit": page_size, "page": page},
                headers={
                    "User-Agent": _USER_AGENT,
                    "Accept": "application/json",
                },
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
    except Exception:
        return []

    products_raw = data.get("products") or []
    results: list[dict] = []
    for p in products_raw:
        handle = p.get("handle")
        title = p.get("title")
        if not handle or not title:
            continue
        images = p.get("images") or []
        image = _thumb(images[0]["src"]) if images else ""
        results.append(
            {"url": f"{origin}/products/{handle}", "slug": title, "image": image}
        )
    return results


async def _fetch_page_title(origin: str) -> str:
    """Fetch the origin's <title> for a store name."""
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                origin,
                headers={"User-Agent": _USER_AGENT, "Accept": "text/html"},
            )
            html = resp.text
        match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
        if match:
            return re.split(r"[–—|]", match.group(1).strip())[0].strip()
    except Exception:
        pass
    return ""


# ---------------------------------------------------------------------------
# Strategy 2: HTML scraping fallback
# ---------------------------------------------------------------------------

_PRODUCT_HREF_RE = re.compile(
    r"""href=["']((?:https?://[^"']*)?/products/([^"'#?]+))["']""",
    re.IGNORECASE,
)
_IMG_RE = re.compile(
    r"""(?:src|data-src)=["']((?:https?:)?//[^"'\s]+?\.(?:jpg|jpeg|png|webp|avif)[^"'\s]*)""",
    re.IGNORECASE,
)


async def _try_html_scraping(
    origin: str, original_url: str
) -> dict:
    """Return {products, storeName, isProductPage} from HTML scraping."""
    url_to_fetch = original_url if original_url.startswith("http") else f"https://{original_url}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            url_to_fetch,
            headers={
                "User-Agent": _USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        if resp.status_code != 200:
            return {"products": [], "storeName": "", "isProductPage": False}

    html = resp.text

    # Store name from <title>
    title_m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    store_name = ""
    if title_m:
        store_name = re.split(r"[–—|]", title_m.group(1).strip())[0].strip()

    # Detect product page
    parsed = urlparse(url_to_fetch)
    is_product_page = bool(re.search(r"/products/[^/]+", parsed.path))
    if not is_product_page:
        has_products_ref = "/products/" in html
        has_cart_signals = bool(re.search(r"add.to.cart|AddToCart|product-form", html, re.IGNORECASE))
        few_product_links = len(re.findall(r"/products/", html)) <= 5
        if has_products_ref and has_cart_signals and few_product_links:
            is_product_page = True

    # Extract product links
    seen: set[str] = set()
    products: list[dict] = []
    for m in _PRODUCT_HREF_RE.finditer(html):
        if len(products) >= 10:
            break
        href = m.group(1)
        raw_slug = m.group(2)
        if href.startswith("/"):
            href = f"{origin}{href}"
        try:
            p = urlparse(href)
            clean = f"{p.scheme}://{p.hostname}{p.path.rstrip('/')}"
            if p.port:
                clean = f"{p.scheme}://{p.hostname}:{p.port}{p.path.rstrip('/')}"
        except Exception:
            continue
        if clean in seen:
            continue
        seen.add(clean)

        slug = raw_slug.replace("-", " ").replace("/", "").strip()
        if not slug:
            continue

        # Find nearby image (±1500 chars)
        pos = m.start()
        neighbourhood = html[max(0, pos - 1500): pos + 1500]
        img_m = _IMG_RE.search(neighbourhood)
        image = ""
        if img_m:
            image = img_m.group(1)
            if image.startswith("//"):
                image = f"https:{image}"

        products.append({"url": clean, "slug": slug, "image": image})

    return {"products": products, "storeName": store_name, "isProductPage": is_product_page}


# ---------------------------------------------------------------------------
# DB persistence
# ---------------------------------------------------------------------------


def _persist_store_and_products(
    db: Session,
    domain: str,
    store_name: str,
    products: list[dict],
    product_count: int | None = None,
) -> str | None:
    """Upsert store, replace products, return storeId or None on failure.

    ``product_count`` is the total catalog size from
    :func:`app.services.shopify_sitemap.fetch_product_count`.  When None
    (sitemap + /products.json both failed) we leave any pre-existing
    value intact rather than clobbering it with NULL.
    """
    try:
        update_set: dict = {
            "name": store_name or None,
            "updated_at": func.now(),
        }
        if product_count is not None:
            update_set["product_count"] = product_count
        stmt = (
            pg_insert(Store)
            .values(
                domain=domain,
                name=store_name or None,
                product_count=product_count,
            )
            .on_conflict_do_update(
                index_elements=["domain"],
                set_=update_set,
            )
            .returning(Store.id)
        )
        row = db.execute(stmt).fetchone()
        db.commit()
        store_id = row[0]

        # Delete existing products, then bulk-insert
        db.query(StoreProduct).filter(StoreProduct.store_id == store_id).delete()
        if products:
            db.bulk_insert_mappings(
                StoreProduct,
                [
                    {
                        "store_id": store_id,
                        "url": p["url"],
                        "slug": p["slug"],
                        "image": p.get("image") or None,
                    }
                    for p in products
                ],
            )
        db.commit()
        return str(store_id)
    except Exception:
        logger.exception("DB store persist error")
        try:
            db.rollback()
        except Exception:
            pass
        return None


# ---------------------------------------------------------------------------
# Store-wide analysis helpers
# ---------------------------------------------------------------------------

_STORE_TOTAL_WEIGHT = sum(IMPACT_WEIGHTS[k] for k in STORE_WIDE_KEYS)


def _compute_store_wide_score(categories: dict) -> int:
    """Weighted average using only the 7 store-wide dimension weights."""
    total = sum(
        clamp_score(categories.get(k, 0)) * IMPACT_WEIGHTS[k]
        for k in STORE_WIDE_KEYS
    )
    return round(total / _STORE_TOTAL_WEIGHT)


def _serialize_checkout_signals(s) -> dict:
    """Serialize checkout signals to camelCase dicts.

    Accepts either a bare :class:`CheckoutSignals` (PDP-only, legacy
    callers) or a :class:`MergedCheckoutSignals` which adds the
    ground-truth wallet / BNPL / UX fields captured from the real
    checkout page.
    """
    # Duck-type: merged signals have a ``pdp`` attribute
    if hasattr(s, "pdp") and hasattr(s, "checkout_page"):
        pdp = s.pdp
        cp = s.checkout_page
        return {
            # Legacy PDP-derived fields (kept for backward compat)
            "hasAcceleratedCheckout": pdp.has_accelerated_checkout,
            "hasDynamicCheckoutButton": pdp.has_dynamic_checkout_button,
            "hasPaypal": pdp.has_paypal,
            "hasKlarna": pdp.has_klarna,
            "hasAfterpay": pdp.has_afterpay,
            "hasAffirm": pdp.has_affirm,
            "hasSezzle": pdp.has_sezzle,
            "paymentMethodCount": pdp.payment_method_count,
            "hasDrawerCart": pdp.has_drawer_cart,
            "hasAjaxCart": pdp.has_ajax_cart,
            "hasStickyCheckout": pdp.has_sticky_checkout,
            # Ground-truth fields from the live checkout page
            "reachedCheckout": s.reached_checkout,
            "failureReason": s.failure_reason,
            "checkoutFlavor": cp.checkout_flavor,
            "wallets": {
                "shopPay": cp.has_shop_pay,
                "applePay": cp.has_apple_pay,
                "googlePay": cp.has_google_pay,
                "paypal": cp.has_paypal,
                "amazonPay": cp.has_amazon_pay,
                "metaPay": cp.has_meta_pay,
                "stripeLink": cp.has_stripe_link,
            },
            "bnpl": {
                "klarna": cp.has_klarna,
                "afterpay": cp.has_afterpay,
                "clearpay": cp.has_clearpay,
                "affirm": cp.has_affirm,
                "sezzle": cp.has_sezzle,
                "shopPayInstallments": cp.has_shop_pay_installments,
                "zip": cp.has_zip,
            },
            "cardBrands": list(cp.card_brands),
            "guestCheckoutAvailable": cp.guest_checkout_available,
            "forcedAccountCreation": cp.forced_account_creation,
            "checkoutStepCount": cp.checkout_step_count,
            "totalFormFieldsStepOne": cp.total_form_fields_step_one,
            "hasDiscountCodeField": cp.has_discount_code_field,
            "hasGiftCardField": cp.has_gift_card_field,
            "hasShippingCalculator": cp.has_shipping_calculator,
            "hasAddressAutocomplete": cp.has_address_autocomplete,
            "trustBadgeCount": cp.trust_badge_count,
            "currencyCode": cp.currency_code,
        }

    # Raw CheckoutSignals (PDP-only)
    return {
        "hasAcceleratedCheckout": s.has_accelerated_checkout,
        "hasDynamicCheckoutButton": s.has_dynamic_checkout_button,
        "hasPaypal": s.has_paypal,
        "hasKlarna": s.has_klarna,
        "hasAfterpay": s.has_afterpay,
        "hasAffirm": s.has_affirm,
        "hasSezzle": s.has_sezzle,
        "paymentMethodCount": s.payment_method_count,
        "hasDrawerCart": s.has_drawer_cart,
        "hasAjaxCart": s.has_ajax_cart,
        "hasStickyCheckout": s.has_sticky_checkout,
    }


def _serialize_shipping_signals(s) -> dict:
    return {
        "hasFreeShipping": s.has_free_shipping,
        "hasFreeShippingThreshold": s.has_free_shipping_threshold,
        "freeShippingThresholdValue": s.free_shipping_threshold_value,
        "hasDeliveryDate": s.has_delivery_date,
        "hasDeliveryEstimate": s.has_delivery_estimate,
        "hasEddApp": s.has_edd_app,
        "hasShippingCostShown": s.has_shipping_cost_shown,
        "hasShippingInStructuredData": s.has_shipping_in_structured_data,
        "hasShippingPolicyLink": s.has_shipping_policy_link,
        "hasReturnsMentioned": s.has_returns_mentioned,
    }


def _serialize_trust_signals(s) -> dict:
    return {
        "trustBadgeApp": s.trust_badge_app,
        "trustBadgeCount": s.trust_badge_count,
        "hasPaymentIcons": s.has_payment_icons,
        "hasMoneyBackGuarantee": s.has_money_back_guarantee,
        "hasReturnPolicy": s.has_return_policy,
        "hasFreeShippingBadge": s.has_free_shipping_badge,
        "hasSecureCheckoutText": s.has_secure_checkout_text,
        "hasSecurityBadge": s.has_security_badge,
        "hasSafeCheckoutBadge": s.has_safe_checkout_badge,
        "hasLiveChat": s.has_live_chat,
        "hasPhoneNumber": s.has_phone_number,
        "hasContactEmail": s.has_contact_email,
        "hasTrustNearAtc": s.has_trust_near_atc,
        "trustElementCount": s.trust_element_count,
    }


def _serialize_social_commerce_signals(s) -> dict:
    return {
        "hasInstagramEmbed": s.has_instagram_embed,
        "hasTiktokEmbed": s.has_tiktok_embed,
        "hasPinterest": s.has_pinterest,
        "hasUgcGallery": s.has_ugc_gallery,
        "ugcGalleryApp": s.ugc_gallery_app,
        "platformCount": s.platform_count,
    }


def _serialize_accessibility_signals(s) -> dict:
    return {
        "contrastViolations": s.contrast_violations,
        "altTextViolations": s.alt_text_violations,
        "formLabelViolations": s.form_label_violations,
        "emptyLinkViolations": s.empty_link_violations,
        "emptyButtonViolations": s.empty_button_violations,
        "documentLanguageViolations": s.document_language_violations,
        "totalViolations": s.total_violations,
        "totalNodesAffected": s.total_nodes_affected,
        "criticalCount": s.critical_count,
        "seriousCount": s.serious_count,
        "moderateCount": s.moderate_count,
        "minorCount": s.minor_count,
        "scanCompleted": s.scan_completed,
    }


def _serialize_ai_discoverability_signals(s) -> dict:
    return {
        "robotsTxtExists": s.robots_txt_exists,
        "aiSearchBotsAllowedCount": s.ai_search_bots_allowed_count,
        "aiTrainingBotsBlockedCount": s.ai_training_bots_blocked_count,
        "hasOaiSearchbotAllowed": s.has_oai_searchbot_allowed,
        "hasPerplexitybotAllowed": s.has_perplexitybot_allowed,
        "hasClaudeSearchbotAllowed": s.has_claude_searchbot_allowed,
        "hasWildcardBlock": s.has_wildcard_block,
        "llmsTxtExists": s.llms_txt_exists,
        "hasOgType": s.has_og_type,
        "hasOgTitle": s.has_og_title,
        "hasOgDescription": s.has_og_description,
        "hasOgImage": s.has_og_image,
        "hasProductPriceAmount": s.has_product_price_amount,
        "hasProductPriceCurrency": s.has_product_price_currency,
        "ogTagCount": s.og_tag_count,
        "hasStructuredSpecs": s.has_structured_specs,
        "hasSpecTable": s.has_spec_table,
        "hasFaqContent": s.has_faq_content,
        "specMentionCount": s.spec_mention_count,
        "hasMeasurementUnits": s.has_measurement_units,
        "entityDensityScore": round(s.entity_density_score, 3),
    }


def _serialize_page_speed_signals(s) -> dict:
    return {
        "scriptCount": s.script_count,
        "thirdPartyScriptCount": s.third_party_script_count,
        "renderBlockingScriptCount": s.render_blocking_script_count,
        "appScriptCount": s.app_script_count,
        "hasLazyLoading": s.has_lazy_loading,
        "lcpImageLazyLoaded": s.lcp_image_lazy_loaded,
        "hasExplicitImageDimensions": s.has_explicit_image_dimensions,
        "hasModernImageFormats": s.has_modern_image_formats,
        "hasFontDisplaySwap": s.has_font_display_swap,
        "hasPreconnectHints": s.has_preconnect_hints,
        "hasDnsPrefetch": s.has_dns_prefetch,
        "hasHeroPreload": s.has_hero_preload,
        "inlineCssKb": s.inline_css_kb,
        "detectedTheme": s.detected_theme,
        "performanceScore": s.performance_score,
        "lcpMs": s.lcp_ms,
        "clsValue": s.cls_value,
        "tbtMs": s.tbt_ms,
        "fcpMs": s.fcp_ms,
        "speedIndexMs": s.speed_index_ms,
        "hasFieldData": s.has_field_data,
        "fieldLcpMs": s.field_lcp_ms,
        "fieldClsValue": s.field_cls_value,
        "desktop": (
            {
                "performanceScore": s.desktop.performance_score,
                "lcpMs": s.desktop.lcp_ms,
                "clsValue": s.desktop.cls_value,
                "tbtMs": s.desktop.tbt_ms,
                "fcpMs": s.desktop.fcp_ms,
                "speedIndexMs": s.desktop.speed_index_ms,
                "hasFieldData": s.desktop.has_field_data,
                "fieldLcpMs": s.desktop.field_lcp_ms,
                "fieldClsValue": s.desktop.field_cls_value,
            }
            if getattr(s, "desktop", None) is not None
            else None
        ),
    }


def _serialize_store_signals(
    co_signals,
    sh_signals,
    tr_signals,
    sc_signals,
    ac_signals,
    ad_signals,
    ps_signals,
) -> dict:
    """Serialize the 7 store-wide signal dataclasses to camelCase dicts."""
    return {
        "checkout": _serialize_checkout_signals(co_signals),
        "shipping": _serialize_shipping_signals(sh_signals),
        "trust": _serialize_trust_signals(tr_signals),
        "socialCommerce": _serialize_social_commerce_signals(sc_signals),
        "accessibility": _serialize_accessibility_signals(ac_signals),
        "aiDiscoverability": _serialize_ai_discoverability_signals(ad_signals),
        "pageSpeed": _serialize_page_speed_signals(ps_signals),
    }


# Store-wide analysis cache TTL. Store-level signals (shipping policy, trust
# badges, checkout flow) rarely change — 7 days balances freshness vs compute cost.
_STORE_CACHE_TTL_DAYS = 7


def _is_store_cache_fresh(updated_at) -> bool:
    """True when the cached StoreAnalysis row is younger than _STORE_CACHE_TTL_DAYS.

    Handles tz-naive Postgres timestamps by assuming UTC.
    """
    if updated_at is None:
        return False
    ts = updated_at if updated_at.tzinfo is not None else updated_at.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - ts) < timedelta(days=_STORE_CACHE_TTL_DAYS)


def _store_analysis_dict(row: StoreAnalysis) -> dict:
    """Serialize a StoreAnalysis row into the StoreAnalysisData response shape."""
    return {
        "score": row.score,
        "categories": row.categories or {},
        "tips": row.tips or {},
        "signals": row.signals or {},
        "checks": row.checks or {},
        "analyzedUrl": row.analyzed_url,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
    }


async def _run_store_wide_analysis(
    domain: str,
    product_url: str,
    user_id,
    db: Session,
    *,
    force: bool = False,
    only_dimensions: set[str] | None = None,
) -> dict | None:
    """Run store-wide detectors on one product page and persist a StoreAnalysis row.

    When ``force`` is False (default) and ``only_dimensions`` is None, reuses a
    cached StoreAnalysis row if fresher than _STORE_CACHE_TTL_DAYS.

    When ``only_dimensions`` is a set of dimension keys (subset of STORE_WIDE_KEYS),
    runs only those detector chains and skips external API calls that aren't needed
    (run_axe_scan only fires for accessibility, fetch_pagespeed_insights only for
    pageSpeed, fetch_ai_discoverability_data only for aiDiscoverability). The
    existing StoreAnalysis row is loaded with FOR UPDATE, the targeted dimensions
    are merged in, and the overall weighted score is recomputed.

    Returns a dict with score/categories/tips/signals/checks/analyzedUrl/updatedAt,
    or None on failure.
    """
    if only_dimensions is not None:
        invalid = only_dimensions - set(STORE_WIDE_KEYS)
        if invalid:
            raise ValueError(
                f"Invalid dimension keys: {sorted(invalid)}. "
                f"Valid keys: {STORE_WIDE_KEYS}"
            )
        if not only_dimensions:
            raise ValueError("only_dimensions must not be empty when provided")
    is_targeted = only_dimensions is not None
    needs: set[str] = (
        set(only_dimensions) if is_targeted else set(STORE_WIDE_KEYS)
    )

    timings: dict[str, float] = {}
    t_total = time.perf_counter()

    # --- Cache lookup (skipped when caller forces a refresh or targets a subset) ---
    if not force and not is_targeted:
        try:
            cache_row = (
                db.query(StoreAnalysis)
                .filter(StoreAnalysis.store_domain == domain)
                .filter(StoreAnalysis.user_id == user_id)
                .first()
            )
            if cache_row is not None and _is_store_cache_fresh(cache_row.updated_at):
                logger.info(
                    "Store-wide analysis cache HIT for domain=%s user_id=%s — skipping detectors",
                    domain, user_id,
                )
                timings["total_s"] = round((time.perf_counter() - t_total) , 3)
                logger.info(
                    "scan_timings store_wide_analysis cache_hit domain=%s total_s=%s timings=%s",
                    domain, timings["total_s"], timings,
                    extra={
                        "event": "scan_timings",
                        "scope": "store_wide_analysis",
                        "cache_hit": True,
                        "domain": domain,
                        "user_id": str(user_id) if user_id is not None else None,
                        "url": cache_row.analyzed_url,
                        "timings_s": timings,
                    },
                )
                return _store_analysis_dict(cache_row)
            if cache_row is not None:
                logger.info(
                    "Store-wide analysis cache STALE for domain=%s user_id=%s — re-running",
                    domain, user_id,
                )
        except Exception:
            logger.exception(
                "Store-wide cache lookup failed for domain=%s — running fresh analysis",
                domain,
            )

    try:
        # --- Gather HTML + external API data in parallel ---
        # HTML is always required (every detector reads it). Axe scan, AI
        # discoverability fetch, and PSI are each only needed for one dimension
        # — skip them when the caller is targeting a subset that doesn't need
        # them. For the common case of targeted checkout/shipping/trust/social
        # refresh this cuts wall time roughly in half (no axe/PSI/AI fetches).
        coros: list = []
        html_idx = len(coros)
        coros.append(_timed("render_page_s", render_page(product_url), timings))

        run_axe = "accessibility" in needs
        axe_idx = -1
        if run_axe:
            axe_idx = len(coros)
            coros.append(
                _timed("run_axe_scan_s", run_axe_scan(product_url), timings)
            )

        run_ai = "aiDiscoverability" in needs
        ai_idx = -1
        if run_ai:
            ai_idx = len(coros)
            coros.append(
                _timed(
                    "fetch_ai_discoverability_s",
                    fetch_ai_discoverability_data(product_url),
                    timings,
                )
            )

        has_psi = (
            bool(settings.google_pagespeed_api_key) and "pageSpeed" in needs
        )
        psi_idx = -1
        psi_desktop_idx = -1
        if has_psi:
            psi_idx = len(coros)
            coros.append(
                _timed(
                    "fetch_pagespeed_insights_s",
                    fetch_pagespeed_insights(
                        product_url,
                        settings.google_pagespeed_api_key,
                        strategy="MOBILE",
                    ),
                    timings,
                )
            )
            # Desktop strategy runs in parallel with mobile — wall time
            # stays equal to the slower of the two PSI calls (PSI free
            # tier has 25k req/day, well above any realistic load).
            psi_desktop_idx = len(coros)
            coros.append(
                _timed(
                    "fetch_pagespeed_insights_desktop_s",
                    fetch_pagespeed_insights(
                        product_url,
                        settings.google_pagespeed_api_key,
                        strategy="DESKTOP",
                    ),
                    timings,
                )
            )

        t_gather = time.perf_counter()
        results = await asyncio.gather(*coros, return_exceptions=True)
        timings["parallel_io_wall_s"] = round((time.perf_counter() - t_gather) , 3)

        # Unpack HTML (required — can't run detectors without it)
        html_result = results[html_idx]
        if isinstance(html_result, Exception):
            logger.warning(
                "Store analysis: render_page failed for %s: %s",
                product_url,
                html_result,
                extra={
                    "event": "external_api_failure",
                    "api": "render",
                    "domain": domain,
                    "url": product_url,
                },
            )
            return None
        html = html_result

        # Unpack axe scan (graceful degradation)
        axe_results = None
        if axe_idx >= 0:
            r = results[axe_idx]
            if isinstance(r, Exception):
                logger.warning(
                    "Store analysis: axe scan failed for %s: %s",
                    product_url,
                    r,
                    extra={
                        "event": "external_api_failure",
                        "api": "axe",
                        "domain": domain,
                        "url": product_url,
                    },
                )
            else:
                axe_results = r

        # Unpack AI discoverability data (graceful degradation)
        ai_disc_data = None
        if ai_idx >= 0:
            r = results[ai_idx]
            if isinstance(r, Exception):
                logger.warning(
                    "Store analysis: AI discoverability fetch failed for %s: %s",
                    product_url,
                    r,
                    extra={
                        "event": "external_api_failure",
                        "api": "ai_discoverability",
                        "domain": domain,
                        "url": product_url,
                    },
                )
            else:
                ai_disc_data = r

        # Unpack optional PSI data (graceful degradation)
        psi_data = None
        if psi_idx >= 0:
            r = results[psi_idx]
            if isinstance(r, Exception):
                logger.warning(
                    "Store analysis: PSI API failed for %s: %s",
                    product_url,
                    r,
                    extra={
                        "event": "external_api_failure",
                        "api": "psi",
                        "domain": domain,
                        "url": product_url,
                    },
                )
            else:
                psi_data = r

        # Unpack optional desktop PSI data (graceful degradation —
        # absent or failed desktop calls leave the scorecard's
        # Desktop tab disabled on the frontend).
        psi_desktop_data = None
        if psi_desktop_idx >= 0:
            r = results[psi_desktop_idx]
            if isinstance(r, Exception):
                logger.warning(
                    "Store analysis: desktop PSI API failed for %s: %s",
                    product_url,
                    r,
                    extra={
                        "event": "external_api_failure",
                        "api": "psi_desktop",
                        "domain": domain,
                        "url": product_url,
                    },
                )
            else:
                psi_desktop_data = r

        # --- Run detect → score → tips → checks chains for needed dims ---
        t_det = time.perf_counter()

        categories_patch: dict[str, int] = {}
        tips_patch: dict[str, list[str]] = {}
        signals_patch: dict[str, dict] = {}
        checks_patch: dict[str, list[dict]] = {}

        if "checkout" in needs:
            pdp = detect_checkout(html)
            try:
                flow_result = await simulate_checkout_flow(
                    product_url, timeout_s=45.0
                )
                cp = flow_result.signals
            except Exception as exc:
                logger.warning(
                    "Checkout flow simulator crashed for %s: %s",
                    product_url,
                    exc,
                )
                cp = unreached("simulator_error")
            merged = combine_signals(pdp=pdp, checkout_page=cp)
            categories_patch["checkout"] = score_merged_checkout(merged)
            tips_patch["checkout"] = get_merged_checkout_tips(merged)
            signals_patch["checkout"] = _serialize_checkout_signals(merged)
            checks_patch["checkout"] = list_merged_checkout_checks(merged)

        if "shipping" in needs:
            s = detect_shipping(html)
            categories_patch["shipping"] = score_shipping(s)
            tips_patch["shipping"] = get_shipping_tips(s)
            signals_patch["shipping"] = _serialize_shipping_signals(s)
            checks_patch["shipping"] = list_shipping_checks(s)

        if "trust" in needs:
            s = detect_trust(html)
            categories_patch["trust"] = score_trust(s)
            tips_patch["trust"] = get_trust_tips(s)
            signals_patch["trust"] = _serialize_trust_signals(s)
            checks_patch["trust"] = list_trust_checks(s)

        if "socialCommerce" in needs:
            s = detect_social_commerce(html)
            categories_patch["socialCommerce"] = score_social_commerce(s)
            tips_patch["socialCommerce"] = get_social_commerce_tips(s)
            signals_patch["socialCommerce"] = (
                _serialize_social_commerce_signals(s)
            )
            checks_patch["socialCommerce"] = list_social_commerce_checks(s)

        if "accessibility" in needs:
            s = detect_accessibility(html, axe_results)
            categories_patch["accessibility"] = score_accessibility(s)
            tips_patch["accessibility"] = get_accessibility_tips(s)
            signals_patch["accessibility"] = _serialize_accessibility_signals(s)
            checks_patch["accessibility"] = list_accessibility_checks(s)

        if "aiDiscoverability" in needs:
            s = detect_ai_discoverability(html, ai_disc_data)
            categories_patch["aiDiscoverability"] = score_ai_discoverability(s)
            tips_patch["aiDiscoverability"] = get_ai_discoverability_tips(s)
            signals_patch["aiDiscoverability"] = (
                _serialize_ai_discoverability_signals(s)
            )
            checks_patch["aiDiscoverability"] = (
                list_ai_discoverability_checks(s)
            )

        if "pageSpeed" in needs:
            s = detect_page_speed(html, psi_data, psi_desktop_data)
            categories_patch["pageSpeed"] = score_page_speed(s)
            tips_patch["pageSpeed"] = get_page_speed_tips(s)
            signals_patch["pageSpeed"] = _serialize_page_speed_signals(s)
            checks_patch["pageSpeed"] = list_page_speed_checks(s)

        timings["detector_chains_s"] = round((time.perf_counter() - t_det) , 3)

        # --- Persist: targeted merge OR full upsert ---
        updated_at_iso: str | None = None
        merged_categories: dict = dict(categories_patch)
        merged_tips: dict = dict(tips_patch)
        merged_signals: dict = dict(signals_patch)
        merged_checks: dict = dict(checks_patch)
        t_db = time.perf_counter()

        if is_targeted:
            # Lock existing row, merge the refreshed dims on top, recompute
            # overall score from the merged categories.
            try:
                existing = (
                    db.query(StoreAnalysis)
                    .filter(StoreAnalysis.store_domain == domain)
                    .filter(StoreAnalysis.user_id == user_id)
                    .with_for_update()
                    .first()
                )
                if existing is None:
                    logger.warning(
                        "Targeted store refresh with no existing row "
                        "(domain=%s user_id=%s needs=%s) — cannot merge",
                        domain, user_id, sorted(needs),
                    )
                    db.rollback()
                    return None

                merged_categories = {
                    **(existing.categories or {}),
                    **categories_patch,
                }
                merged_tips = {
                    **(existing.tips or {}),
                    **tips_patch,
                }
                merged_signals = {
                    **(existing.signals or {}),
                    **signals_patch,
                }
                merged_checks = {
                    **(existing.checks or {}),
                    **checks_patch,
                }
                score = _compute_store_wide_score(merged_categories)
                now_utc = datetime.now(timezone.utc)

                existing.score = score
                existing.categories = merged_categories
                existing.tips = merged_tips
                existing.signals = merged_signals
                existing.checks = merged_checks
                existing.analyzed_url = product_url
                existing.updated_at = now_utc
                db.commit()
                updated_at_iso = now_utc.isoformat()
            except Exception:
                logger.exception(
                    "Targeted StoreAnalysis merge failed for domain=%s user_id=%s",
                    domain, user_id,
                )
                try:
                    db.rollback()
                except Exception:
                    pass
        else:
            score = _compute_store_wide_score(categories_patch)
            try:
                stmt = (
                    pg_insert(StoreAnalysis)
                    .values(
                        store_domain=domain,
                        user_id=user_id,
                        score=score,
                        categories=merged_categories,
                        tips=merged_tips,
                        signals=merged_signals,
                        checks=merged_checks,
                        analyzed_url=product_url,
                    )
                    .on_conflict_do_update(
                        constraint="uq_store_analyses_domain_user",
                        set_={
                            "score": score,
                            "categories": merged_categories,
                            "tips": merged_tips,
                            "signals": merged_signals,
                            "checks": merged_checks,
                            "analyzed_url": product_url,
                            "updated_at": func.now(),
                        },
                    )
                    .returning(StoreAnalysis.updated_at)
                )
                row = db.execute(stmt).fetchone()
                db.commit()
                if row and row[0]:
                    ts = row[0]
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                    updated_at_iso = ts.isoformat()
            except Exception:
                logger.exception(
                    "StoreAnalysis DB upsert error for domain=%s user_id=%s",
                    domain, user_id,
                )
                try:
                    db.rollback()
                except Exception:
                    pass
        timings["db_upsert_s"] = round((time.perf_counter() - t_db) , 3)

        timings["total_s"] = round((time.perf_counter() - t_total) , 3)
        logger.info(
            "scan_timings store_wide_analysis domain=%s total_s=%s timings=%s",
            domain, timings["total_s"], timings,
            extra={
                "event": "scan_timings",
                "scope": "store_wide_analysis",
                "cache_hit": False,
                "domain": domain,
                "user_id": str(user_id) if user_id is not None else None,
                "url": product_url,
                "psi_enabled": has_psi,
                "timings_s": timings,
            },
        )

        return {
            "score": score,
            "categories": merged_categories,
            "tips": merged_tips,
            "signals": merged_signals,
            "checks": merged_checks,
            "analyzedUrl": product_url,
            "updatedAt": updated_at_iso,
        }

    except Exception:
        logger.exception(
            "Store-wide analysis failed for domain=%s url=%s — product discovery continues",
            domain, product_url,
        )
        return None


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


@router.post("/discover-products")
@limiter.limit("5/minute")
async def discover_products(
    request: Request,
    body: DiscoverProductsRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    timings: dict[str, float] = {}
    t_total = time.perf_counter()
    source: str | None = None
    try:
        # SSRF-safe URL validation via shared validator
        url, error = validate_url(body.url)
        if error:
            return JSONResponse(
                status_code=400, content={"error": error}
            )

        origin, domain = _parse_url(url)

        # --- Store quota check (authenticated users only) ---
        # Anonymous scans don't create per-user rows, so quota doesn't apply.
        #
        # Credit gating note: /discover-products does NOT consume credits. It
        # is the discovery + onboarding flow and the store-wide analysis it
        # runs is cached for 7 days (see _STORE_CACHE_TTL_DAYS). The per-product
        # /analyze path and the explicit /store/{domain}/rescan path
        # are the credit-consuming operations.
        if current_user is not None and not user_has_store_slot_for(
            current_user, domain, db
        ):
            return JSONResponse(
                status_code=403,
                content=quota_exhausted_response(current_user, db),
            )

        # Strategy 1: Shopify JSON
        t_phase = time.perf_counter()
        json_products = await _try_shopify_json(origin)
        timings["shopify_json_fetch_s"] = round((time.perf_counter() - t_phase) , 3)
        if json_products:
            source = "shopify_json"
            products = json_products[:10]
            first_url = products[0]["url"]

            # Parallel: title fetch + (auth-only) store-wide analysis + product
            # count fetch. Analysis is the long pole (~10–20s); title (~1s) and
            # count (sitemap GET, ~1–2s) overlap inside it.  DB writes stay
            # sequential below.
            t_phase = time.perf_counter()
            if current_user is not None:
                store_name, store_analysis, product_count = await asyncio.gather(
                    _timed("page_title_fetch_s", _fetch_page_title(origin), timings),
                    _timed(
                        "store_wide_analysis_s",
                        _run_store_wide_analysis(
                            domain, first_url, current_user.id, db, force=False
                        ),
                        timings,
                    ),
                    _timed(
                        "product_count_s",
                        fetch_product_count(origin),
                        timings,
                    ),
                )
                timings["title_plus_analysis_wall_s"] = round(
                    (time.perf_counter() - t_phase) , 3
                )
            else:
                store_name, product_count = await asyncio.gather(
                    _timed("page_title_fetch_s", _fetch_page_title(origin), timings),
                    _timed(
                        "product_count_s",
                        fetch_product_count(origin),
                        timings,
                    ),
                )
                timings["title_plus_count_wall_s"] = round(
                    (time.perf_counter() - t_phase) , 3
                )
                store_analysis = None

            t_phase = time.perf_counter()
            store_id = _persist_store_and_products(
                db, domain, store_name, products, product_count
            )
            timings["db_persist_s"] = round((time.perf_counter() - t_phase) , 3)

            timings["total_s"] = round((time.perf_counter() - t_total) , 3)
            logger.info(
                "scan_timings discover_products source=%s domain=%s total_s=%s timings=%s",
                source, domain, timings["total_s"], timings,
                extra={
                    "event": "scan_timings",
                    "scope": "discover_products",
                    "source": source,
                    "domain": domain,
                    "user_id": str(current_user.id) if current_user else None,
                    "url": url,
                    "products_found": len(products),
                    "timings_s": timings,
                },
            )

            return {
                "products": products,
                "storeName": store_name,
                "isProductPage": False,
                "storeId": store_id,
                "productCount": product_count,
                "currentPage": 1,
                "totalPages": total_pages_for(product_count),
                "canPaginate": can_paginate(current_user),
                "storeAnalysis": gate_store_analysis_for_free_tier(
                    store_analysis, current_user
                ),
            }

        # Strategy 2: HTML scraping fallback — no overlap gain (scrape blocks).
        source = "html_scrape"
        t_phase = time.perf_counter()
        html_result = await _try_html_scraping(origin, url)
        timings["html_scrape_fallback_s"] = round((time.perf_counter() - t_phase) , 3)
        products = html_result["products"]
        store_analysis = None
        if products and current_user is not None:
            t_phase = time.perf_counter()
            store_analysis = await _run_store_wide_analysis(
                domain, products[0]["url"], current_user.id, db, force=False
            )
            timings["store_wide_analysis_s"] = round(
                (time.perf_counter() - t_phase) , 3
            )
        # Best-effort count fetch; non-Shopify stores often lack the sitemap
        # path so this typically yields None and falls back to the "?" UI badge.
        t_phase = time.perf_counter()
        product_count = await fetch_product_count(origin) if products else None
        timings["product_count_s"] = round((time.perf_counter() - t_phase) , 3)
        t_phase = time.perf_counter()
        store_id = _persist_store_and_products(
            db, domain, html_result["storeName"], products, product_count
        )
        timings["db_persist_s"] = round((time.perf_counter() - t_phase) , 3)

        timings["total_s"] = round((time.perf_counter() - t_total) , 3)
        logger.info(
            "scan_timings discover_products source=%s domain=%s total_s=%s timings=%s",
            source, domain, timings["total_s"], timings,
            extra={
                "event": "scan_timings",
                "scope": "discover_products",
                "source": source,
                "domain": domain,
                "user_id": str(current_user.id) if current_user else None,
                "url": url,
                "products_found": len(products),
                "timings_s": timings,
            },
        )

        return {
            **html_result,
            "storeId": store_id,
            "productCount": product_count,
            "currentPage": 1,
            "totalPages": total_pages_for(product_count),
            "canPaginate": can_paginate(current_user),
            "storeAnalysis": gate_store_analysis_for_free_tier(
                store_analysis, current_user
            ),
        }

    except Exception:
        timings["total_s"] = round((time.perf_counter() - t_total) , 3)
        logger.exception(
            "Discover products error source=%s total_s=%s timings=%s",
            source, timings["total_s"], timings,
        )
        return JSONResponse(
            status_code=400,
            content={"error": "Could not fetch that URL. Make sure it's accessible."},
        )
