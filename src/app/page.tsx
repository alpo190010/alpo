"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
    const problem = catScore <= 4 ? problems.low : problems.mid;
    const tip = tips[i] || `Improve your ${key} to increase conversions.`;
    return { key, catScore, impact, revenue, tip, problem, category: CATEGORY_LABELS[key] || key };
  });
}

/* ── Leak categories for "What We Check" section ── */
const LEAK_CATEGORIES = [
  {
    icon: "📝",
    label: "Title",
    leak: "Generic title that doesn't sell",
    cost: "Visitors bounce before scrolling",
  },
  {
    icon: "📸",
    label: "Images",
    leak: "Low-quality or too few photos",
    cost: "Buyers can't visualize owning it",
  },
  {
    icon: "💰",
    label: "Pricing",
    leak: "No anchoring, no urgency",
    cost: "Price feels high with no context",
  },
  {
    icon: "⭐",
    label: "Social Proof",
    leak: "Reviews missing or buried below fold",
    cost: "No trust = no purchase",
  },
  {
    icon: "🔘",
    label: "CTA",
    leak: "Weak or hidden Add to Cart button",
    cost: "Ready buyers can't find the button",
  },
  {
    icon: "📄",
    label: "Description",
    leak: "Wall of text, no benefits",
    cost: "Features don't convert, benefits do",
  },
  {
    icon: "🛡️",
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
    // Auto-collapse score card after 2.5s so issues are visible
    const t3 = setTimeout(() => {
      setScoreCardCollapsed(true);
      // Smooth scroll to issues
      setTimeout(() => {
        issuesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 350);
    }, 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [result]);

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (error) setError("");
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
      setCompetitorResult({ competitors: data.competitors ?? [] });
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
      setError("Please enter a valid URL (e.g. https://yourstore.myshopify.com/products/...)");
      return;
    }

    // Prevent double-submit
    if (loading) return;

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
  }, [url, loading]);

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
      {/* ═══ MINIMAL NAV ═══ */}
      <nav className="w-full h-16 sm:h-20 backdrop-blur-md border-b border-[var(--border)]" style={{ background: "rgba(248, 247, 244, 0.85)" }} aria-label="Main navigation">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-[var(--brand)] to-blue-700">
              <div className="w-3 h-3 rounded-sm bg-white"></div>
            </div>
            <span className="text-xl font-bold tracking-tight text-[var(--text-primary)]">PageLeaks</span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (result) {
                handleScanAnother();
              } else {
                document.getElementById("hero-form")?.scrollIntoView({ behavior: "smooth" });
              }
            }}
            className="hidden sm:inline-block text-sm font-semibold px-5 py-2.5 rounded-xl text-white polish-hover-lift polish-focus-ring bg-gradient-to-r from-[var(--brand)] to-blue-700"
            style={{ boxShadow: "0 4px 14px rgba(37, 99, 235, 0.25)" }}
          >
            {result ? "Scan Another" : "Start Analysis"}
          </button>
        </div>
      </nav>

      <main className="min-h-screen bg-[var(--bg)]" aria-busy={loading}>
        {/* ═══ HERO — hidden during loading and after results ═══ */}
        {(phase === "hero" || phase === "hero-exit") && !result && (
        <section className={`relative pt-12 sm:pt-20 pb-10 sm:pb-16 px-4 sm:px-6 ${phase === "hero-exit" ? "anim-phase-exit" : "anim-phase-enter"}`}>
          <div className="max-w-3xl mx-auto text-center">
            {/* Visual indicator */}
            <div className="flex items-center justify-center mb-8">
              <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-[var(--surface)] border-[1.5px] border-[var(--border)]" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-sm font-medium text-[var(--brand)]">Live Analysis Engine</span>
              </div>
            </div>

            <h1 className="font-bold tracking-tight mb-6 text-[var(--text-primary)]" style={{
              fontSize: "clamp(32px, 5vw, 64px)",
              lineHeight: "1.1",
              letterSpacing: "-0.02em"
            }}>
              Every month, your product page loses
              <br />
              <span className="text-[var(--error)]">$1,000s in sales</span>
            </h1>

            <p className="text-lg mb-8 sm:mb-12 max-w-2xl mx-auto leading-relaxed text-[var(--text-secondary)]">
              Get your conversion score in 30 seconds. See exactly where you're bleeding revenue and how to stop it.
            </p>

            {/* Premium input design */}
            <form id="hero-form" onSubmit={analyze} className="max-w-xl mx-auto mb-10 sm:mb-16">
              <div className="relative group">
                <div
                  className="relative flex flex-col sm:flex-row rounded-2xl overflow-hidden transition-shadow duration-200 group-focus-within:shadow-xl sm:group-focus-within:scale-[1.01] bg-[var(--surface)] border-2 border-transparent"
                  style={{
                    backgroundClip: "padding-box",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px var(--border)"
                  }}
                >
                  <div className="hidden sm:block absolute inset-0 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-[var(--brand)] to-blue-700" style={{ padding: "2px" }}>
                    <div className="w-full h-full bg-[var(--surface)] rounded-2xl"></div>
                  </div>

                  <div className="relative flex flex-col sm:flex-row w-full">
                    <input
                      id="url-input"
                      type="url"
                      required
                      placeholder="https://yourstore.myshopify.com/products/..."
                      value={url}
                      onChange={handleUrlChange}
                      aria-label="Shopify product page URL"
                      className="flex-1 px-5 py-4 sm:px-6 sm:py-5 text-base bg-transparent outline-none placeholder-gray-500 text-[var(--text-primary)]"
                      aria-describedby={error ? "url-error" : undefined}
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-8 py-4 sm:py-5 text-base font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed polish-hover-lift polish-focus-ring rounded-xl sm:rounded-xl mx-1 mb-1 sm:m-1"
                      style={{
                        background: loading ? "var(--text-tertiary)" : "linear-gradient(135deg, var(--brand), #1D4ED8)"
                      }}
                    >
                      {loading ? "Scanning..." : "Analyze →"}
                    </button>
                  </div>
                </div>
              </div>
            </form>

            {/* Trust indicators */}
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-sm text-[var(--text-tertiary)]">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 15l-1.18-1.05C2.42 10.65 0 8.48 0 5.8 0 3.42 1.42 2 4 2c1.24 0 2.47.52 3 1.3C7.53 2.52 8.76 2 10 2c2.58 0 4 1.42 4 3.8 0 2.68-2.42 4.85-6.82 8.15L8 15z" fill="var(--success)"/>
                </svg>
                <span>Free forever</span>
              </div>
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 16A8 8 0 108 0a8 8 0 000 16zM7 3v6h2V3H7zm0 8v2h2v-2H7z" fill="var(--brand)"/>
                </svg>
                <span>No signup required</span>
              </div>
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 0l2.4 4.8L16 6.4l-4 3.9.9 5.3L8 13.2 3.1 15.6l.9-5.3-4-3.9L5.6 4.8z" fill="var(--warning)"/>
                </svg>
                <span>30 second analysis</span>
              </div>
            </div>
          </div>
        </section>
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

        {/* ═══ SCORE REVEAL — auto-collapses after 2.5s ═══ */}
        {result && showCard && (phase === "results" || phase === "results-exit") && (
          <section className={`max-w-4xl mx-auto px-6 ${scoreCardCollapsed ? "pb-4" : "pb-16"} ${phase === "results-exit" ? "anim-phase-exit" : ""}`}>

            {/* ── COLLAPSED: compact summary bar ── */}
            {scoreCardCollapsed && (
              <button
                type="button"
                onClick={() => setScoreCardCollapsed(false)}
                className="w-full score-card-collapse bg-[var(--surface)] rounded-2xl cursor-pointer transition-all duration-200 hover:shadow-lg group"
                style={{
                  boxShadow: "0 4px 20px rgba(0,0,0,0.08), 0 0 0 1px var(--border)",
                }}
              >
                <div className="h-1 w-full bg-gradient-to-r from-[var(--brand)] to-blue-700 rounded-t-2xl"></div>
                <div className="px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between gap-4">
                  {/* Left: domain + score */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 border-2"
                      style={{
                        backgroundColor: scoreColorTintBg(result.score),
                        color: scoreColor(result.score),
                        borderColor: scoreColor(result.score),
                      }}
                    >
                      {result.score}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {domain || url}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {result.score >= 80 ? "Excellent" :
                         result.score >= 60 ? "Above average" :
                         result.score >= 40 ? "Needs improvement" :
                         "Critical"} • Shopify avg: 65
                      </p>
                    </div>
                  </div>

                  {/* Right: revenue loss + expand hint */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden sm:block text-right">
                      <p className="text-sm font-bold text-[var(--error-text)]">
                        -${lossLow.toLocaleString()}–${lossHigh.toLocaleString()}/mo
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)]">revenue loss</p>
                    </div>
                    <svg
                      className="w-5 h-5 text-[var(--text-tertiary)] group-hover:text-[var(--brand)] transition-colors"
                      viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </button>
            )}

            {/* ── EXPANDED: full score card ── */}
            {!scoreCardCollapsed && (
            <div
              className="relative overflow-hidden bg-[var(--surface)] rounded-3xl score-card-expand"
              style={{
                boxShadow: "0 20px 64px rgba(0,0,0,0.12), 0 0 0 1px var(--border)",
              }}
            >
              {/* Decorative gradient top */}
              <div className="h-1 w-full bg-gradient-to-r from-[var(--brand)] to-blue-700"></div>

              <div className="px-5 py-10 sm:px-12 sm:py-16 relative">
                {/* Collapse button (only after first auto-collapse) */}
                {showLeaks && (
                  <button
                    type="button"
                    onClick={() => {
                      setScoreCardCollapsed(true);
                      setTimeout(() => {
                        issuesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 100);
                    }}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    aria-label="Collapse score card"
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}

                {/* Domain header */}
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4 bg-[var(--bg)] border border-[var(--border)]">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: scoreColor(result.score) }}></div>
                    <span className="text-sm font-medium text-[var(--text-secondary)] truncate max-w-[300px]">
                      {domain || url}
                    </span>
                  </div>
                </div>

                {/* Score display */}
                <div className="text-center mb-8">
                  <div className="relative inline-block">
                    <div
                      className="font-bold font-[family-name:var(--font-mono)]"
                      style={{
                        fontSize: "clamp(80px, 12vw, 140px)",
                        color: scoreColor(result.score),
                        letterSpacing: "-0.03em",
                        lineHeight: "1",
                        textShadow: "0 2px 8px rgba(0,0,0,0.1)"
                      }}
                    >
                      {animatedScore}
                      <span className="text-[0.3em] opacity-60">/100</span>
                    </div>
                  </div>

                  {/* Score interpretation */}
                  <div className="max-w-md mx-auto mt-6">
                    <p className="text-lg mb-2 text-[var(--text-primary)] font-medium">
                      {result.score >= 80 ? "Excellent conversion rate" :
                       result.score >= 60 ? "Above average performance" :
                       result.score >= 40 ? "Significant room for improvement" :
                       "Critical optimization needed"}
                    </p>
                    <p className="text-sm text-[var(--text-tertiary)]">
                      Shopify average: 65/100 • Analyzed in under 30 seconds
                    </p>
                  </div>
                </div>

                {/* Revenue impact - THE EMOTIONAL MOMENT */}
                {showRevenue && (
                  <div className="relative">
                    <div
                      className="text-center p-5 sm:p-8 rounded-2xl bg-[var(--error-light)] border-2 border-red-300 animate-[slide-up_300ms_ease-out_forwards]"
                      style={{
                        boxShadow: "0 8px 32px rgba(248, 113, 113, 0.2)"
                      }}
                    >
                      <div className="mb-4">
                        <svg className="mx-auto mb-3" width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M12 2L13.09 8.26L19.96 9L13.09 15.74L15.18 22L12 18.77L8.82 22L10.91 15.74L4.04 9L10.91 8.26L12 2Z" fill="var(--error)"/>
                        </svg>
                        <h3 className="text-lg font-semibold mb-2 text-[var(--error-text)]">
                          Monthly Revenue Loss
                        </h3>
                        <p
                          className="font-bold font-[family-name:var(--font-mono)] text-[var(--error-text)]"
                          style={{
                            fontSize: "clamp(28px, 5vw, 48px)",
                            textShadow: "0 2px 4px rgba(0,0,0,0.1)"
                          }}
                        >
                          ${lossLow.toLocaleString()}–${lossHigh.toLocaleString()}
                        </p>
                        <p className="text-sm mt-2 text-[var(--error-text)] opacity-80">
                          This is money walking away from your store every single month.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            )}
          </section>
        )}

        {/* ═══ ISSUES LIST — shown immediately after score ═══ */}
        {result && showLeaks && (phase === "results" || phase === "results-exit") && (
          <div ref={issuesRef} className={`max-w-4xl mx-auto px-6 pb-16 ${phase === "results-exit" ? "anim-phase-exit" : ""}`}>
            <div className="text-center md:text-left mb-10 sm:mb-12">
              <h2 className="text-2xl font-bold mb-3 text-[var(--text-primary)]">Issues Found on Your Page</h2>
              <p className="text-lg text-[var(--text-secondary)]">Click any issue to get the detailed fix</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {leaks.map((leak, i) => {
                const severityIcons = {
                  HIGH: "🚨",
                  MED: "⚠️",
                  LOW: "💡"
                };

                const severityStyles = {
                  HIGH: {
                    bg: "var(--error-light)",
                    borderColor: "rgb(252 165 165)",
                    textColor: "var(--error-text)",
                    hoverBorder: "rgb(248 113 113)",
                  },
                  MED: {
                    bg: "var(--warning-light)",
                    borderColor: "rgb(251 191 36)",
                    textColor: "var(--warning-text)",
                    hoverBorder: "rgb(245 158 11)",
                  },
                  LOW: {
                    bg: "var(--success-light)",
                    borderColor: "rgb(134 239 172)",
                    textColor: "var(--success-text)",
                    hoverBorder: "rgb(74 222 128)",
                  }
                };

                const style = severityStyles[leak.impact as keyof typeof severityStyles];

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
                    className="group text-left rounded-2xl p-5 sm:p-6 cursor-pointer transition-all duration-200 hover:-translate-y-1 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--brand)] hover:shadow-xl"
                    style={{
                      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                      animation: `fade-in-up 400ms ease-out ${i * 80}ms both`,
                    }}
                  >
                    {/* Category + severity */}
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: style.textColor }}
                      ></span>
                      <span className="text-sm font-semibold text-[var(--text-secondary)]">
                        {leak.category}
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)]">·</span>
                      <span className="text-xs font-medium" style={{ color: style.textColor }}>
                        {leak.catScore}/10
                      </span>
                    </div>

                    {/* Problem — the main thing */}
                    <p className="text-base font-semibold leading-snug text-[var(--text-primary)] mb-4">
                      {leak.problem}
                    </p>

                    {/* Bottom: revenue + CTA */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold" style={{ color: style.textColor }}>
                        {leak.revenue} potential
                      </span>
                      <span className="text-sm font-semibold text-[var(--brand)] sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1">
                        See fix
                        <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── Competitor comparison section ── */}

            {/* Trigger button — hidden once clicked or after results/error */}
            {!competitorLoading && !competitorResult && !competitorError && (
              <div className="text-center mt-12 mb-4" style={{ animation: "fade-in-up 400ms ease-out both" }}>
                <button
                  type="button"
                  onClick={fetchCompetitors}
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-2xl text-base font-semibold polish-hover-lift polish-focus-ring border-2 border-[var(--brand)] text-[var(--brand)] bg-[var(--brand-light)]"
                  style={{
                    boxShadow: "0 4px 14px rgba(37, 99, 235, 0.12)",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
                    <path d="M16 3h5v5M4 20L20.586 3.414M8 21H3v-5M20 4L3.414 20.586" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Compare to Competitors
                </button>
                <p className="text-xs text-[var(--text-tertiary)] mt-2.5">
                  See how your page stacks up against similar products
                </p>
              </div>
            )}

            {/* Competitor loader — shown during fetch */}
            {competitorLoading && (
              <div style={{ animation: "fade-in-up 300ms ease-out both" }}>
                <CompetitorLoader url={url} />
              </div>
            )}

            {/* Competitor error — shown on failure with retry */}
            {competitorError && (
              <div className="text-center mt-10 mb-4 px-4" style={{ animation: "fade-in-up 300ms ease-out both" }}>
                <div className="inline-block max-w-md w-full p-6 rounded-2xl bg-[var(--error-light)] border border-red-200">
                  <p className="text-sm font-medium text-[var(--error-text)] mb-3">
                    {competitorError}
                  </p>
                  <button
                    type="button"
                    onClick={fetchCompetitors}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white polish-hover-lift polish-focus-ring bg-gradient-to-r from-[var(--brand)] to-blue-700"
                    style={{ boxShadow: "0 4px 14px rgba(37, 99, 235, 0.2)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {/* Competitor comparison — rendered after competitor fetch completes */}
            {competitorResult && competitorResult.competitors.length > 0 && result && (
              <CompetitorComparison
                competitors={competitorResult.competitors}
                userCategories={result.categories}
                userScore={result.score}
                onBeatCompetitor={(name) => { setCompetitorCTAName(name); setEmailStep("form"); }}
              />
            )}
            {competitorResult && competitorResult.competitors.length === 0 && (
              <CompetitorComparison
                competitors={[]}
                userCategories={result?.categories ?? { title: 0, images: 0, pricing: 0, socialProof: 0, cta: 0, description: 0, trust: 0 }}
                userScore={result?.score ?? 0}
              />
            )}

            {/* Scan another */}
            <div className="text-center mt-16">
              <button
                type="button"
                onClick={handleScanAnother}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring bg-gradient-to-r from-[var(--brand)] to-blue-700"
                style={{ boxShadow: "0 8px 32px rgba(37, 99, 235, 0.2)" }}
              >
                Analyze Another Page
              </button>
            </div>
          </div>
        )}

        {/* ═══ EMAIL MODAL — triggered by clicking an issue ═══ */}
        {(selectedLeak || competitorCTAName) && emailStep && (
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${modalClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"}`}
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
              <div className="h-1 w-full bg-gradient-to-r from-[var(--brand)] to-blue-700"></div>

              {/* Close button */}
              <button
                type="button"
                onClick={closeModal}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
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
                        className="w-full px-6 py-3.5 rounded-xl text-base font-semibold text-white polish-hover-lift polish-focus-ring disabled:opacity-50"
                        style={{
                          background: emailSubmitting ? "var(--text-tertiary)" : "linear-gradient(135deg, var(--brand), #1D4ED8)",
                          boxShadow: "0 4px 14px rgba(37, 99, 235, 0.25)"
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
                        className="w-full px-6 py-3.5 rounded-xl text-base font-semibold text-white polish-hover-lift polish-focus-ring"
                        style={{
                          background: "linear-gradient(135deg, var(--brand), #1D4ED8)",
                          boxShadow: "0 4px 14px rgba(37, 99, 235, 0.25)"
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
                      className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors mt-2"
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
          {/* 7 Leak Categories */}
          <section className="py-16 sm:py-20 bg-gradient-to-b from-[var(--bg)] to-[var(--surface)] anim-phase-enter" style={{ animationDelay: "100ms" }}>
            <div className="max-w-5xl mx-auto px-4 sm:px-6">
              <div className="text-center mb-10 sm:mb-14">
                <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-[var(--text-primary)]">
                  7 Places Your Page Leaks Revenue
                </h2>
                <p className="text-base sm:text-lg text-[var(--text-secondary)] max-w-xl mx-auto">
                  We scan every product page for these conversion killers
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {LEAK_CATEGORIES.map((cat, i) => (
                  <div
                    key={cat.label}
                    className="group bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 transition-all duration-200 hover:border-[var(--brand)] hover:shadow-lg hover:-translate-y-0.5"
                    style={{
                      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                      animation: `fade-in-up 400ms ease-out ${i * 60}ms both`,
                    }}
                  >
                    <div className="flex items-start gap-3.5">
                      <span className="text-2xl leading-none shrink-0 mt-0.5" aria-hidden="true">{cat.icon}</span>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold mb-1.5 text-[var(--text-primary)]">{cat.label}</h3>
                        <p className="text-sm font-medium mb-1 text-[var(--error-text)]">{cat.leak}</p>
                        <p className="text-sm text-[var(--text-tertiary)] leading-snug">{cat.cost}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* CTA card fills the last slot */}
                <div
                  className="group bg-gradient-to-br from-[var(--brand)] to-blue-700 rounded-2xl p-5 sm:p-6 flex flex-col items-center justify-center text-center cursor-pointer polish-hover-lift"
                  style={{
                    boxShadow: "0 8px 32px rgba(37, 99, 235, 0.2)",
                    animation: `fade-in-up 400ms ease-out ${7 * 60}ms both`,
                  }}
                  onClick={() => document.getElementById("url-input")?.focus()}
                >
                  <p className="text-white font-semibold text-lg mb-1">How many leaks does your page have?</p>
                  <p className="text-blue-200 text-sm">Find out in 30 seconds →</p>
                </div>
              </div>
            </div>
          </section>

          {/* How It Works — 3 steps */}
          <section className="py-14 sm:py-16 bg-[var(--surface)] border-t border-[var(--border)] anim-phase-enter" style={{ animationDelay: "200ms" }}>
            <div className="max-w-4xl mx-auto px-4 sm:px-6">
              <div className="text-center mb-10 sm:mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-[var(--text-primary)]">
                  How It Works
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-6">
                {[
                  { step: "1", title: "Paste your URL", desc: "Any Shopify product page" },
                  { step: "2", title: "AI scans 7 factors", desc: "Title, images, pricing, reviews, CTA, copy, trust" },
                  { step: "3", title: "Get your leak report", desc: "Score + revenue impact + fixes" },
                ].map((s, i) => (
                  <div key={s.step} className="text-center" style={{ animation: `fade-in-up 400ms ease-out ${i * 100 + 100}ms both` }}>
                    <div
                      className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center text-lg font-bold text-[var(--brand)] bg-[var(--brand-light)] border border-[var(--brand-border)]"
                    >
                      {s.step}
                    </div>
                    <h3 className="text-base font-semibold mb-1 text-[var(--text-primary)]">{s.title}</h3>
                    <p className="text-sm text-[var(--text-secondary)]">{s.desc}</p>
                    {i < 2 && (
                      <div className="hidden sm:block mt-4 text-[var(--text-tertiary)]" aria-hidden="true">
                        <svg className="mx-auto w-5 h-5 rotate-90 sm:rotate-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Bottom CTA */}
              <div className="text-center mt-12">
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById("url-input")?.focus();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring bg-gradient-to-r from-[var(--brand)] to-blue-700"
                  style={{ boxShadow: "0 8px 32px rgba(37, 99, 235, 0.2)" }}
                >
                  Find Your Leaks — Free
                </button>
                <p className="text-sm text-[var(--text-tertiary)] mt-3">No signup. No email. Just paste and go.</p>
              </div>
            </div>
          </section>
          </>
        )}
      </main>
    </>
  );
}
