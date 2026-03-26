/* ══════════════════════════════════════════════════════════════
   Types — 20 Dimensions
   ══════════════════════════════════════════════════════════════ */

export interface CategoryScores {
  pageSpeed: number;
  images: number;
  socialProof: number;
  checkout: number;
  mobileCta: number;
  title: number;
  aiDiscoverability: number;
  structuredData: number;
  pricing: number;
  description: number;
  shipping: number;
  crossSell: number;
  cartRecovery: number;
  trust: number;
  merchantFeed: number;
  socialCommerce: number;
  sizeGuide: number;
  variantUx: number;
  accessibility: number;
  contentFreshness: number;
}

export interface CompetitorResult {
  competitors: Array<{
    name: string;
    url: string;
    score: number;
    summary: string;
    categories: CategoryScores;
  }>;
}

export interface FreeResult {
  score: number;
  summary: string;
  tips: string[];
  categories: CategoryScores;
  productPrice: number;
  productCategory: string;
  estimatedMonthlyVisitors: number;
}

/** Shape of each entry returned by `buildLeaks` */
export interface LeakCard {
  key: string;
  catScore: number;
  impact: string;
  revenue: string;
  revenueLow: number;
  revenueHigh: number;
  tip: string;
  problem: string;
  category: string;
  revenueImpact: string;
}
