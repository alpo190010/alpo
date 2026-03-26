"use client";

import { useState, useEffect, useRef } from "react";

/* ── Lazy PostHog — don't block initial paint with 176KB bundle ── */
export function captureEvent(event: string, properties?: Record<string, unknown>) {
  import("posthog-js").then(({ default: posthog }) => {
    try { posthog.capture(event, properties); } catch { /* not initialized */ }
  });
}

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
  tip: string;
  problem: string;
  category: string;
  revenueImpact: string;
}

/* ══════════════════════════════════════════════════════════════
   Constants — 20 Dimensions
   ══════════════════════════════════════════════════════════════ */

export const CATEGORY_BENCHMARKS: Record<string, { avg: number; achievable: number }> = {
  fashion:      { avg: 1.90, achievable: 2.80 },
  beauty:       { avg: 2.50, achievable: 3.70 },
  food:         { avg: 1.50, achievable: 3.00 },
  home:         { avg: 1.20, achievable: 2.00 },
  electronics:  { avg: 1.20, achievable: 2.00 },
  fitness:      { avg: 1.60, achievable: 2.40 },
  jewelry:      { avg: 0.80, achievable: 1.40 },
  other:        { avg: 1.40, achievable: 2.20 },
};

export const CATEGORY_LABELS: Record<string, string> = {
  pageSpeed: "Page Speed",
  images: "Product Images",
  socialProof: "Reviews & Social Proof",
  checkout: "Checkout & Payments",
  mobileCta: "Mobile CTA & UX",
  title: "Title & SEO",
  aiDiscoverability: "AI Discoverability",
  structuredData: "Schema Markup",
  pricing: "Pricing Psychology",
  description: "Description Quality",
  shipping: "Shipping Transparency",
  crossSell: "Cross-Sell & Upsell",
  cartRecovery: "Cart Recovery Flows",
  trust: "Trust & Guarantees",
  merchantFeed: "Merchant Feed Quality",
  socialCommerce: "Social Commerce",
  sizeGuide: "Size & Fit Info",
  variantUx: "Variant UX & Stock",
  accessibility: "Accessibility",
  contentFreshness: "Content Freshness",
};

export const CATEGORY_REVENUE_IMPACT: Record<string, string> = {
  pageSpeed: "Very High",
  images: "Very High",
  socialProof: "Very High",
  checkout: "Very High",
  mobileCta: "High",
  title: "High",
  aiDiscoverability: "High",
  structuredData: "High",
  pricing: "High",
  description: "Medium-High",
  shipping: "Medium-High",
  crossSell: "Medium-High",
  cartRecovery: "Medium-High",
  trust: "Medium",
  merchantFeed: "Medium",
  socialCommerce: "Medium",
  sizeGuide: "Medium",
  variantUx: "Medium",
  accessibility: "Low-Medium",
  contentFreshness: "Low-Medium",
};

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
  cartRecovery: { low: "No abandoned cart recovery flows. Automated flows drive 30% of email revenue", mid: "Cart recovery could be stronger. Three emails recover 37% more carts than one" },
  trust: { low: "No trust signals visible. Visible phone numbers are the #1 global trust symbol", mid: "Trust elements present but not prominently displayed" },
  merchantFeed: { low: "No Google Merchant feed detected. 75% of retail ad clicks come from Shopping Ads", mid: "Feed quality could be improved. GTIN accuracy alone increases conversion up to 20%" },
  socialCommerce: { low: "No social commerce integration. TikTok Shop drives 3-5x higher conversion than static listings", mid: "Social commerce is underutilized. Pinterest Rich Pins increase CTR 39%" },
  sizeGuide: { low: "No size guide. 30-40% of clothing returns are size-related", mid: "Size info could be more interactive. Fit finders dramatically outperform static charts" },
  variantUx: { low: "Variant selection is confusing. Color swatches outperform dropdowns for visual products", mid: "Variant UX could improve. Low-stock warnings reduce abandonment by 8%" },
  accessibility: { low: "Accessibility issues detected. 4,500+ lawsuits filed in 2024, up 37% in 2025", mid: "Some accessibility gaps. 54% of Shopify stores fail color contrast" },
  contentFreshness: { low: "Content appears stale. Outdated badges and certifications erode trust", mid: "Content could be fresher. Regular updates signal relevance to search engines and AI" },
};

/** Category SVG icons — solid, monochrome */
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
  ArrowCounterClockwiseIcon,
  ShieldCheckIcon,
  StorefrontIcon,
  ShareNetworkIcon,
  RulerIcon,
  SwatchesIcon,
  WheelchairIcon,
  LeafIcon,
  LockIcon,
} from "@phosphor-icons/react";

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
  cartRecovery: <ArrowCounterClockwiseIcon size={20} weight="fill" />,
  trust: <ShieldCheckIcon size={20} weight="fill" />,
  merchantFeed: <StorefrontIcon size={20} weight="fill" />,
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
  { iconKey: "cartRecovery", label: "Cart Recovery", leak: "No abandoned cart emails", cost: "2% of sends = 30% of email revenue" },
  { iconKey: "trust", label: "Trust", leak: "No guarantees or contact info visible", cost: "Doubt kills the sale at checkout" },
  { iconKey: "merchantFeed", label: "Merchant Feed", leak: "Missing or broken Google Shopping feed", cost: "75% of ad clicks come from Shopping" },
  { iconKey: "socialCommerce", label: "Social Commerce", leak: "No TikTok Shop or Pinterest integration", cost: "3-5x higher conversion on social" },
  { iconKey: "sizeGuide", label: "Size Guide", leak: "No interactive size finder", cost: "30-40% of returns are size-related" },
  { iconKey: "variantUx", label: "Variants", leak: "Dropdowns instead of visual swatches", cost: "69% abandon when out of stock" },
  { iconKey: "accessibility", label: "Accessibility", leak: "Color contrast and screen reader issues", cost: "4,500+ lawsuits in 2024 alone" },
  { iconKey: "contentFreshness", label: "Freshness", leak: "Stale content and expired badges", cost: "Erodes trust with search engines & AI" },
];

/* ══════════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════════ */

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

/** Build leak cards from categories + tips, sorted worst-first */
export function buildLeaks(categories: CategoryScores, tips: string[]): LeakCard[] {
  const entries = Object.entries(categories) as [keyof CategoryScores, number][];
  entries.sort((a, b) => a[1] - b[1]);

  return entries.map((entry, i) => {
    const [key, catScore] = entry;
    const impact = i < 3 ? "HIGH" : i < 8 ? "MED" : "LOW";
    let revenue: string;
    if (i < 3) {
      revenue = `+$${150 + (catScore * 7) % 50}/mo`;
    } else if (i < 8) {
      revenue = `+$${80 + (catScore * 11) % 40}/mo`;
    } else {
      revenue = `+$${30 + (catScore * 13) % 30}/mo`;
    }
    const problems = CATEGORY_PROBLEMS[key] || { low: `Improve your ${key} to increase conversions.`, mid: `Your ${key} needs optimization.` };
    const problem = catScore <= 40 ? problems.low : problems.mid;
    const tip = tips[i] || `Improve your ${key} to increase conversions.`;
    const revenueImpact = CATEGORY_REVENUE_IMPACT[key] || "Medium";
    return { key, catScore, impact, revenue, tip, problem, category: CATEGORY_LABELS[key] || key, revenueImpact };
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
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════
   Hooks
   ══════════════════════════════════════════════════════════════ */

export function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  const rafId = useRef<number>(0);

  useEffect(() => {
    if (target <= 0) {
      started.current = false;
      setValue(0);
      return;
    }
    if (started.current) return;
    started.current = true;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) rafId.current = requestAnimationFrame(tick);
    }
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [target, duration]);

  return value;
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
    pageSpeed: Number(cats?.pageSpeed) || 0,
    images: Number(cats?.images) || 0,
    socialProof: Number(cats?.socialProof) || 0,
    checkout: Number(cats?.checkout) || 0,
    mobileCta: Number(cats?.mobileCta) || 0,
    title: Number(cats?.title) || 0,
    aiDiscoverability: Number(cats?.aiDiscoverability) || 0,
    structuredData: Number(cats?.structuredData) || 0,
    pricing: Number(cats?.pricing) || 0,
    description: Number(cats?.description) || 0,
    shipping: Number(cats?.shipping) || 0,
    crossSell: Number(cats?.crossSell) || 0,
    cartRecovery: Number(cats?.cartRecovery) || 0,
    trust: Number(cats?.trust) || 0,
    merchantFeed: Number(cats?.merchantFeed) || 0,
    socialCommerce: Number(cats?.socialCommerce) || 0,
    sizeGuide: Number(cats?.sizeGuide) || 0,
    variantUx: Number(cats?.variantUx) || 0,
    accessibility: Number(cats?.accessibility) || 0,
    contentFreshness: Number(cats?.contentFreshness) || 0,
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
