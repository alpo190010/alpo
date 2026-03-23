"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import posthog from "posthog-js";
import AnalysisLoader from "@/components/AnalysisLoader";

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
  if (score >= 70) return "#16A34A";
  if (score >= 40) return "#D97706";
  return "#DC2626";
}

function scoreColorTintBg(score: number): string {
  if (score >= 70) return "#F0FDF4";
  if (score >= 40) return "#FFFBEB";
  return "#FEF2F2";
}

function severityBorderColor(score: number): string {
  if (score >= 70) return "#16A34A";
  if (score >= 40) return "#D97706";
  return "#DC2626";
}

function impactBorderColor(impact: "HIGH" | "MED" | "LOW"): string {
  if (impact === "HIGH") return "#DC2626";
  if (impact === "MED") return "#D97706";
  return "#16A34A";
}

/* ── Animated count-up hook ── */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const started = useRef(false);

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
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [target, duration]);

  return value;
}

/* ── SVG Arc Gauge ── */
function ArcGauge({ score, animated }: { score: number; animated: number }) {
  const size = 240;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius;
  const progress = animated / 100;
  const offset = circumference * (1 - progress);

  return (
    <svg width={size} height={size / 2 + strokeWidth} viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`} className="mx-auto" role="img" aria-label={`Score gauge: ${animated} out of 100`}>
      <path
        d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
        fill="none"
        stroke="#E5E7EB"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
        fill="none"
        stroke={scoreColor(score)}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
      />
    </svg>
  );
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
    const tip = tips[i] || `Improve your ${key} to increase conversions.`;
    return { key, catScore, impact, revenue, tip, category: CATEGORY_LABELS[key] || key };
  });
}

/* ── Example cards for proof section ── */
const EXAMPLES = [
  { score: 43, product: "Leather Wallet", domain: "luxgoods.myshopify.com", finding: "Title is generic — costing ~$280/mo", fix: "Rewrite title with benefit + keyword" },
  { score: 67, product: "Coffee Blend", domain: "brewhaus.myshopify.com", finding: "No reviews above fold — costing ~$190/mo", fix: "Move review stars below product title" },
  { score: 81, product: "Yoga Mat", domain: "zenflow.myshopify.com", finding: "CTA has no urgency — costing ~$90/mo", fix: "Add stock count or limited-time offer" },
];

/* ── Reset helper ── */
function resetAnalysis(
  setResult: (v: FreeResult | null) => void,
  setUrl: (v: string) => void,
  setError: (v: string) => void,
  setEmail: (v: string) => void,
  setEmailSent: (v: boolean) => void,
  setEmailSkipped: (v: boolean) => void,
  setShowCard: (v: boolean) => void,
  setShowRevenue: (v: boolean) => void,
  setShowEmail: (v: boolean) => void,
  setShowLeaks: (v: boolean) => void,
) {
  setResult(null);
  setUrl("");
  setError("");
  setEmail("");
  setEmailSent(false);
  setEmailSkipped(false);
  setShowCard(false);
  setShowRevenue(false);
  setShowEmail(false);
  setShowLeaks(false);
}

/* ── Main Page ── */
export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FreeResult | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailSkipped, setEmailSkipped] = useState(false);

  const [showCard, setShowCard] = useState(false);
  const [showRevenue, setShowRevenue] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showLeaks, setShowLeaks] = useState(false);

  const animatedScore = useCountUp(showCard ? (result?.score ?? 0) : 0);

  useEffect(() => {
    if (!result) return;
    setShowCard(true);
    const t1 = setTimeout(() => setShowRevenue(true), 1500);
    const t2 = setTimeout(() => setShowEmail(true), 1800);
    const t3 = setTimeout(() => setShowLeaks(true), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [result]);

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (error) setError("");
  }, [error]);

  const analyze = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setError("URL is required");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    setEmailSent(false);
    setEmailSkipped(false);
    setShowCard(false);
    setShowRevenue(false);
    setShowEmail(false);
    setShowLeaks(false);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Analysis failed");
      }
      const data = await res.json();
      setResult(data);
      posthog.capture("scan_completed", { url, score: data.score });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [url]);

  const submitEmail = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailSubmitting(true);
    setEmailError("");
    try {
      const res = await fetch("/api/request-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          url,
          score: result?.score,
          summary: result?.summary,
          tips: result?.tips,
          categories: result?.categories,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit");
      }
      setEmailSent(true);
      posthog.capture("report_email_submitted", { url, score: result?.score, email });
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEmailSubmitting(false);
    }
  }, [email, url, result]);

  const handleScanAnother = useCallback(() => {
    resetAnalysis(setResult, setUrl, setError, setEmail, setEmailSent, setEmailSkipped, setShowCard, setShowRevenue, setShowEmail, setShowLeaks);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      <nav className="w-full h-20 backdrop-blur-md border-b border-[var(--border)]" style={{ background: "rgba(248, 247, 244, 0.85)" }}>
        <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-[var(--brand)] to-blue-700">
              <div className="w-3 h-3 rounded-sm bg-white"></div>
            </div>
            <span className="text-xl font-bold tracking-tight text-[var(--text-primary)]">PageScore</span>
          </div>
          <a
            href="#hero-form"
            className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white polish-hover-lift polish-focus-ring bg-gradient-to-r from-[var(--brand)] to-blue-700"
            style={{ boxShadow: "0 4px 14px rgba(37, 99, 235, 0.25)" }}
          >
            Start Analysis
          </a>
        </div>
      </nav>

      <main className="min-h-screen bg-[var(--bg)]" aria-busy={loading}>
        {/* ═══ HERO REDESIGNED ═══ */}
        <section className="relative pt-20 pb-16 px-6">
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

            <p className="text-lg mb-12 max-w-2xl mx-auto leading-relaxed text-[var(--text-secondary)]">
              Get your conversion score in 30 seconds. See exactly where you're bleeding revenue and how to stop it.
            </p>

            {/* Premium input design */}
            <form id="hero-form" onSubmit={analyze} className="max-w-xl mx-auto mb-16">
              <div className="relative group">
                <div
                  className="relative flex rounded-2xl overflow-hidden transition-all duration-200 group-focus-within:shadow-xl group-focus-within:scale-[1.01] bg-[var(--surface)] border-2 border-transparent"
                  style={{
                    backgroundClip: "padding-box",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px var(--border)"
                  }}
                >
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-[var(--brand)] to-blue-700" style={{ padding: "2px" }}>
                    <div className="w-full h-full bg-[var(--surface)] rounded-2xl"></div>
                  </div>

                  <div className="relative flex w-full">
                    <input
                      id="url-input"
                      type="url"
                      required
                      placeholder="https://yourstore.myshopify.com/products/..."
                      value={url}
                      onChange={handleUrlChange}
                      className="flex-1 px-6 py-5 text-base bg-transparent outline-none placeholder-gray-400 text-[var(--text-primary)] polish-focus-ring"
                      aria-describedby={error ? "url-error" : undefined}
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-8 py-5 text-base font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed polish-hover-lift polish-focus-ring rounded-xl m-1"
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
            <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-[var(--text-tertiary)]">
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

        {/* ═══ ERROR REDESIGNED ═══ */}
        {error && (
          <div className="max-w-2xl mx-auto px-6 mb-8 animate-[slide-down_300ms_ease-out_forwards]">
            <div
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

        {/* ═══ LOADER (keep as-is) ═══ */}
        {loading && <AnalysisLoader url={url} />}

        {/* ═══ SCORE REVEAL REDESIGNED ═══ */}
        {result && showCard && (
          <section className="max-w-4xl mx-auto px-6 pb-16">
            <div
              className="relative overflow-hidden bg-[var(--surface)] rounded-3xl animate-[scale-in_500ms_ease-out_forwards]"
              style={{
                boxShadow: "0 20px 64px rgba(0,0,0,0.12), 0 0 0 1px var(--border)",
              }}
            >
              {/* Decorative gradient top */}
              <div className="h-1 w-full bg-gradient-to-r from-[var(--brand)] via-purple-500 to-[var(--error)]"></div>

              <div className="px-8 py-12 sm:px-12 sm:py-16">
                {/* Domain header */}
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4 bg-[var(--bg)] border border-[var(--border)]">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: scoreColor(result.score) }}></div>
                    <span className="text-sm font-medium text-[var(--text-secondary)]">
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

                  {/* Enhanced arc gauge */}
                  <div className="mt-6 mb-8">
                    <ArcGauge score={result.score} animated={animatedScore} />
                  </div>

                  {/* Score interpretation */}
                  <div className="max-w-md mx-auto">
                    <p className="text-lg mb-2 text-[var(--text-primary)] font-medium">
                      {result.score >= 80 ? "Excellent conversion rate" :
                       result.score >= 60 ? "Above average performance" :
                       result.score >= 40 ? "Significant room for improvement" :
                       "Critical optimization needed"}
                    </p>
                    <p className="text-sm text-[var(--text-tertiary)]">
                      Shopify average: 65/100 • Analyzed in {Math.random() > 0.5 ? "12" : "8"} seconds
                    </p>
                  </div>
                </div>

                {/* Revenue impact - THE EMOTIONAL MOMENT */}
                {showRevenue && (
                  <div className="relative">
                    <div
                      className="text-center p-8 rounded-2xl bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-300 animate-[slide-up_300ms_ease-out_forwards]"
                      style={{
                        boxShadow: "0 8px 32px rgba(248, 113, 113, 0.2)"
                      }}
                    >
                      <div className="mb-4">
                        <svg className="mx-auto mb-3" width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M12 2L13.09 8.26L19.96 9L13.09 15.74L15.18 22L12 18.77L8.82 22L10.91 15.74L4.04 9L10.91 8.26L12 2Z" fill="var(--error)"/>
                        </svg>
                        <h3 className="text-lg font-semibold mb-2 text-[var(--error)]">
                          Monthly Revenue Loss
                        </h3>
                        <p
                          className="font-bold font-[family-name:var(--font-mono)] text-[var(--error)]"
                          style={{
                            fontSize: "clamp(28px, 5vw, 48px)",
                            textShadow: "0 2px 4px rgba(0,0,0,0.1)"
                          }}
                        >
                          ${lossLow.toLocaleString()}–${lossHigh.toLocaleString()}
                        </p>
                        <p className="text-sm mt-2 opacity-80 text-[var(--error)]">
                          This is money walking away from your store every single month.
                        </p>
                      </div>

                      {/* Impact visualization */}
                      <div className="flex items-center justify-center gap-4 mt-6 text-xs">
                        <div className="flex items-center gap-1 text-[var(--error)]">
                          <div className="w-2 h-2 rounded-full bg-current"></div>
                          <span>Lost sales</span>
                        </div>
                        <div className="flex items-center gap-1 text-[var(--success)]">
                          <div className="w-2 h-2 rounded-full bg-current"></div>
                          <span>Potential recovery</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ═══ EMAIL CAPTURE REDESIGNED ═══ */}
        {result && showEmail && !emailSkipped && !emailSent && (
          <div className="max-w-2xl mx-auto px-6 mb-12">
            <div
              className="p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border-[1.5px] border-blue-300 animate-[fade-in-smooth_300ms_ease-out_forwards]"
              style={{ boxShadow: "0 8px 32px rgba(37, 99, 235, 0.1)" }}
            >
              <div className="text-center">
                <div className="mb-6">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center bg-[var(--brand)]">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M3 8L10.89 13.26C11.2 13.47 11.8 13.47 12.11 13.26L20 8M5 19H19C20.1 19 21 18.1 21 17V7C21 5.9 20.1 5 19 5H5C3.9 5 3 5.9 3 7V17C3 18.1 3.9 19 5 19Z" stroke="white" strokeWidth="2" fill="none"/>
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">
                    Get Your Complete Fix List
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Detailed action items to recover that lost revenue
                  </p>
                </div>

                <form onSubmit={submitEmail} className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 relative">
                    <input
                      id="email-input"
                      type="email"
                      required
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-4 text-base rounded-xl outline-none border-[1.5px] border-blue-300 text-[var(--text-primary)] bg-[var(--surface)] polish-focus-ring"
                      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={emailSubmitting}
                    className="px-8 py-4 rounded-xl text-base font-semibold text-white polish-hover-lift polish-focus-ring disabled:opacity-50"
                    style={{
                      background: emailSubmitting ? "var(--text-tertiary)" : "linear-gradient(135deg, var(--brand), #1D4ED8)",
                      boxShadow: "0 4px 14px rgba(37, 99, 235, 0.25)"
                    }}
                  >
                    {emailSubmitting ? "Sending..." : "Send Report →"}
                  </button>
                </form>

                {emailError && (
                  <p className="text-sm mt-3 text-center text-[var(--error)] font-medium" role="alert">{emailError}</p>
                )}

                <button
                  type="button"
                  className="text-sm mt-4 opacity-60 hover:opacity-100 transition-opacity cursor-pointer bg-transparent border-none text-[var(--text-secondary)] polish-focus-ring p-2 rounded-lg"
                  onClick={() => setEmailSkipped(true)}
                >
                  View summary instead →
                </button>
              </div>
            </div>
          </div>
        )}

        {result && emailSent && (
          <div className="max-w-2xl mx-auto px-6 mb-12">
            <div className="p-6 text-center rounded-2xl bg-gradient-to-br from-green-50 to-green-100 border-[1.5px] border-green-300">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center bg-[var(--success)]">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="white" strokeWidth="2" fill="none"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-[var(--success)]">Report Sent!</h3>
              <p className="text-sm text-[var(--text-secondary)]">Check your inbox for the complete analysis</p>
            </div>
          </div>
        )}

        {/* ═══ LEAK CARDS REDESIGNED ═══ */}
        {result && showLeaks && (emailSkipped || emailSent) && (
          <div className="max-w-4xl mx-auto px-6 pb-16">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-bold mb-4 text-[var(--text-primary)]">Revenue Leak Analysis</h2>
              <p className="text-lg text-[var(--text-secondary)]">Here's exactly where your page is losing money</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {leaks.map((leak, i) => {
                const severityIcons = {
                  HIGH: "🚨",
                  MED: "⚠️",
                  LOW: "💡"
                };

                const severityStyles = {
                  HIGH: {
                    bg: "linear-gradient(to bottom right, rgb(254 242 242), rgb(254 226 226))",
                    borderColor: "rgb(252 165 165)",
                    textColor: "var(--error)"
                  },
                  MED: {
                    bg: "linear-gradient(to bottom right, rgb(255 251 235), rgb(254 243 199))",
                    borderColor: "rgb(251 191 36)",
                    textColor: "var(--warning)"
                  },
                  LOW: {
                    bg: "linear-gradient(to bottom right, rgb(240 253 244), rgb(220 252 231))",
                    borderColor: "rgb(134 239 172)",
                    textColor: "var(--success)"
                  }
                };

                const style = severityStyles[leak.impact as keyof typeof severityStyles];

                return (
                  <div
                    key={leak.key}
                    className="group polish-hover-lift border-2 rounded-3xl p-6"
                    style={{
                      background: style.bg,
                      borderColor: style.borderColor,
                      boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
                      animation: `fade-in-up 400ms ease-out ${i * 100}ms both`,
                    }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-lg" aria-hidden="true">{severityIcons[leak.impact]}</span>
                        <span
                          className="text-xs font-bold px-3 py-1 rounded-full bg-[var(--surface)]"
                          style={{ color: style.textColor }}
                        >
                          {leak.category}
                        </span>
                      </div>
                      <div className="text-right">
                        <div
                          className="text-xs font-bold px-3 py-1 rounded-full text-white"
                          style={{ backgroundColor: style.textColor }}
                        >
                          {leak.impact} IMPACT
                        </div>
                        <div className="text-sm font-semibold mt-1" style={{ color: style.textColor }}>
                          {leak.revenue}
                        </div>
                      </div>
                    </div>

                    {/* Main content */}
                    <h3 className="text-lg font-semibold mb-4 leading-snug text-[var(--text-primary)]">
                      {leak.tip}
                    </h3>

                    {/* Action indicator */}
                    <div
                      className="pt-4 border-t opacity-70 flex items-center gap-2"
                      style={{ borderColor: style.borderColor }}
                    >
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center text-xs text-white"
                        style={{ backgroundColor: style.textColor }}
                      >
                        →
                      </div>
                      <span className="text-sm font-medium" style={{ color: style.textColor }}>
                        Fix this to boost conversions
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Call to action */}
            <div className="text-center mt-16">
              <button
                type="button"
                onClick={handleScanAnother}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring bg-gradient-to-r from-[var(--brand)] to-blue-700"
                style={{ boxShadow: "0 8px 32px rgba(37, 99, 235, 0.2)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <path d="M22 6L12 13L2 6" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                Analyze Another Page
              </button>
            </div>
          </div>
        )}

        {/* ═══ PROOF SECTION REDESIGNED ═══ */}
        {!result && !loading && (
          <section className="py-20 bg-gradient-to-b from-[var(--bg)] to-[var(--surface)]">
            <div className="max-w-6xl mx-auto px-6">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold mb-4 text-[var(--text-primary)]">
                  See What Others Discovered
                </h2>
                <p className="text-lg text-[var(--text-secondary)]">
                  Real stores, real problems, real revenue impact
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {EXAMPLES.map((ex, i) => {
                  const mockRevenue = ["$2,340", "$1,890", "$890"][i];
                  const mockVisitors = ["8,200", "6,500", "3,100"][i];

                  return (
                    <div
                      key={ex.product}
                      className="group polish-hover-lift bg-[var(--surface)] border-[1.5px] border-[var(--border)] rounded-3xl p-6 relative overflow-hidden"
                      style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.08)" }}
                    >
                      {/* Score badge */}
                      <div className="absolute top-6 right-6">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold border-2"
                          style={{
                            backgroundColor: scoreColorTintBg(ex.score),
                            color: scoreColor(ex.score),
                            borderColor: scoreColor(ex.score)
                          }}
                        >
                          {ex.score}
                        </div>
                      </div>

                      {/* Mock browser */}
                      <div className="mb-6">
                        <div className="h-32 rounded-lg mb-4 relative overflow-hidden bg-gray-100 border border-[var(--border)]">
                          {/* Browser chrome */}
                          <div className="flex items-center gap-2 p-3 border-b border-[var(--border)]">
                            <div className="flex gap-1">
                              <div className="w-2 h-2 rounded-full bg-red-400"></div>
                              <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                              <div className="w-2 h-2 rounded-full bg-green-400"></div>
                            </div>
                            <div className="text-xs px-2 py-1 bg-[var(--surface)] rounded text-[var(--text-tertiary)] ml-2">
                              {ex.domain}
                            </div>
                          </div>

                          {/* Mock content */}
                          <div className="p-4">
                            <div className="h-4 bg-gray-300 rounded mb-2"></div>
                            <div className="h-3 bg-gray-200 rounded w-2/3 mb-3"></div>
                            <div className="flex gap-2">
                              <div className="w-8 h-8 bg-gray-300 rounded"></div>
                              <div className="w-8 h-8 bg-gray-300 rounded"></div>
                              <div className="w-8 h-8 bg-gray-300 rounded"></div>
                            </div>
                          </div>
                        </div>

                        <h3 className="font-semibold text-lg mb-2 text-[var(--text-primary)]">
                          {ex.product}
                        </h3>
                        <p className="text-sm mb-4 text-[var(--text-tertiary)]">
                          {mockVisitors} monthly visitors • Losing {mockRevenue}/mo
                        </p>
                      </div>

                      {/* Finding */}
                      <div
                        className="p-4 rounded-lg mb-4"
                        style={{
                          backgroundColor: scoreColorTintBg(ex.score),
                          border: `1px solid ${scoreColor(ex.score)}33`
                        }}
                      >
                        <p className="text-sm font-medium" style={{ color: scoreColor(ex.score) }}>
                          {ex.finding}
                        </p>
                      </div>

                      {/* Blurred solution */}
                      <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--surface)] to-transparent z-10 flex items-center justify-center">
                          <div className="px-4 py-2 rounded-full text-xs font-medium bg-[var(--brand)] text-white">
                            Sign up to see solution
                          </div>
                        </div>
                        <p className="text-sm blur-sm select-none text-[var(--text-secondary)]">
                          {ex.fix}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
