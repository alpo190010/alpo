"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import AnalysisLoader from "@/components/AnalysisLoader";
import CompetitorLoader from "@/components/CompetitorLoader";
import CompetitorComparison from "@/components/CompetitorComparison";

/* ── Lazy PostHog — don't block initial paint with 176KB bundle ── */
function captureEvent(event: string, properties?: Record<string, unknown>) {
  import("posthog-js").then(({ default: posthog }) => {
    try { posthog.capture(event, properties); } catch { /* not initialized */ }
  });
}

/* ── Types ── */
interface CategoryScores {
  title: number;
  images: number;
  pricing: number;
  socialProof: number;
  cta: number;
  description: number;
  trust: number;
}

interface CompetitorResult {
  competitors: Array<{
    name: string;
    url: string;
    score: number;
    summary: string;
    categories: CategoryScores;
  }>;
}

interface FreeResult {
  score: number;
  summary: string;
  tips: string[];
  categories: CategoryScores;
  productPrice: number;
  productCategory: string;
  estimatedMonthlyVisitors: number;
}

/* ── Revenue loss estimation (research-backed) ── */
const CATEGORY_BENCHMARKS: Record<string, { avg: number; achievable: number }> = {
  fashion:      { avg: 1.90, achievable: 2.80 },
  beauty:       { avg: 2.50, achievable: 3.70 },
  food:         { avg: 1.50, achievable: 3.00 },
  home:         { avg: 1.20, achievable: 2.00 },
  electronics:  { avg: 1.20, achievable: 2.00 },
  fitness:      { avg: 1.60, achievable: 2.40 },
  jewelry:      { avg: 0.80, achievable: 1.40 },
  other:        { avg: 1.40, achievable: 2.20 },
};

function roundNicely(n: number): number {
  if (n < 100) return Math.round(n / 5) * 5;
  if (n < 1000) return Math.round(n / 25) * 25;
  if (n < 10000) return Math.round(n / 100) * 100;
  return Math.round(n / 500) * 500;
}

function calculateRevenueLoss(
  score: number,
  productPrice: number,
  estimatedVisitors: number,
  productCategory: string
) {
  const benchmarks = CATEGORY_BENCHMARKS[productCategory] || CATEGORY_BENCHMARKS["other"];
  const { avg, achievable } = benchmarks;
  const price = productPrice || 35;
  const visitors = estimatedVisitors || 500;

  // Score maps to estimated CR between bottom (avg×0.4) and achievable (75th pct)
  const bottomCR = avg * 0.4;
  const scoreNorm = score / 100;
  const estimatedCR = bottomCR + scoreNorm * (achievable - bottomCR);
  const gapVsAchievable = Math.max(0, achievable - estimatedCR) / 100;

  // Only 40% of the CR gap is attributable to page quality (Baymard)
  const pageAttributable = gapVsAchievable * 0.40;
  
  // Additional orders from better page
  const additionalOrders = visitors * pageAttributable;
  
  // Dynamic order cap: cheap items can have more extra sales, expensive items fewer
  // $15 → max 15, $50 → max 10, $200 → max 5, $1000 → max 2, $10000 → max 0.6
  const maxOrders = Math.max(0.3, 15 / Math.pow(1 + price / 50, 0.6));
  const cappedOrders = Math.min(additionalOrders, maxOrders);
  
  const monthlyLoss = cappedOrders * price;

  return {
    lossLow: Math.max(roundNicely(monthlyLoss * 0.7), 20),
    lossHigh: Math.max(roundNicely(monthlyLoss * 1.3), 50),
  };
}

/* ── Score color helper ── */
function scoreColor(score: number): string {
  if (score >= 70) return "var(--success)";
  if (score >= 40) return "var(--warning)";
  return "var(--error)";
}

/** High-contrast variant for text on tinted backgrounds */
function scoreColorText(score: number): string {
  if (score >= 70) return "var(--success-text)";
  if (score >= 40) return "var(--warning-text)";
  return "var(--error-text)";
}

function scoreColorTintBg(score: number): string {
  if (score >= 70) return "var(--success-light)";
  if (score >= 40) return "var(--warning-light)";
  return "var(--error-light)";
}

/* ── Animated count-up hook ── */
function useCountUp(target: number, duration = 1200) {
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

/* ── Build leak cards from categories + tips ── */
const CATEGORY_LABELS: Record<string, string> = {
  title: "Title",
  images: "Images",
  pricing: "Pricing",
  socialProof: "Social Proof",
  cta: "CTA",
  description: "Description",
  trust: "Trust",
};

const CATEGORY_PROBLEMS: Record<string, { low: string; mid: string }> = {
  title: { low: "Product title fails to communicate value or key benefits", mid: "Title misses opportunities to highlight differentiators" },
  images: { low: "Product imagery is insufficient for purchase confidence", mid: "Image gallery lacks variety and lifestyle context" },
  pricing: { low: "Price presentation creates friction and lacks anchoring", mid: "Pricing strategy misses conversion optimization basics" },
  socialProof: { low: "No visible social proof to build buyer confidence", mid: "Social proof elements are present but poorly positioned" },
  cta: { low: "Call-to-action is weak, hidden, or lacks urgency", mid: "CTA could be more prominent and compelling" },
  description: { low: "Product description fails to sell — wall of text or missing", mid: "Description needs better structure and benefit focus" },
  trust: { low: "No trust signals visible — guarantees, returns, or badges missing", mid: "Trust elements present but not prominently displayed" },
};

function buildLeaks(categories: CategoryScores, tips: string[]) {
  const entries = Object.entries(categories) as [keyof CategoryScores, number][];
  entries.sort((a, b) => a[1] - b[1]);

  return entries.slice(0, 7).map((entry, i) => {
    const [key, catScore] = entry;
    let impact: "HIGH" | "MED" | "LOW";
    let revenue: string;
    if (i === 0) {
      impact = "HIGH";
      revenue = `+$${150 + (catScore * 7) % 50}/mo`;
    } else if (i === 1) {
      impact = "MED";
      revenue = `+$${80 + (catScore * 11) % 40}/mo`;
    } else {
      impact = "LOW";
      revenue = `+$${30 + (catScore * 13) % 30}/mo`;
    }
    const problems = CATEGORY_PROBLEMS[key] || { low: `Improve your ${key} to increase conversions.`, mid: `Your ${key} needs optimization.` };
    const problem = catScore <= 40 ? problems.low : problems.mid;
    const tip = tips[i] || `Improve your ${key} to increase conversions.`;
    return { key, catScore, impact, revenue, tip, problem, category: CATEGORY_LABELS[key] || key };
  });
}

/* ── Category SVG icons — solid, monochrome ── */
const CATEGORY_SVG: Record<string, React.ReactNode> = {
  title: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 4v3h5.5v12h3V7H19V4H5z"/>
    </svg>
  ),
  images: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
    </svg>
  ),
  pricing: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
    </svg>
  ),
  socialProof: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
    </svg>
  ),
  cta: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
    </svg>
  ),
  description: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15h8v2H8v-2zm0-4h8v2H8v-2z"/>
    </svg>
  ),
  trust: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
    </svg>
  ),
};
/* ── Leak categories for "What We Check" section ── */
const LEAK_CATEGORIES = [
  {
    iconKey: "title",
    label: "Title",
    leak: "Generic title that doesn't sell",
    cost: "Visitors bounce before scrolling",
  },
  {
    iconKey: "images",
    label: "Images",
    leak: "Low-quality or too few photos",
    cost: "Buyers can't visualize owning it",
  },
  {
    iconKey: "pricing",
    label: "Pricing",
    leak: "No anchoring, no urgency",
    cost: "Price feels high with no context",
  },
  {
    iconKey: "socialProof",
    label: "Social Proof",
    leak: "Reviews missing or buried below fold",
    cost: "No trust = no purchase",
  },
  {
    iconKey: "cta",
    label: "CTA",
    leak: "Weak or hidden Add to Cart button",
    cost: "Ready buyers can't find the button",
  },
  {
    iconKey: "description",
    label: "Description",
    leak: "Wall of text, no benefits",
    cost: "Features don't convert, benefits do",
  },
  {
    iconKey: "trust",
    label: "Trust",
    leak: "No guarantees, shipping, or badges",
    cost: "Doubt kills the sale at checkout",
  },
];

/* ── URL validation ── */
function isValidUrl(input: string): string | null {
  const trimmed = input.trim();
  // Auto-prefix protocol if missing
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    // Must have a dot in hostname (rejects "localhost" etc)
    if (!parsed.hostname.includes(".")) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/* ── View phase for animated transitions ── */
type ViewPhase = "hero" | "hero-exit" | "loading" | "results" | "results-exit";

/* ── Main Page ── */
export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FreeResult | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState("");

  // New flow: issues shown immediately, modal on click
  const [selectedLeak, setSelectedLeak] = useState<string | null>(null);
  const [competitorCTAName, setCompetitorCTAName] = useState<string | null>(null);
  const [emailStep, setEmailStep] = useState<"form" | "queued" | null>(null);
  const [modalClosing, setModalClosing] = useState(false);

  const [showCard, setShowCard] = useState(false);
  const [showRevenue, setShowRevenue] = useState(false);
  const [showLeaks, setShowLeaks] = useState(false);

  // Product picker for homepage URLs
  const [productPicker, setProductPicker] = useState<{
    products: Array<{ url: string; slug: string; image: string }>;
    storeName: string;
  } | null>(null);
  const [productPickerLoading, setProductPickerLoading] = useState(false);
  const [scoreCardCollapsed, setScoreCardCollapsed] = useState(false);
  const issuesRef = useRef<HTMLDivElement>(null);

  // Phase state machine for transitions
  const [phase, setPhase] = useState<ViewPhase>("hero");

  // Competitor comparison state
  const [competitorLoading, setCompetitorLoading] = useState(false);
  const [competitorResult, setCompetitorResult] = useState<CompetitorResult | null>(null);
  const [competitorError, setCompetitorError] = useState("");
  const competitorAbortRef = useRef<AbortController | null>(null);

  const animatedScore = useCountUp(showCard ? (result?.score ?? 0) : 0);

  useEffect(() => {
    if (!result) return;
    setScoreCardCollapsed(false);
    setShowCard(true);
    const t1 = setTimeout(() => setShowRevenue(true), 1500);
    const t2 = setTimeout(() => setShowLeaks(true), 1800);
    // Auto-scroll to issues after the reveal sequence
    const t3 = setTimeout(() => {
      issuesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [result]);

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (error) setError("");
    if (productPicker) setProductPicker(null);
  }, [error]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchCompetitors = useCallback(async () => {
    // Abort any in-flight competitor request
    competitorAbortRef.current?.abort();
    const controller = new AbortController();
    competitorAbortRef.current = controller;

    setCompetitorLoading(true);
    setCompetitorError("");
    setCompetitorResult(null);
    captureEvent("competitor_analysis_triggered", { url });

    try {
      const res = await fetch("/api/analyze-competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Competitor analysis failed (${res.status})`);
      }
      const data = await res.json();
      // Server already filters out 404s/errors — this is a safety net
      const validCompetitors = (data.competitors ?? []).filter(
        (c: { score: number; categories?: Record<string, number> }) => {
          if (c.score <= 0) return false;
          // Reject if all category scores are zero (bad parse)
          const cats = c.categories || {};
          const catSum = Object.values(cats).reduce((a: number, b: number) => a + b, 0);
          return catSum > 0;
        }
      );
      setCompetitorResult({ competitors: validCompetitors });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setCompetitorError(message);
      console.error("Competitor fetch failed:", message);
    } finally {
      setCompetitorLoading(false);
    }
  }, [url]);

  const analyze = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate URL
    const validUrl = isValidUrl(url);
    if (!validUrl) {
      setError("Please enter a valid URL (e.g. yourstore.com or yourstore.com/products/...)");
      return;
    }

    // Prevent double-submit
    if (loading || productPickerLoading) return;

    // Check if this looks like a product page or a homepage/collection
    const urlPath = new URL(validUrl).pathname;
    const isLikelyProductPage = /\/products\/[^/]+/.test(urlPath);

    // Product URLs redirect to scan view with ?sku=handle instead of inline analysis
    if (isLikelyProductPage) {
      const productDomain = new URL(validUrl).hostname;
      const handleMatch = urlPath.match(/\/products\/([^/?#]+)/);
      const productHandle = handleMatch?.[1] || '';
      router.push(`/scan/${encodeURIComponent(productDomain)}${productHandle ? `?sku=${productHandle}` : ''}`);
      return;
    }

    // If not a product page, try to discover products first
    if (!isLikelyProductPage) {
      setProductPickerLoading(true);
      setError("");
      setProductPicker(null);
      try {
        const res = await fetch("/api/discover-products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: validUrl }),
        });
        const data = await res.json();

        if (data.isProductPage) {
          // It's actually a product page (non-standard URL structure) — navigate to scan route
          const scanDomain = new URL(validUrl).hostname;
          setProductPickerLoading(false);
          router.push(`/scan/${encodeURIComponent(scanDomain)}`);
          return;
        } else if (data.products?.length > 0) {
          // Navigate to scan route for split-view
          const scanDomain = new URL(validUrl).hostname;
          setProductPickerLoading(false);
          router.push(`/scan/${encodeURIComponent(scanDomain)}`);
          return;
        } else {
          // No products found — let the main analyze try anyway
          setProductPickerLoading(false);
        }
      } catch {
        // Discovery failed — let the main analyze try anyway
        setProductPickerLoading(false);
      }
    }

    // Clear picker if it was showing
    setProductPicker(null);

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Phase transition: hero exits first, then loading appears
    setPhase("hero-exit");
    setError("");
    setResult(null);
    setSelectedLeak(null);
    setCompetitorCTAName(null);
    setEmailStep(null);
    setModalClosing(false);
    setEmail("");
    setShowCard(false);
    setShowRevenue(false);
    setShowLeaks(false);
    setScoreCardCollapsed(false);

    // Wait for exit animation, then start loading
    await new Promise(r => setTimeout(r, 350));
    setPhase("loading");
    setLoading(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: validUrl }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Analysis failed (${res.status})`);
      }
      const data = await res.json();

      // Defensive: ensure categories has all expected keys
      const safeCategories: CategoryScores = {
        title: Number(data.categories?.title) || 0,
        images: Number(data.categories?.images) || 0,
        pricing: Number(data.categories?.pricing) || 0,
        socialProof: Number(data.categories?.socialProof) || 0,
        cta: Number(data.categories?.cta) || 0,
        description: Number(data.categories?.description) || 0,
        trust: Number(data.categories?.trust) || 0,
      };

      setResult({
        score: Math.min(100, Math.max(0, Number(data.score) || 0)),
        summary: String(data.summary || "Analysis complete."),
        tips: Array.isArray(data.tips) ? data.tips.map(String).slice(0, 7) : [],
        categories: safeCategories,
        productPrice: Number(data.productPrice) || 0,
        productCategory: String(data.productCategory || "other"),
        estimatedMonthlyVisitors: Number(data.estimatedMonthlyVisitors) || 1000,
      });
      setPhase("results");
      captureEvent("scan_completed", { url: validUrl, score: data.score });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setPhase("hero");
    } finally {
      setLoading(false);
    }
  }, [url, loading, productPickerLoading]);

  const submitEmail = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailSubmitting) return;
    setEmailSubmitting(true);
    setEmailError("");
    try {
      const res = await fetch("/api/request-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          url,
          score: result?.score,
          summary: result?.summary,
          tips: result?.tips,
          categories: result?.categories,
          competitorName: competitorCTAName,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429) {
          throw new Error("Too many requests. Please wait a moment and try again.");
        }
        throw new Error(data.error || "Failed to send. Please try again.");
      }
      setEmailStep("queued");
      captureEvent("report_email_submitted", { url, score: result?.score });
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setEmailSubmitting(false);
    }
  }, [email, url, result, emailSubmitting, competitorCTAName]);

  const handleScanAnother = useCallback(() => {
    // Animate results out, then reset to hero
    setPhase("results-exit");
    competitorAbortRef.current?.abort();
    setTimeout(() => {
      setResult(null);
      setUrl("");
      setError("");
      setEmail("");
      setSelectedLeak(null);
      setCompetitorCTAName(null);
      setEmailStep(null);
      setModalClosing(false);
      setShowCard(false);
      setShowRevenue(false);
      setShowLeaks(false);
      setScoreCardCollapsed(false);
      setCompetitorResult(null);
      setCompetitorLoading(false);
      setCompetitorError("");
      setProductPicker(null);
      setProductPickerLoading(false);
      setPhase("hero");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 350);
  }, []);

  const closeModal = useCallback(() => {
    setModalClosing(true);
    setTimeout(() => {
      setSelectedLeak(null);
      setCompetitorCTAName(null);
      setEmailStep(null);
      setModalClosing(false);
    }, 200);
  }, []);

  const leaks = result ? buildLeaks(result.categories, result.tips) : [];
  const { lossLow, lossHigh } = result
    ? calculateRevenueLoss(result.score, result.productPrice, result.estimatedMonthlyVisitors, result.productCategory)
    : { lossLow: 0, lossHigh: 0 };

  let domain = "";
  try { domain = new URL(url).hostname; } catch { /* ignore */ }

  return (
    <>
      {/* ═══ NAV ═══ */}
      <nav className="fixed top-0 w-full z-50 bg-violet-50/80 backdrop-blur-xl shadow-xl shadow-violet-900/5" aria-label="Main navigation">
        <div className="flex justify-between items-center w-full px-4 sm:px-8 py-4 max-w-screen-2xl mx-auto">
          <div className="text-2xl font-black tracking-tighter text-violet-700" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>PageLeaks</div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                if (result) {
                  handleScanAnother();
                } else {
                  document.getElementById("hero-form")?.scrollIntoView({ behavior: "smooth" });
                }
              }}
              className="cursor-pointer primary-gradient text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-violet-600/20 hover:scale-105 active:scale-95 transition-all text-sm"
            >
              {result ? "Scan Another" : "Start Analysis"}
            </button>
          </div>
        </div>
      </nav>

      <main className="min-h-screen bg-[var(--bg)]" aria-busy={loading}>
        {/* ═══ HERO ═══ */}
        {(phase === "hero" || phase === "hero-exit") && !result && (
        <section className={`relative pt-32 sm:pt-40 pb-16 sm:pb-24 overflow-hidden ${phase === "hero-exit" ? "anim-phase-exit" : "anim-phase-enter"}`}>
          {/* Decorative background */}
          <div className="absolute top-0 right-0 -z-10 w-1/2 h-full bg-gradient-to-l from-violet-200/30 to-transparent blur-3xl opacity-50 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 -z-10 w-1/3 h-2/3 bg-gradient-to-tr from-violet-100/30 to-transparent blur-3xl opacity-50 pointer-events-none"></div>

          <div className="max-w-7xl mx-auto px-4 sm:px-8 relative z-10 text-center">
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-[var(--on-surface)] mb-8 leading-[1.1]" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
              Every month, your product page{" "}
              <br className="hidden md:block" />
              loses <span className="text-[var(--brand)]">$1,000s</span> in sales
            </h1>

            <p className="text-lg sm:text-xl text-[var(--on-surface-variant)] max-w-2xl mx-auto mb-12">
              Stop guessing. PageLeaks scans your sales page for conversion killers and tells you exactly what to fix.
            </p>

            {/* Search input — pill style from Stitch */}
            <form id="hero-form" onSubmit={analyze} className="max-w-2xl mx-auto">
              <div className="flex flex-col sm:flex-row p-2 bg-[var(--surface-container-lowest)] rounded-full shadow-[0_20px_40px_rgba(124,58,237,0.06)] border border-[var(--outline-variant)]/15 focus-within:border-[var(--brand)]/40 transition-all duration-300">
                <div className="hidden sm:flex items-center pl-6 pr-2 text-[var(--outline)]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </div>
                <input
                  id="url-input"
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="Paste your store or product page URL..."
                  value={url}
                  onChange={handleUrlChange}
                  aria-label="Product page URL"
                  className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-base sm:text-lg placeholder:text-[var(--outline)]/60 px-4 py-3 sm:py-0 text-[var(--on-surface)]"
                  aria-describedby={error ? "url-error" : undefined}
                />
                <button
                  type="submit"
                  disabled={loading || productPickerLoading}
                  className="cursor-pointer primary-gradient text-white px-8 sm:px-10 py-3.5 sm:py-4 rounded-full font-bold flex items-center justify-center gap-2 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                >
                  {loading ? "Scanning..." : productPickerLoading ? "Finding..." : "Analyze"}
                  {!loading && !productPickerLoading && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  )}
                </button>
              </div>
            </form>

            {/* Trust indicators */}
            <div className="mt-8 flex flex-wrap justify-center gap-6 sm:gap-8 text-[var(--outline)] text-sm font-medium">
              <span className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--brand)" aria-hidden="true"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
                No Credit Card Required
              </span>
              <span className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--brand)" aria-hidden="true"><path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C12.97 17.55 11 21 11 21z"/></svg>
                30-Second Analysis
              </span>
            </div>
          </div>
        </section>
        )}

        {/* ═══ PRODUCT PICKER LOADING ═══ */}
        {productPickerLoading && phase === "hero" && (
          <div className="max-w-xl mx-auto px-6 -mt-4 mb-8 text-center anim-phase-enter">
            <div className="inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-[var(--surface)] border border-[var(--border)]" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div className="w-4 h-4 rounded-full border-2 border-[var(--brand)] border-t-transparent" style={{ animation: "spin 0.8s linear infinite" }}></div>
              <span className="text-sm font-medium text-[var(--text-secondary)]">Finding products on this store…</span>
            </div>
          </div>
        )}

        {/* ═══ ERROR REDESIGNED ═══ */}
        {error && (
          <div className="max-w-2xl mx-auto px-6 mb-8 animate-[slide-down_300ms_ease-out_forwards]">
            <div
              id="url-error"
              className="p-4 rounded-xl text-sm border-l-4 bg-red-50 border-l-[var(--error)] border border-red-200"
              role="alert"
            >
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 16A8 8 0 108 0a8 8 0 000 16zM7 3v6h2V3H7zm0 8v2h2v-2H7z" fill="var(--error)"/>
                </svg>
                <span className="text-[var(--error)] font-medium">{error}</span>
              </div>
            </div>
          </div>
        )}

        {/* ═══ LOADER ═══ */}
        {loading && phase === "loading" && (
          <div className="anim-phase-enter">
            <AnalysisLoader url={url} />
          </div>
        )}

        {/* ═══ RESULTS HERO — Score Ring + Revenue Summary ═══ */}
        {result && showCard && (phase === "results" || phase === "results-exit") && (
          <section
            className={`pt-24 sm:pt-28 pb-8 ${phase === "results-exit" ? "anim-phase-exit" : ""}`}
            style={{ animation: "fade-in-up 600ms var(--ease-out-quart) both" }}
          >
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">

                {/* ── Score Ring + Domain Info ── */}
                <div
                  className="md:col-span-8 bg-[var(--surface)] rounded-3xl p-8 sm:p-10 flex flex-col md:flex-row items-center gap-8 sm:gap-10 relative overflow-hidden"
                  style={{ boxShadow: "var(--shadow-elevated)" }}
                >
                  {/* Decorative glow */}
                  <div
                    className="absolute top-0 right-0 w-72 h-72 rounded-full -mr-24 -mt-24 blur-3xl pointer-events-none"
                    style={{ background: "var(--brand)", opacity: 0.04 }}
                  ></div>

                  {/* Score ring */}
                  <div className="relative shrink-0">
                    <svg
                      className="w-44 h-44 sm:w-48 sm:h-48"
                      viewBox="0 0 192 192"
                      style={{ transform: "rotate(-90deg)" }}
                      aria-hidden="true"
                    >
                      <circle
                        cx="96" cy="96" r="88"
                        fill="transparent"
                        stroke="var(--surface-container)"
                        strokeWidth="10"
                      />
                      <circle
                        cx="96" cy="96" r="88"
                        fill="transparent"
                        stroke={scoreColor(result.score)}
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray="553"
                        strokeDashoffset={553 - (553 * animatedScore / 100)}
                        className="score-ring-progress"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span
                        className="font-extrabold text-[var(--on-surface)]"
                        style={{
                          fontSize: "clamp(40px, 7vw, 56px)",
                          fontFamily: "var(--font-manrope), Manrope, sans-serif",
                          lineHeight: 1,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {animatedScore}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--on-surface-variant)] opacity-50 mt-1">
                        Score
                      </span>
                    </div>
                  </div>

                  {/* Domain + context */}
                  <div className="space-y-4 text-center md:text-left relative z-10">
                    <div>
                      <span
                        className="inline-block px-3 py-1.5 rounded-full text-xs font-bold mb-3 uppercase tracking-wider"
                        style={{
                          backgroundColor: scoreColorTintBg(result.score),
                          color: scoreColorText(result.score),
                        }}
                      >
                        {result.score >= 80
                          ? "Excellent"
                          : result.score >= 60
                          ? "Above Average"
                          : result.score >= 40
                          ? "Needs Improvement"
                          : "Critical Issues Found"}
                      </span>
                      <h1
                        className="text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] tracking-tight"
                        style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
                      >
                        {domain || url}
                      </h1>
                    </div>
                    <p className="text-[var(--on-surface-variant)] max-w-md text-sm sm:text-base leading-relaxed">
                      {result.summary}
                    </p>
                    <div className="flex gap-3 pt-2 justify-center md:justify-start">
                      <div className="px-4 py-2.5 bg-[var(--surface-container-low)] rounded-xl">
                        <div className="text-[9px] text-[var(--on-surface-variant)] uppercase font-bold tracking-[0.15em]">
                          Issues
                        </div>
                        <div
                          className="text-lg font-bold text-[var(--on-surface)]"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {leaks.length}
                        </div>
                      </div>
                      <div className="px-4 py-2.5 bg-[var(--surface-container-low)] rounded-xl">
                        <div className="text-[9px] text-[var(--on-surface-variant)] uppercase font-bold tracking-[0.15em]">
                          Avg Score
                        </div>
                        <div
                          className="text-lg font-bold text-[var(--on-surface)]"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          65
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Revenue Loss Card ── */}
                {showRevenue && (
                  <div
                    className="md:col-span-4 p-8 rounded-3xl text-white flex flex-col justify-between"
                    style={{
                      background: "linear-gradient(135deg, var(--brand), var(--primary-dim))",
                      boxShadow: "0 20px 60px rgba(124, 58, 237, 0.25)",
                      animation: "fade-in-up 500ms var(--ease-out-quart) both",
                    }}
                  >
                    <div className="space-y-2">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="opacity-50" aria-hidden="true">
                        <path d="M23 6l-9.5 9.5-5-5L1 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M17 6h6v6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <h3 className="text-base sm:text-lg font-semibold opacity-80 leading-tight">
                        Estimated Monthly Revenue Loss
                      </h3>
                    </div>
                    <div className="space-y-1 my-6">
                      <div
                        className="font-extrabold tracking-tighter"
                        style={{
                          fontSize: "clamp(28px, 5vw, 44px)",
                          fontFamily: "var(--font-manrope), Manrope, sans-serif",
                        }}
                      >
                        -${lossLow.toLocaleString()}&ndash;${lossHigh.toLocaleString()}
                      </div>
                      <p className="text-sm font-medium opacity-70">Based on estimated store traffic</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => issuesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="cursor-pointer w-full py-3 bg-white/10 backdrop-blur-md rounded-xl font-bold border border-white/20 hover:bg-white/20 transition-all text-sm"
                    >
                      View Issue Breakdown &darr;
                    </button>
                  </div>
                )}

              </div>
            </div>
          </section>
        )}

        {/* ═══ COMPETITOR TEASER — hidden for now ═══ */}
        {false && result && showLeaks && (phase === "results" || phase === "results-exit") && !competitorLoading && !competitorResult && !competitorError && (
          <div className="max-w-4xl mx-auto px-6 mb-6" style={{ animation: "fade-in-up 500ms ease-out 200ms both" }}>
            <button
              type="button"
              onClick={fetchCompetitors}
              className="cursor-pointer w-full group relative overflow-hidden rounded-2xl text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.99]"
              style={{
                background: "linear-gradient(135deg, var(--brand), var(--primary-dim))",
                boxShadow: "0 8px 32px rgba(124, 58, 237, 0.25)",
              }}
            >
              {/* Decorative glow */}
              <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 blur-[60px] rounded-full pointer-events-none"></div>
              <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/10 blur-[40px] rounded-full pointer-events-none"></div>

              <div className="relative z-10 px-6 py-5 sm:px-8 sm:py-6 flex items-center gap-4 sm:gap-6">
                {/* Pulsing icon */}
                <div className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                  <div className="relative">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="3" y="12" width="4" height="9" rx="1" fill="white" opacity="0.5"/>
                      <rect x="10" y="4" width="4" height="17" rx="1" fill="white"/>
                      <rect x="17" y="8" width="4" height="13" rx="1" fill="white" opacity="0.7"/>
                    </svg>
                    <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-400 animate-pulse"></div>
                  </div>
                </div>

                {/* Copy */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-white mb-0.5 leading-snug">
                    Are competitors outscoring you?
                  </h3>
                  <p className="text-sm text-white/70 hidden sm:block">
                    See how your page compares to similar products — category by category
                  </p>
                </div>

                {/* Explicit CTA */}
                <div className="shrink-0 flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-full bg-white text-[var(--brand)] font-bold text-sm group-hover:bg-white/90 transition-colors shadow-sm">
                  <span className="hidden sm:inline">Compare Now</span>
                  <span className="sm:hidden">Compare</span>
                  <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* ═══ COMPETITOR LOADER — hidden for now ═══ */}
        {false && result && showLeaks && competitorLoading && (phase === "results" || phase === "results-exit") && (
          <div className="max-w-4xl mx-auto px-6 mb-6" style={{ animation: "fade-in-up 300ms ease-out both" }}>
            <CompetitorLoader url={url} />
          </div>
        )}

        {/* ═══ COMPETITOR ERROR — hidden for now ═══ */}
        {false && result && showLeaks && competitorError && (phase === "results" || phase === "results-exit") && (
          <div className="max-w-4xl mx-auto px-6 mb-6" style={{ animation: "fade-in-up 300ms ease-out both" }}>
            <div className="p-6 rounded-2xl bg-[var(--error-light)] border border-red-200">
              <div className="flex items-center gap-4">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="var(--error)" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--error-text)]">{competitorError}</p>
                </div>
                <button
                  type="button"
                  onClick={fetchCompetitors}
                  className="cursor-pointer shrink-0 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[var(--brand)] to-violet-800 hover:scale-105 transition-transform"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ COMPETITOR RESULTS — hidden for now
        {result && showLeaks && competitorResult && (phase === "results" || phase === "results-exit") && (
          <div className={`max-w-4xl mx-auto px-6 mb-6 ${phase === "results-exit" ? "anim-phase-exit" : ""}`}>
            {competitorResult.competitors.length > 0 ? (
              <CompetitorComparison
                competitors={competitorResult.competitors}
                userCategories={result.categories}
                userScore={result.score}
                onBeatCompetitor={(name) => { setCompetitorCTAName(name); setEmailStep("form"); }}
              />
            ) : (
              <CompetitorComparison
                competitors={[]}
                userCategories={result.categories}
                userScore={result.score}
              />
            )}
          </div>
        )}
        ═══ */}

        {/* ═══ ISSUES BENTO GRID — 3-column with CTA card ═══ */}
        {result && showLeaks && (phase === "results" || phase === "results-exit") && (
          <div ref={issuesRef} className={`max-w-6xl mx-auto px-4 sm:px-6 pb-8 ${phase === "results-exit" ? "anim-phase-exit" : ""}`}>
            {/* Section header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 sm:mb-10 pl-0 sm:pl-1">
              <div className="border-l-[3px] border-[var(--brand)] pl-5">
                <h2
                  className="text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] tracking-tight"
                  style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
                >
                  Issues Found
                </h2>
                <p className="text-[var(--on-surface-variant)] text-sm sm:text-base mt-1">
                  {leaks.length} conversion leaks identified. Click any to get the fix.
                </p>
              </div>
            </div>

            {/* Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {leaks.map((leak, i) => {

                const style = {
                  HIGH: {
                    textColor: "var(--error-text)",
                  },
                  MED: {
                    textColor: "var(--warning-text)",
                  },
                  LOW: {
                    textColor: "var(--success-text)",
                  },
                }[leak.impact as "HIGH" | "MED" | "LOW"];

                return (
                  <button
                    key={leak.key}
                    type="button"
                    onClick={() => {
                      setSelectedLeak(leak.key);
                      setEmailStep("form");
                      setEmailError("");
                      captureEvent("issue_clicked", { category: leak.key, impact: leak.impact });
                    }}
                    className="cursor-pointer group text-left bg-[var(--surface)] rounded-[1.5rem] p-6 sm:p-7 flex flex-col justify-between border border-[var(--outline-variant)]/20 hover:border-[var(--brand)]/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)]"
                    style={{
                      boxShadow: "var(--shadow-subtle)",
                      animation: `fade-in-up 400ms ease-out ${i * 70}ms both`,
                    }}
                  >
                    <div className="space-y-5">
                      {/* Icon + Score */}
                      <div className="flex justify-between items-start">
                        <div className="w-12 h-12 bg-[var(--surface-container-high)] rounded-2xl flex items-center justify-center text-[var(--on-surface-variant)] group-hover:text-[var(--brand)] group-hover:scale-110 transition-all duration-300">
                          {CATEGORY_SVG[leak.key] || CATEGORY_SVG.title}
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] font-bold text-[var(--on-surface-variant)] tracking-[0.15em] uppercase">
                            Score
                          </div>
                          <div
                            className="text-xl font-extrabold"
                            style={{
                              color: style.textColor,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {leak.catScore}<span className="text-xs font-semibold opacity-50">/100</span>
                          </div>
                        </div>
                      </div>

                      {/* Category + Problem */}
                      <div className="space-y-2">
                        <h3 className="text-lg sm:text-xl font-bold text-[var(--on-surface)] tracking-tight leading-snug">
                          {leak.category}
                        </h3>
                        <p className="text-sm text-[var(--on-surface-variant)] leading-relaxed line-clamp-3">
                          {leak.problem}
                        </p>
                      </div>
                    </div>

                    {/* Bottom: Revenue + Arrow */}
                    <div className="mt-6 pt-5 border-t border-[var(--surface-container)] flex justify-between items-center">
                      <div>
                        <div className="text-[9px] font-bold text-[var(--on-surface-variant)] uppercase tracking-[0.15em]">
                          Potential Gain
                        </div>
                        <div className="text-base sm:text-lg font-extrabold text-[var(--brand)]">
                          {leak.revenue}
                        </div>
                      </div>
                      <svg
                        className="w-5 h-5 text-[var(--on-surface-variant)] group-hover:text-[var(--brand)] group-hover:translate-x-1 transition-all duration-200"
                        viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
                      >
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </button>
                );
              })}

              {/* CTA Card — last position */}
              <button
                type="button"
                onClick={() => {
                  setSelectedLeak(leaks[0]?.key || null);
                  setEmailStep("form");
                  setEmailError("");
                  captureEvent("cta_card_clicked", { url });
                }}
                className="cursor-pointer group relative rounded-[1.5rem] p-7 flex flex-col items-center justify-center text-center overflow-hidden text-white min-h-[280px]"
                style={{
                  background: "linear-gradient(135deg, var(--on-surface) 0%, #2d1b42 100%)",
                  animation: `fade-in-up 400ms ease-out ${leaks.length * 70}ms both`,
                }}
              >
                {/* Subtle grid pattern overlay */}
                <div
                  className="absolute inset-0 opacity-[0.04] pointer-events-none"
                  style={{
                    backgroundImage: "linear-gradient(var(--brand) 1px, transparent 1px), linear-gradient(90deg, var(--brand) 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                  }}
                ></div>

                <div className="relative z-10 space-y-4">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <h3
                    className="text-xl sm:text-2xl font-extrabold"
                    style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
                  >
                    Get All Fixes
                  </h3>
                  <p className="text-white/60 text-sm max-w-[200px] mx-auto leading-relaxed">
                    Step-by-step recommendations for all {leaks.length} issues, sent to your inbox.
                  </p>
                  <span className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-white text-[var(--on-surface)] rounded-full font-bold text-sm group-hover:scale-105 transition-transform">
                    Get Free Report
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ═══ FEATURED INSIGHT — editorial section ═══ */}
        {result && showLeaks && (phase === "results" || phase === "results-exit") && (
          <section
            className={`max-w-6xl mx-auto px-4 sm:px-6 pb-16 ${phase === "results-exit" ? "anim-phase-exit" : ""}`}
            style={{ animation: "fade-in-up 600ms var(--ease-out-quart) 400ms both" }}
          >
            <div className="bg-[var(--surface-container-low)] rounded-3xl p-8 sm:p-12 relative overflow-hidden">
              <div className="grid md:grid-cols-2 gap-10 items-center relative z-10">
                <div className="space-y-5">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold bg-[var(--brand-light)] text-[var(--brand)] border border-[var(--brand-border)]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--brand)" aria-hidden="true">
                      <path d="M12 1.5l2.61 6.727 6.89.52-5.23 4.917 1.58 6.836L12 16.56 6.15 20.5l1.58-6.836L2.5 8.747l6.89-.52L12 1.5z"/>
                    </svg>
                    Top Insight
                  </div>
                  <h2
                    className="text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] tracking-tight leading-tight"
                    style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
                  >
                    {leaks[0]
                      ? `Your "${leaks[0].category}" score of ${leaks[0].catScore} is the #1 revenue blocker.`
                      : "Critical improvements identified."}
                  </h2>
                  <p className="text-[var(--on-surface-variant)] text-base leading-relaxed max-w-lg">
                    {leaks[0]?.tip || result.summary}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (leaks[0]) {
                        setSelectedLeak(leaks[0].key);
                        setEmailStep("form");
                        setEmailError("");
                      }
                    }}
                    className="cursor-pointer group inline-flex items-center gap-2 text-[var(--brand)] font-bold text-base"
                  >
                    Get the detailed fix
                    <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                {/* Score breakdown mini-chart */}
                <div className="space-y-3">
                  {leaks.slice(0, 5).map((leak) => (
                    <div key={leak.key} className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[var(--on-surface-variant)] w-24 shrink-0 truncate">
                        {leak.category}
                      </span>
                      <div className="flex-1 h-3 bg-[var(--surface-container)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${leak.catScore}%`,
                            backgroundColor: scoreColor(leak.catScore),
                          }}
                        ></div>
                      </div>
                      <span
                        className="text-sm font-bold w-8 text-right"
                        style={{
                          color: scoreColorText(leak.catScore),
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {leak.catScore}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Decorative blur */}
              <div
                className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full blur-[100px] pointer-events-none"
                style={{ background: "var(--brand)", opacity: 0.06 }}
              ></div>
            </div>

            {/* Scan another CTA */}
            <div className="text-center mt-12">
              <button
                type="button"
                onClick={handleScanAnother}
                className="cursor-pointer inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring bg-gradient-to-r from-[var(--brand)] to-violet-800"
                style={{ boxShadow: "0 8px 32px rgba(124, 58, 237, 0.2)" }}
              >
                Analyze Another Page
              </button>
            </div>
          </section>
        )}

        {/* ═══ EMAIL MODAL — triggered by clicking an issue ═══ */}
        {(selectedLeak || competitorCTAName) && emailStep && (
          <div
            className={`cursor-pointer fixed inset-0 z-50 flex items-center justify-center p-4 ${modalClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"}`}
            style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
            role="dialog"
            aria-modal="true"
            aria-label="Get detailed fix"
          >
            <div
              className={`relative w-full max-w-md bg-[var(--surface)] rounded-3xl overflow-hidden ${modalClosing ? "modal-content-exit" : "modal-content-enter"}`}
              style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}
            >
              {/* Top accent */}
              <div className="h-1 w-full bg-gradient-to-r from-[var(--brand)] to-violet-800"></div>

              {/* Close button */}
              <button
                type="button"
                onClick={closeModal}
                className="cursor-pointer absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>

              <div className="p-6 sm:p-8">
                {emailStep === "form" && (
                  <div key="form-step">
                    <div className="text-center mb-6">
                      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--brand-light)] border border-[var(--brand-border)]">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">
                        {competitorCTAName
                          ? <>Get a Detailed Plan to Beat &ldquo;{competitorCTAName}&rdquo;</>
                          : <>Get the Fix for &ldquo;{leaks.find(l => l.key === selectedLeak)?.category}&rdquo;</>
                        }
                      </h3>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                        {competitorCTAName
                          ? <>We&apos;ll send you a step-by-step plan to outrank {competitorCTAName} across all categories.</>
                          : <>Enter your email and we&apos;ll send you detailed, actionable fixes for all {leaks.length} issues found on your page.</>
                        }
                      </p>
                    </div>

                    <form onSubmit={submitEmail}>
                      <div className="mb-3">
                        <input
                          id="modal-email-input"
                          type="email"
                          required
                          placeholder="your@email.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          aria-label="Your email address"
                          autoFocus
                          className="w-full px-4 py-3.5 text-base rounded-xl outline-none border-[1.5px] border-[var(--border)] text-[var(--text-primary)] bg-[var(--bg)] polish-focus-ring"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={emailSubmitting}
                        className="cursor-pointer w-full px-6 py-3.5 rounded-xl text-base font-semibold text-white polish-hover-lift polish-focus-ring disabled:opacity-50"
                        style={{
                          background: emailSubmitting ? "var(--text-tertiary)" : "linear-gradient(135deg, var(--brand), var(--primary-dim))",
                          boxShadow: "0 4px 14px rgba(124, 58, 237, 0.25)"
                        }}
                      >
                        {emailSubmitting ? "Submitting..." : "Send Me the Fixes →"}
                      </button>
                      {emailError && (
                        <p className="text-sm mt-3 text-center text-[var(--error)] font-medium" role="alert">{emailError}</p>
                      )}
                    </form>

                    <p className="text-xs text-center mt-4 text-[var(--text-tertiary)]">
                      No spam. Just your fixes.
                    </p>
                  </div>
                )}

                {emailStep === "queued" && (
                  <div className="text-center modal-step-enter" key="queued-step">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--success-light)] border border-[var(--success-border)]">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">
                      You're in the Queue!
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
                      Due to high demand, your detailed report with step-by-step fixes will arrive within <strong className="text-[var(--text-primary)]">48 hours</strong>.
                    </p>

                    {/* Priority upsell */}
                    <div
                      className="p-5 rounded-2xl border-2 border-dashed mb-4"
                      style={{
                        borderColor: "var(--brand-border)",
                        background: "linear-gradient(135deg, var(--brand-light), #EEF2FF)",
                      }}
                    >
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M13 10V3L4 14h7v7l9-11h-7z" fill="var(--brand)"/>
                        </svg>
                        <span className="text-sm font-bold text-[var(--brand)]">Skip the wait</span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] mb-4">
                        Get your full report with expert suggestions <strong className="text-[var(--text-primary)]">instantly</strong>.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          captureEvent("priority_report_clicked", { url, score: result?.score, email });
                          // TODO: integrate Stripe checkout
                          alert("Stripe checkout coming soon!");
                        }}
                        className="cursor-pointer w-full px-6 py-3.5 rounded-xl text-base font-semibold text-white polish-hover-lift polish-focus-ring"
                        style={{
                          background: "linear-gradient(135deg, var(--brand), var(--primary-dim))",
                          boxShadow: "0 4px 14px rgba(124, 58, 237, 0.25)"
                        }}
                      >
                        Get Priority Report — $0.99
                      </button>
                      <p className="text-xs text-center mt-2 text-[var(--text-tertiary)]">
                        Full report with actionable suggestions • Instant delivery
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={closeModal}
                      className="cursor-pointer text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors mt-2"
                    >
                      I'll wait for the free report →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ WHAT WE CHECK + HOW IT WORKS ═══ */}
        {phase === "hero" && !result && !loading && (
          <>
          {/* ── Bento Grid: 7 Leak Categories ── */}
          <section className="py-16 sm:py-24 bg-[var(--surface-container-low)] anim-phase-enter" style={{ animationDelay: "100ms" }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-8">
              <div className="text-center mb-12 sm:mb-16">
                <h2 className="text-3xl sm:text-4xl font-extrabold mb-4 text-[var(--on-surface)]" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>7 Places Your Page Leaks Revenue</h2>
                <p className="text-[var(--on-surface-variant)] text-lg">Our engine identifies the friction points that drive users away.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6">
                {/* Large highlight card */}
                <div className="md:col-span-8 bg-[var(--surface-container-lowest)] p-8 sm:p-10 rounded-[2rem] shadow-sm flex flex-col justify-between group hover:shadow-xl transition-shadow duration-500" style={{ animation: "fade-in-up 500ms ease-out 0ms both" }}>
                  <div>
                    <div className="w-14 h-14 glass-card rounded-2xl flex items-center justify-center mb-8 shadow-sm text-[var(--on-surface-variant)]">
                      {CATEGORY_SVG.title}
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-bold mb-4 text-[var(--on-surface)]">Title, Images & First Impression</h3>
                    <p className="text-[var(--on-surface-variant)] text-lg leading-relaxed max-w-lg">Generic titles and poor imagery cause visitors to bounce in seconds. We analyze your above-the-fold content for conversion impact.</p>
                  </div>
                </div>

                {/* Vertical gradient card */}
                <div className="md:col-span-4 primary-gradient text-white p-8 sm:p-10 rounded-[2rem] shadow-lg flex flex-col justify-between overflow-hidden relative" style={{ animation: "fade-in-up 500ms ease-out 80ms both" }}>
                  <div className="relative z-10">
                    <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-8 text-white">
                      {CATEGORY_SVG.pricing}
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-bold mb-4">Pricing & Value</h3>
                    <p className="text-white/80 text-lg leading-relaxed">No anchoring, no urgency, no context. If your price just sits there, customers leave to &ldquo;think about it.&rdquo;</p>
                  </div>
                  <div className="absolute -bottom-10 -right-10 opacity-[0.06] pointer-events-none text-white">
                    <svg width="160" height="160" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>
                  </div>
                </div>

                {/* Small cards row */}
                <div className="md:col-span-4 bg-[var(--surface-container-lowest)] p-7 sm:p-8 rounded-[2rem] shadow-sm hover:shadow-lg transition-all duration-300" style={{ animation: "fade-in-up 500ms ease-out 160ms both" }}>
                  <div className="w-12 h-12 glass-card rounded-xl flex items-center justify-center mb-6 text-[var(--on-surface-variant)]">
                    {CATEGORY_SVG.socialProof}
                  </div>
                  <h4 className="text-xl font-bold mb-2 text-[var(--on-surface)]">Social Proof</h4>
                  <p className="text-[var(--on-surface-variant)]">Missing reviews or buried testimonials create immediate doubt. No trust = no purchase.</p>
                </div>
                <div className="md:col-span-4 bg-[var(--surface-container-lowest)] p-7 sm:p-8 rounded-[2rem] shadow-sm hover:shadow-lg transition-all duration-300" style={{ animation: "fade-in-up 500ms ease-out 240ms both" }}>
                  <div className="w-12 h-12 glass-card rounded-xl flex items-center justify-center mb-6 text-[var(--on-surface-variant)]">
                    {CATEGORY_SVG.cta}
                  </div>
                  <h4 className="text-xl font-bold mb-2 text-[var(--on-surface)]">CTA Clarity</h4>
                  <p className="text-[var(--on-surface-variant)]">Weak or hidden Add to Cart buttons let ready buyers slip away at the final moment.</p>
                </div>
                <div className="md:col-span-4 bg-[var(--surface-container-lowest)] p-7 sm:p-8 rounded-[2rem] shadow-sm hover:shadow-lg transition-all duration-300" style={{ animation: "fade-in-up 500ms ease-out 320ms both" }}>
                  <div className="w-12 h-12 glass-card rounded-xl flex items-center justify-center mb-6 text-[var(--on-surface-variant)]">
                    {CATEGORY_SVG.trust}
                  </div>
                  <h4 className="text-xl font-bold mb-2 text-[var(--on-surface)]">Trust & Copy</h4>
                  <p className="text-[var(--on-surface-variant)]">Missing guarantees, poor descriptions, and no security badges create friction at checkout.</p>
                </div>
              </div>
            </div>
          </section>

          {/* ── How It Works — 3 steps ── */}
          <section className="py-16 sm:py-24 bg-[var(--surface-base)] anim-phase-enter" style={{ animationDelay: "200ms" }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-8">
              <div className="flex flex-col md:flex-row justify-between items-end mb-16 sm:mb-20 gap-6">
                <div className="max-w-xl">
                  <h2 className="text-3xl sm:text-4xl font-extrabold mb-4 text-[var(--on-surface)]" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>Three Steps to More Sales</h2>
                  <p className="text-[var(--on-surface-variant)] text-lg">Stop losing money and start optimizing with precision.</p>
                </div>
                <div className="hidden md:block h-px bg-violet-100 flex-1 mx-12 mb-5"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-12 sm:gap-16 relative">
                {[
                  { num: "01", title: "Input Your URL", desc: "Simply paste your sales or product page link. No code installation required." },
                  { num: "02", title: "Deep AI Scan", desc: "Our AI analyzes 7 conversion factors — title, images, pricing, reviews, CTA, copy, and trust." },
                  { num: "03", title: "Execute Fixes", desc: "Get a prioritized list of high-impact changes with estimated revenue impact for each." },
                ].map((s, i) => (
                  <div key={s.num} className="relative" style={{ animation: `fade-in-up 500ms ease-out ${i * 120 + 100}ms both` }}>
                    <div className="text-[8rem] font-black text-[var(--brand)]/5 absolute -top-16 sm:-top-20 -left-2 sm:-left-4 pointer-events-none select-none" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>{s.num}</div>
                    <div className="relative z-10">
                      <h4 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-[var(--on-surface)]">{s.title}</h4>
                      <p className="text-[var(--on-surface-variant)] leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── CTA Section ── */}
          <section className="py-16 sm:py-24 px-4 sm:px-8 anim-phase-enter" style={{ animationDelay: "300ms" }}>
            <div className="max-w-7xl mx-auto primary-gradient rounded-[2rem] sm:rounded-[3rem] p-8 sm:p-12 md:p-24 text-center text-white relative overflow-hidden shadow-2xl">
              <div className="absolute -top-40 -right-40 w-96 h-96 bg-white/10 rounded-full blur-[100px] pointer-events-none"></div>
              <div className="relative z-10">
                <h2 className="text-3xl sm:text-4xl md:text-6xl font-extrabold mb-6 sm:mb-8 tracking-tight" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>Ready to stop the leak?</h2>
                <p className="text-lg sm:text-xl text-violet-100 mb-10 sm:mb-12 max-w-xl mx-auto">Find your conversion killers in 30 seconds. Free. No signup required.</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
                  <button
                    type="button"
                    onClick={() => { document.getElementById("url-input")?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="cursor-pointer bg-white text-violet-600 px-10 sm:px-12 py-4 sm:py-5 rounded-full font-bold text-lg hover:bg-violet-50 transition-all hover:scale-105 active:scale-95"
                  >
                    Get Your Free Audit
                  </button>
                  <button
                    type="button"
                    onClick={() => { document.getElementById("url-input")?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="cursor-pointer bg-white/10 backdrop-blur-md border border-white/20 px-10 sm:px-12 py-4 sm:py-5 rounded-full font-bold text-lg hover:bg-white/20 transition-all"
                  >
                    Learn More
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ── Footer ── */}
          <footer className="bg-violet-50 border-t border-violet-100 w-full">
            <div className="flex flex-col md:flex-row justify-between items-center w-full px-4 sm:px-8 py-10 sm:py-12 gap-6 max-w-7xl mx-auto">
              <div className="flex flex-col gap-1 text-center md:text-left">
                <div className="text-lg font-bold text-violet-800" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>PageLeaks</div>
                <p className="text-slate-500 text-xs tracking-wide uppercase">© 2024 PageLeaks. All rights reserved.</p>
              </div>
              <div className="flex gap-6 sm:gap-8 text-xs tracking-wide uppercase">
                <a className="cursor-pointer text-slate-500 hover:text-violet-600 transition-colors" href="#">Privacy Policy</a>
                <a className="cursor-pointer text-slate-500 hover:text-violet-600 transition-colors" href="#">Terms of Service</a>
                <a className="cursor-pointer text-slate-500 hover:text-violet-600 transition-colors" href="#">Support</a>
              </div>
            </div>
          </footer>
          </>
        )}
      </main>
    </>
  );
}
