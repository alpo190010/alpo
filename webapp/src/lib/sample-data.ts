import type { CategoryScores } from "@/lib/analysis";

/* ── Sample scan data (Gymshark Arrival Shorts) ── */
export const SAMPLE_SCAN: {
  url: string;
  brand: string;
  score: number;
  summary: string;
  categories: CategoryScores;
  tips: string[];
  productPrice: number;
  productCategory: string;
} = {
  url: "gymshark.com/products/arrival-5-shorts",
  brand: "Gymshark",
  score: 15,
  summary: "Missing reviews, star ratings, and user-generated content",
  categories: {
    pageSpeed: 45, images: 55, socialProof: 15, checkout: 40, mobileCta: 50,
    title: 65, aiDiscoverability: 20, structuredData: 15, pricing: 40,
    description: 50, shipping: 55, crossSell: 15, trust: 30,
    socialCommerce: 25, sizeGuide: 40, variantUx: 45,
    accessibility: 40, contentFreshness: 50,
  },
  productPrice: 36,
  productCategory: "fitness",
  tips: [
    "Add review count and star rating visible above the fold",
    "Implement Product schema.org JSON-LD markup",
    "Add 'Frequently Bought Together' cross-sell section",
    "Include trust badges: free returns, secure checkout",
    "Add estimated delivery date on product page",
  ],
};
