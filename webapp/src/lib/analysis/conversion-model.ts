/* ══════════════════════════════════════════════════════════════
   Conversion Model — pure TS, no React imports.
   Safe for Server Component / SSR import.
   ══════════════════════════════════════════════════════════════ */

import type { CategoryScores, PlanTier } from './types';

/**
 * Numeric conversion-impact weights per dimension, used by calculateConversionLoss().
 * Tiers: Very High 0.25, High 0.20, Medium-High 0.13, Medium 0.08, Low-Medium 0.05.
 * Must stay in sync with ACTIVE_DIMENSIONS keys in constants.tsx.
 */
export const DIMENSION_IMPACT_WEIGHTS: Record<string, number> = {
  // Very High (0.25)
  pageSpeed: 0.25,
  images: 0.25,
  socialProof: 0.25,
  checkout: 0.25,
  // High (0.20)
  mobileCta: 0.20,
  title: 0.20,
  aiDiscoverability: 0.20,
  structuredData: 0.20,
  pricing: 0.20,
  // Medium-High (0.13)
  description: 0.13,
  shipping: 0.13,
  crossSell: 0.13,
  // Medium (0.08)
  trust: 0.08,
  socialCommerce: 0.08,
  sizeGuide: 0.08,
  variantUx: 0.08,
  // Low-Medium (0.05)
  accessibility: 0.05,
  contentFreshness: 0.05,
};

/* ══════════════════════════════════════════════════════════════
   Tier Gating — plan dimension access
   ══════════════════════════════════════════════════════════════ */

/** Whether a dimension's fix checklist is visible to the user. */
export type DimensionAccess = "unlocked" | "locked";

/**
 * Resolve whether a dimension is accessible on the given plan.
 * - pro  -> all dimensions unlocked
 * - free -> all locked
 */
export function getDimensionAccess(plan: PlanTier, _dimensionKey: string): DimensionAccess {
  if (plan === "pro") return "unlocked";
  return "locked";
}

/**
 * Per-dimension conversion loss as a percentage (0–25).
 * Formula: ((100 - clamp(score, 0, 100)) / 100) × weight × 100
 * Returns 0 for unknown dimension keys. Rounded to 1 decimal place.
 */
export function calculateConversionLoss(score: number, dimensionKey: string): number {
  const weight = DIMENSION_IMPACT_WEIGHTS[dimensionKey] ?? 0;
  if (weight === 0) return 0;
  const clamped = Math.min(100, Math.max(0, score));
  const loss = ((100 - clamped) / 100) * weight * 100;
  return Math.round(loss * 10) / 10;
}

/* ══════════════════════════════════════════════════════════════
   Category Benchmarks — research-backed conversion rates (%)
   floor: worst observed performers
   avg:   category median
   achievable: top-quartile performers
   ══════════════════════════════════════════════════════════════ */

export interface CategoryBenchmark {
  floor: number;
  avg: number;
  achievable: number;
}

export const CATEGORY_BENCHMARKS: Record<string, CategoryBenchmark> = {
  fashion:     { floor: 0.50, avg: 1.90, achievable: 2.80 },
  beauty:      { floor: 0.60, avg: 2.50, achievable: 3.70 },
  food:        { floor: 0.40, avg: 1.50, achievable: 3.00 },
  home:        { floor: 0.30, avg: 1.20, achievable: 2.00 },
  electronics: { floor: 0.30, avg: 1.20, achievable: 2.00 },
  fitness:     { floor: 0.40, avg: 1.60, achievable: 2.40 },
  jewelry:     { floor: 0.20, avg: 0.80, achievable: 1.40 },
  other:       { floor: 0.35, avg: 1.40, achievable: 2.20 },
};

/* ══════════════════════════════════════════════════════════════
   Dollar-Loss Model (D058)
   ══════════════════════════════════════════════════════════════ */

/**
 * Piecewise-linear conversion-rate estimator.
 * score 0–65 → floor → avg  (low segment)
 * score 65–100 → avg → achievable  (high segment)
 * Returns a percentage value (e.g. 1.90 means 1.90%).
 */
function scoreToConversionRate(score: number, category: string): number {
  const clamped = Math.min(100, Math.max(0, score));
  const bench = CATEGORY_BENCHMARKS[category] ?? CATEGORY_BENCHMARKS['other'];

  if (clamped <= 65) {
    return bench.floor + (bench.avg - bench.floor) * (clamped / 65);
  }
  return bench.avg + (bench.achievable - bench.avg) * ((clamped - 65) / 35);
}

/**
 * Estimated revenue loss per 1 000 visitors compared to the achievable
 * conversion rate for the product's category.
 *
 * Returns 0 when productPrice ≤ 0 (R031).
 * Falls back to "other" for unknown categories.
 * Result is non-negative and rounded to 2 decimal places.
 */
export function calculateDollarLossPerThousand(
  categories: CategoryScores,
  productPrice: number,
  productCategory: string,
): number {
  if (productPrice <= 0) return 0;

  const bench = CATEGORY_BENCHMARKS[productCategory] ?? CATEGORY_BENCHMARKS['other'];
  const achievableCR = bench.achievable / 100;

  // Weighted average score across dimensions present in both maps
  let weightedSum = 0;
  let weightTotal = 0;
  for (const dim of Object.keys(categories) as (keyof CategoryScores)[]) {
    const w = DIMENSION_IMPACT_WEIGHTS[dim];
    if (w !== undefined) {
      weightedSum += categories[dim] * w;
      weightTotal += w;
    }
  }

  const weightedScore = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const estimatedCR = scoreToConversionRate(weightedScore, productCategory) / 100;

  const dollarLoss = (achievableCR - estimatedCR) * 1000 * productPrice;
  return Math.max(0, Math.round(dollarLoss * 100) / 100);
}
