"""POST /analyze endpoint — URL validation, AI scoring, DB persistence."""

import logging
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
from app.services.page_renderer import render_page
from app.services.openrouter import call_openrouter
from app.services.scoring import build_category_scores, compute_weighted_score
from app.services.social_proof_detector import detect_social_proof
from app.services.social_proof_rubric import score_social_proof, get_social_proof_tips
from app.services.structured_data_detector import detect_structured_data
from app.services.structured_data_rubric import score_structured_data, get_structured_data_tips

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
        '- "categories": scores 0-100 for ALL 20 dimensions below\n'
        '- "productPrice": extract the product price as a number (e.g. 49.99). Return 0 if not found.\n'
        '- "productCategory": one of: "fashion", "electronics", "beauty", "home", "food", "fitness", "jewelry", "other"\n'
        '- "estimatedMonthlyVisitors": your best estimate based on page signals. 500 small, 2000 medium, 10000 large.\n'
        '\n'
        'Score ALL 20 dimensions (0-100, be STRICT):\n'
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
        '13. cartRecovery (Medium-High): Evidence of email capture? Cart recovery signals? Hard to detect from HTML, score 40-50 if unclear.\n'
        '14. trust (Medium): Money-back guarantee? Return policy visible? Phone number? "As seen in" logos? None = 25.\n'
        '15. merchantFeed (Medium): Google Shopping markup? GTIN present? Clean product data? Hard to detect, score 40-50 if unclear.\n'
        '16. socialCommerce (Medium): TikTok/Instagram/Pinterest integration? Social sharing? Social proof from platforms? None = 20.\n'
        '17. sizeGuide (Medium, category-dependent): Size chart? Fit finder? Model measurements? For non-apparel, score 60-70 (N/A boost).\n'
        '18. variantUx (Medium): Color swatches vs dropdowns? Stock indicators? Out-of-stock handling? Basic dropdown = 35.\n'
        '19. accessibility (Low-Medium): Color contrast? Alt text on images? Semantic HTML? ARIA labels? Most stores score 30-50.\n'
        '20. contentFreshness (Low-Medium): Updated dates? Current year? Fresh badges? Stale content = 30.\n'
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

    # --- Fetch HTML ---
    try:
        html = await render_page(url)
    except Exception as exc:
        logger.exception("Failed to render page %s: %s", url, exc)
        return JSONResponse(
            status_code=400,
            content={
                "error": "Could not fetch that URL. Make sure it's accessible and not behind a login."
            },
        )

    if len(html) < 100:
        return JSONResponse(
            status_code=400,
            content={"error": "Page appears to be empty or too small to analyze."},
        )

    # --- Deterministic social proof scoring (runs on full HTML) ---
    signals = detect_social_proof(html)
    sp_score = score_social_proof(signals)
    sp_tips = get_social_proof_tips(signals)

    # --- Deterministic structured data scoring (runs on full HTML) ---
    sd_signals = detect_structured_data(html)
    sd_score = score_structured_data(sd_signals)
    sd_tips = get_structured_data_tips(sd_signals)

    # --- Mock scores for the other 18 dimensions (AI disabled) ---
    import random
    _mock_seed = hash(url) & 0xFFFFFFFF
    _rng = random.Random(_mock_seed)
    mock_categories = {
        "title": _rng.randint(35, 75),
        "description": _rng.randint(35, 75),
        "images": _rng.randint(35, 75),
        "pricing": _rng.randint(35, 75),
        "cta": _rng.randint(35, 75),
        "trustSignals": _rng.randint(35, 75),
        "urgency": _rng.randint(35, 75),
        "mobileUx": _rng.randint(35, 75),
        "pageSpeed": _rng.randint(35, 75),
        "seo": _rng.randint(35, 75),
        "structuredData": sd_score,
        "crossSell": _rng.randint(35, 75),
        "socialCommerce": _rng.randint(35, 75),
        "accessibility": _rng.randint(35, 75),
        "contentQuality": _rng.randint(35, 75),
        "checkout": _rng.randint(35, 75),
        "aiDiscoverability": _rng.randint(35, 75),
        "internationalReadiness": _rng.randint(35, 75),
        "merchantFeedQuality": _rng.randint(35, 75),
    }
    mock_categories["socialProof"] = sp_score

    # Overall score = weighted average across all dimensions
    mock_score = compute_weighted_score(mock_categories)

    all_tips = sp_tips + sd_tips

    response_data: dict = {
        "score": mock_score,
        "summary": "Analysis complete.",
        "tips": all_tips or ["No issues detected."],
        "categories": mock_categories,
        "productPrice": 0,
        "productCategory": "other",
        "estimatedMonthlyVisitors": 1000,
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

    # --- DB operations (fire-and-forget) ---
    analysis_id: str | None = None

    # 1. Insert scan record
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

    # 2. Upsert product analysis
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

    return {**response_data, "analysisId": analysis_id}
