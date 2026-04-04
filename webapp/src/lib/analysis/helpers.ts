import type { CategoryScores, FreeResult, LeakCard } from "./types";
import {
  CATEGORY_BENCHMARKS, CATEGORY_LABELS, CATEGORY_PROBLEMS, CATEGORY_REVENUE_IMPACT,
  DIMENSION_GROUPS, ACTIVE_DIMENSIONS, type DimensionGroup,
} from "./constants";

/* ── Lazy PostHog — don't block initial paint with 176KB bundle ── */
export function captureEvent(event: string, properties?: Record<string, unknown>) {
  import("posthog-js").then(({ default: posthog }) => {
    try { posthog.capture(event, properties); } catch { /* not initialized */ }
  });
}

export function roundNicely(n: number): number {
  if (n < 100) return Math.round(n / 5) * 5;
  if (n < 1000) return Math.round(n / 25) * 25;
  if (n < 10000) return Math.round(n / 100) * 100;
  return Math.round(n / 500) * 500;
}

export function calculateRevenueLoss(
  score: number,
  productPrice: number,
  estimatedVisitors: number,
  productCategory: string
) {
  const benchmarks = CATEGORY_BENCHMARKS[productCategory] || CATEGORY_BENCHMARKS["other"];
  const { avg, achievable } = benchmarks;
  const price = productPrice || 35;
  const visitors = estimatedVisitors || 500;
  const bottomCR = avg * 0.4;
  const scoreNorm = score / 100;
  const estimatedCR = bottomCR + scoreNorm * (achievable - bottomCR);
  const gapVsAchievable = Math.max(0, achievable - estimatedCR) / 100;
  const pageAttributable = gapVsAchievable * 0.40;
  const additionalOrders = visitors * pageAttributable;
  const maxOrders = Math.max(0.3, 15 / Math.pow(1 + price / 50, 0.6));
  const cappedOrders = Math.min(additionalOrders, maxOrders);
  const monthlyLoss = cappedOrders * price;
  return {
    lossLow: Math.max(roundNicely(monthlyLoss * 0.7), 20),
    lossHigh: Math.max(roundNicely(monthlyLoss * 1.3), 50),
  };
}

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

/** Build leak cards from categories + tips, sorted worst-first.
 *  When lossLow/lossHigh are provided, per-card revenue is distributed
 *  proportionally by gap (100 - score). Without them, falls back to
 *  a rough estimate.
 *  When dimensionTips is provided, each card gets its own dimension-specific
 *  tip instead of a positional index into the flat tips array. */
export function buildLeaks(
  categories: CategoryScores,
  tips: string[],
  lossLow?: number,
  lossHigh?: number,
  dimensionTips?: Record<string, string[]>,
): LeakCard[] {
  const entries = (Object.entries(categories) as [keyof CategoryScores, number][])
    .filter(([key]) => ACTIVE_DIMENSIONS.has(key));
  entries.sort((a, b) => a[1] - b[1]);

  /* Total gap across all dimensions — used to weight each card's share */
  const totalGap = entries.reduce((sum, [, score]) => sum + (100 - score), 0);

  return entries.map((entry, i) => {
    const [key, catScore] = entry;
    const impact = i < 3 ? "HIGH" : i < 8 ? "MED" : "LOW";

    /* Revenue attribution: proportional share of total loss range */
    let revenue: string;
    let revenueLow = 0;
    let revenueHigh = 0;
    if (lossLow != null && lossHigh != null && totalGap > 0) {
      const weight = (100 - catScore) / totalGap;
      revenueLow = roundNicely(Math.round(lossLow * weight));
      revenueHigh = roundNicely(Math.round(lossHigh * weight));
      if (revenueLow === revenueHigh || revenueLow === 0) {
        revenue = `+$${revenueHigh}/mo`;
      } else {
        revenue = `+$${revenueLow}–$${revenueHigh}/mo`;
      }
    } else {
      /* Fallback when loss data isn't available */
      if (i < 3) { revenueLow = 150; revenueHigh = 150 + (catScore * 7) % 50; }
      else if (i < 8) { revenueLow = 80; revenueHigh = 80 + (catScore * 11) % 40; }
      else { revenueLow = 30; revenueHigh = 30 + (catScore * 13) % 30; }
      revenue = `+$${revenueHigh}/mo`;
    }

    const problems = CATEGORY_PROBLEMS[key] || { low: `Improve your ${key} to increase conversions.`, mid: `Your ${key} needs optimization.` };
    const problem = catScore <= 40 ? problems.low : problems.mid;
    const dimTips = dimensionTips?.[key];
    const tip = dimTips?.[0] || tips[i] || `Improve your ${key} to increase conversions.`;
    const revenueImpact = CATEGORY_REVENUE_IMPACT[key] || "Medium";
    return { key, catScore, impact, revenue, revenueLow, revenueHigh, tip, problem, category: CATEGORY_LABELS[key] || key, revenueImpact };
  });
}

/** URL validation — returns normalized URL or null */
export function isValidUrl(input: string): string | null {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (!parsed.hostname.includes(".")) return null;
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

export function parseAnalysisResponse(data: Record<string, unknown>): FreeResult {
  const cats = data.categories as Record<string, unknown> | undefined;
  const safeCategories: CategoryScores = {
    pageSpeed: Number(cats?.pageSpeed) || 0, images: Number(cats?.images) || 0,
    socialProof: Number(cats?.socialProof) || 0, checkout: Number(cats?.checkout) || 0,
    mobileCta: Number(cats?.mobileCta) || 0, title: Number(cats?.title) || 0,
    aiDiscoverability: Number(cats?.aiDiscoverability) || 0, structuredData: Number(cats?.structuredData) || 0,
    pricing: Number(cats?.pricing) || 0, description: Number(cats?.description) || 0,
    shipping: Number(cats?.shipping) || 0, crossSell: Number(cats?.crossSell) || 0,
    cartRecovery: Number(cats?.cartRecovery) || 0, trust: Number(cats?.trust) || 0,
    merchantFeed: Number(cats?.merchantFeed) || 0, socialCommerce: Number(cats?.socialCommerce) || 0,
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
  const signals: import("./types").DimensionSignals | undefined = (sp || sd || co || pr || im || ti || sh || de || tr || ps || cs || vu || sg || ad)
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
    estimatedMonthlyVisitors: Number(data.estimatedMonthlyVisitors) || 1000,
    signals,
  };
}

/** Group leaks into dimension groups, sorted worst-group-first */
export interface GroupedLeaks {
  group: DimensionGroup;
  leaks: LeakCard[];
  avgScore: number;
  revenueLow: number;
  revenueHigh: number;
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

      const revLow = groupLeaks.reduce((sum, l) => sum + l.revenueLow, 0);
      const revHigh = groupLeaks.reduce((sum, l) => sum + l.revenueHigh, 0);

      return { group, leaks: groupLeaks, avgScore: avg, revenueLow: revLow, revenueHigh: revHigh };
    })
    .filter((g) => g.leaks.length > 0)
    .sort((a, b) => a.avgScore - b.avgScore); // worst group first
}
