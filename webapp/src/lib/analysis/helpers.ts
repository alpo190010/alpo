import type { CategoryScores, DimensionSignals, FreeResult, LeakCard } from "./types";
export type { StoreAnalysisData, DimensionCheck } from "./types";
import {
  CATEGORY_LABELS, CATEGORY_PROBLEMS, CATEGORY_REVENUE_IMPACT,
  DIMENSION_GROUPS, ACTIVE_DIMENSIONS, DIMENSION_IMPACT_WEIGHTS, STORE_WIDE_DIMENSIONS,
  type DimensionGroup,
} from "./constants";
import { calculateConversionLoss } from "./conversion-model";

/* ── Lazy PostHog — don't block initial paint with 176KB bundle ── */
export function captureEvent(event: string, properties?: Record<string, unknown>) {
  import("posthog-js").then(({ default: posthog }) => {
    try { posthog.capture(event, properties); } catch { /* not initialized */ }
  });
}

/* calculateConversionLoss & calculateDollarLossPerThousand re-exported from conversion-model.ts (pure TS, SSR-safe) */
export { calculateConversionLoss, calculateDollarLossPerThousand, getDimensionAccess } from "./conversion-model";
export type { PlanTier } from "./types";
export type { DimensionAccess } from "./conversion-model";

/** Score → CSS color variable */
export function scoreColor(score: number): string {
  if (score >= 70) return "var(--success)";
  if (score >= 40) return "var(--warning)";
  return "var(--error)";
}
export function scoreColorText(score: number): string {
  if (score >= 70) return "var(--success-text)";
  if (score >= 40) return "var(--warning-text)";
  return "var(--error-text)";
}
export function scoreColorTintBg(score: number): string {
  if (score >= 70) return "var(--success-light)";
  if (score >= 40) return "var(--warning-light)";
  return "var(--error-light)";
}

/** Non-null availability payload describing why a dimension's score is limited or missing. */
export interface DimensionAvailabilityInfo {
  /** Short chip label for card UIs. */
  label: string;
  /** One-line explanation for detail panes. */
  detail: string;
}

/**
 * Three store-wide dimensions depend on external inputs (axe, Google PSI,
 * robots.txt / llms.txt) that can fail silently and leave the score computed
 * from a narrower signal set — or, for accessibility, not computed at all.
 * Returns a payload when the UI should surface that to the user, null when the
 * dimension is fully analyzed or not one of the gated three.
 */
export function dimensionAvailability(
  key: string,
  signals: Partial<DimensionSignals> | undefined | null,
): DimensionAvailabilityInfo | null {
  if (!signals) return null;
  if (key === "accessibility" && signals.accessibility?.scanCompleted === false) {
    return {
      label: "Scan unavailable",
      detail: "Accessibility scan didn't run — no score computed for this dimension.",
    };
  }
  if (key === "pageSpeed" && signals.pageSpeed && signals.pageSpeed.performanceScore == null) {
    return {
      label: "Limited",
      detail: "Google PageSpeed Insights didn't respond — score derived from HTML-only signals.",
    };
  }
  if (
    key === "aiDiscoverability" &&
    signals.aiDiscoverability &&
    signals.aiDiscoverability.robotsTxtExists == null
  ) {
    return {
      label: "Limited",
      detail: "Couldn't fetch robots.txt — score derived from HTML-only signals.",
    };
  }
  return null;
}

/** Build leak cards from categories + tips, sorted worst-first.
 *  Each card computes per-dimension conversion loss via calculateConversionLoss().
 *  Revenue string shows "~X% conversion loss" instead of dollar estimates.
 *  When dimensionTips is provided, each card gets its own dimension-specific
 *  tip instead of a positional index into the flat tips array. */
export function buildLeaks(
  categories: CategoryScores,
  tips: string[],
  dimensionTips?: Record<string, string[]>,
): LeakCard[] {
  const entries = (Object.entries(categories) as [keyof CategoryScores, number][])
    .filter(([key]) => ACTIVE_DIMENSIONS.has(key));
  entries.sort((a, b) => a[1] - b[1]);

  return entries.map((entry, i) => {
    const [key, catScore] = entry;
    const impact = i < 3 ? "HIGH" : i < 8 ? "MED" : "LOW";

    /* Per-dimension conversion loss via weighted formula */
    const conversionLoss = calculateConversionLoss(catScore, key);
    const revenue = `~${conversionLoss}% conversion loss`;

    const problems = CATEGORY_PROBLEMS[key] || { low: `Improve your ${key} to increase conversions.`, mid: `Your ${key} needs optimization.` };
    const problem = catScore <= 40 ? problems.low : problems.mid;
    const dimTips = dimensionTips?.[key];
    const tip = dimTips?.[0] || tips[i] || `Improve your ${key} to increase conversions.`;
    const revenueImpact = CATEGORY_REVENUE_IMPACT[key] || "Medium";
    return { key, catScore, impact, revenue, conversionLoss, tip, problem, category: CATEGORY_LABELS[key] || key, revenueImpact };
  });
}

/** URL validation — returns normalized URL or null */
export function isValidUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length > 2048) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (!parsed.hostname.includes(".")) return null;
    // Block localhost and private/reserved IPs
    const h = parsed.hostname;
    if (
      h === "localhost" ||
      h.startsWith("127.") ||
      h.startsWith("0.") ||
      h.startsWith("10.") ||
      h.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h)
    )
      return null;
    return parsed.href;
  } catch { return null; }
}

export function isProductPageUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return /\/products\/[^/]+/.test(path) || /\/p\/[^/]+/.test(path);
  } catch { return false; }
}

export function extractDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return ""; }
}

/** Convert a raw domain/hostname to a brand-like display name.
 *  "allbirds.com" → "allbirds"
 *  "www.allbirds.com" → "allbirds"
 *  "shop.allbirds.co.uk" → "allbirds"
 *  Names that don't look like a hostname (contain whitespace, no dot) are
 *  returned untouched so real brand names like "Dr. Martens" pass through. */
export function domainToBrand(input: string): string {
  if (!input) return input;
  if (/\s/.test(input)) return input;
  if (!input.includes(".")) return input;
  let host = input.replace(/^https?:\/\//, "").split("/")[0] ?? input;
  host = host.replace(/^(www|shop|store|m)\./i, "");
  host = host.replace(/\.co\.(uk|jp|in|kr|nz|za)$/i, "");
  host = host.replace(/\.com\.(au|br|mx|cn)$/i, "");
  const lastDot = host.lastIndexOf(".");
  if (lastDot > 0) host = host.slice(0, lastDot);
  return host;
}

export function parseAnalysisResponse(data: Record<string, unknown>): FreeResult {
  const cats = data.categories as Record<string, unknown> | undefined;
  const safeCategories: CategoryScores = {
    pageSpeed: Number(cats?.pageSpeed) || 0, images: Number(cats?.images) || 0,
    socialProof: Number(cats?.socialProof) || 0, checkout: Number(cats?.checkout) || 0,
    mobileCta: Number(cats?.mobileCta) || 0, title: Number(cats?.title) || 0,
    aiDiscoverability: Number(cats?.aiDiscoverability) || 0, structuredData: Number(cats?.structuredData) || 0,
    pricing: Number(cats?.pricing) || 0, description: Number(cats?.description) || 0,
    shipping: Number(cats?.shipping) || 0, crossSell: Number(cats?.crossSell) || 0,
    trust: Number(cats?.trust) || 0,
    socialCommerce: Number(cats?.socialCommerce) || 0,
    sizeGuide: Number(cats?.sizeGuide) || 0, variantUx: Number(cats?.variantUx) || 0,
    accessibility: Number(cats?.accessibility) || 0, contentFreshness: Number(cats?.contentFreshness) || 0,
  };

  // Parse signals if present
  const rawSignals = data.signals as Record<string, unknown> | undefined;
  const sp = rawSignals?.socialProof as Record<string, unknown> | undefined;
  const sd = rawSignals?.structuredData as Record<string, unknown> | undefined;
  const co = rawSignals?.checkout as Record<string, unknown> | undefined;
  const pr = rawSignals?.pricing as Record<string, unknown> | undefined;
  const im = rawSignals?.images as Record<string, unknown> | undefined;
  const ti = rawSignals?.title as Record<string, unknown> | undefined;
  const sh = rawSignals?.shipping as Record<string, unknown> | undefined;
  const de = rawSignals?.description as Record<string, unknown> | undefined;
  const tr = rawSignals?.trust as Record<string, unknown> | undefined;
  const ps = rawSignals?.pageSpeed as Record<string, unknown> | undefined;
  const cs = rawSignals?.crossSell as Record<string, unknown> | undefined;
  const vu = rawSignals?.variantUx as Record<string, unknown> | undefined;
  const sg = rawSignals?.sizeGuide as Record<string, unknown> | undefined;
  const ad = rawSignals?.aiDiscoverability as Record<string, unknown> | undefined;
  const mc = rawSignals?.mobileCta as Record<string, unknown> | undefined;
  const cf = rawSignals?.contentFreshness as Record<string, unknown> | undefined;
  const ac = rawSignals?.accessibility as Record<string, unknown> | undefined;
  const sc = rawSignals?.socialCommerce as Record<string, unknown> | undefined;
  const signals: import("./types").DimensionSignals | undefined = (sp || sd || co || pr || im || ti || sh || de || tr || ps || mc || cs || vu || sg || ad || cf || ac || sc)
    ? {
        ...(sp ? {
          socialProof: {
            reviewApp: (sp.reviewApp as string) ?? null,
            starRating: sp.starRating != null ? Number(sp.starRating) : null,
            reviewCount: sp.reviewCount != null ? Number(sp.reviewCount) : null,
            hasPhotoReviews: Boolean(sp.hasPhotoReviews),
            hasVideoReviews: Boolean(sp.hasVideoReviews),
            starRatingAboveFold: Boolean(sp.starRatingAboveFold),
            hasReviewFiltering: Boolean(sp.hasReviewFiltering),
          },
        } : {}),
        ...(sd ? {
          structuredData: {
            hasProductSchema: Boolean(sd.hasProductSchema),
            hasName: Boolean(sd.hasName),
            hasImage: Boolean(sd.hasImage),
            hasDescription: Boolean(sd.hasDescription),
            hasOffers: Boolean(sd.hasOffers),
            hasPrice: Boolean(sd.hasPrice),
            hasPriceCurrency: Boolean(sd.hasPriceCurrency),
            hasAvailability: Boolean(sd.hasAvailability),
            hasBrand: Boolean(sd.hasBrand),
            hasSku: Boolean(sd.hasSku),
            hasGtin: Boolean(sd.hasGtin),
            hasAggregateRating: Boolean(sd.hasAggregateRating),
            hasPriceValidUntil: Boolean(sd.hasPriceValidUntil),
            hasShippingDetails: Boolean(sd.hasShippingDetails),
            hasReturnPolicy: Boolean(sd.hasReturnPolicy),
            hasBreadcrumbList: Boolean(sd.hasBreadcrumbList),
            hasOrganization: Boolean(sd.hasOrganization),
            hasMissingBrand: Boolean(sd.hasMissingBrand),
            hasCurrencyInPrice: Boolean(sd.hasCurrencyInPrice),
            hasInvalidAvailability: Boolean(sd.hasInvalidAvailability),
            jsonParseErrors: Number(sd.jsonParseErrors) || 0,
            duplicateProductCount: Number(sd.duplicateProductCount) || 0,
          },
        } : {}),
        ...(co ? {
          checkout: {
            hasAcceleratedCheckout: Boolean(co.hasAcceleratedCheckout),
            hasDynamicCheckoutButton: Boolean(co.hasDynamicCheckoutButton),
            hasPaypal: Boolean(co.hasPaypal),
            hasKlarna: Boolean(co.hasKlarna),
            hasAfterpay: Boolean(co.hasAfterpay),
            hasAffirm: Boolean(co.hasAffirm),
            hasSezzle: Boolean(co.hasSezzle),
            paymentMethodCount: Number(co.paymentMethodCount) || 0,
            hasDrawerCart: Boolean(co.hasDrawerCart),
            hasAjaxCart: Boolean(co.hasAjaxCart),
            hasStickyCheckout: Boolean(co.hasStickyCheckout),
            // Ground-truth checkout-page fields (optional; absent on
            // older cached rows or when the flow couldn't run)
            ...(co.reachedCheckout !== undefined && {
              reachedCheckout: Boolean(co.reachedCheckout),
            }),
            ...(co.failureReason !== undefined && {
              failureReason: co.failureReason == null ? null : String(co.failureReason),
            }),
            ...(co.checkoutFlavor !== undefined && {
              checkoutFlavor: co.checkoutFlavor as "onepage" | "classic" | "unknown",
            }),
            ...(co.wallets !== undefined && {
              wallets: ((w: Record<string, unknown>) => ({
                shopPay: Boolean(w.shopPay),
                applePay: Boolean(w.applePay),
                googlePay: Boolean(w.googlePay),
                paypal: Boolean(w.paypal),
                amazonPay: Boolean(w.amazonPay),
                metaPay: Boolean(w.metaPay),
                stripeLink: Boolean(w.stripeLink),
              }))(co.wallets as Record<string, unknown>),
            }),
            ...(co.bnpl !== undefined && {
              bnpl: ((b: Record<string, unknown>) => ({
                klarna: Boolean(b.klarna),
                afterpay: Boolean(b.afterpay),
                clearpay: Boolean(b.clearpay),
                affirm: Boolean(b.affirm),
                sezzle: Boolean(b.sezzle),
                shopPayInstallments: Boolean(b.shopPayInstallments),
                zip: Boolean(b.zip),
              }))(co.bnpl as Record<string, unknown>),
            }),
            ...(Array.isArray(co.cardBrands) && {
              cardBrands: (co.cardBrands as unknown[]).map(String),
            }),
            ...(co.guestCheckoutAvailable !== undefined && {
              guestCheckoutAvailable: Boolean(co.guestCheckoutAvailable),
            }),
            ...(co.forcedAccountCreation !== undefined && {
              forcedAccountCreation: Boolean(co.forcedAccountCreation),
            }),
            ...(co.checkoutStepCount !== undefined && {
              checkoutStepCount: Number(co.checkoutStepCount) || 0,
            }),
            ...(co.totalFormFieldsStepOne !== undefined && {
              totalFormFieldsStepOne: Number(co.totalFormFieldsStepOne) || 0,
            }),
            ...(co.hasDiscountCodeField !== undefined && {
              hasDiscountCodeField: Boolean(co.hasDiscountCodeField),
            }),
            ...(co.hasGiftCardField !== undefined && {
              hasGiftCardField: Boolean(co.hasGiftCardField),
            }),
            ...(co.hasShippingCalculator !== undefined && {
              hasShippingCalculator: Boolean(co.hasShippingCalculator),
            }),
            ...(co.hasAddressAutocomplete !== undefined && {
              hasAddressAutocomplete: Boolean(co.hasAddressAutocomplete),
            }),
            ...(co.trustBadgeCount !== undefined && {
              trustBadgeCount: Number(co.trustBadgeCount) || 0,
            }),
            ...(co.currencyCode !== undefined && {
              currencyCode: co.currencyCode == null ? null : String(co.currencyCode),
            }),
          },
        } : {}),
        ...(pr ? {
          pricing: {
            hasCompareAtPrice: Boolean(pr.hasCompareAtPrice),
            hasStrikethroughPrice: Boolean(pr.hasStrikethroughPrice),
            priceValue: pr.priceValue != null ? Number(pr.priceValue) : null,
            hasCharmPricing: Boolean(pr.hasCharmPricing),
            isRoundPrice: Boolean(pr.isRoundPrice),
            hasCountdownTimer: Boolean(pr.hasCountdownTimer),
            hasScarcityMessaging: Boolean(pr.hasScarcityMessaging),
            hasFakeTimerRisk: Boolean(pr.hasFakeTimerRisk),
            hasKlarnaPlacement: Boolean(pr.hasKlarnaPlacement),
            hasAfterPayBadge: Boolean(pr.hasAfterPayBadge),
            hasShopPayInstallments: Boolean(pr.hasShopPayInstallments),
            hasBnplNearPrice: Boolean(pr.hasBnplNearPrice),
          },
        } : {}),
        ...(im ? {
          images: {
            imageCount: Number(im.imageCount) || 0,
            hasVideo: Boolean(im.hasVideo),
            has360View: Boolean(im.has360View),
            hasZoom: Boolean(im.hasZoom),
            hasLifestyleImages: Boolean(im.hasLifestyleImages),
            cdnHosted: Boolean(im.cdnHosted),
            hasModernFormat: Boolean(im.hasModernFormat),
            hasHighRes: Boolean(im.hasHighRes),
            altTextScore: Number(im.altTextScore) || 0,
          },
        } : {}),
        ...(ti ? {
          title: {
            h1Text: (ti.h1Text as string) ?? null,
            metaTitle: (ti.metaTitle as string) ?? null,
            brandName: (ti.brandName as string) ?? null,
            h1Count: Number(ti.h1Count) || 0,
            h1Length: Number(ti.h1Length) || 0,
            metaTitleLength: Number(ti.metaTitleLength) || 0,
            hasH1: Boolean(ti.hasH1),
            hasSingleH1: Boolean(ti.hasSingleH1),
            hasBrandInTitle: Boolean(ti.hasBrandInTitle),
            hasKeywordStuffing: Boolean(ti.hasKeywordStuffing),
            isAllCaps: Boolean(ti.isAllCaps),
            hasPromotionalText: Boolean(ti.hasPromotionalText),
            h1MetaDiffer: Boolean(ti.h1MetaDiffer),
            hasSpecifics: Boolean(ti.hasSpecifics),
          },
        } : {}),
        ...(sh ? {
          shipping: {
            hasFreeShipping: Boolean(sh.hasFreeShipping),
            hasFreeShippingThreshold: Boolean(sh.hasFreeShippingThreshold),
            freeShippingThresholdValue: sh.freeShippingThresholdValue != null ? Number(sh.freeShippingThresholdValue) : null,
            hasDeliveryDate: Boolean(sh.hasDeliveryDate),
            hasDeliveryEstimate: Boolean(sh.hasDeliveryEstimate),
            hasEddApp: Boolean(sh.hasEddApp),
            hasShippingCostShown: Boolean(sh.hasShippingCostShown),
            hasShippingInStructuredData: Boolean(sh.hasShippingInStructuredData),
            hasShippingPolicyLink: Boolean(sh.hasShippingPolicyLink),
            hasReturnsMentioned: Boolean(sh.hasReturnsMentioned),
          },
        } : {}),
        ...(de ? {
          description: {
            descriptionFound: Boolean(de.descriptionFound),
            wordCount: Number(de.wordCount) || 0,
            fleschKincaidGrade: Number(de.fleschKincaidGrade) || 0,
            avgSentenceLength: Number(de.avgSentenceLength) || 0,
            sentenceCount: Number(de.sentenceCount) || 0,
            benefitRatio: Number(de.benefitRatio) || 0,
            benefitWordCount: Number(de.benefitWordCount) || 0,
            featureWordCount: Number(de.featureWordCount) || 0,
            emotionalDensity: Number(de.emotionalDensity) || 0,
            htmlTagVariety: Number(de.htmlTagVariety) || 0,
            hasHeadings: Boolean(de.hasHeadings),
            hasBulletLists: Boolean(de.hasBulletLists),
            hasEmphasis: Boolean(de.hasEmphasis),
          },
        } : {}),
        ...(tr ? {
          trust: {
            trustBadgeApp: (tr.trustBadgeApp as string) ?? null,
            trustBadgeCount: Number(tr.trustBadgeCount) || 0,
            hasPaymentIcons: Boolean(tr.hasPaymentIcons),
            hasMoneyBackGuarantee: Boolean(tr.hasMoneyBackGuarantee),
            hasReturnPolicy: Boolean(tr.hasReturnPolicy),
            hasFreeShippingBadge: Boolean(tr.hasFreeShippingBadge),
            hasSecureCheckoutText: Boolean(tr.hasSecureCheckoutText),
            hasSecurityBadge: Boolean(tr.hasSecurityBadge),
            hasSafeCheckoutBadge: Boolean(tr.hasSafeCheckoutBadge),
            hasLiveChat: Boolean(tr.hasLiveChat),
            hasPhoneNumber: Boolean(tr.hasPhoneNumber),
            hasContactEmail: Boolean(tr.hasContactEmail),
            hasTrustNearAtc: Boolean(tr.hasTrustNearAtc),
            trustElementCount: Number(tr.trustElementCount) || 0,
          },
        } : {}),
        ...(ps ? {
          pageSpeed: {
            scriptCount: Number(ps.scriptCount) || 0,
            thirdPartyScriptCount: Number(ps.thirdPartyScriptCount) || 0,
            renderBlockingScriptCount: Number(ps.renderBlockingScriptCount) || 0,
            appScriptCount: Number(ps.appScriptCount) || 0,
            hasLazyLoading: Boolean(ps.hasLazyLoading),
            lcpImageLazyLoaded: Boolean(ps.lcpImageLazyLoaded),
            hasExplicitImageDimensions: Boolean(ps.hasExplicitImageDimensions),
            hasModernImageFormats: Boolean(ps.hasModernImageFormats),
            hasFontDisplaySwap: Boolean(ps.hasFontDisplaySwap),
            hasPreconnectHints: Boolean(ps.hasPreconnectHints),
            hasDnsPrefetch: Boolean(ps.hasDnsPrefetch),
            hasHeroPreload: Boolean(ps.hasHeroPreload),
            inlineCssKb: Number(ps.inlineCssKb) || 0,
            detectedTheme: (ps.detectedTheme as string) ?? null,
            performanceScore: ps.performanceScore != null ? Number(ps.performanceScore) : null,
            lcpMs: ps.lcpMs != null ? Number(ps.lcpMs) : null,
            clsValue: ps.clsValue != null ? Number(ps.clsValue) : null,
            tbtMs: ps.tbtMs != null ? Number(ps.tbtMs) : null,
            fcpMs: ps.fcpMs != null ? Number(ps.fcpMs) : null,
            speedIndexMs: ps.speedIndexMs != null ? Number(ps.speedIndexMs) : null,
            hasFieldData: Boolean(ps.hasFieldData),
            fieldLcpMs: ps.fieldLcpMs != null ? Number(ps.fieldLcpMs) : null,
            fieldClsValue: ps.fieldClsValue != null ? Number(ps.fieldClsValue) : null,
            // PSI desktop strategy. Optional — may be missing on
            // pre-migration cached rows. Coerced field-by-field so
            // the shape stays stable even if the API drifts.
            desktop: ((d): import("./types").PageSpeedDesktopSignals | null => (
              d && typeof d === "object" ? {
                performanceScore: d.performanceScore != null ? Number(d.performanceScore) : null,
                lcpMs: d.lcpMs != null ? Number(d.lcpMs) : null,
                clsValue: d.clsValue != null ? Number(d.clsValue) : null,
                tbtMs: d.tbtMs != null ? Number(d.tbtMs) : null,
                fcpMs: d.fcpMs != null ? Number(d.fcpMs) : null,
                speedIndexMs: d.speedIndexMs != null ? Number(d.speedIndexMs) : null,
                hasFieldData: Boolean(d.hasFieldData),
                fieldLcpMs: d.fieldLcpMs != null ? Number(d.fieldLcpMs) : null,
                fieldClsValue: d.fieldClsValue != null ? Number(d.fieldClsValue) : null,
              } : null
            ))(ps.desktop as Record<string, unknown> | null | undefined),
          },
        } : {}),
        ...(cs ? {
          crossSell: {
            crossSellApp: (cs.crossSellApp as string) ?? null,
            hasCrossSellSection: Boolean(cs.hasCrossSellSection),
            widgetType: (cs.widgetType as string) ?? null,
            productCount: Number(cs.productCount) || 0,
            hasBundlePricing: Boolean(cs.hasBundlePricing),
            hasCheckboxSelection: Boolean(cs.hasCheckboxSelection),
            hasAddAllToCart: Boolean(cs.hasAddAllToCart),
            hasDiscountOnBundle: Boolean(cs.hasDiscountOnBundle),
            nearBuyButton: Boolean(cs.nearBuyButton),
            recommendationCountOptimal: Boolean(cs.recommendationCountOptimal),
          },
        } : {}),
        ...(vu ? {
          variantUx: {
            hasVariants: Boolean(vu.hasVariants),
            hasVisualSwatches: Boolean(vu.hasVisualSwatches),
            hasPillButtons: Boolean(vu.hasPillButtons),
            hasDropdownSelectors: Boolean(vu.hasDropdownSelectors),
            colorSelectorType: (vu.colorSelectorType as string) ?? null,
            sizeSelectorType: (vu.sizeSelectorType as string) ?? null,
            optionGroupCount: Number(vu.optionGroupCount) || 0,
            hasStockIndicator: Boolean(vu.hasStockIndicator),
            hasPreciseStockCount: Boolean(vu.hasPreciseStockCount),
            hasLowStockUrgency: Boolean(vu.hasLowStockUrgency),
            hasSoldOutHandling: Boolean(vu.hasSoldOutHandling),
            hasNotifyMe: Boolean(vu.hasNotifyMe),
            swatchApp: (vu.swatchApp as string) ?? null,
            hasVariantImageLink: Boolean(vu.hasVariantImageLink),
            colorUsesDropdown: Boolean(vu.colorUsesDropdown),
          },
        } : {}),
        ...(sg ? {
          sizeGuide: {
            sizeGuideApp: (sg.sizeGuideApp as string) ?? null,
            hasSizeGuideLink: Boolean(sg.hasSizeGuideLink),
            hasSizeGuidePopup: Boolean(sg.hasSizeGuidePopup),
            hasSizeChartTable: Boolean(sg.hasSizeChartTable),
            hasFitFinder: Boolean(sg.hasFitFinder),
            hasModelMeasurements: Boolean(sg.hasModelMeasurements),
            hasFitRecommendation: Boolean(sg.hasFitRecommendation),
            hasMeasurementInstructions: Boolean(sg.hasMeasurementInstructions),
            nearSizeSelector: Boolean(sg.nearSizeSelector),
            categoryApplicable: Boolean(sg.categoryApplicable),
          },
        } : {}),
        ...(ad ? {
          aiDiscoverability: {
            robotsTxtExists: ad.robotsTxtExists != null ? Boolean(ad.robotsTxtExists) : null,
            aiSearchBotsAllowedCount: Number(ad.aiSearchBotsAllowedCount) || 0,
            aiTrainingBotsBlockedCount: Number(ad.aiTrainingBotsBlockedCount) || 0,
            hasOaiSearchbotAllowed: Boolean(ad.hasOaiSearchbotAllowed),
            hasPerplexitybotAllowed: Boolean(ad.hasPerplexitybotAllowed),
            hasClaudeSearchbotAllowed: Boolean(ad.hasClaudeSearchbotAllowed),
            hasWildcardBlock: Boolean(ad.hasWildcardBlock),
            llmsTxtExists: ad.llmsTxtExists != null ? Boolean(ad.llmsTxtExists) : null,
            hasOgType: Boolean(ad.hasOgType),
            hasOgTitle: Boolean(ad.hasOgTitle),
            hasOgDescription: Boolean(ad.hasOgDescription),
            hasOgImage: Boolean(ad.hasOgImage),
            hasProductPriceAmount: Boolean(ad.hasProductPriceAmount),
            hasProductPriceCurrency: Boolean(ad.hasProductPriceCurrency),
            ogTagCount: Number(ad.ogTagCount) || 0,
            hasStructuredSpecs: Boolean(ad.hasStructuredSpecs),
            hasSpecTable: Boolean(ad.hasSpecTable),
            hasFaqContent: Boolean(ad.hasFaqContent),
            specMentionCount: Number(ad.specMentionCount) || 0,
            hasMeasurementUnits: Boolean(ad.hasMeasurementUnits),
            entityDensityScore: Number(ad.entityDensityScore) || 0,
          },
        } : {}),
        ...(mc ? {
          mobileCta: {
            ctaFound: Boolean(mc.ctaFound),
            ctaText: (mc.ctaText as string) ?? null,
            ctaCount: Number(mc.ctaCount) || 0,
            ctaSelectorMatched: (mc.ctaSelectorMatched as string) ?? null,
            hasViewportMeta: Boolean(mc.hasViewportMeta),
            hasResponsiveMeta: Boolean(mc.hasResponsiveMeta),
            hasStickyClass: Boolean(mc.hasStickyClass),
            hasStickyApp: (mc.hasStickyApp as string) ?? null,
            buttonWidthPx: mc.buttonWidthPx != null ? Number(mc.buttonWidthPx) : null,
            buttonHeightPx: mc.buttonHeightPx != null ? Number(mc.buttonHeightPx) : null,
            meetsMin44px: mc.meetsMin44px != null ? Boolean(mc.meetsMin44px) : null,
            meetsOptimal60_72px: mc.meetsOptimal60_72px != null ? Boolean(mc.meetsOptimal60_72px) : null,
            aboveFold: mc.aboveFold != null ? Boolean(mc.aboveFold) : null,
            isSticky: mc.isSticky != null ? Boolean(mc.isSticky) : null,
            inThumbZone: mc.inThumbZone != null ? Boolean(mc.inThumbZone) : null,
            isFullWidth: mc.isFullWidth != null ? Boolean(mc.isFullWidth) : null,
          },
        } : {}),
        ...(cf ? {
          contentFreshness: {
            copyrightYear: cf.copyrightYear != null ? Number(cf.copyrightYear) : null,
            copyrightYearIsCurrent: Boolean(cf.copyrightYearIsCurrent),
            hasExpiredPromotion: Boolean(cf.hasExpiredPromotion),
            expiredPromotionText: (cf.expiredPromotionText as string) ?? null,
            hasSeasonalMismatch: Boolean(cf.hasSeasonalMismatch),
            hasNewLabel: Boolean(cf.hasNewLabel),
            datePublishedIso: (cf.datePublishedIso as string) ?? null,
            newLabelIsStale: Boolean(cf.newLabelIsStale),
            mostRecentReviewDateIso: (cf.mostRecentReviewDateIso as string) ?? null,
            reviewAgeDays: cf.reviewAgeDays != null ? Number(cf.reviewAgeDays) : null,
            reviewStaleness: (cf.reviewStaleness as string) ?? null,
            dateModifiedIso: (cf.dateModifiedIso as string) ?? null,
            dateModifiedAgeDays: cf.dateModifiedAgeDays != null ? Number(cf.dateModifiedAgeDays) : null,
            lastModifiedHeader: (cf.lastModifiedHeader as string) ?? null,
            lastModifiedAgeDays: cf.lastModifiedAgeDays != null ? Number(cf.lastModifiedAgeDays) : null,
            timeElementCount: Number(cf.timeElementCount) || 0,
            mostRecentTimeIso: (cf.mostRecentTimeIso as string) ?? null,
            mostRecentTimeAgeDays: cf.mostRecentTimeAgeDays != null ? Number(cf.mostRecentTimeAgeDays) : null,
            freshestSignalAgeDays: cf.freshestSignalAgeDays != null ? Number(cf.freshestSignalAgeDays) : null,
          },
        } : {}),
        ...(ac ? {
          accessibility: {
            contrastViolations: Number(ac.contrastViolations) || 0,
            altTextViolations: Number(ac.altTextViolations) || 0,
            formLabelViolations: Number(ac.formLabelViolations) || 0,
            emptyLinkViolations: Number(ac.emptyLinkViolations) || 0,
            emptyButtonViolations: Number(ac.emptyButtonViolations) || 0,
            documentLanguageViolations: Number(ac.documentLanguageViolations) || 0,
            totalViolations: Number(ac.totalViolations) || 0,
            totalNodesAffected: Number(ac.totalNodesAffected) || 0,
            criticalCount: Number(ac.criticalCount) || 0,
            seriousCount: Number(ac.seriousCount) || 0,
            moderateCount: Number(ac.moderateCount) || 0,
            minorCount: Number(ac.minorCount) || 0,
            scanCompleted: Boolean(ac.scanCompleted),
          },
        } : {}),
        ...(sc ? {
          socialCommerce: {
            hasInstagramEmbed: Boolean(sc.hasInstagramEmbed),
            hasTiktokEmbed: Boolean(sc.hasTiktokEmbed),
            hasPinterest: Boolean(sc.hasPinterest),
            hasUgcGallery: Boolean(sc.hasUgcGallery),
            ugcGalleryApp: (sc.ugcGalleryApp as string) ?? null,
            platformCount: Number(sc.platformCount) || 0,
          },
        } : {}),
      }
    : undefined;

  // Parse dimensionTips if present
  const rawDimTips = data.dimensionTips as Record<string, unknown> | undefined;
  const dimensionTips: Record<string, string[]> | undefined = rawDimTips
    ? Object.fromEntries(
        Object.entries(rawDimTips)
          .filter(([, v]) => Array.isArray(v))
          .map(([k, v]) => [k, (v as unknown[]).map(String)])
      )
    : undefined;

  return {
    score: Math.min(100, Math.max(0, Number(data.score) || 0)),
    summary: String(data.summary || "Analysis complete."),
    tips: Array.isArray(data.tips) ? data.tips.map(String).slice(0, 20) : [],
    dimensionTips,
    categories: safeCategories,
    productPrice: Number(data.productPrice) || 0,
    productCategory: String(data.productCategory || "other"),
    signals,
  };
}

/** Group leaks into dimension groups, sorted worst-group-first */
export interface GroupedLeaks {
  group: DimensionGroup;
  leaks: LeakCard[];
  avgScore: number;
  conversionLoss: number;
}

export function groupLeaks(leaks: LeakCard[]): GroupedLeaks[] {
  const leakMap = new Map(leaks.map((l) => [l.key, l]));

  return DIMENSION_GROUPS
    .map((group) => {
      const groupLeaks = group.keys
        .filter((k) => ACTIVE_DIMENSIONS.has(k))
        .map((k) => leakMap.get(k))
        .filter((l): l is LeakCard => !!l)
        .sort((a, b) => a.catScore - b.catScore); // worst-first within group

      const avg = groupLeaks.length > 0
        ? Math.round(groupLeaks.reduce((sum, l) => sum + l.catScore, 0) / groupLeaks.length)
        : 0;

      const convLoss = groupLeaks.reduce((sum, l) => sum + l.conversionLoss, 0);

      return { group, leaks: groupLeaks, avgScore: avg, conversionLoss: Math.round(convLoss * 10) / 10 };
    })
    .filter((g) => g.leaks.length > 0)
    .sort((a, b) => a.avgScore - b.avgScore); // worst group first
}

/** Split leaks by dimension scope. Store-wide leaks describe the storefront
 *  and apply to every product; product leaks are specific to the analyzed page. */
export function splitLeaksByScope(leaks: LeakCard[]): {
  productLeaks: LeakCard[];
  storeLeaks: LeakCard[];
} {
  const productLeaks: LeakCard[] = [];
  const storeLeaks: LeakCard[] = [];
  for (const leak of leaks) {
    if (STORE_WIDE_DIMENSIONS.has(leak.key)) storeLeaks.push(leak);
    else productLeaks.push(leak);
  }
  // Within each bucket, keep the worst-first ordering that buildLeaks produced.
  return { productLeaks, storeLeaks };
}
