"""POST /analyze endpoint ��� URL validation, AI scoring, DB persistence."""

import asyncio
import logging
import time
import urllib.parse
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.auth import get_current_user_optional, get_current_user_required
from app.config import settings
from app.database import get_db
from app.models import ProductAnalysis, Scan, StoreAnalysis, User
from app.services.entitlement import get_credits_limit, has_credits_remaining, increment_credits
from app.services.page_renderer import render_page, measure_mobile_cta
# AI call removed — all scoring is deterministic
# from app.services.openrouter import call_openrouter
from app.services.scoring import STORE_WIDE_KEYS, build_category_scores, compute_weighted_score
from app.services.social_proof_detector import detect_social_proof
from app.services.social_proof_rubric import score_social_proof, get_social_proof_tips
from app.services.structured_data_detector import detect_structured_data
from app.services.price_extractor import extract_price
from app.services.structured_data_rubric import score_structured_data, get_structured_data_tips
from app.services.checkout_detector import detect_checkout
from app.services.checkout_rubric import score_checkout, get_checkout_tips
from app.services.pricing_detector import detect_pricing
from app.services.pricing_rubric import score_pricing, get_pricing_tips
from app.services.images_detector import detect_images
from app.services.images_rubric import score_images, get_images_tips
from app.services.title_detector import detect_title
from app.services.title_rubric import score_title, get_title_tips
from app.services.shipping_detector import detect_shipping
from app.services.shipping_rubric import score_shipping, get_shipping_tips
from app.services.description_detector import detect_description
from app.services.description_rubric import score_description, get_description_tips
from app.services.trust_detector import detect_trust
from app.services.trust_rubric import score_trust, get_trust_tips
from app.services.mobile_cta_detector import detect_mobile_cta
from app.services.mobile_cta_rubric import score_mobile_cta, get_mobile_cta_tips
from app.services.page_speed_api import fetch_pagespeed_insights
from app.services.page_speed_detector import detect_page_speed
from app.services.page_speed_rubric import score_page_speed, get_page_speed_tips
from app.services.cross_sell_detector import detect_cross_sell
from app.services.cross_sell_rubric import score_cross_sell, get_cross_sell_tips
from app.services.variant_ux_detector import detect_variant_ux
from app.services.variant_ux_rubric import score_variant_ux, get_variant_ux_tips
from app.services.size_guide_detector import detect_size_guide
from app.services.size_guide_rubric import score_size_guide, get_size_guide_tips
from app.services.ai_discoverability_api import fetch_ai_discoverability_data
from app.services.ai_discoverability_detector import detect_ai_discoverability
from app.services.ai_discoverability_rubric import score_ai_discoverability, get_ai_discoverability_tips
from app.services.content_freshness_api import fetch_content_freshness_data
from app.services.content_freshness_detector import detect_content_freshness
from app.services.content_freshness_rubric import score_content_freshness, get_content_freshness_tips
from app.services.accessibility_scanner import run_axe_scan
from app.services.accessibility_detector import detect_accessibility
from app.services.accessibility_rubric import score_accessibility, get_accessibility_tips
from app.services.social_commerce_detector import detect_social_commerce, SocialCommerceSignals
from app.services.social_commerce_rubric import score_social_commerce, get_social_commerce_tips
from app.services.url_validator import validate_url
from app.services.scan_dedup import try_acquire_scan, release_scan

from app.rate_limit import limiter, get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter()


def _run_chain(detect_fn, score_fn, tips_fn, *args):
    """Run a detect → score → tips chain, returning (signals, score, tips, timing_ms).

    This is a sync function — ``asyncio.to_thread`` runs it in the default
    thread-pool executor so all 11 product-level (or 7 store-wide) chains
    execute concurrently instead of sequentially.
    """
    t0 = time.perf_counter()
    signals = detect_fn(*args)
    score = score_fn(signals)
    tips = tips_fn(signals)
    elapsed = round((time.perf_counter() - t0) * 1000, 1)
    return signals, score, tips, elapsed


class AnalyzeRequest(BaseModel):
    url: str = Field(..., min_length=1)


@router.get("/analysis")
def get_cached_analysis(
    url: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Return a previously-stored analysis for *url*, or 404.

    Requires authentication — unauthenticated requests receive 401.
    Only returns analyses owned by the authenticated user (R012).
    """
    row = (
        db.query(ProductAnalysis)
        .filter(ProductAnalysis.product_url == url)
        .filter(ProductAnalysis.user_id == current_user.id)
        .first()
    )
    if not row:
        return JSONResponse(status_code=404, content={"error": "No cached analysis"})
    return {
        "score": row.score,
        "summary": row.summary,
        "tips": row.tips,
        "categories": row.categories,
        "productPrice": row.product_price,
        "productCategory": row.product_category,
        "signals": row.signals,
        "analysisId": str(row.id),
    }


def _anon_rate_limit_key(request: Request) -> str:
    """Return real IP for anonymous requests; fixed high-ceiling bucket for authenticated.

    Authenticated users send an Authorization header via authFetch. They share a
    single bucket keyed "authenticated:bypass" which will never hit the 3/day
    ceiling. Anonymous users get a per-IP bucket like "anon:203.0.113.42".
    """
    if request.headers.get("authorization"):
        return "authenticated:bypass"
    return f"anon:{get_client_ip(request)}"


@router.post("/analyze")
@limiter.limit("5/minute")
@limiter.limit("3/day", key_func=_anon_rate_limit_key)
async def analyze(
    request: Request,
    body: AnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    # --- URL validation via shared SSRF-safe validator ---
    url, error = validate_url(body.url)
    if error:
        return JSONResponse(status_code=400, content={"error": error})

    parsed_url = urllib.parse.urlparse(url)

    # --- Credit check (only for authenticated users) ---
    if current_user and not has_credits_remaining(current_user):
        return JSONResponse(
            status_code=403,
            content={
                "error": "Credit limit reached",
                "plan": current_user.plan_tier,
                "creditsUsed": current_user.credits_used,
                "creditsLimit": get_credits_limit(current_user.plan_tier),
            },
        )

    # --- Scan dedup (authenticated users only, per D091) ---
    if current_user:
        if not try_acquire_scan(url, str(current_user.id)):
            return JSONResponse(
                status_code=409,
                content={"error": "A scan for this URL is already in progress"},
            )

    # Track whether we acquired the dedup lock so we can release it on all paths
    _dedup_acquired = bool(current_user)

    timings: dict[str, float] = {}
    t_start = time.perf_counter()

    try:
        return await _do_analyze(request, url, parsed_url, db, current_user, timings, t_start)
    finally:
        if _dedup_acquired and current_user:
            release_scan(url, str(current_user.id))


async def _do_analyze(
    request: Request,
    url: str,
    parsed_url,
    db: Session,
    current_user: User | None,
    timings: dict[str, float],
    t_start: float,
):
    """Inner implementation of /analyze — extracted for try/finally dedup release."""

    # --- StoreAnalysis cache lookup (authenticated users only) ---
    store_cache = None
    if current_user is not None:
        try:
            cache_row = (
                db.query(StoreAnalysis)
                .filter(StoreAnalysis.store_domain == parsed_url.hostname)
                .filter(StoreAnalysis.user_id == current_user.id)
                .first()
            )
            if cache_row is not None:
                cache_updated = cache_row.updated_at
                # Handle timezone-naive Postgres timestamps
                if cache_updated is not None and cache_updated.tzinfo is None:
                    cache_updated = cache_updated.replace(tzinfo=timezone.utc)
                if cache_updated is not None and (datetime.now(timezone.utc) - cache_updated) < timedelta(days=7):
                    store_cache = cache_row
                    logger.info("StoreAnalysis cache HIT for %s (user %s)", parsed_url.hostname, current_user.id)
                else:
                    logger.info("StoreAnalysis cache STALE for %s (user %s)", parsed_url.hostname, current_user.id)
            else:
                logger.info("StoreAnalysis cache MISS for %s (user %s)", parsed_url.hostname, current_user.id)
        except Exception:
            logger.exception("StoreAnalysis cache lookup failed — falling back to full analysis")

    # --- Fetch HTML + mobile CTA measurement + optional async API calls (in parallel) ---
    t0 = time.perf_counter()
    if store_cache is not None:
        # Cache hit: skip run_axe_scan, fetch_ai_discoverability_data, fetch_pagespeed_insights
        coros: list = [render_page(url), measure_mobile_cta(url), fetch_content_freshness_data(url)]
    else:
        coros: list = [render_page(url), measure_mobile_cta(url), fetch_ai_discoverability_data(url), fetch_content_freshness_data(url), run_axe_scan(url)]
    has_psi = bool(settings.google_pagespeed_api_key)
    if has_psi and store_cache is None:
        coros.append(
            fetch_pagespeed_insights(url, settings.google_pagespeed_api_key)
        )

    results = await asyncio.gather(*coros, return_exceptions=True)

    # Unpack HTML result
    html_result = results[0]
    if isinstance(html_result, Exception):
        logger.exception("Failed to render page %s: %s", url, html_result)
        return JSONResponse(
            status_code=400,
            content={
                "error": "Could not fetch that URL. Make sure it's accessible and not behind a login."
            },
        )
    html = html_result
    timings["pageRender"] = round((time.perf_counter() - t0) * 1000, 1)

    # Unpack mobile CTA measurements (graceful degradation)
    mobile_measurements = None
    mobile_result = results[1]
    if isinstance(mobile_result, Exception):
        logger.warning("Mobile CTA measurement failed for %s: %s", url, mobile_result)
    else:
        mobile_measurements = mobile_result

    if store_cache is not None:
        # Cache hit path: coros = [render_page, measure_mobile_cta, fetch_content_freshness_data]
        ai_disc_data = None
        cf_data = None
        cf_result = results[2]
        if isinstance(cf_result, Exception):
            logger.warning("Content freshness fetch failed for %s: %s", url, cf_result)
        else:
            cf_data = cf_result
        axe_results = None
        psi_data = None
    else:
        # Cache miss path: coros = [render_page, measure_mobile_cta, fetch_ai_discoverability_data, fetch_content_freshness_data, run_axe_scan, (optional PSI)]
        # Unpack AI discoverability data (robots.txt + llms.txt)
        ai_disc_data = None
        ai_disc_result = results[2]
        if isinstance(ai_disc_result, Exception):
            logger.warning("AI discoverability fetch failed for %s: %s", url, ai_disc_result)
        else:
            ai_disc_data = ai_disc_result

        # Unpack Content Freshness data (Last-Modified header)
        cf_data = None
        cf_result = results[3]
        if isinstance(cf_result, Exception):
            logger.warning("Content freshness fetch failed for %s: %s", url, cf_result)
        else:
            cf_data = cf_result

        # Unpack axe-core scan results
        axe_results = None
        axe_result = results[4]
        if isinstance(axe_result, Exception):
            logger.warning("Axe scan failed for %s: %s", url, axe_result)
        else:
            axe_results = axe_result

        # Unpack optional PSI result
        psi_data = None
        if has_psi and len(results) > 5:
            psi_result = results[5]
            if isinstance(psi_result, Exception):
                logger.warning("PSI API failed for %s: %s", url, psi_result)
            else:
                psi_data = psi_result

    if len(html) < 100:
        return JSONResponse(
            status_code=400,
            content={"error": "Page appears to be empty or too small to analyze."},
        )

    # ---- Product-level detectors (run concurrently via asyncio.gather) ----

    (
        (sp_signals_obj, sp_score, sp_tips, t_sp),
        (sd_signals, sd_score, sd_tips, t_sd),
        (pr_signals, pr_score, pr_tips, t_pr),
        (im_signals, im_score, im_tips, t_im),
        (ti_signals, ti_score, ti_tips, t_ti),
        (de_signals, de_score, de_tips, t_de),
        (mc_signals, mc_score, mc_tips, t_mc),
        (cs_signals, cs_score, cs_tips, t_cs),
        (vu_signals, vu_score, vu_tips, t_vu),
        (sg_signals, sg_score, sg_tips, t_sg),
        (cf_signals, cf_score, cf_tips, t_cf),
    ) = await asyncio.gather(
        asyncio.to_thread(_run_chain, detect_social_proof, score_social_proof, get_social_proof_tips, html),
        asyncio.to_thread(_run_chain, detect_structured_data, score_structured_data, get_structured_data_tips, html),
        asyncio.to_thread(_run_chain, detect_pricing, score_pricing, get_pricing_tips, html),
        asyncio.to_thread(_run_chain, detect_images, score_images, get_images_tips, html),
        asyncio.to_thread(_run_chain, detect_title, score_title, get_title_tips, html),
        asyncio.to_thread(_run_chain, detect_description, score_description, get_description_tips, html),
        asyncio.to_thread(_run_chain, detect_mobile_cta, score_mobile_cta, get_mobile_cta_tips, html, mobile_measurements),
        asyncio.to_thread(_run_chain, detect_cross_sell, score_cross_sell, get_cross_sell_tips, html),
        asyncio.to_thread(_run_chain, detect_variant_ux, score_variant_ux, get_variant_ux_tips, html),
        asyncio.to_thread(_run_chain, detect_size_guide, score_size_guide, get_size_guide_tips, html, None),
        asyncio.to_thread(_run_chain, detect_content_freshness, score_content_freshness, get_content_freshness_tips, html, cf_data),
    )

    timings["socialProof"] = t_sp
    timings["structuredData"] = t_sd
    timings["pricing"] = t_pr
    timings["images"] = t_im
    timings["title"] = t_ti
    timings["description"] = t_de
    timings["mobileCta"] = t_mc
    timings["crossSell"] = t_cs
    timings["variantUx"] = t_vu
    timings["sizeGuide"] = t_sg
    timings["contentFreshness"] = t_cf

    # ---- Store-wide detectors: from cache or fresh computation ----
    if store_cache is not None:
        _cached_cats = store_cache.categories or {}
        _cached_tips = store_cache.tips or {}
        _cached_sigs = store_cache.signals or {}

        co_score = _cached_cats.get("checkout", 0)
        co_tips = _cached_tips.get("checkout", [])
        sh_score = _cached_cats.get("shipping", 0)
        sh_tips = _cached_tips.get("shipping", [])
        tr_score = _cached_cats.get("trust", 0)
        tr_tips = _cached_tips.get("trust", [])
        ps_score = _cached_cats.get("pageSpeed", 0)
        ps_tips = _cached_tips.get("pageSpeed", [])
        ad_score = _cached_cats.get("aiDiscoverability", 0)
        ad_tips = _cached_tips.get("aiDiscoverability", [])
        ac_score = _cached_cats.get("accessibility", 0)
        ac_tips = _cached_tips.get("accessibility", [])
        sc_score = _cached_cats.get("socialCommerce", 0)
        sc_tips = _cached_tips.get("socialCommerce", [])

        for _sw_key in STORE_WIDE_KEYS:
            timings[_sw_key] = 0
    else:
        (
            (co_signals, co_score, co_tips, t_co),
            (sh_signals, sh_score, sh_tips, t_sh),
            (tr_signals, tr_score, tr_tips, t_tr),
            (ps_signals, ps_score, ps_tips, t_ps),
            (ad_signals, ad_score, ad_tips, t_ad),
            (ac_signals, ac_score, ac_tips, t_ac),
            (sc_signals, sc_score, sc_tips, t_sc),
        ) = await asyncio.gather(
            asyncio.to_thread(_run_chain, detect_checkout, score_checkout, get_checkout_tips, html),
            asyncio.to_thread(_run_chain, detect_shipping, score_shipping, get_shipping_tips, html),
            asyncio.to_thread(_run_chain, detect_trust, score_trust, get_trust_tips, html),
            asyncio.to_thread(_run_chain, detect_page_speed, score_page_speed, get_page_speed_tips, html, psi_data),
            asyncio.to_thread(_run_chain, detect_ai_discoverability, score_ai_discoverability, get_ai_discoverability_tips, html, ai_disc_data),
            asyncio.to_thread(_run_chain, detect_accessibility, score_accessibility, get_accessibility_tips, html, axe_results),
            asyncio.to_thread(_run_chain, detect_social_commerce, score_social_commerce, get_social_commerce_tips, html),
        )

        timings["checkout"] = t_co
        timings["shipping"] = t_sh
        timings["trust"] = t_tr
        timings["pageSpeed"] = t_ps
        timings["aiDiscoverability"] = t_ad
        timings["accessibility"] = t_ac
        timings["socialCommerce"] = t_sc

    # ---- Build unified response (all 18 dimensions) ----
    categories = {
        "title": ti_score,
        "description": de_score,
        "images": im_score,
        "pricing": pr_score,
        "mobileCta": mc_score,
        "trust": tr_score,
        "pageSpeed": ps_score,
        "structuredData": sd_score,
        "crossSell": cs_score,
        "variantUx": vu_score,
        "sizeGuide": sg_score,
        "socialCommerce": sc_score,
        "accessibility": ac_score,
        "contentFreshness": cf_score,
        "checkout": co_score,
        "aiDiscoverability": ad_score,
        "shipping": sh_score,
        "socialProof": sp_score,
    }

    # Overall score = weighted average across all dimensions
    overall_score = compute_weighted_score(categories)

    all_tips = sp_tips + sd_tips + co_tips + pr_tips + im_tips + ti_tips + sh_tips + de_tips + tr_tips + ps_tips + mc_tips + cs_tips + vu_tips + sg_tips + ad_tips + cf_tips + ac_tips + sc_tips

    timings["total"] = round((time.perf_counter() - t_start) * 1000, 1)

    # Product-level signals (always built from fresh detector objects)
    _product_signals: dict = {
        "socialProof": {
            "reviewApp": sp_signals_obj.review_app,
            "starRating": sp_signals_obj.star_rating,
            "reviewCount": sp_signals_obj.review_count,
            "hasPhotoReviews": sp_signals_obj.has_photo_reviews,
            "hasVideoReviews": sp_signals_obj.has_video_reviews,
            "starRatingAboveFold": sp_signals_obj.star_rating_above_fold,
            "hasReviewFiltering": sp_signals_obj.has_review_filtering,
        },
        "structuredData": {
            "hasProductSchema": sd_signals.has_product_schema,
            "hasName": sd_signals.has_name,
            "hasImage": sd_signals.has_image,
            "hasDescription": sd_signals.has_description,
            "hasOffers": sd_signals.has_offers,
            "hasPrice": sd_signals.has_price,
            "hasPriceCurrency": sd_signals.has_price_currency,
            "hasAvailability": sd_signals.has_availability,
            "hasBrand": sd_signals.has_brand,
            "hasSku": sd_signals.has_sku,
            "hasGtin": sd_signals.has_gtin,
            "hasAggregateRating": sd_signals.has_aggregate_rating,
            "hasPriceValidUntil": sd_signals.has_price_valid_until,
            "hasShippingDetails": sd_signals.has_shipping_details,
            "hasReturnPolicy": sd_signals.has_return_policy,
            "hasBreadcrumbList": sd_signals.has_breadcrumb_list,
            "hasOrganization": sd_signals.has_organization,
            "hasMissingBrand": sd_signals.has_missing_brand,
            "hasCurrencyInPrice": sd_signals.has_currency_in_price,
            "hasInvalidAvailability": sd_signals.has_invalid_availability,
            "jsonParseErrors": sd_signals.json_parse_errors,
            "duplicateProductCount": sd_signals.duplicate_product_count,
        },
        "pricing": {
            "hasCompareAtPrice": pr_signals.has_compare_at_price,
            "hasStrikethroughPrice": pr_signals.has_strikethrough_price,
            "priceValue": pr_signals.price_value,
            "hasCharmPricing": pr_signals.has_charm_pricing,
            "isRoundPrice": pr_signals.is_round_price,
            "hasCountdownTimer": pr_signals.has_countdown_timer,
            "hasScarcityMessaging": pr_signals.has_scarcity_messaging,
            "hasFakeTimerRisk": pr_signals.has_fake_timer_risk,
            "hasKlarnaPlacement": pr_signals.has_klarna_placement,
            "hasAfterPayBadge": pr_signals.has_afterpay_badge,
            "hasShopPayInstallments": pr_signals.has_shop_pay_installments,
            "hasBnplNearPrice": pr_signals.has_bnpl_near_price,
        },
        "images": {
            "imageCount": im_signals.image_count,
            "hasVideo": im_signals.has_video,
            "has360View": im_signals.has_360_view,
            "hasZoom": im_signals.has_zoom,
            "hasLifestyleImages": im_signals.has_lifestyle_images,
            "cdnHosted": im_signals.cdn_hosted,
            "hasModernFormat": im_signals.has_modern_format,
            "hasHighRes": im_signals.has_high_res,
            "altTextScore": im_signals.alt_text_score,
        },
        "title": {
            "h1Text": ti_signals.h1_text,
            "metaTitle": ti_signals.meta_title,
            "brandName": ti_signals.brand_name,
            "h1Count": ti_signals.h1_count,
            "h1Length": ti_signals.h1_length,
            "metaTitleLength": ti_signals.meta_title_length,
            "hasH1": ti_signals.has_h1,
            "hasSingleH1": ti_signals.has_single_h1,
            "hasBrandInTitle": ti_signals.has_brand_in_title,
            "hasKeywordStuffing": ti_signals.has_keyword_stuffing,
            "isAllCaps": ti_signals.is_all_caps,
            "hasPromotionalText": ti_signals.has_promotional_text,
            "h1MetaDiffer": ti_signals.h1_meta_differ,
            "hasSpecifics": ti_signals.has_specifics,
        },
        "description": {
            "descriptionFound": de_signals.description_found,
            "wordCount": de_signals.word_count,
            "fleschKincaidGrade": de_signals.flesch_kincaid_grade,
            "avgSentenceLength": de_signals.avg_sentence_length,
            "sentenceCount": de_signals.sentence_count,
            "benefitRatio": de_signals.benefit_ratio,
            "benefitWordCount": de_signals.benefit_word_count,
            "featureWordCount": de_signals.feature_word_count,
            "emotionalDensity": de_signals.emotional_density,
            "htmlTagVariety": de_signals.html_tag_variety,
            "hasHeadings": de_signals.has_headings,
            "hasBulletLists": de_signals.has_bullet_lists,
            "hasEmphasis": de_signals.has_emphasis,
        },
        "mobileCta": {
            "ctaFound": mc_signals.cta_found,
            "ctaText": mc_signals.cta_text,
            "ctaCount": mc_signals.cta_count,
            "ctaSelectorMatched": mc_signals.cta_selector_matched,
            "hasViewportMeta": mc_signals.has_viewport_meta,
            "hasResponsiveMeta": mc_signals.has_responsive_meta,
            "hasStickyClass": mc_signals.has_sticky_class,
            "hasStickyApp": mc_signals.has_sticky_app,
            "buttonWidthPx": mc_signals.button_width_px,
            "buttonHeightPx": mc_signals.button_height_px,
            "meetsMin44px": mc_signals.meets_min_44px,
            "meetsOptimal60_72px": mc_signals.meets_optimal_60_72px,
            "aboveFold": mc_signals.above_fold,
            "isSticky": mc_signals.is_sticky,
            "inThumbZone": mc_signals.in_thumb_zone,
            "isFullWidth": mc_signals.is_full_width,
        },
        "crossSell": {
            "crossSellApp": cs_signals.cross_sell_app,
            "hasCrossSellSection": cs_signals.has_cross_sell_section,
            "widgetType": cs_signals.widget_type,
            "productCount": cs_signals.product_count,
            "hasBundlePricing": cs_signals.has_bundle_pricing,
            "hasCheckboxSelection": cs_signals.has_checkbox_selection,
            "hasAddAllToCart": cs_signals.has_add_all_to_cart,
            "hasDiscountOnBundle": cs_signals.has_discount_on_bundle,
            "nearBuyButton": cs_signals.near_buy_button,
            "recommendationCountOptimal": cs_signals.recommendation_count_optimal,
        },
        "variantUx": {
            "hasVariants": vu_signals.has_variants,
            "hasVisualSwatches": vu_signals.has_visual_swatches,
            "hasPillButtons": vu_signals.has_pill_buttons,
            "hasDropdownSelectors": vu_signals.has_dropdown_selectors,
            "colorSelectorType": vu_signals.color_selector_type,
            "sizeSelectorType": vu_signals.size_selector_type,
            "optionGroupCount": vu_signals.option_group_count,
            "hasStockIndicator": vu_signals.has_stock_indicator,
            "hasPreciseStockCount": vu_signals.has_precise_stock_count,
            "hasLowStockUrgency": vu_signals.has_low_stock_urgency,
            "hasSoldOutHandling": vu_signals.has_sold_out_handling,
            "hasNotifyMe": vu_signals.has_notify_me,
            "swatchApp": vu_signals.swatch_app,
            "hasVariantImageLink": vu_signals.has_variant_image_link,
            "colorUsesDropdown": vu_signals.color_uses_dropdown,
        },
        "sizeGuide": {
            "sizeGuideApp": sg_signals.size_guide_app,
            "hasSizeGuideLink": sg_signals.has_size_guide_link,
            "hasSizeGuidePopup": sg_signals.has_size_guide_popup,
            "hasSizeChartTable": sg_signals.has_size_chart_table,
            "hasFitFinder": sg_signals.has_fit_finder,
            "hasModelMeasurements": sg_signals.has_model_measurements,
            "hasFitRecommendation": sg_signals.has_fit_recommendation,
            "hasMeasurementInstructions": sg_signals.has_measurement_instructions,
            "nearSizeSelector": sg_signals.near_size_selector,
            "categoryApplicable": sg_signals.category_applicable,
        },
        "contentFreshness": {
            "copyrightYear": cf_signals.copyright_year,
            "copyrightYearIsCurrent": cf_signals.copyright_year_is_current,
            "hasExpiredPromotion": cf_signals.has_expired_promotion,
            "expiredPromotionText": cf_signals.expired_promotion_text,
            "hasSeasonalMismatch": cf_signals.has_seasonal_mismatch,
            "hasNewLabel": cf_signals.has_new_label,
            "datePublishedIso": cf_signals.date_published_iso,
            "newLabelIsStale": cf_signals.new_label_is_stale,
            "mostRecentReviewDateIso": cf_signals.most_recent_review_date_iso,
            "reviewAgeDays": cf_signals.review_age_days,
            "reviewStaleness": cf_signals.review_staleness,
            "dateModifiedIso": cf_signals.date_modified_iso,
            "dateModifiedAgeDays": cf_signals.date_modified_age_days,
            "lastModifiedHeader": cf_signals.last_modified_header,
            "lastModifiedAgeDays": cf_signals.last_modified_age_days,
            "timeElementCount": cf_signals.time_element_count,
            "mostRecentTimeIso": cf_signals.most_recent_time_iso,
            "mostRecentTimeAgeDays": cf_signals.most_recent_time_age_days,
            "freshestSignalAgeDays": cf_signals.freshest_signal_age_days,
        },
    }

    # Store-wide signals: from cache or fresh detector objects
    if store_cache is not None:
        _store_signals: dict = {k: _cached_sigs.get(k, {}) for k in STORE_WIDE_KEYS}
    else:
        _store_signals: dict = {
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
            "socialCommerce": {
                "hasInstagramEmbed": sc_signals.has_instagram_embed,
                "hasTiktokEmbed": sc_signals.has_tiktok_embed,
                "hasPinterest": sc_signals.has_pinterest,
                "hasUgcGallery": sc_signals.has_ugc_gallery,
                "ugcGalleryApp": sc_signals.ugc_gallery_app,
                "platformCount": sc_signals.platform_count,
            },
        }

    response_data: dict = {
        "score": overall_score,
        "summary": "Analysis complete.",
        "tips": all_tips or ["No issues detected."],
        "dimensionTips": {
            "socialProof": sp_tips,
            "structuredData": sd_tips,
            "checkout": co_tips,
            "pricing": pr_tips,
            "images": im_tips,
            "title": ti_tips,
            "shipping": sh_tips,
            "description": de_tips,
            "trust": tr_tips,
            "pageSpeed": ps_tips,
            "mobileCta": mc_tips,
            "crossSell": cs_tips,
            "variantUx": vu_tips,
            "sizeGuide": sg_tips,
            "aiDiscoverability": ad_tips,
            "contentFreshness": cf_tips,
            "accessibility": ac_tips,
            "socialCommerce": sc_tips,
        },
        "categories": categories,
        "productPrice": extract_price(html, sd_price=sd_signals.price_amount) or 0,
        "productCategory": "other",
        "timings": timings,
        "signals": {**_product_signals, **_store_signals},
    }

    # --- Consume credit (best-effort — analysis already succeeded) ---
    if current_user:
        try:
            increment_credits(current_user, db)
        except Exception:
            logger.exception("Credit increment failed for user %s — analysis delivered anyway", current_user.id)

    credits_remaining = (
        get_credits_limit(current_user.plan_tier) - current_user.credits_used
        if current_user else None
    )
    if credits_remaining is not None:
        response_data["creditsRemaining"] = credits_remaining

    logger.info("analyze timings %s — %s", url, timings)

    # --- DB operations (fire-and-forget) ---
    analysis_id: str | None = None

    # 1. Insert scan record
    t0 = time.perf_counter()
    # Extract price safely — 0 is falsy in Python, so use explicit None check
    _raw_price = response_data.get("productPrice")
    _price_for_db = str(_raw_price) if _raw_price is not None and float(_raw_price) > 0 else None

    try:
        db.add(
            Scan(
                url=url,
                score=response_data["score"],
                product_category=response_data["productCategory"] or None,
                product_price=_price_for_db,
                user_id=current_user.id if current_user else None,
            )
        )
        db.commit()
    except Exception:
        logger.exception("DB scan insert error")
        try:
            db.rollback()
        except Exception:
            pass
    timings["dbScan"] = round((time.perf_counter() - t0) * 1000, 1)

    # 2. Upsert product analysis (authenticated users only — R013)
    # Anonymous users skip DB persistence to avoid NOT NULL violation on user_id
    # and to respect the composite unique constraint (product_url, user_id).
    t0 = time.perf_counter()
    if current_user is not None:
        try:
            stmt = (
                pg_insert(ProductAnalysis)
                .values(
                    product_url=url,
                    store_domain=parsed_url.hostname,
                    score=response_data["score"],
                    summary=response_data["summary"],
                    tips=response_data["tips"],
                    categories=response_data["categories"],
                    product_price=_price_for_db,
                    product_category=response_data["productCategory"] or None,
                    estimated_monthly_visitors=None,
                    signals=response_data.get("signals"),
                    user_id=current_user.id,
                )
                .on_conflict_do_update(
                    index_elements=["product_url", "user_id"],
                    set_={
                        "store_domain": parsed_url.hostname,
                        "score": response_data["score"],
                        "summary": response_data["summary"],
                        "tips": response_data["tips"],
                        "categories": response_data["categories"],
                        "product_price": _price_for_db,
                        "product_category": response_data["productCategory"] or None,
                        "estimated_monthly_visitors": None,
                        "signals": response_data.get("signals"),
                        "updated_at": func.now(),
                    },
                )
                .returning(ProductAnalysis.id)
            )
            row = db.execute(stmt).fetchone()
            db.commit()
            analysis_id = str(row[0]) if row else None
        except Exception:
            logger.exception("DB product analysis upsert error")
            try:
                db.rollback()
            except Exception:
                pass
    timings["dbUpsert"] = round((time.perf_counter() - t0) * 1000, 1)

    return {**response_data, "analysisId": analysis_id}
