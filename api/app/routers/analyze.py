"""POST /analyze endpoint ��� URL validation, AI scoring, DB persistence."""

import asyncio
import logging
import time
import urllib.parse

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.auth import get_current_user_optional
from app.config import settings
from app.database import get_db
from app.models import ProductAnalysis, Scan, User
from app.services.entitlement import get_credits_limit, has_credits_remaining, increment_credits
from app.services.page_renderer import render_page, measure_mobile_cta
from app.services.openrouter import call_openrouter
from app.services.scoring import build_category_scores, compute_weighted_score
from app.services.social_proof_detector import detect_social_proof
from app.services.social_proof_rubric import score_social_proof, get_social_proof_tips
from app.services.structured_data_detector import detect_structured_data
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

logger = logging.getLogger(__name__)

router = APIRouter()

# Hostnames / prefixes blocked for SSRF prevention.
_BLOCKED_EXACT = {"localhost", "0.0.0.0", "[::1]"}
_BLOCKED_PREFIXES = ("127.", "10.", "192.168.", "172.")
_BLOCKED_SUFFIX = ".local"


def _is_blocked_host(hostname: str) -> bool:
    h = hostname.lower()
    if h in _BLOCKED_EXACT:
        return True
    if any(h.startswith(p) for p in _BLOCKED_PREFIXES):
        return True
    if h.endswith(_BLOCKED_SUFFIX):
        return True
    return False


def _build_analysis_prompt(truncated_html: str) -> str:
    """Build the 20-dimension analysis prompt. Copied VERBATIM from
    webapp/src/app/api/analyze/route.ts (lines ~96-139), with only the
    JS template-literal interpolation replaced by Python concatenation."""
    return (
        'You are a ruthless e-commerce conversion expert. You have analyzed thousands of Shopify product pages. You are HONEST and SPECIFIC — you never give vague feedback.\n'
        '\n'
        'Analyze this HTML for a Shopify product page. Return a JSON object with:\n'
        '- "score": number 0-100 (conversion effectiveness — be harsh, most pages score 30-55)\n'
        '- "summary": one punchy sentence about the biggest issue (max 20 words, be specific)\n'
        '- "tips": array of up to 10 specific fixes — each must reference actual content on THIS page (max 30 words each). No generic advice.\n'
        '- "categories": scores 0-100 for ALL 18 dimensions below\n'
        '- "productPrice": extract the product price as a number (e.g. 49.99). Return 0 if not found.\n'
        '- "productCategory": one of: "fashion", "electronics", "beauty", "home", "food", "fitness", "jewelry", "other"\n'
        '- "estimatedMonthlyVisitors": your best estimate based on page signals. 500 small, 2000 medium, 10000 large.\n'
        '\n'
        'Score ALL 18 dimensions (0-100, be STRICT):\n'
        '\n'
        '1. pageSpeed (Very High impact): Check for large unoptimized images, render-blocking scripts, excessive apps. Most Shopify stores score 40-60.\n'
        '2. images (Very High): 5-7 images minimum across types (white bg, lifestyle, scale, texture, UGC). Only 1-2 basic photos = 30 or less.\n'
        '3. checkout (Very High): Shop Pay? BNPL? Multiple payment icons? Apple/Google Pay? Only basic checkout = 40.\n'
        '5. mobileCta (High): Is CTA above fold on mobile? Sticky? Proper size (44-48px)? Thumb-zone? Hidden CTA = 20.\n'
        '6. title (High): Product name + key benefit + keyword in first 3-5 words? 55-70 chars? Generic name = 25.\n'
        '7. aiDiscoverability (High): Structured data for AI? Clear product attributes? FAQ schema? Most stores score 10-30.\n'
        '8. structuredData (High): Product schema? Review schema? FAQ? Breadcrumbs? Offer markup? Missing = 15.\n'
        '9. pricing (High): Charm pricing? Compare-at anchor? Installment framing? Just one price = 40.\n'
        '10. description (Medium-High): Benefits first? Scannable? Bullet points? Layered architecture? Wall of text = 25.\n'
        '11. shipping (Medium-High): Delivery date visible? Free shipping threshold? Costs shown? Hidden costs = 20.\n'
        '12. crossSell (Medium-High): "Frequently bought together"? Recommendations near buy button? 4-6 items? None = 15.\n'
        '13. trust (Medium): Money-back guarantee? Return policy visible? Phone number? "As seen in" logos? None = 25.\n'
        '14. socialCommerce (Medium): TikTok/Instagram/Pinterest integration? Social sharing? Social proof from platforms? None = 20.\n'
        '15. sizeGuide (Medium, category-dependent): Size chart? Fit finder? Model measurements? For non-apparel, score 60-70 (N/A boost).\n'
        '16. variantUx (Medium): Color swatches vs dropdowns? Stock indicators? Out-of-stock handling? Basic dropdown = 35.\n'
        '17. accessibility (Low-Medium): Color contrast? Alt text on images? Semantic HTML? ARIA labels? Most stores score 30-50.\n'
        '18. contentFreshness (Low-Medium): Updated dates? Current year? Fresh badges? Stale content = 30.\n'
        '\n'
        'If the page is a 404 or error, return score: 0.\n'
        '\n'
        'Return ONLY valid JSON. No markdown, no explanation.\n'
        '\n'
        'HTML:\n'
    ) + truncated_html


@router.get("/analysis")
def get_cached_analysis(
    url: str,
    db: Session = Depends(get_db),
):
    """Return a previously-stored analysis for *url*, or 404."""
    row = (
        db.query(ProductAnalysis)
        .filter(ProductAnalysis.product_url == url)
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


@router.post("/analyze")
async def analyze(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "URL is required"})

    url = body.get("url") if isinstance(body, dict) else None
    if not url or not isinstance(url, str) or not url.strip():
        return JSONResponse(status_code=400, content={"error": "URL is required"})

    url = url.strip()

    # --- URL validation ---
    if len(url) > 2048:
        return JSONResponse(status_code=400, content={"error": "URL is too long"})

    parsed_url = urllib.parse.urlparse(url)
    if not parsed_url.scheme or not parsed_url.hostname:
        return JSONResponse(status_code=400, content={"error": "Invalid URL format"})

    if parsed_url.scheme not in ("http", "https"):
        return JSONResponse(
            status_code=400,
            content={"error": "Only HTTP/HTTPS URLs are supported"},
        )

    if _is_blocked_host(parsed_url.hostname):
        return JSONResponse(
            status_code=400,
            content={"error": "Internal URLs are not allowed"},
        )

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

    timings: dict[str, float] = {}
    t_start = time.perf_counter()

    # --- Fetch HTML + mobile CTA measurement + optional PSI API (in parallel) ---
    t0 = time.perf_counter()
    coros: list = [render_page(url), measure_mobile_cta(url), fetch_ai_discoverability_data(url), fetch_content_freshness_data(url), run_axe_scan(url)]
    has_psi = bool(settings.google_pagespeed_api_key)
    if has_psi:
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

    # --- Deterministic social proof scoring (runs on full HTML) ---
    t0 = time.perf_counter()
    signals = detect_social_proof(html)
    sp_score = score_social_proof(signals)
    sp_tips = get_social_proof_tips(signals)
    timings["socialProof"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic structured data scoring (runs on full HTML) ---
    t0 = time.perf_counter()
    sd_signals = detect_structured_data(html)
    sd_score = score_structured_data(sd_signals)
    sd_tips = get_structured_data_tips(sd_signals)
    timings["structuredData"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic checkout scoring (runs on full HTML) ---
    t0 = time.perf_counter()
    co_signals = detect_checkout(html)
    co_score = score_checkout(co_signals)
    co_tips = get_checkout_tips(co_signals)
    timings["checkout"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic pricing psychology scoring (runs on full HTML) ---
    t0 = time.perf_counter()
    pr_signals = detect_pricing(html)
    pr_score = score_pricing(pr_signals)
    pr_tips = get_pricing_tips(pr_signals)
    timings["pricing"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic product images scoring (runs on full HTML) ---
    t0 = time.perf_counter()
    im_signals = detect_images(html)
    im_score = score_images(im_signals)
    im_tips = get_images_tips(im_signals)
    timings["images"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic title & SEO scoring (runs on full HTML) ---
    t0 = time.perf_counter()
    ti_signals = detect_title(html)
    ti_score = score_title(ti_signals)
    ti_tips = get_title_tips(ti_signals)
    timings["title"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic shipping transparency scoring (runs on full HTML) ---
    t0 = time.perf_counter()
    sh_signals = detect_shipping(html)
    sh_score = score_shipping(sh_signals)
    sh_tips = get_shipping_tips(sh_signals)
    timings["shipping"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic description quality scoring (runs on full HTML) ---
    t0 = time.perf_counter()
    de_signals = detect_description(html)
    de_score = score_description(de_signals)
    de_tips = get_description_tips(de_signals)
    timings["description"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic trust & guarantees scoring (runs on full HTML) ---
    t0 = time.perf_counter()
    tr_signals = detect_trust(html)
    tr_score = score_trust(tr_signals)
    tr_tips = get_trust_tips(tr_signals)
    timings["trust"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic page speed scoring (HTML + optional PSI) ---
    t0 = time.perf_counter()
    ps_signals = detect_page_speed(html, psi_data)
    ps_score = score_page_speed(ps_signals)
    ps_tips = get_page_speed_tips(ps_signals)
    timings["pageSpeed"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic mobile CTA & UX scoring (HTML + Playwright measurements) ---
    t0 = time.perf_counter()
    mc_signals = detect_mobile_cta(html, measurements=mobile_measurements)
    mc_score = score_mobile_cta(mc_signals)
    mc_tips = get_mobile_cta_tips(mc_signals)
    timings["mobileCta"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic cross-sell scoring (runs on full HTML) ---
    t0 = time.perf_counter()
    cs_signals = detect_cross_sell(html)
    cs_score = score_cross_sell(cs_signals)
    cs_tips = get_cross_sell_tips(cs_signals)
    timings["crossSell"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic variant UX scoring (runs on full HTML) ---
    t0 = time.perf_counter()
    vu_signals = detect_variant_ux(html)
    vu_score = score_variant_ux(vu_signals)
    vu_tips = get_variant_ux_tips(vu_signals)
    timings["variantUx"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic size guide scoring (runs on full HTML) ---
    t0 = time.perf_counter()
    sg_signals = detect_size_guide(html, product_category=None)
    sg_score = score_size_guide(sg_signals)
    sg_tips = get_size_guide_tips(sg_signals)
    timings["sizeGuide"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic AI discoverability scoring (HTML + robots.txt/llms.txt) ---
    t0 = time.perf_counter()
    ad_signals = detect_ai_discoverability(html, ai_disc_data)
    ad_score = score_ai_discoverability(ad_signals)
    ad_tips = get_ai_discoverability_tips(ad_signals)
    timings["aiDiscoverability"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic content freshness scoring (HTML + Last-Modified header) ---
    t0 = time.perf_counter()
    cf_signals = detect_content_freshness(html, cf_data)
    cf_score = score_content_freshness(cf_signals)
    cf_tips = get_content_freshness_tips(cf_signals)
    timings["contentFreshness"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Deterministic accessibility scoring (HTML + axe-core scan) ---
    t0 = time.perf_counter()
    ac_signals = detect_accessibility(html, axe_results)
    ac_score = score_accessibility(ac_signals)
    ac_tips = get_accessibility_tips(ac_signals)
    timings["accessibility"] = round((time.perf_counter() - t0) * 1000, 1)

    # --- Mock scores for the other 6 dimensions (AI disabled) ---
    import random
    _mock_seed = hash(url) & 0xFFFFFFFF
    _rng = random.Random(_mock_seed)
    mock_categories = {
        "title": ti_score,
        "description": de_score,
        "images": im_score,
        "pricing": pr_score,
        "mobileCta": mc_score,
        "trust": tr_score,
        "urgency": _rng.randint(35, 75),
        "mobileUx": _rng.randint(35, 75),
        "pageSpeed": ps_score,
        "seo": _rng.randint(35, 75),
        "structuredData": sd_score,
        "crossSell": cs_score,
        "variantUx": vu_score,
        "sizeGuide": sg_score,
        "socialCommerce": _rng.randint(35, 75),
        "accessibility": ac_score,
        "contentFreshness": cf_score,
        "checkout": co_score,
        "aiDiscoverability": ad_score,
        "shipping": sh_score,
    }
    mock_categories["socialProof"] = sp_score

    # Overall score = weighted average across all dimensions
    mock_score = compute_weighted_score(mock_categories)

    all_tips = sp_tips + sd_tips + co_tips + pr_tips + im_tips + ti_tips + sh_tips + de_tips + tr_tips + ps_tips + mc_tips + cs_tips + vu_tips + sg_tips + ad_tips + cf_tips + ac_tips

    timings["total"] = round((time.perf_counter() - t_start) * 1000, 1)

    response_data: dict = {
        "score": mock_score,
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
        },
        "categories": mock_categories,
        "productPrice": 0,
        "productCategory": "other",
        "estimatedMonthlyVisitors": 1000,
        "timings": timings,
        "signals": {
            "socialProof": {
                "reviewApp": signals.review_app,
                "starRating": signals.star_rating,
                "reviewCount": signals.review_count,
                "hasPhotoReviews": signals.has_photo_reviews,
                "hasVideoReviews": signals.has_video_reviews,
                "starRatingAboveFold": signals.star_rating_above_fold,
                "hasReviewFiltering": signals.has_review_filtering,
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
        },
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
    try:
        db.add(
            Scan(
                url=url,
                score=response_data["score"],
                product_category=response_data["productCategory"] or None,
                product_price=response_data["productPrice"] or None,
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

    # 2. Upsert product analysis
    t0 = time.perf_counter()
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
                product_price=(
                    str(response_data["productPrice"])
                    if response_data["productPrice"]
                    else None
                ),
                product_category=response_data["productCategory"] or None,
                estimated_monthly_visitors=response_data["estimatedMonthlyVisitors"],
                signals=response_data.get("signals"),
                user_id=current_user.id if current_user else None,
            )
            .on_conflict_do_update(
                index_elements=["product_url"],
                set_={
                    "store_domain": parsed_url.hostname,
                    "score": response_data["score"],
                    "summary": response_data["summary"],
                    "tips": response_data["tips"],
                    "categories": response_data["categories"],
                    "product_price": (
                        str(response_data["productPrice"])
                        if response_data["productPrice"]
                        else None
                    ),
                    "product_category": response_data["productCategory"] or None,
                    "estimated_monthly_visitors": response_data[
                        "estimatedMonthlyVisitors"
                    ],
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
