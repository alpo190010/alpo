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
from app.services.page_renderer import render_page
from app.services.accessibility_scanner import run_axe_scan
from app.services.page_speed_api import fetch_pagespeed_insights
from app.services.ai_discoverability_api import fetch_ai_discoverability_data
from app.services.checkout_detector import detect_checkout
from app.services.shipping_detector import detect_shipping
from app.services.trust_detector import detect_trust
from app.services.social_commerce_detector import detect_social_commerce
from app.services.accessibility_detector import detect_accessibility
from app.services.ai_discoverability_detector import detect_ai_discoverability
from app.services.page_speed_detector import detect_page_speed
from app.services.checkout_rubric import score_checkout, get_checkout_tips
from app.services.shipping_rubric import score_shipping, get_shipping_tips
from app.services.trust_rubric import score_trust, get_trust_tips
from app.services.social_commerce_rubric import score_social_commerce, get_social_commerce_tips
from app.services.accessibility_rubric import score_accessibility, get_accessibility_tips
from app.services.ai_discoverability_rubric import score_ai_discoverability, get_ai_discoverability_tips
from app.services.page_speed_rubric import score_page_speed, get_page_speed_tips
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


async def _try_shopify_json(
    origin: str,
) -> list[dict]:
    """Fetch /products.json and return list of {url, slug, image}."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{origin}/products.json?limit=20",
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
        if len(products) >= 20:
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
) -> str | None:
    """Upsert store, replace products, return storeId or None on failure."""
    try:
        stmt = (
            pg_insert(Store)
            .values(domain=domain, name=store_name or None)
            .on_conflict_do_update(
                index_elements=["domain"],
                set_={"name": store_name or None, "updated_at": func.now()},
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
        "checkout": {
            "hasAcceleratedCheckout": co_signals.has_accelerated_checkout,
            "hasDynamicCheckoutButton": co_signals.has_dynamic_checkout_button,
            "hasPaypal": co_signals.has_paypal,
            "hasKlarna": co_signals.has_klarna,
            "hasAfterpay": co_signals.has_afterpay,
            "hasAffirm": co_signals.has_affirm,
            "hasSezzle": co_signals.has_sezzle,
            "paymentMethodCount": co_signals.payment_method_count,
            "hasDrawerCart": co_signals.has_drawer_cart,
            "hasAjaxCart": co_signals.has_ajax_cart,
            "hasStickyCheckout": co_signals.has_sticky_checkout,
        },
        "shipping": {
            "hasFreeShipping": sh_signals.has_free_shipping,
            "hasFreeShippingThreshold": sh_signals.has_free_shipping_threshold,
            "freeShippingThresholdValue": sh_signals.free_shipping_threshold_value,
            "hasDeliveryDate": sh_signals.has_delivery_date,
            "hasDeliveryEstimate": sh_signals.has_delivery_estimate,
            "hasEddApp": sh_signals.has_edd_app,
            "hasShippingCostShown": sh_signals.has_shipping_cost_shown,
            "hasShippingInStructuredData": sh_signals.has_shipping_in_structured_data,
            "hasShippingPolicyLink": sh_signals.has_shipping_policy_link,
            "hasReturnsMentioned": sh_signals.has_returns_mentioned,
        },
        "trust": {
            "trustBadgeApp": tr_signals.trust_badge_app,
            "trustBadgeCount": tr_signals.trust_badge_count,
            "hasPaymentIcons": tr_signals.has_payment_icons,
            "hasMoneyBackGuarantee": tr_signals.has_money_back_guarantee,
            "hasReturnPolicy": tr_signals.has_return_policy,
            "hasFreeShippingBadge": tr_signals.has_free_shipping_badge,
            "hasSecureCheckoutText": tr_signals.has_secure_checkout_text,
            "hasSecurityBadge": tr_signals.has_security_badge,
            "hasSafeCheckoutBadge": tr_signals.has_safe_checkout_badge,
            "hasLiveChat": tr_signals.has_live_chat,
            "hasPhoneNumber": tr_signals.has_phone_number,
            "hasContactEmail": tr_signals.has_contact_email,
            "hasTrustNearAtc": tr_signals.has_trust_near_atc,
            "trustElementCount": tr_signals.trust_element_count,
        },
        "socialCommerce": {
            "hasInstagramEmbed": sc_signals.has_instagram_embed,
            "hasTiktokEmbed": sc_signals.has_tiktok_embed,
            "hasPinterest": sc_signals.has_pinterest,
            "hasUgcGallery": sc_signals.has_ugc_gallery,
            "ugcGalleryApp": sc_signals.ugc_gallery_app,
            "platformCount": sc_signals.platform_count,
        },
        "accessibility": {
            "contrastViolations": ac_signals.contrast_violations,
            "altTextViolations": ac_signals.alt_text_violations,
            "formLabelViolations": ac_signals.form_label_violations,
            "emptyLinkViolations": ac_signals.empty_link_violations,
            "emptyButtonViolations": ac_signals.empty_button_violations,
            "documentLanguageViolations": ac_signals.document_language_violations,
            "totalViolations": ac_signals.total_violations,
            "totalNodesAffected": ac_signals.total_nodes_affected,
            "criticalCount": ac_signals.critical_count,
            "seriousCount": ac_signals.serious_count,
            "moderateCount": ac_signals.moderate_count,
            "minorCount": ac_signals.minor_count,
            "scanCompleted": ac_signals.scan_completed,
        },
        "aiDiscoverability": {
            "robotsTxtExists": ad_signals.robots_txt_exists,
            "aiSearchBotsAllowedCount": ad_signals.ai_search_bots_allowed_count,
            "aiTrainingBotsBlockedCount": ad_signals.ai_training_bots_blocked_count,
            "hasOaiSearchbotAllowed": ad_signals.has_oai_searchbot_allowed,
            "hasPerplexitybotAllowed": ad_signals.has_perplexitybot_allowed,
            "hasClaudeSearchbotAllowed": ad_signals.has_claude_searchbot_allowed,
            "hasWildcardBlock": ad_signals.has_wildcard_block,
            "llmsTxtExists": ad_signals.llms_txt_exists,
            "hasOgType": ad_signals.has_og_type,
            "hasOgTitle": ad_signals.has_og_title,
            "hasOgDescription": ad_signals.has_og_description,
            "hasOgImage": ad_signals.has_og_image,
            "hasProductPriceAmount": ad_signals.has_product_price_amount,
            "hasProductPriceCurrency": ad_signals.has_product_price_currency,
            "ogTagCount": ad_signals.og_tag_count,
            "hasStructuredSpecs": ad_signals.has_structured_specs,
            "hasSpecTable": ad_signals.has_spec_table,
            "hasFaqContent": ad_signals.has_faq_content,
            "specMentionCount": ad_signals.spec_mention_count,
            "hasMeasurementUnits": ad_signals.has_measurement_units,
            "entityDensityScore": round(ad_signals.entity_density_score, 3),
        },
        "pageSpeed": {
            "scriptCount": ps_signals.script_count,
            "thirdPartyScriptCount": ps_signals.third_party_script_count,
            "renderBlockingScriptCount": ps_signals.render_blocking_script_count,
            "appScriptCount": ps_signals.app_script_count,
            "hasLazyLoading": ps_signals.has_lazy_loading,
            "lcpImageLazyLoaded": ps_signals.lcp_image_lazy_loaded,
            "hasExplicitImageDimensions": ps_signals.has_explicit_image_dimensions,
            "hasModernImageFormats": ps_signals.has_modern_image_formats,
            "hasFontDisplaySwap": ps_signals.has_font_display_swap,
            "hasPreconnectHints": ps_signals.has_preconnect_hints,
            "hasDnsPrefetch": ps_signals.has_dns_prefetch,
            "hasHeroPreload": ps_signals.has_hero_preload,
            "inlineCssKb": ps_signals.inline_css_kb,
            "detectedTheme": ps_signals.detected_theme,
            "performanceScore": ps_signals.performance_score,
            "lcpMs": ps_signals.lcp_ms,
            "clsValue": ps_signals.cls_value,
            "tbtMs": ps_signals.tbt_ms,
            "fcpMs": ps_signals.fcp_ms,
            "speedIndexMs": ps_signals.speed_index_ms,
            "hasFieldData": ps_signals.has_field_data,
            "fieldLcpMs": ps_signals.field_lcp_ms,
            "fieldClsValue": ps_signals.field_cls_value,
        },
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
) -> dict | None:
    """Run 7 store-wide detectors on one product page and persist a StoreAnalysis row.

    When ``force`` is False (default), reuses a cached StoreAnalysis row if one exists
    for (domain, user_id) and is fresher than _STORE_CACHE_TTL_DAYS — skipping all
    detectors and external API calls (axe, PSI, AI discoverability).

    Returns a dict with score/categories/tips/signals/analyzedUrl/updatedAt, or None
    on failure. Product discovery never fails due to store analysis errors — all
    exceptions are caught.
    """
    # --- Cache lookup (skipped when caller forces a refresh) ---
    if not force:
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
        coros: list = [
            render_page(product_url),
            run_axe_scan(product_url),
            fetch_ai_discoverability_data(product_url),
        ]
        has_psi = bool(settings.google_pagespeed_api_key)
        if has_psi:
            coros.append(
                fetch_pagespeed_insights(product_url, settings.google_pagespeed_api_key)
            )

        results = await asyncio.gather(*coros, return_exceptions=True)

        # Unpack HTML (required — can't run detectors without it)
        html_result = results[0]
        if isinstance(html_result, Exception):
            logger.warning(
                "Store analysis: render_page failed for %s: %s", product_url, html_result
            )
            return None
        html = html_result

        # Unpack axe scan (graceful degradation)
        axe_results = None
        if isinstance(results[1], Exception):
            logger.warning(
                "Store analysis: axe scan failed for %s: %s", product_url, results[1]
            )
        else:
            axe_results = results[1]

        # Unpack AI discoverability data (graceful degradation)
        ai_disc_data = None
        if isinstance(results[2], Exception):
            logger.warning(
                "Store analysis: AI discoverability fetch failed for %s: %s",
                product_url, results[2],
            )
        else:
            ai_disc_data = results[2]

        # Unpack optional PSI data (graceful degradation)
        psi_data = None
        if has_psi and len(results) > 3:
            if isinstance(results[3], Exception):
                logger.warning(
                    "Store analysis: PSI API failed for %s: %s", product_url, results[3]
                )
            else:
                psi_data = results[3]

        # --- Run 7 detect → score → tips chains ---
        co_signals = detect_checkout(html)
        co_score = score_checkout(co_signals)
        co_tips = get_checkout_tips(co_signals)

        sh_signals = detect_shipping(html)
        sh_score = score_shipping(sh_signals)
        sh_tips = get_shipping_tips(sh_signals)

        tr_signals = detect_trust(html)
        tr_score = score_trust(tr_signals)
        tr_tips = get_trust_tips(tr_signals)

        sc_signals = detect_social_commerce(html)
        sc_score = score_social_commerce(sc_signals)
        sc_tips = get_social_commerce_tips(sc_signals)

        ac_signals = detect_accessibility(html, axe_results)
        ac_score = score_accessibility(ac_signals)
        ac_tips = get_accessibility_tips(ac_signals)

        ad_signals = detect_ai_discoverability(html, ai_disc_data)
        ad_score = score_ai_discoverability(ad_signals)
        ad_tips = get_ai_discoverability_tips(ad_signals)

        ps_signals = detect_page_speed(html, psi_data)
        ps_score = score_page_speed(ps_signals)
        ps_tips = get_page_speed_tips(ps_signals)

        # --- Build results ---
        categories = {
            "checkout": co_score,
            "shipping": sh_score,
            "trust": tr_score,
            "socialCommerce": sc_score,
            "accessibility": ac_score,
            "aiDiscoverability": ad_score,
            "pageSpeed": ps_score,
        }

        score = _compute_store_wide_score(categories)
        tips_by_dim: dict[str, list[str]] = {
            "checkout": co_tips,
            "shipping": sh_tips,
            "trust": tr_tips,
            "socialCommerce": sc_tips,
            "accessibility": ac_tips,
            "aiDiscoverability": ad_tips,
            "pageSpeed": ps_tips,
        }
        signals = _serialize_store_signals(
            co_signals, sh_signals, tr_signals, sc_signals,
            ac_signals, ad_signals, ps_signals,
        )

        # --- Upsert StoreAnalysis row ---
        updated_at_iso: str | None = None
        try:
            stmt = (
                pg_insert(StoreAnalysis)
                .values(
                    store_domain=domain,
                    user_id=user_id,
                    score=score,
                    categories=categories,
                    tips=tips_by_dim,
                    signals=signals,
                    analyzed_url=product_url,
                )
                .on_conflict_do_update(
                    constraint="uq_store_analyses_domain_user",
                    set_={
                        "score": score,
                        "categories": categories,
                        "tips": tips_by_dim,
                        "signals": signals,
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
                "StoreAnalysis DB upsert error for domain=%s user_id=%s", domain, user_id
            )
            try:
                db.rollback()
            except Exception:
                pass

        return {
            "score": score,
            "categories": categories,
            "tips": tips_by_dim,
            "signals": signals,
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
    try:
        # SSRF-safe URL validation via shared validator
        url, error = validate_url(body.url)
        if error:
            return JSONResponse(
                status_code=400, content={"error": error}
            )

        origin, domain = _parse_url(url)

        # Strategy 1: Shopify JSON
        json_products = await _try_shopify_json(origin)
        if json_products:
            store_name = await _fetch_page_title(origin)
            store_id = _persist_store_and_products(db, domain, store_name, json_products)

            # Store-wide analysis is kicked off by the frontend after products load,
            # so the discovery response returns as fast as possible.
            return {
                "products": json_products[:20],
                "storeName": store_name,
                "isProductPage": False,
                "storeId": store_id,
            }

        # Strategy 2: HTML scraping fallback
        html_result = await _try_html_scraping(origin, url)
        store_id = _persist_store_and_products(
            db, domain, html_result["storeName"], html_result["products"]
        )

        return {**html_result, "storeId": store_id}

    except Exception:
        logger.exception("Discover products error")
        return JSONResponse(
            status_code=400,
            content={"error": "Could not fetch that URL. Make sure it's accessible."},
        )
