import {
  LightningIcon,
  ImageIcon,
  StarIcon,
  ShoppingCartIcon,
  DeviceMobileIcon,
  TextTIcon,
  RobotIcon,
  CodeIcon,
  CurrencyDollarIcon,
  ArticleIcon,
  TruckIcon,
  StackPlusIcon,
  ShieldCheckIcon,
  ShareNetworkIcon,
  RulerIcon,
  SwatchesIcon,
  WheelchairIcon,
  LeafIcon,
  LockIcon,
} from "@phosphor-icons/react";

/** Re-exported from conversion-model.ts (pure TS, SSR-safe). */
export { CATEGORY_BENCHMARKS } from './conversion-model';

export const CATEGORY_LABELS: Record<string, string> = {
  pageSpeed: "Page Speed", images: "Product Images", socialProof: "Reviews & Social Proof",
  checkout: "Checkout & Payments", mobileCta: "Mobile CTA & UX", title: "Title & SEO",
  aiDiscoverability: "AI Discoverability", structuredData: "Schema Markup", pricing: "Pricing Psychology",
  description: "Description Quality", shipping: "Shipping Transparency", crossSell: "Cross-Sell & Upsell",
  trust: "Trust & Guarantees",
  socialCommerce: "Social Commerce", sizeGuide: "Size & Fit Info", variantUx: "Variant UX & Stock",
  accessibility: "Accessibility", contentFreshness: "Content Freshness",
};

/**
 * Dimensions with real scoring. Everything else is mocked and hidden from the UI.
 * Add keys here as detectors are built out.
 */
export const ACTIVE_DIMENSIONS: ReadonlySet<string> = new Set(["socialProof", "structuredData", "checkout", "pricing", "images", "title", "shipping", "description", "trust", "pageSpeed", "mobileCta", "crossSell", "variantUx", "sizeGuide", "aiDiscoverability", "contentFreshness", "accessibility", "socialCommerce"]);

/* ══════════════════════════════════════════════════════════════
   Dimension Scope — mirrors backend DIMENSION_SCOPE (scoring.py)
   "store"   → evaluated once per storefront (7 dimensions)
   "product" → evaluated per product page   (11 dimensions)
   ══════════════════════════════════════════════════════════════ */
import type { DimensionScope } from "./types";

export const DIMENSION_SCOPE: Record<string, DimensionScope> = {
  pageSpeed: "store",
  images: "product",
  socialProof: "product",
  checkout: "store",
  mobileCta: "product",
  title: "product",
  aiDiscoverability: "store",
  structuredData: "product",
  pricing: "product",
  description: "product",
  shipping: "store",
  crossSell: "product",
  trust: "store",
  socialCommerce: "store",
  sizeGuide: "product",
  variantUx: "product",
  accessibility: "store",
  contentFreshness: "product",
} as const;

/** Dimensions evaluated once per storefront (derived from DIMENSION_SCOPE). */
export const STORE_WIDE_DIMENSIONS: ReadonlySet<string> = new Set(
  Object.entries(DIMENSION_SCOPE).filter(([, v]) => v === "store").map(([k]) => k),
);

/** Dimensions evaluated per product page (derived from DIMENSION_SCOPE). */
export const PRODUCT_LEVEL_DIMENSIONS: ReadonlySet<string> = new Set(
  Object.entries(DIMENSION_SCOPE).filter(([, v]) => v === "product").map(([k]) => k),
);

export const CATEGORY_REVENUE_IMPACT: Record<string, string> = {
  pageSpeed: "Very High", images: "Very High", socialProof: "Very High", checkout: "Very High",
  mobileCta: "High", title: "High", aiDiscoverability: "High", structuredData: "High", pricing: "High",
  description: "Medium-High", shipping: "Medium-High", crossSell: "Medium-High",
  trust: "Medium", socialCommerce: "Medium", sizeGuide: "Medium", variantUx: "Medium",
  accessibility: "Low-Medium", contentFreshness: "Low-Medium",
};

/** Re-exported from conversion-model.ts (pure TS, SSR-safe). */
export { DIMENSION_IMPACT_WEIGHTS } from "./conversion-model";

export const CATEGORY_PROBLEMS: Record<string, { low: string; mid: string }> = {
  pageSpeed: { low: "Page loads too slowly. A 1-second delay cuts conversions ~7%", mid: "Page speed could be faster. Only 48% of Shopify stores pass Core Web Vitals on mobile" },
  images: { low: "Product imagery is insufficient. 56% of users explore images before reading anything", mid: "Image gallery lacks variety. Missing lifestyle, scale, or texture shots" },
  socialProof: { low: "No visible reviews. Going from 0 to 5 reviews delivers a 270% conversion lift", mid: "Social proof present but poorly positioned. UGC photo reviews drive 144-161% higher conversion" },
  checkout: { low: "Checkout options are limited. Shop Pay alone lifts conversion up to 50%", mid: "Payment options could be expanded. BNPL increases conversion 35% on higher-ticket items" },
  mobileCta: { low: "CTA is hidden or broken on mobile. 77% of traffic is mobile but converts at half the desktop rate", mid: "Mobile CTA could be more prominent. Sticky add-to-cart buttons are non-negotiable" },
  title: { low: "Product title fails to communicate value or include key search terms", mid: "Title misses SEO opportunities. Primary keyword should be in the first 3-5 words" },
  aiDiscoverability: { low: "Page is invisible to AI shopping. AI-referred traffic converts at 14.2% vs 2.8% from Google", mid: "AI discoverability could be improved. AI traffic to retail grew 4,700% YoY" },
  structuredData: { low: "Missing or broken schema markup. 65% of pages cited by Google AI Mode include structured data", mid: "Schema markup is incomplete. Rich snippets boost CTR up to 25%" },
  pricing: { low: "Price presentation creates friction. No anchoring, no compare-at price, no installment framing", mid: "Pricing psychology underutilized. Charm pricing and anchoring shift conversion measurably" },
  description: { low: "Description fails to sell. 78% of sites don't structure by highlights", mid: "Description needs better structure and benefit focus" },
  shipping: { low: "Hidden shipping costs cause 48% of all cart abandonment", mid: "Shipping info is vague. Concrete delivery dates outperform estimates. 41% of sites fail here" },
  crossSell: { low: "No cross-sell or upsell strategy. AI recommendations can increase AOV by 18.65%", mid: "Cross-sell present but not optimized. Show 4-6 recommendations near the buy section" },
  trust: { low: "No trust signals visible. Visible phone numbers are the #1 global trust symbol", mid: "Trust elements present but not prominently displayed" },
  socialCommerce: { low: "No social commerce integration. TikTok Shop drives 3-5x higher conversion than static listings", mid: "Social commerce is underutilized. Pinterest Rich Pins increase CTR 39%" },
  sizeGuide: { low: "No size guide. 30-40% of clothing returns are size-related", mid: "Size info could be more interactive. Fit finders dramatically outperform static charts" },
  variantUx: { low: "Variant selection is confusing. Color swatches outperform dropdowns for visual products", mid: "Variant UX could improve. Low-stock warnings reduce abandonment by 8%" },
  accessibility: { low: "Accessibility issues detected. 4,500+ lawsuits filed in 2024, up 37% in 2025", mid: "Some accessibility gaps. 54% of Shopify stores fail color contrast" },
  contentFreshness: { low: "Content appears stale. Outdated badges and certifications erode trust", mid: "Content could be fresher. Regular updates signal relevance to search engines and AI" },
};

/** Category SVG icons — solid, monochrome */
export const CATEGORY_SVG: Record<string, React.ReactNode> = {
  pageSpeed: <LightningIcon size={20} weight="fill" />,
  images: <ImageIcon size={20} weight="fill" />,
  socialProof: <StarIcon size={20} weight="fill" />,
  checkout: <ShoppingCartIcon size={20} weight="fill" />,
  mobileCta: <DeviceMobileIcon size={20} weight="fill" />,
  title: <TextTIcon size={20} weight="fill" />,
  aiDiscoverability: <RobotIcon size={20} weight="fill" />,
  structuredData: <CodeIcon size={20} weight="fill" />,
  pricing: <CurrencyDollarIcon size={20} weight="fill" />,
  description: <ArticleIcon size={20} weight="fill" />,
  shipping: <TruckIcon size={20} weight="fill" />,
  crossSell: <StackPlusIcon size={20} weight="fill" />,
  trust: <ShieldCheckIcon size={20} weight="fill" />,
  socialCommerce: <ShareNetworkIcon size={20} weight="fill" />,
  sizeGuide: <RulerIcon size={20} weight="fill" />,
  variantUx: <SwatchesIcon size={20} weight="fill" />,
  accessibility: <WheelchairIcon size={20} weight="fill" />,
  contentFreshness: <LeafIcon size={20} weight="fill" />,
  cta: <LockIcon size={20} weight="fill" />,
};

/** Leak categories for "What We Check" section on landing page */
export const LEAK_CATEGORIES = [
  { iconKey: "pageSpeed", label: "Page Speed", leak: "Slow loading kills 7% conversion per second", cost: "Every visitor affected on every page" },
  { iconKey: "images", label: "Images", leak: "Low-quality or too few photos", cost: "56% of users explore images first" },
  { iconKey: "socialProof", label: "Social Proof", leak: "Reviews missing or buried below fold", cost: "0→5 reviews = 270% conversion lift" },
  { iconKey: "checkout", label: "Checkout", leak: "Limited payment options", cost: "Shop Pay lifts conversion up to 50%" },
  { iconKey: "mobileCta", label: "Mobile CTA", leak: "CTA hidden or broken on mobile", cost: "77% of traffic, half the conversion" },
  { iconKey: "title", label: "Title & SEO", leak: "Generic title misses search traffic", cost: "No discovery = no sales" },
  { iconKey: "aiDiscoverability", label: "AI Discovery", leak: "Invisible to ChatGPT and AI shopping", cost: "AI traffic converts at 14.2% vs 2.8%" },
  { iconKey: "structuredData", label: "Schema", leak: "Missing structured data", cost: "65% of AI-cited pages have schema" },
  { iconKey: "pricing", label: "Pricing", leak: "No anchoring or installment framing", cost: "Price feels high with no context" },
  { iconKey: "description", label: "Description", leak: "Wall of text, no benefits", cost: "78% of sites fail description structure" },
  { iconKey: "shipping", label: "Shipping", leak: "Hidden costs at checkout", cost: "#1 cart abandonment reason (48%)" },
  { iconKey: "crossSell", label: "Cross-Sell", leak: "No recommendations near buy button", cost: "Missing 18% AOV increase" },
  { iconKey: "trust", label: "Trust", leak: "No guarantees or contact info visible", cost: "Doubt kills the sale at checkout" },
  { iconKey: "socialCommerce", label: "Social Commerce", leak: "No TikTok Shop or Pinterest integration", cost: "3-5x higher conversion on social" },
  { iconKey: "sizeGuide", label: "Size Guide", leak: "No interactive size finder", cost: "30-40% of returns are size-related" },
  { iconKey: "variantUx", label: "Variants", leak: "Dropdowns instead of visual swatches", cost: "69% abandon when out of stock" },
  { iconKey: "accessibility", label: "Accessibility", leak: "Color contrast and screen reader issues", cost: "4,500+ lawsuits in 2024 alone" },
  { iconKey: "contentFreshness", label: "Freshness", leak: "Stale content and expired badges", cost: "Erodes trust with search engines & AI" },
];

/* ══════════════════════════════════════════════════════════════
   Dimension Groups — maps each category key to a funnel stage
   ══════════════════════════════════════════════════════════════ */

export interface DimensionGroup {
  id: string;
  label: string;
  question: string;
  keys: (keyof import("./types").CategoryScores)[];
}

export const DIMENSION_GROUPS: DimensionGroup[] = [
  {
    id: "buying",
    label: "Buying Experience",
    question: "Does your page sell the product?",
    keys: ["images", "description", "pricing", "sizeGuide", "variantUx"],
  },
  {
    id: "trust",
    label: "Trust & Transparency",
    question: "Do shoppers believe you?",
    keys: ["socialProof", "trust", "shipping"],
  },
  {
    id: "conversion",
    label: "Conversion & Checkout",
    question: "Will the sale actually complete?",
    keys: ["checkout", "mobileCta", "crossSell"],
  },
  {
    id: "discovery",
    label: "Discovery & Traffic",
    question: "Can people find your product?",
    keys: ["title", "aiDiscoverability", "structuredData", "socialCommerce"],
  },
  {
    id: "technical",
    label: "Technical Foundation",
    question: "Is your site healthy?",
    keys: ["pageSpeed", "accessibility", "contentFreshness"],
  },
];
