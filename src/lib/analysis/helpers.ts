import type { CategoryScores, FreeResult, LeakCard } from "./types";
import {
  CATEGORY_BENCHMARKS, CATEGORY_LABELS, CATEGORY_PROBLEMS, CATEGORY_REVENUE_IMPACT,
  DIMENSION_GROUPS, type DimensionGroup,
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
 *  a rough estimate. */
export function buildLeaks(
  categories: CategoryScores,
  tips: string[],
  lossLow?: number,
  lossHigh?: number,
): LeakCard[] {
  const entries = Object.entries(categories) as [keyof CategoryScores, number][];
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
    const tip = tips[i] || `Improve your ${key} to increase conversions.`;
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
  return {
    score: Math.min(100, Math.max(0, Number(data.score) || 0)),
    summary: String(data.summary || "Analysis complete."),
    tips: Array.isArray(data.tips) ? data.tips.map(String).slice(0, 20) : [],
    categories: safeCategories,
    productPrice: Number(data.productPrice) || 0,
    productCategory: String(data.productCategory || "other"),
    estimatedMonthlyVisitors: Number(data.estimatedMonthlyVisitors) || 1000,
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
