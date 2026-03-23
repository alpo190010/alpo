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

/* ── Severity helpers ── */
function getSeverity(catScore: number) {
  if (catScore < 4) return { label: "Critical", emoji: "\uD83D\uDD34", color: "border-red-500", textColor: "text-red-600", bgColor: "bg-red-50" };
  if (catScore <= 6) return { label: "Moderate", emoji: "\uD83D\uDFE1", color: "border-yellow-500", textColor: "text-yellow-700", bgColor: "bg-yellow-50" };
  return { label: "Minor", emoji: "\uD83D\uDFE2", color: "border-emerald-500", textColor: "text-emerald-700", bgColor: "bg-emerald-50" };
}

function getRevenueImpact(catScore: number): string {
  if (catScore < 4) {
    const amt = 150 + Math.round(Math.random() * 150);
    return `~$${amt}/mo`;
  }
  if (catScore <= 6) {
    const amt = 80 + Math.round(Math.random() * 70);
    return `~$${amt}/mo`;
  }
  const amt = 30 + Math.round(Math.random() * 50);
  return `~$${amt}/mo`;
}

/* ── Build leak cards from categories + tips ── */
function buildLeaks(categories: CategoryScores, tips: string[]) {
  const entries = Object.entries(categories) as [keyof CategoryScores, number][];
  entries.sort((a, b) => a[1] - b[1]);

  return entries.slice(0, 7).map((entry, i) => {
    const [key, score] = entry;
    const severity = getSeverity(score);
    const impact = getRevenueImpact(score);
    const tip = tips[i] || `Improve your ${key} to increase conversions.`;
    return { key, score, severity, impact, tip };
  });
}

/* ── Loading overlay ── */
function LoadingOverlay() {
  const [step, setStep] = useState(0);
  const lines = [
    "Reading your page title",
    "Checking social proof",
    "Calculating revenue impact",
  ];

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 800);
    const t2 = setTimeout(() => setStep(2), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 backdrop-blur-sm">
      <div className="text-center space-y-4">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`text-lg font-medium transition-all duration-500 ${
              i <= step ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            } ${i === step ? "text-[#0f172a]" : "text-[#64748b]"}`}
          >
            {line}
            {i === step && <span className="animate-pulse">...</span>}
            {i < step && <span className="text-emerald-500 ml-2">&#10003;</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Example cards for below-fold ── */
const EXAMPLES = [
  { score: 43, product: "Leather Wallet", finding: 'Title is generic — costing ~$280/mo', severity: "critical" as const },
  { score: 67, product: "Coffee Blend", finding: 'No reviews above fold — costing ~$190/mo', severity: "moderate" as const },
  { score: 81, product: "Yoga Mat", finding: 'CTA has no urgency — costing ~$90/mo', severity: "minor" as const },
];

function scoreColorClass(score: number) {
  if (score >= 70) return "text-emerald-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-600";
}

const severityBorderColor = { critical: "border-l-red-500", moderate: "border-l-yellow-500", minor: "border-l-emerald-500" };

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

  const animatedScore = useCountUp(result?.score ?? 0);

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setEmailSent(false);

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
  const freeLeaks = leaks.slice(0, 3);
  const remainingCount = Math.max(leaks.length - 3, 0);

  const lossLow = result ? (100 - result.score) * 4 : 0;
  const lossHigh = result ? (100 - result.score) * 8 : 0;

  return (
    <>
      {loading && <LoadingOverlay />}

      {/* ═══ NAV ═══ */}
      <nav className="w-full border-b border-[#e2e8f0] bg-white sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/" className="text-lg font-extrabold tracking-tight text-[#0f172a]">PageScore</a>
          <div className="flex items-center gap-3">
            <a href="#" className="text-sm font-medium text-[#64748b] hover:text-[#0f172a] transition">Sign in</a>
            <a href="#" className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-[#6366f1] hover:bg-[#4f46e5] text-white transition">Get Started</a>
          </div>
        </div>
      </nav>

      <main className="min-h-screen flex flex-col items-center px-4">
        {/* ═══ HERO ═══ */}
        <section className="max-w-[680px] w-full text-center pt-24 pb-20">
          <div className="inline-flex items-center px-3.5 py-1 mb-6 rounded-full text-xs font-semibold tracking-wide bg-indigo-50 text-indigo-600 border border-indigo-100">
            Free Shopify Product Page Analyzer
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[#0f172a] mb-4">
            Your product page has a leak.
          </h1>
          <p className="text-lg text-[#64748b] mb-10 max-w-md mx-auto leading-relaxed">
            Paste your Shopify product URL. Find out exactly where you are losing sales &mdash; in 30 seconds.
          </p>

          <form onSubmit={analyze} className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
            <input
              type="url"
              required
              placeholder="https://yourstore.com/products/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 px-4 py-3 rounded-xl bg-white border border-[#e2e8f0] text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-sm cursor-pointer"
            >
              Find My Leaks &rarr;
            </button>
          </form>

          <p className="mt-6 text-sm text-[#94a3b8] flex items-center justify-center gap-2">
            <span className="flex -space-x-1.5">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="inline-block w-6 h-6 rounded-full bg-[#e2e8f0] border-2 border-white" />
              ))}
            </span>
            Trusted by 500+ Shopify store owners
          </p>
        </section>

        {/* ═══ ERROR ═══ */}
        {error && (
          <div className="max-w-2xl w-full p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-8">
            {error}
          </div>
        )}

        {/* ═══ RESULTS ═══ */}
        {result && (
          <section className="max-w-2xl w-full mb-20">
            {/* Score Hero */}
            <div className="text-center mb-10 p-8 rounded-2xl bg-white border border-[#e2e8f0] shadow-md">
              <div className="text-8xl md:text-[160px] font-extrabold leading-none tracking-tighter text-indigo-600">
                {animatedScore}
              </div>
              <div className="text-lg text-[#64748b] -mt-1 mb-4">/100</div>
              <p className="text-sm text-[#64748b] mb-2 break-all">{url}</p>
              <p className="text-[#d97706] text-lg font-semibold mb-3">
                Likely losing ${lossLow}&ndash;${lossHigh}/month
              </p>
              <div className="flex items-center justify-center gap-3">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100">
                  Your score: {result.score}
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#f8fafc] text-[#64748b] border border-[#e2e8f0]">
                  Average: 65
                </span>
              </div>
            </div>

            {/* Free Leaks (3) */}
            <div className="space-y-4 mb-8">
              {freeLeaks.map((leak) => (
                <div
                  key={leak.key}
                  className={`rounded-xl border-l-4 ${leak.severity.color} bg-white border border-[#e2e8f0] shadow-sm overflow-hidden`}
                >
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${leak.severity.bgColor} ${leak.severity.textColor}`}
                      >
                        {leak.severity.emoji} {leak.severity.label}
                      </span>
                    </div>
                    <h3 className="font-semibold text-[#0f172a] mb-1">{leak.tip}</h3>
                    <p className="text-[#d97706] text-sm font-medium">
                      Est. impact: {leak.impact}
                    </p>
                  </div>
                  {/* Blurred fix section */}
                  <div className="relative px-5 pb-5">
                    <div className="filter blur-[4px] select-none pointer-events-none text-sm text-[#64748b] leading-relaxed">
                      <p className="font-semibold text-[#0f172a] mb-1">How to fix:</p>
                      <p>
                        Rewrite this section to focus on specific customer benefits and include social proof elements. Add urgency triggers and clear value propositions above the fold.
                      </p>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="px-4 py-2 rounded-lg bg-white/80 border border-[#e2e8f0] text-sm text-[#64748b] backdrop-blur-sm flex items-center gap-2 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                        Fix locked
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Email Capture */}
            {emailSent ? (
              <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
                <div className="text-4xl mb-3">&#9993;&#65039;</div>
                <h3 className="text-xl font-bold text-[#0f172a] mb-2">Check your inbox &mdash; fixes on the way.</h3>
                <p className="text-sm text-[#64748b]">
                  We sent the complete fix list to <span className="text-[#0f172a] font-medium">{email}</span>
                </p>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-indigo-50 border border-indigo-100 text-center">
                <h3 className="text-xl font-bold text-[#0f172a] mb-2">
                  There {remainingCount === 1 ? "is" : "are"} {remainingCount} more issue{remainingCount !== 1 ? "s" : ""} on this page.
                </h3>
                <p className="text-[#64748b] mb-5">
                  Get the complete fix list &mdash; free.
                </p>
                <form onSubmit={submitEmail} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                  <input
                    type="email"
                    required
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl bg-white border border-[#e2e8f0] text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-sm"
                  />
                  <button
                    type="submit"
                    disabled={emailSubmitting}
                    className="px-5 py-3 rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer shadow-sm"
                  >
                    {emailSubmitting ? "Sending\u2026" : "Send Me the Fixes \u2192"}
                  </button>
                </form>
                {emailError && (
                  <p className="text-red-600 text-sm mt-3">{emailError}</p>
                )}
                <p className="text-xs text-[#94a3b8] mt-3">
                  No spam. Unsubscribe anytime.
                </p>
              </div>
            )}
          </section>
        )}

        {/* ═══ BELOW FOLD — "What your audit looks like" (only before results) ═══ */}
        {!result && !loading && (
          <section className="w-full bg-[#f8fafc] -mx-4 px-4 py-16">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl font-bold text-[#0f172a] text-center mb-8">What your audit looks like</h2>
              <div className="grid md:grid-cols-3 gap-5">
                {EXAMPLES.map((ex) => (
                  <div
                    key={ex.product}
                    className={`rounded-2xl bg-white border border-[#e2e8f0] shadow-sm overflow-hidden border-l-4 ${severityBorderColor[ex.severity]}`}
                  >
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[#64748b] uppercase tracking-wide font-medium">Example</span>
                        <span className={`text-2xl font-bold ${scoreColorClass(ex.score)}`}>
                          {ex.score}
                          <span className="text-sm text-[#94a3b8]">/100</span>
                        </span>
                      </div>
                      <h3 className="font-semibold text-[#0f172a] mb-2">{ex.product}</h3>
                      <p className="text-sm text-[#d97706] font-medium">{ex.finding}</p>
                    </div>
                    {/* Blurred bottom */}
                    <div className="px-5 pb-5 filter blur-[4px] select-none pointer-events-none">
                      <div className="h-3 bg-[#e2e8f0] rounded mb-2 w-full" />
                      <div className="h-3 bg-[#e2e8f0] rounded mb-2 w-4/5" />
                      <div className="h-3 bg-[#e2e8f0] rounded w-3/5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ═══ FOOTER ═══ */}
        <footer className="py-8 text-xs text-[#94a3b8]">
          &copy; {new Date().getFullYear()} PageScore. Built with AI.
        </footer>
      </main>
    </>
  );
}
