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

/* ── Dynamic revenue loss calculation ── */
function calculateRevenueLoss(score: number, productPrice: number, estimatedVisitors: number, productCategory: string) {
  const avgCVR: Record<string, number> = {
    fashion: 0.022,
    electronics: 0.015,
    beauty: 0.028,
    home: 0.018,
    food: 0.032,
    fitness: 0.020,
    jewelry: 0.012,
    other: 0.020,
  };

  const baseCVR = avgCVR[productCategory] || 0.020;
  const price = productPrice || 49;
  const visitors = estimatedVisitors || 1000;

  const currentCVR = baseCVR * (score / 100) * 0.8 + baseCVR * 0.2;
  const potentialCVR = baseCVR * (85 / 100) * 0.8 + baseCVR * 0.2;

  const currentRevenue = visitors * currentCVR * price;
  const potentialRevenue = visitors * potentialCVR * price;
  const lossLow = Math.round((potentialRevenue - currentRevenue) * 0.7 / 10) * 10;
  const lossHigh = Math.round((potentialRevenue - currentRevenue) * 1.3 / 10) * 10;

  return { lossLow: Math.max(lossLow, 20), lossHigh: Math.max(lossHigh, 50) };
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
      {/* ═══ NAV ═══ */}
      <nav className="w-full h-16" style={{ background: "#F8F7F4", borderBottom: "1px solid #E5E7EB" }}>
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between">
          <a href="/" className="text-lg font-bold tracking-[-0.02em]" style={{ color: "#111111" }} aria-label="PageScore home">
            PageScore
          </a>
          <div className="flex items-center gap-3">
            <a href="#" className="text-sm font-medium" style={{ color: "#6B6B6B" }}>
              Sign in
            </a>
            <a
              href="#hero-form"
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition hover:opacity-90"
              style={{ backgroundColor: "#2563EB", height: "36px", display: "inline-flex", alignItems: "center" }}
              aria-label="Analyze your page for free"
            >
              Get started
            </a>
          </div>
        </div>
      </nav>

      <main className="min-h-screen flex flex-col items-center" aria-busy={loading}>
        {/* ═══ HERO ═══ */}
        <section className="max-w-[680px] w-full text-center pt-16 sm:pt-24 px-4">
          <div
            className="inline-flex items-center px-3.5 py-1 mb-6 rounded-full text-xs font-medium"
            style={{ backgroundColor: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE" }}
          >
            Free Shopify Product Page Analyzer
          </div>
          <h1
            className="text-[28px] sm:text-[32px] md:text-[48px] font-bold leading-tight mb-4"
            style={{ color: "#111111", letterSpacing: "-0.02em" }}
          >
            Find out why your product page isn&apos;t converting
          </h1>
          <p className="text-base md:text-xl mb-10 max-w-md mx-auto" style={{ color: "#6B6B6B" }}>
            Find where you are losing sales.
          </p>

          <form id="hero-form" onSubmit={analyze} className="flex flex-col sm:flex-row max-w-lg mx-auto sm:h-14" style={{ border: "1.5px solid #E5E7EB", borderRadius: "8px", overflow: "hidden" }}>
            <label htmlFor="url-input" className="sr-only">Shopify product URL</label>
            <input
              id="url-input"
              type="url"
              required
              placeholder="https://yourstore.myshopify.com/products/..."
              value={url}
              onChange={handleUrlChange}
              className="flex-1 px-4 text-sm bg-white outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/30 focus-visible:ring-inset"
              style={{ color: "#111111", border: "none", minHeight: "48px" }}
              aria-describedby={error ? "url-error" : undefined}
            />
            <button
              type="submit"
              disabled={loading}
              className="px-5 text-base font-semibold text-white whitespace-nowrap transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer m-1"
              style={{ backgroundColor: "#2563EB", borderRadius: "6px", minHeight: "44px" }}
              aria-label={loading ? "Analyzing..." : "Analyze page"}
            >
              {loading ? "Analyzing..." : "Analyze →"}
            </button>
          </form>
        </section>

        {/* ═══ ERROR ═══ */}
        {error && (
          <div id="url-error" role="alert" className="max-w-[800px] w-full mt-8 mx-4 p-4 rounded-xl text-sm" style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626" }}>
            {error}
          </div>
        )}

        {/* ═══ LOADER ═══ */}
        {loading && <AnalysisLoader url={url} />}

        {/* ═══ SCORE REVEAL ═══ */}
        {result && showCard && (
          <section
            className="max-w-[600px] w-full mt-12 mb-8 mx-auto animate-fade-up"
            style={{
              background: "#FFFFFF",
              borderRadius: "16px",
              padding: "clamp(24px, 5vw, 48px)",
              boxShadow: "0 4px 32px rgba(0,0,0,0.10)",
              border: "1.5px solid #E5E7EB",
            }}
          >
            <p className="text-sm text-center mb-1" style={{ color: "#9E9E9E" }}>
              {domain || url}
            </p>

            <div className="text-center">
              <span
                className="font-bold font-[family-name:var(--font-mono)] leading-none"
                style={{
                  fontSize: "clamp(56px, 10vw, 96px)",
                  color: scoreColor(result.score),
                  letterSpacing: "-0.02em",
                }}
              >
                {animatedScore}
              </span>
            </div>

            <ArcGauge score={result.score} animated={animatedScore} />

            {showRevenue && (
              <div
                className="mt-8 p-4 sm:p-6 text-center"
                style={{
                  backgroundColor: "#FEF2F2",
                  borderRadius: "12px",
                  animation: "fade-up 250ms ease-out forwards",
                }}
              >
                <p className="font-extrabold" style={{ fontSize: "clamp(24px, 4vw, 36px)", color: "#DC2626" }}>
                  ${lossLow}–${lossHigh} / month
                </p>
              </div>
            )}

            <p className="text-sm text-center mt-4" style={{ color: "#9E9E9E" }}>
              Shopify average: 65/100
            </p>
          </section>
        )}

        {/* ═══ EMAIL CAPTURE ═══ */}
        {result && showEmail && !emailSkipped && !emailSent && (
          <div
            className="max-w-[600px] w-full mb-8 mx-4"
            style={{
              backgroundColor: "#EFF6FF",
              border: "1.5px solid #BFDBFE",
              borderRadius: "12px",
              padding: "clamp(20px, 4vw, 32px)",
              animation: "fade-up 250ms ease-out forwards",
            }}
          >
            <h3 className="text-lg sm:text-xl font-semibold text-center mb-5" style={{ color: "#111111" }}>
              Get the full fix list →
            </h3>
            <form onSubmit={submitEmail} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <label htmlFor="email-input" className="sr-only">Your email address</label>
              <input
                id="email-input"
                type="email"
                required
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 px-4 h-12 rounded-lg text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/30"
                style={{ border: "1.5px solid #BFDBFE", color: "#111111", background: "#FFFFFF" }}
              />
              <button
                type="submit"
                disabled={emailSubmitting}
                className="h-12 px-5 rounded-lg text-base font-semibold text-white transition disabled:opacity-50 cursor-pointer whitespace-nowrap"
                style={{ backgroundColor: "#2563EB" }}
                aria-label={emailSubmitting ? "Sending email" : "Send fixes to your email"}
              >
                {emailSubmitting ? "Sending..." : "Send →"}
              </button>
            </form>
            {emailError && (
              <p className="text-sm mt-3 text-center" role="alert" style={{ color: "#DC2626" }}>{emailError}</p>
            )}
            <button
              type="button"
              className="text-[13px] text-center mt-4 cursor-pointer block mx-auto bg-transparent border-none p-2"
              style={{ color: "#9E9E9E" }}
              onClick={() => setEmailSkipped(true)}
              aria-label="Skip email and show leak details"
            >
              Skip →
            </button>
          </div>
        )}

        {result && emailSent && (
          <div
            className="max-w-[600px] w-full mb-8 p-6 text-center mx-4"
            style={{
              backgroundColor: "#F0FDF4",
              border: "1.5px solid #BBF7D0",
              borderRadius: "12px",
            }}
          >
            <p className="text-base font-semibold" style={{ color: "#16A34A" }}>Check your inbox</p>
          </div>
        )}

        {/* ═══ LEAK CARDS ═══ */}
        {result && showLeaks && (emailSkipped || emailSent) && (
          <div className="max-w-[600px] w-full mb-8 px-4" style={{ display: "grid", gap: "16px" }}>
            {leaks.map((leak, i) => {
              const impactStyle = leak.impact === "HIGH"
                ? { bg: "#FEF2F2", color: "#DC2626" }
                : leak.impact === "MED"
                ? { bg: "#FFFBEB", color: "#D97706" }
                : { bg: "#F0FDF4", color: "#16A34A" };

              return (
                <div
                  key={leak.key}
                  style={{
                    background: "#FFFFFF",
                    border: "1.5px solid #E5E7EB",
                    borderLeft: `4px solid ${impactBorderColor(leak.impact)}`,
                    borderRadius: "12px",
                    padding: "clamp(16px, 3vw, 24px)",
                    animation: `fade-in 300ms ease-out ${i * 120}ms both`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: "#EFF6FF", color: "#2563EB" }}
                    >
                      {leak.category}
                    </span>
                    <span
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: impactStyle.bg, color: impactStyle.color }}
                    >
                      {leak.impact}
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-semibold mt-4" style={{ color: "#111111" }}>
                    {leak.tip}
                  </h3>

                  <div className="mt-4 pt-4" style={{ borderTop: "1px solid #F3F4F6" }}>
                    <p className="text-sm sm:text-[15px]" style={{ color: "#111111" }}>
                      → Improve your {leak.category.toLowerCase()} to boost conversions.
                    </p>
                  </div>
                </div>
              );
            })}

            {/* ═══ SCAN ANOTHER ═══ */}
            <div className="text-center pt-4">
              <button
                type="button"
                onClick={handleScanAnother}
                className="inline-flex items-center px-6 py-3 rounded-lg text-sm font-semibold transition hover:opacity-90 cursor-pointer"
                style={{ backgroundColor: "#F8F7F4", color: "#111111", border: "1.5px solid #E5E7EB" }}
                aria-label="Scan another page"
              >
                Scan another page →
              </button>
            </div>
          </div>
        )}

        {/* ═══ PROOF SECTION ═══ */}
        {!result && !loading && (
          <section className="w-full py-12 sm:py-16 mt-8 sm:mt-12" style={{ background: "#F8F7F4" }}>
            <div className="max-w-4xl mx-auto px-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {EXAMPLES.map((ex) => (
                  <div
                    key={ex.product}
                    style={{
                      background: "#FFFFFF",
                      border: "1.5px solid #E5E7EB",
                      borderLeft: `4px solid ${severityBorderColor(ex.score)}`,
                      borderRadius: "12px",
                      padding: "clamp(16px, 3vw, 24px)",
                    }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: scoreColorTintBg(ex.score), color: scoreColor(ex.score) }}
                      >
                        {ex.score}
                      </span>
                    </div>

                    <p className="text-[15px] leading-relaxed mb-4" style={{ color: "#6B6B6B" }}>{ex.finding}</p>

                    <div className="pt-4" style={{ borderTop: "1px solid #F3F4F6" }}>
                      <p className="text-[15px]" style={{ color: "#111111", filter: "blur(3px)", userSelect: "none" }}>{ex.fix}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ═══ FOOTER ═══ */}
        <footer className="py-8 w-full text-center">
          <span className="text-xs" style={{ color: "#C0C0C0" }}>PageScore · alpo.ai</span>
        </footer>
      </main>
    </>
  );
}
