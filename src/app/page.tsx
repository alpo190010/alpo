"use client";

import { useState, useEffect, useRef } from "react";
import posthog from "posthog-js";

interface FreeResult {
  score: number;
  summary: string;
  tips: string[];
  categories: CategoryScores;
}

interface CategoryScores {
  title: number;
  images: number;
  pricing: number;
  socialProof: number;
  cta: number;
  description: number;
  trust: number;
}

/* ── Score color by value ── */
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

/* ── Animated count-up hook ── */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (target <= 0 || started.current) return;
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
  const circumference = Math.PI * radius; // semicircle
  const progress = animated / 100;
  const offset = circumference * (1 - progress);

  return (
    <svg width={size} height={size / 2 + strokeWidth} viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`} className="mx-auto">
      {/* Track */}
      <path
        d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
        fill="none"
        stroke="#E5E7EB"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Fill */}
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

/* ── Category labels ── */
const CATEGORY_LABELS: Record<string, string> = {
  title: "Title",
  images: "Images",
  pricing: "Pricing",
  socialProof: "Social Proof",
  cta: "CTA",
  description: "Description",
  trust: "Trust",
};

/* ── Build leak cards from categories + tips ── */
function buildLeaks(categories: CategoryScores, tips: string[]) {
  const entries = Object.entries(categories) as [keyof CategoryScores, number][];
  entries.sort((a, b) => a[1] - b[1]);

  return entries.slice(0, 7).map((entry, i) => {
    const [key, catScore] = entry;
    const tip = tips[i] || `Improve your ${key} to increase conversions.`;
    let impact: string;
    let impactLevel: "HIGH" | "MED" | "LOW";
    if (i === 0) { impact = `+$${150 + Math.round(Math.random() * 50)}/mo`; impactLevel = "HIGH"; }
    else if (i === 1) { impact = `+$${80 + Math.round(Math.random() * 40)}/mo`; impactLevel = "MED"; }
    else { impact = `+$${30 + Math.round(Math.random() * 30)}/mo`; impactLevel = "LOW"; }
    return { key, catScore, tip, impact, impactLevel, label: CATEGORY_LABELS[key] || key };
  });
}

const IMPACT_STYLES = {
  HIGH: { bg: "#FEF2F2", text: "#DC2626" },
  MED: { bg: "#FFFBEB", text: "#D97706" },
  LOW: { bg: "#F0FDF4", text: "#16A34A" },
};

/* ── Example cards for proof section ── */
const EXAMPLES = [
  { score: 43, product: "Leather Wallet", category: "Title", finding: "Title is generic — no keywords, no benefits", fix: "Rewrite with primary keyword + key benefit", impact: "+$180/mo" },
  { score: 67, product: "Coffee Blend", category: "Social Proof", finding: "No reviews visible above the fold", fix: "Move review stars to product title area", impact: "+$120/mo" },
  { score: 81, product: "Yoga Mat", category: "CTA", finding: "Buy button lacks urgency or benefit copy", fix: "Add urgency text + benefit-driven CTA", impact: "+$45/mo" },
];

/* ── Main page ── */
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
  const [revealStage, setRevealStage] = useState(0);

  const animatedScore = useCountUp(result ? result.score : 0);

  /* Animation sequence after result arrives */
  useEffect(() => {
    if (!result) return;
    setRevealStage(1); // card fade in
    const t1 = setTimeout(() => setRevealStage(2), 1500); // revenue
    const t2 = setTimeout(() => setRevealStage(3), 1800); // email capture
    const t3 = setTimeout(() => setRevealStage(4), 2000); // leak cards
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [result]);

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setEmailSent(false);
    setEmailSkipped(false);
    setRevealStage(0);

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
  }

  async function submitEmail(e: React.FormEvent) {
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
  }

  const leaks = result ? buildLeaks(result.categories, result.tips) : [];
  const lossLow = result ? (100 - result.score) * 4 : 0;
  const lossHigh = result ? (100 - result.score) * 8 : 0;

  // Extract domain from URL
  let domain = "";
  try { domain = new URL(url).hostname; } catch { domain = url; }

  const showLeaks = emailSent || emailSkipped;

  return (
    <>
      {/* ═══ LOADING BAR ═══ */}
      {loading && (
        <div
          className="fixed top-0 left-0 h-[3px] z-50"
          style={{
            backgroundColor: "#2563EB",
            animation: "progress-bar 1.8s ease-out forwards",
          }}
        />
      )}

      {/* ═══ NAV ═══ */}
      <nav className="w-full h-16" style={{ backgroundColor: "#F8F7F4" }}>
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between">
          <a href="/" className="text-lg font-bold text-[#111111] no-underline" style={{ letterSpacing: "-0.02em" }}>
            PageScore
          </a>
          <div className="flex items-center gap-3">
            <a href="#" className="text-sm font-medium text-[#6B6B6B] hover:text-[#111111] transition no-underline">
              Sign in
            </a>
            <a
              href="#"
              className="text-sm font-semibold px-4 py-0 h-9 inline-flex items-center rounded-lg text-white no-underline transition"
              style={{ backgroundColor: "#2563EB" }}
            >
              Analyze Free &rarr;
            </a>
          </div>
        </div>
      </nav>

      <main className="flex flex-col items-center px-4" style={{ opacity: loading ? 0.4 : 1, transition: "opacity 0.3s" }}>
        {/* ═══ HERO ═══ */}
        <section className="max-w-[680px] w-full text-center" style={{ paddingTop: "96px" }}>
          <div
            className="inline-flex items-center px-3 py-1 mb-6 rounded-full text-xs font-medium"
            style={{ backgroundColor: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE" }}
          >
            Free Shopify Product Page Analyzer
          </div>
          <h1
            className="text-[32px] sm:text-5xl font-bold text-[#111111] mb-4"
            style={{ letterSpacing: "-0.02em" }}
          >
            Find out why your product page isn&apos;t converting
          </h1>
          <p className="text-base sm:text-xl font-normal text-[#6B6B6B] mb-10 max-w-lg mx-auto">
            Paste your Shopify product URL. Get an instant revenue analysis. Free.
          </p>

          <form onSubmit={analyze} className="flex flex-col sm:flex-row gap-0 max-w-lg mx-auto">
            <div
              className="flex flex-col sm:flex-row flex-1 items-stretch rounded-lg overflow-hidden"
              style={{ border: "1.5px solid #E5E7EB", height: "56px" }}
            >
              <input
                type="url"
                required
                placeholder="https://yourstore.myshopify.com/products/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 px-4 h-full bg-white text-[#111111] placeholder:text-[#9E9E9E] focus:outline-none text-sm sm:text-base"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-5 h-full font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer text-base"
                style={{ backgroundColor: "#2563EB", borderRadius: "6px", margin: "4px" }}
              >
                Analyze &rarr;
              </button>
            </div>
          </form>

          <p className="mt-4 text-xs text-[#9E9E9E]">
            No signup required &middot; Takes 10 seconds &middot; Free forever
          </p>
        </section>

        {/* ═══ SOCIAL PROOF ═══ */}
        {!result && !loading && (
          <p className="mt-10 text-sm text-[#6B6B6B]">
            Trusted by 1,200+ Shopify merchants
          </p>
        )}

        {/* ═══ ERROR ═══ */}
        {error && (
          <div className="max-w-[800px] w-full p-4 rounded-xl mt-8 text-sm" style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626" }}>
            {error}
          </div>
        )}

        {/* ═══ SCORE REVEAL ═══ */}
        {result && (
          <section
            className="max-w-[800px] w-full mt-12 mb-20"
            style={{
              animation: "fade-up 300ms ease-out forwards",
            }}
          >
            {/* Score Card */}
            <div
              className="rounded-2xl p-12 text-center mx-auto"
              style={{
                backgroundColor: "#FFFFFF",
                border: "1.5px solid #E5E7EB",
                borderRadius: "16px",
                boxShadow: "0 4px 32px rgba(0,0,0,0.10)",
              }}
            >
              {/* Domain */}
              <p className="text-sm text-[#9E9E9E] mb-1">Analysis for {domain}</p>

              {/* Product title from summary */}
              <p className="text-lg font-semibold text-[#111111] mb-6">{result.summary?.split('.')[0] || "Your Product Page"}</p>

              {/* Score Number */}
              <div
                className="font-bold leading-none font-[family-name:var(--font-mono)]"
                style={{
                  fontSize: "96px",
                  color: scoreColor(result.score),
                  letterSpacing: "-0.02em",
                }}
              >
                {animatedScore}
              </div>

              {/* Arc Gauge */}
              <ArcGauge score={result.score} animated={animatedScore} />

              <p className="text-sm text-[#9E9E9E] -mt-2">out of 100</p>

              {/* Revenue Impact */}
              {revealStage >= 2 && (
                <div
                  className="mt-8 p-6 rounded-xl text-center"
                  style={{
                    backgroundColor: "#FEF2F2",
                    borderRadius: "12px",
                    animation: "fade-up 250ms ease-out forwards",
                  }}
                >
                  <p className="text-base text-[#6B6B6B]">This page is estimated to be losing</p>
                  <p className="text-4xl sm:text-[36px] font-extrabold text-[#DC2626] my-2">
                    ${lossLow}&ndash;${lossHigh}/month
                  </p>
                  <p className="text-base text-[#6B6B6B]">in potential revenue</p>
                </div>
              )}

              {/* Competitive Context */}
              <div className="flex items-center justify-center gap-3 mt-4">
                <span
                  className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: scoreColorTintBg(result.score), color: scoreColor(result.score) }}
                >
                  Your score: {result.score}
                </span>
                <span
                  className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "#F3F4F6", color: "#6B6B6B" }}
                >
                  Avg Shopify store: 65
                </span>
              </div>
            </div>

            {/* ═══ EMAIL CAPTURE ═══ */}
            {revealStage >= 3 && !showLeaks && (
              <div
                className="mt-8 p-8 rounded-xl text-center"
                style={{
                  backgroundColor: "#EFF6FF",
                  border: "1.5px solid #BFDBFE",
                  borderRadius: "12px",
                  animation: "fade-up 250ms ease-out forwards",
                }}
              >
                {emailSent ? (
                  <p className="text-base font-semibold text-[#111111]">Check your inbox &#10003;</p>
                ) : (
                  <>
                    <h3 className="text-xl font-semibold text-[#111111] mb-1">Get the full fix checklist</h3>
                    <p className="text-[15px] text-[#6B6B6B] mb-5">We&apos;ll send you detailed fixes for each issue. No spam.</p>
                    <form onSubmit={submitEmail} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                      <input
                        type="email"
                        required
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="flex-1 px-4 h-12 rounded-lg bg-white text-[#111111] placeholder:text-[#9E9E9E] focus:outline-none text-sm"
                        style={{ border: "1px solid #BFDBFE" }}
                      />
                      <button
                        type="submit"
                        disabled={emailSubmitting}
                        className="h-12 px-5 rounded-lg text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer text-base"
                        style={{ backgroundColor: "#2563EB" }}
                      >
                        {emailSubmitting ? "Sending\u2026" : "Send fixes \u2192"}
                      </button>
                    </form>
                    {emailError && (
                      <p className="text-sm mt-3" style={{ color: "#DC2626" }}>{emailError}</p>
                    )}
                    <button
                      onClick={() => setEmailSkipped(true)}
                      className="mt-4 text-[13px] text-[#9E9E9E] underline cursor-pointer bg-transparent border-none"
                    >
                      Skip, just show me the leaks &darr;
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ═══ LEAK CARDS ═══ */}
            {revealStage >= 4 && showLeaks && (
              <div className="mt-8 space-y-4">
                {leaks.map((leak, i) => {
                  const impactStyle = IMPACT_STYLES[leak.impactLevel];
                  return (
                    <div
                      key={leak.key}
                      className="rounded-xl p-6"
                      style={{
                        backgroundColor: "#FFFFFF",
                        border: "1.5px solid #E5E7EB",
                        borderRadius: "12px",
                        animation: `fade-up 300ms ease-out ${i * 120}ms both`,
                      }}
                    >
                      {/* Row 1: Category + Impact */}
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: "#EFF6FF", color: "#2563EB" }}
                        >
                          {leak.label}
                        </span>
                        <span
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: impactStyle.bg, color: impactStyle.text }}
                        >
                          {leak.impactLevel}
                        </span>
                      </div>

                      {/* Row 2: Headline */}
                      <h3 className="text-lg font-semibold text-[#111111] mt-4">
                        {leak.tip}
                      </h3>

                      {/* Row 3: Description */}
                      <p className="text-[15px] text-[#6B6B6B] mt-2 leading-relaxed">
                        Score: {leak.catScore}/10 &mdash; this area needs attention to improve conversions.
                      </p>

                      {/* Row 4: Fix */}
                      <div className="mt-4 pt-4" style={{ borderTop: "1px solid #F3F4F6" }}>
                        <div className="flex items-center justify-between">
                          <p className="text-[15px] text-[#111111]">
                            &rarr; Improve your {leak.label.toLowerCase()} to capture more conversions
                          </p>
                          <span className="text-[13px] font-semibold text-[#16A34A] whitespace-nowrap ml-4">
                            {leak.impact} potential
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ═══ PROOF SECTION ═══ */}
        {!result && !loading && (
          <section className="w-full py-20 -mx-4 px-4" style={{ backgroundColor: "#F8F7F4" }}>
            <div className="max-w-4xl mx-auto">
              <h2
                className="text-[32px] font-bold text-[#111111] text-center mb-10"
                style={{ letterSpacing: "-0.02em" }}
              >
                What your analysis looks like
              </h2>
              <div className="grid md:grid-cols-3 gap-5">
                {EXAMPLES.map((ex) => (
                  <div
                    key={ex.product}
                    className="rounded-xl p-6"
                    style={{
                      backgroundColor: "#FFFFFF",
                      border: "1.5px solid #E5E7EB",
                      borderRadius: "12px",
                    }}
                  >
                    {/* Badges */}
                    <div className="flex items-center justify-between mb-4">
                      <span
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: "#EFF6FF", color: "#2563EB" }}
                      >
                        {ex.category}
                      </span>
                      <span
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                        style={{
                          backgroundColor: ex.score < 40 ? "#FEF2F2" : ex.score < 70 ? "#FFFBEB" : "#F0FDF4",
                          color: ex.score < 40 ? "#DC2626" : ex.score < 70 ? "#D97706" : "#16A34A",
                        }}
                      >
                        {ex.score < 40 ? "HIGH" : ex.score < 70 ? "MED" : "LOW"}
                      </span>
                    </div>

                    <h3 className="text-lg font-semibold text-[#111111] mb-2">{ex.product}</h3>
                    <p className="text-[15px] text-[#6B6B6B] leading-relaxed mb-4">{ex.finding}</p>

                    <div className="pt-4" style={{ borderTop: "1px solid #F3F4F6" }}>
                      <div className="flex items-center justify-between">
                        <p className="text-[15px] text-[#111111]">&rarr; {ex.fix}</p>
                        <span className="text-[13px] font-semibold text-[#16A34A] whitespace-nowrap ml-4">{ex.impact}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ═══ FOOTER ═══ */}
        <footer className="w-full py-12 bg-white">
          <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#9E9E9E]">
            <span className="font-bold text-[#111111]">PageScore</span>
            <span>&copy; {new Date().getFullYear()} PageScore</span>
            <span>Built with AI</span>
          </div>
        </footer>
      </main>
    </>
  );
}
