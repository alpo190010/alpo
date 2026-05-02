/**
 * productChecks.ts
 *
 * Builds a flat list of {@link DimensionCheck} entries from the rich
 * `signals` payload of a {@link FreeResult}. Each `*Checks` builder
 * mirrors one of the legacy `*Checklist` JSX functions in
 * `webapp/src/components/analysis/IssueCard.tsx` 1:1 — every
 * `<SignalRow>` in the JSX becomes one `DimensionCheck` in the output.
 *
 * The check list feeds the new "What's working / What's missing"
 * two-list layout that the products-page deep-analyze view shares
 * with the storewide dimensions.
 *
 * Severity weight scheme (mirrors storewide thresholds in
 * `severityFor`: ≥15 critical, ≥7 major, else minor):
 *
 *  - 15 (critical): foundational signals whose absence is a
 *    show-stopper for the dimension (e.g. Product schema missing,
 *    no H1, no product images, viewport meta absent).
 *  - 8  (major): high-impact secondary signals (brand, full
 *    schema offers, modern image format, sticky mobile CTA, etc.).
 *  - 3  (minor): polish / amplifier signals that primarily refine
 *    an already-working baseline.
 */
import type {
  AccessibilitySignals,
  AiDiscoverabilitySignals,
  CategoryScores,
  CheckoutSignals,
  ContentFreshnessSignals,
  CrossSellSignals,
  DescriptionSignals,
  DimensionCheck,
  FreeResult,
  ImageSignals,
  LeakCard,
  MobileCtaSignals,
  PageSpeedSignals,
  PricingSignals,
  ShippingSignals,
  SizeGuideSignals,
  SocialCommerceSignals,
  SocialProofSignals,
  StructuredDataSignals,
  TitleSignals,
  TrustSignals,
  VariantUxSignals,
} from "@/lib/analysis/types";
import {
  CATEGORY_LABELS,
  DIMENSION_GROUPS,
  PRODUCT_LEVEL_DIMENSIONS,
} from "@/lib/analysis/constants";

/* ────────────────────────────────────────────────────────────────
   Grouped output — one entry per dimension. Used by the per-product
   AnalysisResults view to render a collapsible accordion (each
   dimension is its own section with score, counts, and an inner
   What's working / What's missing list).
   ──────────────────────────────────────────────────────────────── */
export interface ProductDimensionGroup {
  /** Dimension key, e.g. "structuredData", "pageSpeed". */
  key: string;
  /** Human-readable label from `CATEGORY_LABELS`. */
  label: string;
  /** Category score 0–100 from `result.categories`. */
  score: number;
  /** Conversion-loss percent from the matching leak (0 if no leak). */
  conversionLoss: number;
  /** All checks for this dimension (passing + failing). */
  checks: DimensionCheck[];
}

/* ────────────────────────────────────────────────────────────────
   Thematic-group view — pools the per-dimension data into the five
   `DIMENSION_GROUPS` buckets (Buying Experience, Trust &
   Transparency, etc.). Drives the Score breakdown card grid in the
   product analysis surface.
   ──────────────────────────────────────────────────────────────── */
export interface ProductGroupView {
  /** Group id, e.g. "buying", "trust". */
  id: string;
  /** Group label, e.g. "Buying Experience". */
  label: string;
  /** Group's framing question from `DIMENSION_GROUPS`. */
  question: string;
  /** Average of contained dimensions' scores (0–100). */
  avgScore: number;
  /** Sum of contained dimensions' conversion-loss percent. */
  conversionLoss: number;
  /** Pooled checks across the group's dimensions. */
  checks: DimensionCheck[];
  /** Per-check dimension provenance, keyed by check `id`. */
  checkDimensionKey: Record<string, string>;
  /** The contained per-dimension groups, for sub-display. */
  dimensions: ProductDimensionGroup[];
}

/* ────────────────────────────────────────────────────────────────
   Shared helpers
   ──────────────────────────────────────────────────────────────── */

/**
 * Hook for future per-signal leak merging. Currently a no-op:
 * dimension-level fix copy lives in the `<DimensionFixCallout>`
 * banner above the missing list (rendered by `AnalysisResults`),
 * not on every failing row's expand drawer. Stamping the same
 * `leak.tip` onto every row produced repetitive expansions —
 * removed in favour of the single dimension-level callout.
 *
 * Kept as a one-liner so future work can stamp signal-specific
 * remediation per row without touching the 18 builder call sites.
 */
function applyLeakMerge(
  checks: DimensionCheck[],
  _leak: LeakCard | undefined,
): DimensionCheck[] {
  return checks;
}

/* ────────────────────────────────────────────────────────────────
   Social Proof — ported from IssueCard.tsx inline JSX (1447–1501)
   ──────────────────────────────────────────────────────────────── */
export function buildSocialProofChecks(
  sp: SocialProofSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const starInOptimalRange =
    sp.starRating !== null && sp.starRating >= 4.2 && sp.starRating <= 4.7;
  const starOutOfRangeDetail =
    sp.starRating !== null && (sp.starRating < 4.2 || sp.starRating > 4.7)
      ? "Optimal range is 4.2–4.7 stars"
      : undefined;

  const reviewCount = sp.reviewCount;
  const reviewCountDetail =
    reviewCount !== null && reviewCount < 5
      ? "Products with 5+ reviews see 270% higher conversion"
      : reviewCount !== null && reviewCount < 30
        ? "Aim for 30+ reviews for maximum impact"
        : undefined;

  const checks: DimensionCheck[] = [
    {
      id: "socialProof.reviewApp",
      label: sp.reviewApp ? `Review app: ${sp.reviewApp}` : "No review app detected",
      passed: sp.reviewApp !== null,
      weight: 8,
    },
    {
      id: "socialProof.starRating",
      label:
        sp.starRating !== null
          ? `Star rating: ${sp.starRating}/5`
          : "No star rating found",
      // Optimal range only carries the "passed" badge; matches the original
      // `starRating !== null` present check while highlighting out-of-range
      // ratings via the detail string the JSX emitted.
      passed: sp.starRating !== null && starInOptimalRange,
      weight: 8,
      detail: starOutOfRangeDetail,
    },
    {
      id: "socialProof.reviewCount",
      label:
        reviewCount !== null ? `${reviewCount} reviews` : "No review count found",
      passed: reviewCount !== null && reviewCount >= 30,
      weight: 8,
      detail: reviewCountDetail,
    },
    {
      id: "socialProof.photoReviews",
      label: "Photo reviews",
      passed: sp.hasPhotoReviews,
      weight: 8,
      detail: !sp.hasPhotoReviews ? "Photo reviews boost conversion by 106%" : undefined,
    },
    {
      id: "socialProof.videoReviews",
      label: "Video reviews",
      passed: sp.hasVideoReviews,
      weight: 3,
    },
    {
      id: "socialProof.starAboveFold",
      label: "Star rating above fold",
      passed: sp.starRatingAboveFold,
      weight: 8,
      detail: !sp.starRatingAboveFold
        ? "56% of shoppers check reviews before anything else"
        : undefined,
    },
    {
      id: "socialProof.reviewFiltering",
      label: "Review filtering & sorting",
      passed: sp.hasReviewFiltering,
      weight: 3,
      detail: !sp.hasReviewFiltering
        ? "Shoppers who filter reviews are 2x more likely to convert"
        : undefined,
    },
  ];

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Structured Data — IssueCard.tsx 100–193
   ──────────────────────────────────────────────────────────────── */
export function buildStructuredDataChecks(
  sd: StructuredDataSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const requiredFields = [sd.hasName, sd.hasImage, sd.hasDescription, sd.hasOffers];
  const requiredCount = requiredFields.filter(Boolean).length;

  const offersPresent = [sd.hasPrice, sd.hasPriceCurrency, sd.hasAvailability];
  const offersCount = offersPresent.filter(Boolean).length;

  const recommendedFields = [
    sd.hasSku,
    sd.hasGtin,
    sd.hasAggregateRating,
    sd.hasPriceValidUntil,
  ];
  const recommendedCount = recommendedFields.filter(Boolean).length;

  const shippingCount = [sd.hasShippingDetails, sd.hasReturnPolicy].filter(Boolean).length;

  const errorItems: string[] = [];
  if (sd.hasCurrencyInPrice) errorItems.push("currency symbol in price value");
  if (sd.hasInvalidAvailability) errorItems.push("invalid availability value");
  if (sd.duplicateProductCount > 0)
    errorItems.push(`${sd.duplicateProductCount} duplicate Product schema(s)`);
  if (sd.jsonParseErrors > 0)
    errorItems.push(`${sd.jsonParseErrors} JSON-LD parse error(s)`);

  const checks: DimensionCheck[] = [
    {
      id: "structuredData.productSchema",
      label: sd.hasProductSchema
        ? "Product schema detected"
        : "No Product schema found",
      passed: sd.hasProductSchema,
      weight: 15,
      detail: !sd.hasProductSchema
        ? "Product schema is required for rich results in Google Shopping"
        : undefined,
    },
    {
      id: "structuredData.requiredFields",
      label: `${requiredCount} of 4 required fields present`,
      passed: requiredCount === 4,
      weight: 8,
      detail:
        requiredCount < 4
          ? `Missing: ${[
              !sd.hasName && "name",
              !sd.hasImage && "image",
              !sd.hasDescription && "description",
              !sd.hasOffers && "offers",
            ]
              .filter(Boolean)
              .join(", ")}`
          : undefined,
    },
    {
      id: "structuredData.offersDetail",
      label: `Offers detail: ${offersCount} of 3 (price, currency, availability)`,
      passed: offersCount === 3,
      weight: 8,
      detail:
        offersCount < 3
          ? `Missing: ${[
              !sd.hasPrice && "price",
              !sd.hasPriceCurrency && "priceCurrency",
              !sd.hasAvailability && "availability",
            ]
              .filter(Boolean)
              .join(", ")}`
          : undefined,
    },
    {
      id: "structuredData.brand",
      label: sd.hasBrand ? "Brand present" : "Brand missing",
      passed: sd.hasBrand && !sd.hasMissingBrand,
      weight: 8,
      detail: sd.hasMissingBrand
        ? "Brand field exists but value is empty or invalid"
        : !sd.hasBrand
          ? "Adding brand improves merchant listing quality"
          : undefined,
    },
    {
      id: "structuredData.recommendedFields",
      label: `${recommendedCount} of 4 recommended fields (SKU, GTIN, rating, priceValidUntil)`,
      passed: recommendedCount >= 3,
      weight: 3,
      detail:
        recommendedCount < 3
          ? `Missing: ${[
              !sd.hasSku && "SKU",
              !sd.hasGtin && "GTIN",
              !sd.hasAggregateRating && "aggregateRating",
              !sd.hasPriceValidUntil && "priceValidUntil",
            ]
              .filter(Boolean)
              .join(", ")}`
          : undefined,
    },
    {
      id: "structuredData.shippingReturns",
      label: `Shipping & returns: ${shippingCount} of 2`,
      passed: shippingCount === 2,
      weight: 8,
      detail:
        shippingCount < 2
          ? `Missing: ${[
              !sd.hasShippingDetails && "shippingDetails",
              !sd.hasReturnPolicy && "returnPolicy",
            ]
              .filter(Boolean)
              .join(", ")}`
          : undefined,
    },
    {
      id: "structuredData.breadcrumbList",
      label: "BreadcrumbList schema",
      passed: sd.hasBreadcrumbList,
      weight: 3,
      detail: !sd.hasBreadcrumbList
        ? "Breadcrumbs improve search appearance and click-through rate"
        : undefined,
    },
    {
      id: "structuredData.organization",
      label: "Organization schema",
      passed: sd.hasOrganization,
      weight: 3,
      detail: !sd.hasOrganization
        ? "Organization schema helps Google display business info in search"
        : undefined,
    },
  ];

  if (errorItems.length > 0) {
    checks.push({
      id: "structuredData.errors",
      label: `${errorItems.length} error${errorItems.length > 1 ? "s" : ""} found`,
      passed: false,
      weight: 8,
      detail: errorItems.join("; "),
    });
  }

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Checkout — IssueCard.tsx 194–394
   ──────────────────────────────────────────────────────────────── */
export function buildCheckoutChecks(
  co: CheckoutSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const liveChecked = co.reachedCheckout === true;
  const wallets = co.wallets;
  const bnpl = co.bnpl;
  const checks: DimensionCheck[] = [];

  if (liveChecked && wallets) {
    checks.push(
      {
        id: "checkout.shopPay",
        label: "Shop Pay on checkout",
        passed: wallets.shopPay,
        weight: 15,
        detail: !wallets.shopPay
          ? "Shop Pay drives a 50% checkout-to-order lift for returning buyers"
          : undefined,
      },
      {
        id: "checkout.applePay",
        label: "Apple Pay on checkout",
        passed: wallets.applePay,
        weight: 15,
        detail: !wallets.applePay
          ? "Apple Pay roughly doubles mobile checkout conversion"
          : undefined,
      },
      {
        id: "checkout.googlePay",
        label: "Google Pay on checkout",
        passed: wallets.googlePay,
        weight: 15,
        detail: !wallets.googlePay
          ? "43% of Android shoppers abandon without Google Pay"
          : undefined,
      },
      {
        id: "checkout.paypal",
        label: "PayPal on checkout",
        passed: wallets.paypal,
        weight: 8,
        detail: !wallets.paypal
          ? "PayPal reaches 400M+ active buyers globally"
          : undefined,
      },
    );
    if (wallets.amazonPay || wallets.metaPay || wallets.stripeLink) {
      checks.push({
        id: "checkout.otherWallet",
        label: "Amazon / Meta / Stripe Link wallet",
        passed: wallets.amazonPay || wallets.metaPay || wallets.stripeLink,
        weight: 3,
      });
    }
  } else {
    checks.push(
      {
        id: "checkout.acceleratedCheckout",
        label: "Shop Pay / accelerated-checkout wrapper on product page",
        passed: co.hasAcceleratedCheckout,
        weight: 15,
        detail: !co.hasAcceleratedCheckout
          ? "Accelerated checkout can boost conversion 1.7×"
          : undefined,
      },
      {
        id: "checkout.dynamicCheckoutButton",
        label: "Dynamic checkout button on product page",
        passed: co.hasDynamicCheckoutButton,
        weight: 8,
        detail: !co.hasDynamicCheckoutButton
          ? "Shows the buyer's preferred payment at checkout"
          : undefined,
      },
      {
        id: "checkout.paypalPdp",
        label: "PayPal (product page)",
        passed: co.hasPaypal,
        weight: 8,
        detail: !co.hasPaypal
          ? "PayPal reaches 400M+ active buyers globally"
          : undefined,
      },
    );
  }

  if (liveChecked && bnpl) {
    checks.push(
      {
        id: "checkout.shopPayInstallments",
        label: "Shop Pay Installments on checkout",
        passed: bnpl.shopPayInstallments,
        weight: 3,
        detail: !bnpl.shopPayInstallments
          ? "Shop Pay Installments lifts AOV for orders $50+"
          : undefined,
      },
      {
        id: "checkout.klarna",
        label: "Klarna on checkout",
        passed: bnpl.klarna,
        weight: 3,
        detail: !bnpl.klarna ? "BNPL options increase AOV by up to 45%" : undefined,
      },
      {
        id: "checkout.afterpay",
        label: "Afterpay / Clearpay on checkout",
        passed: bnpl.afterpay || bnpl.clearpay,
        weight: 3,
        detail: !(bnpl.afterpay || bnpl.clearpay)
          ? "Afterpay drives repeat purchases at 2× the rate"
          : undefined,
      },
      {
        id: "checkout.affirm",
        label: "Affirm on checkout",
        passed: bnpl.affirm,
        weight: 3,
        detail: !bnpl.affirm
          ? "Affirm reduces cart abandonment on high-AOV items"
          : undefined,
      },
    );
  } else {
    checks.push(
      {
        id: "checkout.klarnaPdp",
        label: "Klarna (product page)",
        passed: co.hasKlarna,
        weight: 3,
        detail: !co.hasKlarna ? "BNPL options increase AOV by up to 45%" : undefined,
      },
      {
        id: "checkout.afterpayPdp",
        label: "Afterpay (product page)",
        passed: co.hasAfterpay,
        weight: 3,
        detail: !co.hasAfterpay
          ? "Afterpay drives repeat purchases at 2× the rate"
          : undefined,
      },
      {
        id: "checkout.affirmPdp",
        label: "Affirm (product page)",
        passed: co.hasAffirm,
        weight: 3,
        detail: !co.hasAffirm
          ? "Affirm reduces cart abandonment on high-AOV items"
          : undefined,
      },
      {
        id: "checkout.sezzlePdp",
        label: "Sezzle (product page)",
        passed: co.hasSezzle,
        weight: 3,
        detail: !co.hasSezzle
          ? "Sezzle targets younger demographics effectively"
          : undefined,
      },
    );
  }

  if (liveChecked) {
    checks.push(
      {
        id: "checkout.guestCheckout",
        label: co.forcedAccountCreation
          ? "Forced account creation"
          : "Guest checkout supported",
        passed: co.guestCheckoutAvailable === true && !co.forcedAccountCreation,
        weight: 8,
        detail: !co.guestCheckoutAvailable
          ? "24% of shoppers abandon carts when forced to sign up"
          : undefined,
      },
      {
        id: "checkout.stepCount",
        label:
          co.checkoutStepCount === 1
            ? "One-page checkout"
            : `${co.checkoutStepCount ?? "?"}-step checkout`,
        passed: co.checkoutStepCount === 1,
        weight: 8,
        detail:
          (co.checkoutStepCount ?? 0) > 1
            ? "One-page checkouts convert 13% better than multi-step"
            : undefined,
      },
      {
        id: "checkout.discountCode",
        label: "Discount-code field on checkout",
        passed: co.hasDiscountCodeField === true,
        weight: 3,
        detail: !co.hasDiscountCodeField
          ? "Expose a code field — buyers who leave to search for codes rarely return"
          : undefined,
      },
      {
        id: "checkout.addressAutocomplete",
        label: "Address autocomplete on checkout",
        passed: co.hasAddressAutocomplete === true,
        weight: 3,
        detail: !co.hasAddressAutocomplete
          ? "Autocomplete reduces address typing by 20%"
          : undefined,
      },
    );
  }

  checks.push(
    {
      id: "checkout.paymentMethodCount",
      label: `${co.paymentMethodCount} of 5 payment methods detected on product page`,
      passed: co.paymentMethodCount >= 3,
      weight: 8,
      detail:
        co.paymentMethodCount < 3
          ? "Offer 3+ payment methods to reduce checkout friction"
          : undefined,
    },
    {
      id: "checkout.drawerCart",
      label: "Drawer / slide-out cart",
      passed: co.hasDrawerCart,
      weight: 3,
      detail: !co.hasDrawerCart ? "Drawer carts keep shoppers on the page" : undefined,
    },
    {
      id: "checkout.ajaxCart",
      label: "AJAX add-to-cart",
      passed: co.hasAjaxCart,
      weight: 3,
      detail: !co.hasAjaxCart
        ? "AJAX cart avoids disruptive page reloads"
        : undefined,
    },
    {
      id: "checkout.stickyCheckout",
      label: "Sticky checkout button",
      passed: co.hasStickyCheckout,
      weight: 3,
      detail: !co.hasStickyCheckout
        ? "Sticky buttons keep CTA visible while scrolling"
        : undefined,
    },
  );

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Pricing Psychology — IssueCard.tsx 395–479
   ──────────────────────────────────────────────────────────────── */
export function buildPricingChecks(
  pr: PricingSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const checks: DimensionCheck[] = [
    {
      id: "pricing.compareAtPrice",
      label: pr.hasCompareAtPrice
        ? "Compare-at price detected"
        : "No compare-at price",
      passed: pr.hasCompareAtPrice,
      weight: 8,
      detail: !pr.hasCompareAtPrice
        ? "Strikethrough anchoring produces a 25–40% conversion lift"
        : undefined,
    },
    {
      id: "pricing.strikethrough",
      label: pr.hasStrikethroughPrice
        ? "Strikethrough price present"
        : "No strikethrough price",
      passed: pr.hasStrikethroughPrice,
      weight: 8,
      detail: !pr.hasStrikethroughPrice
        ? "Visible original price with strike-through reinforces value"
        : undefined,
    },
    {
      id: "pricing.charmPricing",
      label:
        pr.priceValue != null
          ? pr.hasCharmPricing
            ? `Charm pricing detected ($${pr.priceValue})`
            : pr.isRoundPrice
              ? `Round price ($${pr.priceValue}) — consider .99 ending`
              : `Price: $${pr.priceValue}`
          : "No price extracted",
      passed: pr.hasCharmPricing,
      weight: 3,
      detail:
        !pr.hasCharmPricing && pr.isRoundPrice
          ? "MIT field experiments show 24% sales increase from .99 endings"
          : undefined,
    },
    {
      id: "pricing.bnplNearPrice",
      label: pr.hasBnplNearPrice
        ? "BNPL installment messaging present"
        : "No BNPL installment messaging",
      passed: pr.hasBnplNearPrice,
      weight: 8,
      detail: !pr.hasBnplNearPrice
        ? "'Pay in 4' framing increases conversion 20–35% on items over $50"
        : undefined,
    },
    {
      id: "pricing.klarna",
      label: "Klarna",
      passed: pr.hasKlarnaPlacement,
      weight: 3,
    },
    {
      id: "pricing.afterpay",
      label: "Afterpay",
      passed: pr.hasAfterPayBadge,
      weight: 3,
    },
    {
      id: "pricing.shopPayInstallments",
      label: "Shop Pay Installments",
      passed: pr.hasShopPayInstallments,
      weight: 3,
    },
    {
      id: "pricing.countdownTimer",
      label: pr.hasCountdownTimer
        ? "Countdown timer present"
        : "No countdown timer",
      passed: pr.hasCountdownTimer && !pr.hasFakeTimerRisk,
      weight: 3,
      detail: pr.hasFakeTimerRisk
        ? "Timer may be fake — Princeton research found ~40% of e-commerce timers are artificial"
        : !pr.hasCountdownTimer
          ? "Truthful countdown timers increase conversion up to 17.8%"
          : undefined,
    },
    {
      id: "pricing.scarcityMessaging",
      label: pr.hasScarcityMessaging
        ? "Stock scarcity messaging present"
        : "No scarcity messaging",
      passed: pr.hasScarcityMessaging,
      weight: 3,
      detail: !pr.hasScarcityMessaging
        ? "Real-time stock levels ('Only 3 left') drive urgency and increase conversions"
        : undefined,
    },
  ];

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Product Images — IssueCard.tsx 480–555
   ──────────────────────────────────────────────────────────────── */
export function buildImagesChecks(
  im: ImageSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const altPct = Math.round(im.altTextScore * 100);

  const checks: DimensionCheck[] = [
    {
      id: "images.imageCount",
      label: `${im.imageCount} product image${im.imageCount !== 1 ? "s" : ""} detected`,
      passed: im.imageCount >= 5,
      weight: 15,
      detail:
        im.imageCount < 3
          ? "56% of shoppers explore images first — aim for 5–8 images"
          : im.imageCount < 5
            ? "Good start, but 5–8 images is optimal for conversion"
            : undefined,
    },
    {
      id: "images.video",
      label: im.hasVideo ? "Product video present" : "No product video",
      passed: im.hasVideo,
      weight: 8,
      detail: !im.hasVideo ? "Product video increases add-to-cart by 37%" : undefined,
    },
    {
      id: "images.view360",
      label: im.has360View ? "360° view available" : "No 360° view",
      passed: im.has360View,
      weight: 3,
      detail: !im.has360View ? "360° views increase conversion by 27%" : undefined,
    },
    {
      id: "images.zoom",
      label: im.hasZoom ? "Zoom/magnify enabled" : "No zoom capability",
      passed: im.hasZoom,
      weight: 3,
      detail: !im.hasZoom
        ? "42% of shoppers gauge size from images (Baymard)"
        : undefined,
    },
    {
      id: "images.altText",
      label: `Alt text quality: ${altPct}%`,
      passed: im.altTextScore >= 0.7,
      weight: 8,
      detail:
        im.altTextScore < 0.5
          ? "Descriptive alt text increases organic traffic by 30%"
          : im.altTextScore < 0.7
            ? "Alt text is decent but could be more descriptive and unique"
            : undefined,
    },
    {
      id: "images.modernFormat",
      label: im.hasModernFormat
        ? "WebP/AVIF format detected"
        : "No modern image formats",
      passed: im.hasModernFormat,
      weight: 8,
      detail: !im.hasModernFormat
        ? "WebP/AVIF saves 25–50% file size vs JPEG"
        : undefined,
    },
    {
      id: "images.heroQuality",
      label: im.hasHighRes
        ? "High-resolution images"
        : "No high-res images detected",
      passed: im.hasHighRes,
      weight: 3,
      detail: !im.hasHighRes
        ? "Serve images at 1000px+ width for quality zoom experience"
        : undefined,
    },
    {
      id: "images.lifestyle",
      label: im.hasLifestyleImages
        ? "Lifestyle/context images detected"
        : "No lifestyle images detected",
      passed: im.hasLifestyleImages,
      weight: 8,
      detail: !im.hasLifestyleImages
        ? "Contextual imagery drives 38% higher conversion"
        : undefined,
    },
    {
      id: "images.cdn",
      label: im.cdnHosted ? "CDN-hosted images" : "Images not on CDN",
      passed: im.cdnHosted,
      weight: 3,
      detail: !im.cdnHosted
        ? "CDN delivery improves page load and global performance"
        : undefined,
    },
  ];

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Title & SEO — IssueCard.tsx 556–628
   ──────────────────────────────────────────────────────────────── */
export function buildTitleChecks(
  ti: TitleSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const truncatedH1 =
    ti.h1Text && ti.h1Text.length > 50 ? ti.h1Text.slice(0, 50) + "…" : ti.h1Text;

  const checks: DimensionCheck[] = [
    {
      id: "title.h1Present",
      label: ti.hasH1 ? `H1: "${truncatedH1}"` : "No H1 tag found",
      passed: ti.hasH1,
      weight: 15,
      detail: !ti.hasH1
        ? "Products with proper heading hierarchy see 12–15% better CTR"
        : undefined,
    },
    {
      id: "title.singleH1",
      label: `${ti.h1Count} H1 tag${ti.h1Count !== 1 ? "s" : ""} on page`,
      passed: ti.hasSingleH1,
      weight: 8,
      detail:
        ti.h1Count > 1
          ? "Multiple H1s confuse search engine crawlers"
          : ti.h1Count === 0
            ? "Every page needs exactly one H1"
            : undefined,
    },
    {
      id: "title.h1Length",
      label: ti.hasH1 ? `H1 length: ${ti.h1Length} chars` : "H1 length: N/A",
      passed: ti.hasH1 && ti.h1Length <= 80,
      weight: 3,
      detail:
        ti.h1Length > 80
          ? `${ti.h1Length - 80} characters over the 80-char limit`
          : undefined,
    },
    {
      id: "title.metaTitleLength",
      label: ti.metaTitle
        ? `Meta title: ${ti.metaTitleLength} chars`
        : "No meta title found",
      passed: ti.metaTitle != null && ti.metaTitleLength <= 60,
      weight: 8,
      detail:
        ti.metaTitleLength > 60
          ? `${ti.metaTitleLength - 60} chars over SERP limit — title will be truncated`
          : undefined,
    },
    {
      id: "title.brandInTitle",
      label: ti.hasBrandInTitle
        ? `Brand "${ti.brandName}" in title`
        : ti.brandName
          ? `Brand "${ti.brandName}" missing from title`
          : "Brand not detected",
      passed: ti.hasBrandInTitle,
      weight: 8,
      detail:
        !ti.hasBrandInTitle && ti.brandName
          ? "97% of top-performing titles include the brand"
          : undefined,
    },
    {
      id: "title.keywordStuffing",
      label: ti.hasKeywordStuffing
        ? "Keyword stuffing detected"
        : "No keyword stuffing",
      passed: !ti.hasKeywordStuffing,
      weight: 8,
      detail: ti.hasKeywordStuffing
        ? "Repeated keywords reduce trust and risk Google penalties"
        : undefined,
    },
    {
      id: "title.allCaps",
      label: ti.isAllCaps ? "Title is ALL CAPS" : "Proper case used",
      passed: !ti.isAllCaps,
      weight: 3,
      detail: ti.isAllCaps
        ? "Mixed case is 40% more readable and trustworthy"
        : undefined,
    },
    {
      id: "title.promotionalText",
      label: ti.hasPromotionalText
        ? "Promotional text in title"
        : "No promotional text",
      passed: !ti.hasPromotionalText,
      weight: 3,
      detail: ti.hasPromotionalText
        ? "SEO titles should describe the product, not the deal"
        : undefined,
    },
    {
      id: "title.h1MetaDiffer",
      label: ti.h1MetaDiffer
        ? "H1 and meta title are different"
        : "H1 and meta title are identical",
      passed: ti.h1MetaDiffer,
      weight: 3,
      detail:
        !ti.h1MetaDiffer && ti.hasH1 && ti.metaTitle
          ? "Optimize meta title for SERP display separately from the on-page H1"
          : undefined,
    },
    {
      id: "title.specifics",
      label: ti.hasSpecifics
        ? "Product specifics detected (color, size, material)"
        : "Title lacks product specifics",
      passed: ti.hasSpecifics,
      weight: 3,
      detail: !ti.hasSpecifics
        ? "Adding color, size, or material improves search specificity"
        : undefined,
    },
  ];

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Description Quality — IssueCard.tsx 629–735
   ──────────────────────────────────────────────────────────────── */
export function buildDescriptionChecks(
  de: DescriptionSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const benefitPct = Math.round(de.benefitRatio * 100);
  const emotionalPct = (de.emotionalDensity * 100).toFixed(1);

  const checks: DimensionCheck[] = [
    {
      id: "description.descriptionFound",
      label: de.descriptionFound
        ? "Product description detected"
        : "No product description found",
      passed: de.descriptionFound,
      weight: 15,
      detail: !de.descriptionFound
        ? "87% of shoppers consider descriptions the most important purchase factor"
        : undefined,
    },
    {
      id: "description.wordCount",
      label: `${de.wordCount} words`,
      passed: de.wordCount >= 100 && de.wordCount <= 400,
      weight: 8,
      detail:
        de.wordCount < 50
          ? "Too thin — aim for 100–400 words"
          : de.wordCount < 100
            ? "A bit short — 100–400 words is optimal"
            : de.wordCount > 600
              ? "Over 600 words risks losing readers before the buy button"
              : de.wordCount > 400
                ? "Slightly long — 100–400 words is the sweet spot"
                : undefined,
    },
    {
      id: "description.readingLevel",
      label: `Reading level: grade ${de.fleschKincaidGrade.toFixed(1)}`,
      passed: de.fleschKincaidGrade >= 4 && de.fleschKincaidGrade <= 10,
      weight: 8,
      detail:
        de.fleschKincaidGrade > 10
          ? "Too complex — grade 6–8 maximises comprehension"
          : de.fleschKincaidGrade < 4 && de.descriptionFound
            ? "Very simple — grade 6–8 is the target"
            : undefined,
    },
    {
      id: "description.avgSentence",
      label: `Avg sentence: ${de.avgSentenceLength.toFixed(0)} words`,
      passed: de.avgSentenceLength >= 10 && de.avgSentenceLength <= 20,
      weight: 8,
      detail:
        de.avgSentenceLength > 25
          ? "Sentences are too long — target 10–20 words per sentence"
          : de.avgSentenceLength < 8 && de.descriptionFound
            ? "Sentences are very short — 10–20 words is ideal"
            : undefined,
    },
    {
      id: "description.benefitRatio",
      label: `Benefit vs feature ratio: ${benefitPct}% benefit-focused`,
      passed: de.benefitRatio >= 0.3 && de.benefitRatio <= 0.7,
      weight: 8,
      detail:
        de.benefitRatio < 0.3 && de.benefitWordCount + de.featureWordCount > 3
          ? "Feature-heavy — lead with benefits over features for 12–24% higher conversion"
          : de.benefitRatio > 0.7 && de.benefitWordCount + de.featureWordCount > 3
            ? "Add more feature details — shoppers need specs to confirm their decision"
            : undefined,
    },
    {
      id: "description.emotional",
      label: `Emotional language: ${emotionalPct}%`,
      passed: de.emotionalDensity >= 0.02 && de.emotionalDensity <= 0.1,
      weight: 8,
      detail:
        de.emotionalDensity < 0.01 && de.descriptionFound
          ? "Copy feels flat — 3–8% emotional words drives higher engagement"
          : undefined,
    },
    {
      id: "description.htmlVariety",
      label: `${de.htmlTagVariety} formatting tag types`,
      passed: de.htmlTagVariety >= 4,
      weight: 8,
      detail:
        de.htmlTagVariety === 0 && de.descriptionFound
          ? "Plain text wall — add bold, bullets, and images"
          : de.htmlTagVariety < 4 && de.descriptionFound
            ? "Basic formatting — add more variety for better scannability"
            : undefined,
    },
    {
      id: "description.structure",
      label:
        de.hasHeadings && de.hasBulletLists
          ? "Structured layout (headings + bullets)"
          : de.hasHeadings
            ? "Has headings but no bullet lists"
            : de.hasBulletLists
              ? "Has bullets but no section headings"
              : "No structural elements",
      passed: de.hasHeadings && de.hasBulletLists,
      weight: 8,
      detail:
        !de.hasHeadings && de.descriptionFound
          ? "Add H2/H3 headings to break content into scannable sections"
          : !de.hasBulletLists && de.descriptionFound
            ? "Add bullet points — only 16% of users read word-for-word"
            : undefined,
    },
  ];

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Shipping Transparency — IssueCard.tsx 736–814
   ──────────────────────────────────────────────────────────────── */
export function buildShippingChecks(
  sh: ShippingSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const checks: DimensionCheck[] = [
    {
      id: "shipping.freeShipping",
      label: sh.hasFreeShipping
        ? "Free shipping detected"
        : "No free shipping messaging",
      passed: sh.hasFreeShipping,
      weight: 15,
      detail: !sh.hasFreeShipping
        ? "62% of shoppers won't purchase without free shipping"
        : undefined,
    },
    {
      id: "shipping.threshold",
      label: sh.hasFreeShippingThreshold
        ? `Free shipping threshold: $${sh.freeShippingThresholdValue ?? "?"}`
        : "No free shipping threshold",
      passed: sh.hasFreeShippingThreshold,
      weight: 3,
      detail:
        !sh.hasFreeShippingThreshold && sh.hasFreeShipping
          ? "Set threshold 10–15% above AOV — 58% of shoppers add items to qualify"
          : undefined,
    },
    {
      id: "shipping.deliveryDate",
      label: sh.hasDeliveryDate
        ? "Specific delivery date found"
        : "No specific delivery date",
      passed: sh.hasDeliveryDate,
      weight: 8,
      detail: !sh.hasDeliveryDate
        ? "'Arrives by Thursday, Feb 12' outperforms '3–5 business days' by 24%"
        : undefined,
    },
    {
      id: "shipping.deliveryEstimate",
      label: sh.hasDeliveryEstimate
        ? "Business-day estimate present"
        : "No delivery time estimate",
      passed: sh.hasDeliveryEstimate || sh.hasDeliveryDate,
      weight: 8,
      detail:
        !sh.hasDeliveryEstimate && !sh.hasDeliveryDate
          ? "75% of shoppers say delivery dates influence purchase decisions"
          : sh.hasDeliveryEstimate && !sh.hasDeliveryDate
            ? "Upgrade to a specific date for better conversion"
            : undefined,
    },
    {
      id: "shipping.eddApp",
      label: sh.hasEddApp ? "Delivery date app detected" : "No EDD app installed",
      passed: sh.hasEddApp,
      weight: 3,
      detail: !sh.hasEddApp
        ? "Apps like AfterShip EDD or Synctrack automate delivery estimates"
        : undefined,
    },
    {
      id: "shipping.costShown",
      label: sh.hasShippingCostShown
        ? "Shipping cost visible"
        : "No shipping cost shown",
      passed: sh.hasShippingCostShown,
      weight: 8,
      detail: !sh.hasShippingCostShown
        ? "Hidden extra costs cause 48% of all cart abandonment"
        : undefined,
    },
    {
      id: "shipping.structuredData",
      label: sh.hasShippingInStructuredData
        ? "shippingDetails in schema"
        : "No shippingDetails in schema",
      passed: sh.hasShippingInStructuredData,
      weight: 3,
      detail: !sh.hasShippingInStructuredData
        ? "Enables shipping info in Google Shopping and AI citations"
        : undefined,
    },
    {
      id: "shipping.policyLink",
      label: sh.hasShippingPolicyLink
        ? "Shipping policy link found"
        : "No shipping policy link",
      passed: sh.hasShippingPolicyLink,
      weight: 8,
      detail: !sh.hasShippingPolicyLink
        ? "A visible policy link reduces pre-purchase hesitation"
        : undefined,
    },
    {
      id: "shipping.returnsMentioned",
      label: sh.hasReturnsMentioned
        ? "Returns/refund info present"
        : "No returns info mentioned",
      passed: sh.hasReturnsMentioned,
      weight: 8,
      detail: !sh.hasReturnsMentioned
        ? "Combined shipping + returns transparency builds buyer confidence"
        : undefined,
    },
  ];

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Trust & Guarantees — IssueCard.tsx 815–891
   ──────────────────────────────────────────────────────────────── */
export function buildTrustChecks(
  tr: TrustSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const checks: DimensionCheck[] = [
    {
      id: "trust.moneyBackGuarantee",
      label: tr.hasMoneyBackGuarantee
        ? "Money-back guarantee detected"
        : "No money-back guarantee",
      passed: tr.hasMoneyBackGuarantee,
      weight: 8,
      detail: !tr.hasMoneyBackGuarantee
        ? "Money-back guarantees increase conversion up to 32%"
        : undefined,
    },
    {
      id: "trust.returnPolicy",
      label: tr.hasReturnPolicy
        ? "Return policy visible"
        : "No return policy visible",
      passed: tr.hasReturnPolicy,
      weight: 8,
      detail: !tr.hasReturnPolicy
        ? "Visible return policy lifts conversion 8–14% for products over $75"
        : undefined,
    },
    {
      id: "trust.securityBadge",
      label: tr.hasSecurityBadge ? "Security badge detected" : "No security badge",
      passed: tr.hasSecurityBadge,
      weight: 8,
      detail: !tr.hasSecurityBadge
        ? "Norton/McAfee badges increase conversion 12.2%"
        : undefined,
    },
    {
      id: "trust.safeCheckoutBadge",
      label: tr.hasSafeCheckoutBadge
        ? '"Guaranteed Safe Checkout" badge'
        : "No safe checkout badge",
      passed: tr.hasSafeCheckoutBadge,
      weight: 8,
      detail: !tr.hasSafeCheckoutBadge
        ? "Payment security icons lift conversion 11%"
        : undefined,
    },
    {
      id: "trust.badgeCount",
      label: `${tr.trustBadgeCount} trust badge${tr.trustBadgeCount !== 1 ? "s" : ""} found`,
      passed: tr.trustBadgeCount >= 2,
      weight: 8,
      detail:
        tr.trustBadgeCount === 0
          ? "Aim for 2–3 trust badges at 60–80px wide"
          : tr.trustBadgeCount > 3
            ? "More than 3 badges creates visual clutter"
            : undefined,
    },
    {
      id: "trust.secureCheckoutText",
      label: tr.hasSecureCheckoutText
        ? "Secure checkout messaging"
        : "No secure checkout text",
      passed: tr.hasSecureCheckoutText,
      weight: 3,
    },
    {
      id: "trust.paymentIcons",
      label: tr.hasPaymentIcons
        ? "Payment trust icons visible"
        : "No payment trust icons",
      passed: tr.hasPaymentIcons,
      weight: 8,
      detail: !tr.hasPaymentIcons
        ? "Familiar payment logos reduce checkout anxiety"
        : undefined,
    },
    {
      id: "trust.liveChat",
      label: tr.hasLiveChat ? "Live chat available" : "No live chat detected",
      passed: tr.hasLiveChat,
      weight: 3,
      detail: !tr.hasLiveChat
        ? "Live chat increases conversion 20% on average"
        : undefined,
    },
    {
      id: "trust.phoneNumber",
      label: tr.hasPhoneNumber ? "Phone number visible" : "No phone number",
      passed: tr.hasPhoneNumber,
      weight: 8,
      detail: !tr.hasPhoneNumber
        ? "Phone visibility is the #1 global trust symbol"
        : undefined,
    },
    {
      id: "trust.freeShippingBadge",
      label: tr.hasFreeShippingBadge
        ? "Free shipping messaging"
        : "No free shipping badge",
      passed: tr.hasFreeShippingBadge,
      weight: 3,
    },
    {
      id: "trust.nearAtc",
      label: tr.hasTrustNearAtc
        ? "Trust signals near Add to Cart"
        : "No trust signals near ATC",
      passed: tr.hasTrustNearAtc,
      weight: 8,
      detail: !tr.hasTrustNearAtc
        ? "Trust badges near ATC deliver 8–19% conversion lift"
        : undefined,
    },
  ];

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Page Speed — IssueCard.tsx 929–1004
   Special: emits one headline check carrying the full
   PageSpeedSignals payload (so the disclosure drawer can render
   <PageSpeedScorecard>) plus 1:1 ports of every HTML-derived
   <SignalRow> below.
   ──────────────────────────────────────────────────────────────── */
export function buildPageSpeedChecks(
  ps: PageSpeedSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const score = ps.performanceScore ?? 0;
  const headline: DimensionCheck = {
    id: "pageSpeed.overall",
    label:
      score >= 90
        ? `Page speed: ${score}/100`
        : `Page speed needs work: ${score}/100`,
    passed: score >= 90,
    weight: 15,
    detail:
      score >= 90
        ? "Lab Lighthouse score is in the green band"
        : "Slower pages lose ~7% conversion per second of load delay",
    pageSpeedSignals: ps,
  };

  const checks: DimensionCheck[] = [headline];

  checks.push(
    {
      id: "pageSpeed.thirdPartyScripts",
      label: `${ps.thirdPartyScriptCount} third-party script${ps.thirdPartyScriptCount !== 1 ? "s" : ""}`,
      passed: ps.thirdPartyScriptCount <= 5,
      weight: 8,
      detail:
        ps.thirdPartyScriptCount > 10
          ? "Over 10 third-party scripts significantly slows page load"
          : ps.thirdPartyScriptCount > 5
            ? "Consider auditing which scripts are essential"
            : undefined,
    },
    {
      id: "pageSpeed.renderBlocking",
      label: `${ps.renderBlockingScriptCount} render-blocking script${ps.renderBlockingScriptCount !== 1 ? "s" : ""}`,
      passed: ps.renderBlockingScriptCount === 0,
      weight: 8,
      detail:
        ps.renderBlockingScriptCount > 0
          ? "Defer or async non-critical scripts to unblock rendering"
          : undefined,
    },
    {
      id: "pageSpeed.lazyLoading",
      label: ps.hasLazyLoading
        ? "Lazy loading enabled"
        : "No lazy loading detected",
      passed: ps.hasLazyLoading,
      weight: 8,
      detail: !ps.hasLazyLoading
        ? "Lazy loading below-fold images saves bandwidth and speeds up FCP"
        : undefined,
    },
    {
      id: "pageSpeed.lcpImageLazyLoaded",
      label: ps.lcpImageLazyLoaded
        ? "⚠ LCP image is lazy-loaded"
        : "LCP image not lazy-loaded",
      passed: !ps.lcpImageLazyLoaded,
      weight: 8,
      detail: ps.lcpImageLazyLoaded
        ? "Never lazy-load the hero/LCP image — it delays the largest paint"
        : undefined,
    },
    {
      id: "pageSpeed.modernImageFormats",
      label: ps.hasModernImageFormats
        ? "WebP/AVIF images detected"
        : "No modern image formats",
      passed: ps.hasModernImageFormats,
      weight: 8,
      detail: !ps.hasModernImageFormats
        ? "WebP/AVIF saves 25–50% file size vs JPEG/PNG"
        : undefined,
    },
    {
      id: "pageSpeed.fontDisplaySwap",
      label: ps.hasFontDisplaySwap
        ? "font-display: swap used"
        : "No font-display: swap",
      passed: ps.hasFontDisplaySwap,
      weight: 3,
      detail: !ps.hasFontDisplaySwap
        ? "font-display: swap prevents invisible text during web font loading"
        : undefined,
    },
    {
      id: "pageSpeed.preconnect",
      label: ps.hasPreconnectHints
        ? "Preconnect hints found"
        : "No preconnect hints",
      passed: ps.hasPreconnectHints,
      weight: 3,
      detail: !ps.hasPreconnectHints
        ? "Preconnect to key origins saves 100–500ms per resource"
        : undefined,
    },
    {
      id: "pageSpeed.heroPreload",
      label: ps.hasHeroPreload ? "Hero image preloaded" : "No hero preload",
      passed: ps.hasHeroPreload,
      weight: 8,
      detail: !ps.hasHeroPreload
        ? "Preloading the hero image improves LCP significantly"
        : undefined,
    },
  );

  if (ps.detectedTheme) {
    checks.push({
      id: "pageSpeed.detectedTheme",
      label: `Theme: ${ps.detectedTheme}`,
      passed: true,
      weight: 3,
    });
  }

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Mobile CTA — IssueCard.tsx 1005–1079
   ──────────────────────────────────────────────────────────────── */
export function buildMobileCtaChecks(
  mc: MobileCtaSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const checks: DimensionCheck[] = [
    {
      id: "mobileCta.atcReachable",
      label: mc.ctaFound
        ? `CTA found: "${mc.ctaText ?? "Add to Cart"}"`
        : "No Add to Cart button detected",
      passed: mc.ctaFound,
      weight: 15,
      detail: !mc.ctaFound
        ? "A visible Add to Cart button is essential for conversion"
        : undefined,
    },
    {
      id: "mobileCta.viewportMeta",
      label: mc.hasViewportMeta
        ? "Viewport meta tag present"
        : "Missing viewport meta tag",
      passed: mc.hasViewportMeta,
      weight: 15,
      detail: !mc.hasViewportMeta
        ? "Viewport meta is required for proper mobile rendering"
        : undefined,
    },
    {
      id: "mobileCta.responsiveMeta",
      label: mc.hasResponsiveMeta
        ? "Responsive viewport configured"
        : "Non-responsive viewport",
      passed: mc.hasResponsiveMeta,
      weight: 8,
      detail: !mc.hasResponsiveMeta
        ? "Use width=device-width for responsive layout"
        : undefined,
    },
    {
      id: "mobileCta.tapTarget",
      label:
        mc.meetsMin44px === null
          ? "Button tap target: not measured"
          : mc.meetsOptimal60_72px
            ? `Button: ${mc.buttonHeightPx}px tall — optimal`
            : mc.meetsMin44px
              ? `Button: ${mc.buttonHeightPx}px tall — meets minimum`
              : `Button: ${mc.buttonHeightPx}px tall — too small`,
      passed: mc.meetsMin44px === true,
      weight: 8,
      detail:
        mc.meetsMin44px === false
          ? "Minimum 44px tap target (Apple HIG) — 60–72px is optimal for thumb reach"
          : mc.meetsMin44px === true && !mc.meetsOptimal60_72px
            ? "Meets minimum but 60–72px height converts better on mobile"
            : undefined,
    },
    {
      id: "mobileCta.aboveFold",
      label:
        mc.aboveFold === null
          ? "Fold position: not measured"
          : mc.aboveFold
            ? "CTA above the fold"
            : "CTA below the fold",
      passed: mc.aboveFold === true,
      weight: 8,
      detail:
        mc.aboveFold === false
          ? "70% of mobile users never scroll — keep CTA visible immediately"
          : undefined,
    },
    {
      id: "mobileCta.sticky",
      label: mc.isSticky ? "Sticky CTA enabled" : "No sticky CTA",
      passed: mc.isSticky === true,
      weight: 8,
      detail: !mc.isSticky
        ? "Sticky buy buttons keep the CTA visible during scroll"
        : mc.hasStickyApp
          ? `via ${mc.hasStickyApp}`
          : undefined,
    },
    {
      id: "mobileCta.fullWidth",
      label: mc.isFullWidth ? "Full-width button" : "Button is not full-width",
      passed: mc.isFullWidth === true,
      weight: 3,
      detail:
        mc.isFullWidth === false
          ? "Full-width buttons are easier to tap on mobile"
          : undefined,
    },
    {
      id: "mobileCta.thumbZone",
      label:
        mc.inThumbZone === null
          ? "Thumb zone: not measured"
          : mc.inThumbZone
            ? "CTA in thumb zone"
            : "CTA outside thumb zone",
      passed: mc.inThumbZone === true,
      weight: 3,
      detail:
        mc.inThumbZone === false
          ? "Place primary CTA in the bottom-center thumb zone for one-handed use"
          : undefined,
    },
  ];

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Cross-Sell — IssueCard.tsx 1080–1148
   ──────────────────────────────────────────────────────────────── */
export function buildCrossSellChecks(
  cs: CrossSellSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const checks: DimensionCheck[] = [
    {
      id: "crossSell.section",
      label: cs.hasCrossSellSection
        ? "Cross-sell section detected"
        : "No cross-sell section found",
      passed: cs.hasCrossSellSection,
      weight: 8,
      detail: !cs.hasCrossSellSection
        ? "Cross-sell recommendations increase AOV by 10–30%"
        : undefined,
    },
  ];

  if (cs.crossSellApp) {
    checks.push({
      id: "crossSell.app",
      label: `App: ${cs.crossSellApp}`,
      passed: true,
      weight: 3,
    });
  }
  if (cs.widgetType) {
    checks.push({
      id: "crossSell.widgetType",
      label: `Widget type: ${cs.widgetType}`,
      passed: true,
      weight: 3,
    });
  }

  checks.push(
    {
      id: "crossSell.productCount",
      label: `${cs.productCount} recommended product${cs.productCount !== 1 ? "s" : ""}`,
      passed: cs.recommendationCountOptimal,
      weight: 8,
      detail:
        cs.productCount === 0
          ? "Show 3–6 complementary products"
          : !cs.recommendationCountOptimal
            ? "Optimal is 3–6 recommendations — too many causes decision fatigue"
            : undefined,
    },
    {
      id: "crossSell.bundlePricing",
      label: cs.hasBundlePricing ? "Bundle pricing available" : "No bundle pricing",
      passed: cs.hasBundlePricing,
      weight: 3,
      detail:
        !cs.hasBundlePricing && cs.hasCrossSellSection
          ? "Bundle discounts increase cross-sell acceptance 25%"
          : undefined,
    },
    {
      id: "crossSell.bundleDiscount",
      label: cs.hasDiscountOnBundle
        ? "Bundle discount shown"
        : "No bundle discount",
      passed: cs.hasDiscountOnBundle,
      weight: 3,
      detail:
        !cs.hasDiscountOnBundle && cs.hasCrossSellSection
          ? "'Save 15% when bought together' is a proven conversion driver"
          : undefined,
    },
    {
      id: "crossSell.addAllToCart",
      label: cs.hasAddAllToCart
        ? "Add All to Cart button"
        : "No quick-add for bundle",
      passed: cs.hasAddAllToCart,
      weight: 3,
      detail:
        !cs.hasAddAllToCart && cs.hasCrossSellSection
          ? "One-click bundle add reduces friction"
          : undefined,
    },
    {
      id: "crossSell.checkboxSelection",
      label: cs.hasCheckboxSelection
        ? "Checkbox selection available"
        : "No item selection checkboxes",
      passed: cs.hasCheckboxSelection,
      weight: 3,
      detail:
        !cs.hasCheckboxSelection && cs.hasCrossSellSection
          ? "Let shoppers pick which items to add"
          : undefined,
    },
    {
      id: "crossSell.nearBuyButton",
      label: cs.nearBuyButton
        ? "Cross-sell near Buy button"
        : "Cross-sell not near Buy button",
      passed: cs.nearBuyButton,
      weight: 3,
      detail:
        !cs.nearBuyButton && cs.hasCrossSellSection
          ? "Proximity to the Buy button drives higher engagement"
          : undefined,
    },
  );

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Variant UX — IssueCard.tsx 1149–1215
   ──────────────────────────────────────────────────────────────── */
export function buildVariantUxChecks(
  vu: VariantUxSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const checks: DimensionCheck[] = [
    {
      id: "variantUx.hasVariants",
      label: vu.hasVariants
        ? "Product variants detected"
        : "No product variants found",
      passed: vu.hasVariants,
      weight: 8,
    },
    {
      id: "variantUx.visualSwatches",
      label: vu.hasVisualSwatches ? "Visual color swatches" : "No visual swatches",
      passed: vu.hasVisualSwatches,
      weight: 8,
      detail:
        !vu.hasVisualSwatches && vu.hasVariants
          ? "Visual swatches increase engagement 26% vs text-only selectors"
          : undefined,
    },
    {
      id: "variantUx.colorDropdown",
      label: vu.colorUsesDropdown
        ? "Color uses dropdown (not ideal)"
        : "Color not using dropdown",
      passed: !vu.colorUsesDropdown,
      weight: 3,
      detail: vu.colorUsesDropdown
        ? "Replace color dropdowns with visual swatches — 60% of shoppers prefer them"
        : undefined,
    },
    {
      id: "variantUx.variantImageLink",
      label: vu.hasVariantImageLink
        ? "Variants update product image"
        : "Variant selection doesn't update image",
      passed: vu.hasVariantImageLink,
      weight: 3,
      detail:
        !vu.hasVariantImageLink && vu.hasVariants
          ? "Linking variants to images reduces return rate 5–10%"
          : undefined,
    },
    {
      id: "variantUx.stockIndicator",
      label: vu.hasStockIndicator ? "Stock indicator present" : "No stock indicator",
      passed: vu.hasStockIndicator,
      weight: 8,
      detail:
        !vu.hasStockIndicator && vu.hasVariants
          ? "Per-variant stock status reduces disappointment at checkout"
          : undefined,
    },
    {
      id: "variantUx.lowStockUrgency",
      label: vu.hasLowStockUrgency
        ? "Low-stock urgency messaging"
        : "No low-stock urgency",
      passed: vu.hasLowStockUrgency,
      weight: 3,
      detail:
        !vu.hasLowStockUrgency && vu.hasVariants
          ? "'Only 3 left' messaging drives urgency and faster decisions"
          : undefined,
    },
    {
      id: "variantUx.soldOutHandling",
      label: vu.hasSoldOutHandling
        ? "Sold-out variants handled"
        : "No sold-out handling",
      passed: vu.hasSoldOutHandling,
      weight: 8,
      detail:
        !vu.hasSoldOutHandling && vu.hasVariants
          ? "Gray out or label sold-out variants instead of hiding them"
          : undefined,
    },
    {
      id: "variantUx.notifyMe",
      label: vu.hasNotifyMe
        ? "Back-in-stock notification"
        : "No notify-me option",
      passed: vu.hasNotifyMe,
      weight: 3,
      detail:
        !vu.hasNotifyMe && vu.hasVariants
          ? "Back-in-stock alerts recover 5–15% of otherwise lost sales"
          : undefined,
    },
  ];

  if (vu.swatchApp) {
    checks.push({
      id: "variantUx.swatchApp",
      label: `Swatch app: ${vu.swatchApp}`,
      passed: true,
      weight: 3,
    });
  }

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Size Guide — IssueCard.tsx 1216–1283
   ──────────────────────────────────────────────────────────────── */
export function buildSizeGuideChecks(
  sg: SizeGuideSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const checks: DimensionCheck[] = [
    {
      id: "sizeGuide.linkPresent",
      label: sg.hasSizeGuideLink ? "Size guide link present" : "No size guide link",
      passed: sg.hasSizeGuideLink,
      weight: 8,
      detail:
        !sg.hasSizeGuideLink && sg.categoryApplicable
          ? "Size guides reduce returns by 32% in apparel/footwear"
          : undefined,
    },
    {
      id: "sizeGuide.popup",
      label: sg.hasSizeGuidePopup
        ? "Size guide opens in popup/modal"
        : "No size guide popup",
      passed: sg.hasSizeGuidePopup,
      weight: 3,
      detail:
        !sg.hasSizeGuidePopup && sg.hasSizeGuideLink
          ? "Popup keeps shoppers on the product page while checking sizing"
          : undefined,
    },
    {
      id: "sizeGuide.chartTable",
      label: sg.hasSizeChartTable
        ? "Size chart table found"
        : "No size chart table",
      passed: sg.hasSizeChartTable,
      weight: 8,
      detail:
        !sg.hasSizeChartTable && sg.categoryApplicable
          ? "Comparison tables make size selection faster and more confident"
          : undefined,
    },
    {
      id: "sizeGuide.fitFinder",
      label: sg.hasFitFinder ? "Fit finder / quiz detected" : "No fit finder tool",
      passed: sg.hasFitFinder,
      weight: 3,
      detail:
        !sg.hasFitFinder && sg.categoryApplicable
          ? "Interactive fit finders increase conversion 20% and reduce returns"
          : undefined,
    },
    {
      id: "sizeGuide.modelMeasurements",
      label: sg.hasModelMeasurements
        ? "Model measurements shown"
        : "No model measurements",
      passed: sg.hasModelMeasurements,
      weight: 3,
      detail:
        !sg.hasModelMeasurements && sg.categoryApplicable
          ? "'Model is 5'10\" wearing size M' gives a concrete reference point"
          : undefined,
    },
    {
      id: "sizeGuide.fitRecommendation",
      label: sg.hasFitRecommendation
        ? "Fit recommendation present"
        : "No fit recommendation",
      passed: sg.hasFitRecommendation,
      weight: 3,
      detail:
        !sg.hasFitRecommendation && sg.categoryApplicable
          ? "'Runs true to size' or 'Order one size up' reduces hesitation"
          : undefined,
    },
    {
      id: "sizeGuide.measurementInstructions",
      label: sg.hasMeasurementInstructions
        ? "How-to-measure instructions"
        : "No measurement instructions",
      passed: sg.hasMeasurementInstructions,
      weight: 3,
      detail:
        !sg.hasMeasurementInstructions && sg.categoryApplicable
          ? "Self-measurement guides reduce sizing errors"
          : undefined,
    },
    {
      id: "sizeGuide.nearSizeSelector",
      label: sg.nearSizeSelector
        ? "Size guide near size selector"
        : "Size guide not near selector",
      passed: sg.nearSizeSelector,
      weight: 3,
      detail:
        !sg.nearSizeSelector && sg.hasSizeGuideLink
          ? "Place the size guide link directly next to the size dropdown"
          : undefined,
    },
  ];

  if (sg.sizeGuideApp) {
    checks.push({
      id: "sizeGuide.app",
      label: `App: ${sg.sizeGuideApp}`,
      passed: true,
      weight: 3,
    });
  }

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   AI Discoverability — IssueCard.tsx 1284–1362
   ──────────────────────────────────────────────────────────────── */
export function buildAiDiscoverabilityChecks(
  ad: AiDiscoverabilitySignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const ogPresent = [ad.hasOgType, ad.hasOgTitle, ad.hasOgDescription, ad.hasOgImage]
    .filter(Boolean).length;

  const checks: DimensionCheck[] = [
    {
      id: "aiDiscoverability.robotsTxt",
      label:
        ad.robotsTxtExists === null
          ? "robots.txt: could not check"
          : ad.robotsTxtExists
            ? "robots.txt exists"
            : "No robots.txt found",
      passed: ad.robotsTxtExists === true,
      weight: 8,
      detail:
        ad.robotsTxtExists === false
          ? "robots.txt tells AI crawlers what they can and can't index"
          : undefined,
    },
    {
      id: "aiDiscoverability.wildcardBlock",
      label: ad.hasWildcardBlock
        ? "⚠ Wildcard User-agent block detected"
        : "No wildcard bot block",
      passed: !ad.hasWildcardBlock,
      weight: 8,
      detail: ad.hasWildcardBlock
        ? "Disallow * blocks all bots including AI search — use targeted rules instead"
        : undefined,
    },
    {
      id: "aiDiscoverability.aiBotsAllowed",
      label: `${ad.aiSearchBotsAllowedCount} AI search bot${ad.aiSearchBotsAllowedCount !== 1 ? "s" : ""} allowed`,
      passed: ad.aiSearchBotsAllowedCount >= 2,
      weight: 8,
      detail:
        ad.aiSearchBotsAllowedCount === 0
          ? "Allow OAI-SearchBot, PerplexityBot, and ClaudeBot for AI search visibility"
          : undefined,
    },
    {
      id: "aiDiscoverability.oaiSearchBot",
      label: ad.hasOaiSearchbotAllowed
        ? "OAI-SearchBot allowed"
        : "OAI-SearchBot not allowed",
      passed: ad.hasOaiSearchbotAllowed,
      weight: 3,
    },
    {
      id: "aiDiscoverability.perplexityBot",
      label: ad.hasPerplexitybotAllowed
        ? "PerplexityBot allowed"
        : "PerplexityBot not allowed",
      passed: ad.hasPerplexitybotAllowed,
      weight: 3,
    },
    {
      id: "aiDiscoverability.claudeBot",
      label: ad.hasClaudeSearchbotAllowed
        ? "ClaudeBot allowed"
        : "ClaudeBot not allowed",
      passed: ad.hasClaudeSearchbotAllowed,
      weight: 3,
    },
    {
      id: "aiDiscoverability.llmsTxt",
      label:
        ad.llmsTxtExists === null
          ? "llms.txt: could not check"
          : ad.llmsTxtExists
            ? "llms.txt exists"
            : "No llms.txt found",
      passed: ad.llmsTxtExists === true,
      weight: 3,
      detail:
        ad.llmsTxtExists === false
          ? "llms.txt provides structured context for AI assistants"
          : undefined,
    },
    {
      id: "aiDiscoverability.openGraphTags",
      label: `OpenGraph tags: ${ogPresent} of 4`,
      passed: ogPresent === 4,
      weight: 8,
      detail:
        ogPresent < 4
          ? `Missing: ${[
              !ad.hasOgType && "og:type",
              !ad.hasOgTitle && "og:title",
              !ad.hasOgDescription && "og:description",
              !ad.hasOgImage && "og:image",
            ]
              .filter(Boolean)
              .join(", ")}`
          : undefined,
    },
    {
      id: "aiDiscoverability.structuredSpecs",
      label: ad.hasStructuredSpecs
        ? "Structured specifications found"
        : "No structured specs",
      passed: ad.hasStructuredSpecs,
      weight: 8,
      detail: !ad.hasStructuredSpecs
        ? "Structured specs help AI extract concrete product attributes"
        : undefined,
    },
    {
      id: "aiDiscoverability.faqContent",
      label: ad.hasFaqContent ? "FAQ content detected" : "No FAQ section",
      passed: ad.hasFaqContent,
      weight: 8,
      detail: !ad.hasFaqContent
        ? "FAQ sections are prime targets for AI answer extraction"
        : undefined,
    },
    {
      id: "aiDiscoverability.entityDensity",
      label: `Entity density: ${(ad.entityDensityScore * 100).toFixed(0)}%`,
      passed: ad.entityDensityScore >= 0.03,
      weight: 8,
      detail:
        ad.entityDensityScore < 0.03
          ? "Low entity density — add more concrete specs, measurements, and data points"
          : undefined,
    },
  ];

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Content Freshness — IssueCard.tsx 1363–1441
   ──────────────────────────────────────────────────────────────── */
export function buildContentFreshnessChecks(
  cf: ContentFreshnessSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const ageLabel = (days: number | null) => {
    if (days == null) return null;
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.round(days / 30)}mo ago`;
    return `${(days / 365).toFixed(1)}yr ago`;
  };

  const checks: DimensionCheck[] = [
    {
      id: "contentFreshness.copyrightYear",
      label: cf.copyrightYear
        ? `Copyright year: ${cf.copyrightYear}`
        : "No copyright year found",
      passed: cf.copyrightYearIsCurrent,
      weight: 3,
      detail:
        cf.copyrightYear && !cf.copyrightYearIsCurrent
          ? "Outdated copyright year makes the site look abandoned"
          : undefined,
    },
    {
      id: "contentFreshness.expiredPromotion",
      label: cf.hasExpiredPromotion
        ? `Expired promotion detected`
        : "No expired promotions",
      passed: !cf.hasExpiredPromotion,
      weight: 3,
      detail: cf.hasExpiredPromotion
        ? cf.expiredPromotionText
          ? `"${cf.expiredPromotionText.slice(0, 60)}${cf.expiredPromotionText.length > 60 ? "…" : ""}"`
          : "Expired deals erode trust — remove or update them"
        : undefined,
    },
    {
      id: "contentFreshness.seasonalMismatch",
      label: cf.hasSeasonalMismatch
        ? "Seasonal content mismatch"
        : "No seasonal mismatch",
      passed: !cf.hasSeasonalMismatch,
      weight: 3,
      detail: cf.hasSeasonalMismatch
        ? "Off-season promotions make the page look neglected"
        : undefined,
    },
    {
      id: "contentFreshness.newLabel",
      label: cf.hasNewLabel
        ? cf.newLabelIsStale
          ? "'New' label but product is stale"
          : "'New' label present"
        : "No 'New' label",
      passed: cf.hasNewLabel && !cf.newLabelIsStale,
      weight: 3,
      detail: cf.newLabelIsStale
        ? "Remove 'New' badges from products older than 90 days"
        : undefined,
    },
    {
      id: "contentFreshness.latestReview",
      label: cf.mostRecentReviewDateIso
        ? `Latest review: ${ageLabel(cf.reviewAgeDays) ?? cf.mostRecentReviewDateIso.slice(0, 10)}`
        : "No review dates found",
      passed: cf.reviewStaleness === "fresh" || cf.reviewStaleness === "moderate",
      weight: 3,
      detail:
        cf.reviewStaleness === "stale"
          ? "Reviews older than 12 months erode buyer confidence"
          : cf.reviewStaleness === "moderate"
            ? "Recent reviews would strengthen trust — consider a review request campaign"
            : undefined,
    },
    {
      id: "contentFreshness.dateModified",
      label: cf.dateModifiedIso
        ? `Last modified: ${ageLabel(cf.dateModifiedAgeDays) ?? cf.dateModifiedIso.slice(0, 10)}`
        : "No dateModified in schema",
      passed: cf.dateModifiedAgeDays != null && cf.dateModifiedAgeDays < 180,
      weight: 3,
      detail:
        cf.dateModifiedAgeDays != null && cf.dateModifiedAgeDays > 365
          ? "Schema shows content unchanged for over a year — search engines notice"
          : undefined,
    },
    {
      id: "contentFreshness.lastModifiedHeader",
      label: cf.lastModifiedHeader
        ? `Last-Modified header: ${ageLabel(cf.lastModifiedAgeDays) ?? cf.lastModifiedHeader}`
        : "No Last-Modified HTTP header",
      passed: cf.lastModifiedAgeDays != null && cf.lastModifiedAgeDays < 180,
      weight: 3,
    },
    {
      id: "contentFreshness.freshestSignal",
      label:
        cf.freshestSignalAgeDays != null
          ? `Freshest signal: ${ageLabel(cf.freshestSignalAgeDays)}`
          : "No freshness signals detected",
      passed: cf.freshestSignalAgeDays != null && cf.freshestSignalAgeDays < 90,
      weight: 3,
      detail:
        cf.freshestSignalAgeDays != null && cf.freshestSignalAgeDays > 365
          ? "All content signals are over a year old — page appears dormant to both users and AI"
          : undefined,
    },
  ];

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Accessibility — IssueCard.tsx 892–910
   Special: emit synthesized critical/serious/moderate/minor
   bucket checks (driven by the *Count fields on AccessibilitySignals)
   plus a `rules` catch-all — `CheckRow` renders rules in the
   disclosure drawer via the `RuleList` component.
   When `scanCompleted === false` the dimension was never scanned,
   so we emit an empty array.
   ──────────────────────────────────────────────────────────────── */
export function buildAccessibilityChecks(
  ac: AccessibilitySignals,
  leak?: LeakCard,
): DimensionCheck[] {
  if (ac.scanCompleted === false) return [];

  // Mirror IssueCard.tsx's AccessibilityChecklist 1:1 — six specific
  // violation rows, not bucketed severity counts. Weights are derived
  // from the storewide axe `impactToWeight` ladder (contrast/alt-text
  // are critical; empty link/button + form labels are serious; doc
  // language is moderate).
  const checks: DimensionCheck[] = [
    {
      id: "accessibility.contrast",
      label:
        ac.contrastViolations === 0
          ? "Color contrast passes"
          : `${ac.contrastViolations} contrast violation(s)`,
      passed: ac.contrastViolations === 0,
      weight: 15,
    },
    {
      id: "accessibility.altText",
      label:
        ac.altTextViolations === 0
          ? "All images have alt text"
          : `${ac.altTextViolations} missing alt text`,
      passed: ac.altTextViolations === 0,
      weight: 15,
    },
    {
      id: "accessibility.formLabels",
      label:
        ac.formLabelViolations === 0
          ? "All form inputs labeled"
          : `${ac.formLabelViolations} unlabeled input(s)`,
      passed: ac.formLabelViolations === 0,
      weight: 8,
    },
    {
      id: "accessibility.emptyLinks",
      label:
        ac.emptyLinkViolations === 0
          ? "All links have names"
          : `${ac.emptyLinkViolations} empty link(s)`,
      passed: ac.emptyLinkViolations === 0,
      weight: 8,
    },
    {
      id: "accessibility.emptyButtons",
      label:
        ac.emptyButtonViolations === 0
          ? "All buttons have names"
          : `${ac.emptyButtonViolations} empty button(s)`,
      passed: ac.emptyButtonViolations === 0,
      weight: 8,
    },
    {
      id: "accessibility.documentLanguage",
      label:
        ac.documentLanguageViolations === 0
          ? "Document language set"
          : "Missing document language",
      passed: ac.documentLanguageViolations === 0,
      weight: 4,
    },
  ];

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Social Commerce — IssueCard.tsx 911–928
   ──────────────────────────────────────────────────────────────── */
export function buildSocialCommerceChecks(
  sc: SocialCommerceSignals,
  leak?: LeakCard,
): DimensionCheck[] {
  const checks: DimensionCheck[] = [
    {
      id: "socialCommerce.instagram",
      label: "Instagram embed detected",
      passed: sc.hasInstagramEmbed,
      weight: 3,
    },
    {
      id: "socialCommerce.tiktok",
      label: "TikTok embed detected",
      passed: sc.hasTiktokEmbed,
      weight: 3,
    },
    {
      id: "socialCommerce.pinterest",
      label: "Pinterest integration detected",
      passed: sc.hasPinterest,
      weight: 3,
    },
    {
      id: "socialCommerce.ugcGallery",
      label: sc.ugcGalleryApp
        ? `UGC gallery: ${sc.ugcGalleryApp}`
        : "UGC gallery app detected",
      passed: sc.hasUgcGallery,
      weight: 8,
    },
    {
      id: "socialCommerce.platformCount",
      label: `${sc.platformCount} platform(s) integrated`,
      passed: sc.platformCount >= 2,
      weight: 3,
    },
  ];

  return applyLeakMerge(checks, leak);
}

/* ────────────────────────────────────────────────────────────────
   Top-level dispatch
   ──────────────────────────────────────────────────────────────── */
export function buildProductChecks(
  result: FreeResult,
  productLeaks: LeakCard[],
): DimensionCheck[] {
  const signals = result.signals;
  if (!signals) return [];
  const out: DimensionCheck[] = [];
  const leakFor = (key: string) => productLeaks.find((l) => l.key === key);

  if (signals.socialProof)
    out.push(...buildSocialProofChecks(signals.socialProof, leakFor("socialProof")));
  if (signals.structuredData)
    out.push(
      ...buildStructuredDataChecks(signals.structuredData, leakFor("structuredData")),
    );
  if (signals.checkout)
    out.push(...buildCheckoutChecks(signals.checkout, leakFor("checkout")));
  if (signals.pricing)
    out.push(...buildPricingChecks(signals.pricing, leakFor("pricing")));
  if (signals.images)
    out.push(...buildImagesChecks(signals.images, leakFor("images")));
  if (signals.title)
    out.push(...buildTitleChecks(signals.title, leakFor("title")));
  if (signals.description)
    out.push(...buildDescriptionChecks(signals.description, leakFor("description")));
  if (signals.shipping)
    out.push(...buildShippingChecks(signals.shipping, leakFor("shipping")));
  if (signals.trust)
    out.push(...buildTrustChecks(signals.trust, leakFor("trust")));
  if (signals.pageSpeed)
    out.push(...buildPageSpeedChecks(signals.pageSpeed, leakFor("pageSpeed")));
  if (signals.mobileCta)
    out.push(...buildMobileCtaChecks(signals.mobileCta, leakFor("mobileCta")));
  if (signals.crossSell)
    out.push(...buildCrossSellChecks(signals.crossSell, leakFor("crossSell")));
  if (signals.variantUx)
    out.push(...buildVariantUxChecks(signals.variantUx, leakFor("variantUx")));
  if (signals.sizeGuide)
    out.push(...buildSizeGuideChecks(signals.sizeGuide, leakFor("sizeGuide")));
  if (signals.aiDiscoverability)
    out.push(
      ...buildAiDiscoverabilityChecks(
        signals.aiDiscoverability,
        leakFor("aiDiscoverability"),
      ),
    );
  if (signals.contentFreshness)
    out.push(
      ...buildContentFreshnessChecks(
        signals.contentFreshness,
        leakFor("contentFreshness"),
      ),
    );
  if (signals.accessibility)
    out.push(
      ...buildAccessibilityChecks(signals.accessibility, leakFor("accessibility")),
    );
  if (signals.socialCommerce)
    out.push(
      ...buildSocialCommerceChecks(signals.socialCommerce, leakFor("socialCommerce")),
    );

  // Free-tier strip: backend already drops `tips`/`steps`, but
  // remediation/code stamps from leak-merge live client-side and need
  // to be removed for free / anonymous viewers.
  return result.recommendationsLocked
    ? out.map((c) => ({ ...c, remediation: undefined, code: undefined }))
    : out;
}

/* ────────────────────────────────────────────────────────────────
   Per-dimension grouped output for the AnalysisResults accordion.
   Order: worst score first (so the dimension with the most issues
   surfaces at the top and gets opened by default). Dimensions
   without any signals on the result are skipped entirely.
   ──────────────────────────────────────────────────────────────── */

type DimensionBuilder = (
  result: FreeResult,
  leak: LeakCard | undefined,
) => DimensionCheck[];

const DIMENSION_BUILDERS: Record<string, DimensionBuilder> = {
  socialProof: (r, l) =>
    r.signals?.socialProof ? buildSocialProofChecks(r.signals.socialProof, l) : [],
  structuredData: (r, l) =>
    r.signals?.structuredData ? buildStructuredDataChecks(r.signals.structuredData, l) : [],
  checkout: (r, l) =>
    r.signals?.checkout ? buildCheckoutChecks(r.signals.checkout, l) : [],
  pricing: (r, l) =>
    r.signals?.pricing ? buildPricingChecks(r.signals.pricing, l) : [],
  images: (r, l) =>
    r.signals?.images ? buildImagesChecks(r.signals.images, l) : [],
  title: (r, l) =>
    r.signals?.title ? buildTitleChecks(r.signals.title, l) : [],
  description: (r, l) =>
    r.signals?.description ? buildDescriptionChecks(r.signals.description, l) : [],
  shipping: (r, l) =>
    r.signals?.shipping ? buildShippingChecks(r.signals.shipping, l) : [],
  trust: (r, l) =>
    r.signals?.trust ? buildTrustChecks(r.signals.trust, l) : [],
  pageSpeed: (r, l) =>
    r.signals?.pageSpeed ? buildPageSpeedChecks(r.signals.pageSpeed, l) : [],
  mobileCta: (r, l) =>
    r.signals?.mobileCta ? buildMobileCtaChecks(r.signals.mobileCta, l) : [],
  crossSell: (r, l) =>
    r.signals?.crossSell ? buildCrossSellChecks(r.signals.crossSell, l) : [],
  variantUx: (r, l) =>
    r.signals?.variantUx ? buildVariantUxChecks(r.signals.variantUx, l) : [],
  sizeGuide: (r, l) =>
    r.signals?.sizeGuide ? buildSizeGuideChecks(r.signals.sizeGuide, l) : [],
  aiDiscoverability: (r, l) =>
    r.signals?.aiDiscoverability
      ? buildAiDiscoverabilityChecks(r.signals.aiDiscoverability, l)
      : [],
  contentFreshness: (r, l) =>
    r.signals?.contentFreshness
      ? buildContentFreshnessChecks(r.signals.contentFreshness, l)
      : [],
  accessibility: (r, l) =>
    r.signals?.accessibility ? buildAccessibilityChecks(r.signals.accessibility, l) : [],
  socialCommerce: (r, l) =>
    r.signals?.socialCommerce
      ? buildSocialCommerceChecks(r.signals.socialCommerce, l)
      : [],
};

export function buildProductDimensions(
  result: FreeResult,
  productLeaks: LeakCard[],
): ProductDimensionGroup[] {
  if (!result.signals) return [];
  const leakFor = (key: string) => productLeaks.find((l) => l.key === key);
  const categories = result.categories as Partial<CategoryScores>;
  const groups: ProductDimensionGroup[] = [];

  for (const [key, build] of Object.entries(DIMENSION_BUILDERS)) {
    // Only product-scope dimensions appear on the per-product surface.
    // Store-wide dimensions (pageSpeed, checkout, accessibility, etc.)
    // are owned by the storewide route — duplicating them here would
    // confuse users and dilute the storewide page's purpose.
    if (!PRODUCT_LEVEL_DIMENSIONS.has(key)) continue;

    const checks = build(result, leakFor(key));
    if (checks.length === 0) continue;

    const stripped = result.recommendationsLocked
      ? checks.map((c) => ({ ...c, remediation: undefined, code: undefined }))
      : checks;

    const matchingLeak = leakFor(key);
    const score = (categories[key as keyof CategoryScores] ?? 100) as number;

    groups.push({
      key,
      label: CATEGORY_LABELS[key] ?? key,
      score,
      conversionLoss: matchingLeak?.conversionLoss ?? 0,
      checks: stripped,
    });
  }

  // Worst score first — pushes the most actionable dimension to the
  // top so the default-expanded section is the one users should fix.
  // Tie-breaker: more failing checks first.
  groups.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const aFail = a.checks.filter((c) => !c.passed).length;
    const bFail = b.checks.filter((c) => !c.passed).length;
    return bFail - aFail;
  });

  return groups;
}

/* ────────────────────────────────────────────────────────────────
   buildProductGroups — pool per-dimension data into the 5 thematic
   `DIMENSION_GROUPS` buckets. Sorted by avgScore ascending (worst
   first) so the default-selected card in the Score breakdown grid
   is the one users should fix.
   ──────────────────────────────────────────────────────────────── */
export function buildProductGroups(
  result: FreeResult,
  productLeaks: LeakCard[],
): ProductGroupView[] {
  const dimensions = buildProductDimensions(result, productLeaks);
  const dimByKey = new Map(dimensions.map((d) => [d.key, d]));

  const views: ProductGroupView[] = [];

  for (const group of DIMENSION_GROUPS) {
    const dims = group.keys
      .map((k) => dimByKey.get(k as string))
      .filter((d): d is ProductDimensionGroup => d !== undefined);
    if (dims.length === 0) continue;

    const checks = dims.flatMap((d) => d.checks);
    const checkDimensionKey: Record<string, string> = {};
    for (const dim of dims) {
      for (const c of dim.checks) checkDimensionKey[c.id] = dim.key;
    }

    const avgScore = Math.round(
      dims.reduce((s, d) => s + d.score, 0) / dims.length,
    );
    const conversionLoss =
      Math.round(dims.reduce((s, d) => s + d.conversionLoss, 0) * 10) / 10;

    views.push({
      id: group.id,
      label: group.label,
      question: group.question,
      avgScore,
      conversionLoss,
      checks,
      checkDimensionKey,
      dimensions: dims,
    });
  }

  views.sort((a, b) => {
    if (a.avgScore !== b.avgScore) return a.avgScore - b.avgScore;
    const aFail = a.checks.filter((c) => !c.passed).length;
    const bFail = b.checks.filter((c) => !c.passed).length;
    return bFail - aFail;
  });

  return views;
}
