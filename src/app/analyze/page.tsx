"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AnalysisLoader from "@/components/AnalysisLoader";
import {
  type FreeResult,
  type CategoryScores,
  type LeakCard,
  captureEvent,
  calculateRevenueLoss,
  scoreColor,
  scoreColorText,
  scoreColorTintBg,
  buildLeaks,
  extractDomain,
  parseAnalysisResponse,
} from "@/lib/analysis";

/* ── Category SVG icons ── */
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

function AnalyzePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const url = searchParams.get("url") || "";
  const domain = extractDomain(url);

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<FreeResult | null>(null);
  const [error, setError] = useState("");

  // Email modal state
  const [email, setEmail] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [selectedLeak, setSelectedLeak] = useState<string | null>(null);
  const [competitorCTAName, setCompetitorCTAName] = useState<string | null>(null);
  const [emailStep, setEmailStep] = useState<"form" | "queued" | "pricing" | "sent" | null>(null);
  const [modalClosing, setModalClosing] = useState(false);

  // Reveal state
  const [showCard, setShowCard] = useState(false);
  const [showRevenue, setShowRevenue] = useState(false);
  const [showLeaks, setShowLeaks] = useState(false);
  const issuesRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const animatedScore = useCountUp(showCard ? (result?.score ?? 0) : 0);

  // Run analysis on mount
  useEffect(() => {
    if (!url) {
      setError("No URL provided.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || `Analysis failed (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        setResult(parseAnalysisResponse(data as Record<string, unknown>));
        setLoading(false);
        captureEvent("scan_completed", { url, score: (data as Record<string, unknown>).score });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
        setLoading(false);
      });

    return () => { controller.abort(); };
  }, [url]);

  // Reveal sequence
  useEffect(() => {
    if (!result) return;
    setShowCard(true);
    const t1 = setTimeout(() => setShowRevenue(true), 1500);
    const t2 = setTimeout(() => setShowLeaks(true), 1800);
    const t3 = setTimeout(() => {
      issuesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [result]);

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
        if (res.status === 429) throw new Error("Too many requests. Please wait a moment and try again.");
        throw new Error((data as { error?: string }).error || "Failed to send. Please try again.");
      }
      setEmailStep("queued");
      captureEvent("report_email_submitted", { url, score: result?.score });
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setEmailSubmitting(false);
    }
  }, [email, url, result, emailSubmitting, competitorCTAName]);

  const closeModal = useCallback(() => {
    setModalClosing(true);
    setTimeout(() => {
      setSelectedLeak(null);
      setCompetitorCTAName(null);
      setEmailStep(null);
      setModalClosing(false);
    }, 200);
  }, []);

  const handleScanAnother = useCallback(() => {
    router.push("/");
  }, [router]);

  const leaks = result ? buildLeaks(result.categories, result.tips) : [];
  const { lossLow, lossHigh } = result
    ? calculateRevenueLoss(result.score, result.productPrice, result.estimatedMonthlyVisitors, result.productCategory)
    : { lossLow: 0, lossHigh: 0 };

  // Error state
  if (error && !loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6 anim-phase-enter">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--error-light)] flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4m0 4h.01" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">Analysis Failed</h1>
            <p className="text-sm text-[var(--text-secondary)]">{error}</p>
          </div>
          <button
            type="button"
            onClick={handleScanAnother}
            className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 primary-gradient text-white rounded-full font-bold text-sm hover:brightness-110 transition-all"
          >
            Try Another URL
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Nav ── */}
      <nav className="fixed top-0 w-full z-50 bg-violet-50/80 backdrop-blur-xl shadow-xl shadow-violet-900/5" aria-label="Main navigation">
        <div className="flex justify-between items-center w-full px-4 sm:px-8 py-4 max-w-screen-2xl mx-auto">
          <a href="/" className="text-2xl font-black tracking-tighter text-violet-700" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>PageLeaks</a>
          <button
            type="button"
            onClick={handleScanAnother}
            className="cursor-pointer primary-gradient text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-violet-600/20 hover:scale-105 active:scale-95 transition-all text-sm"
          >
            {result ? "Scan Another" : "Analyzing..."}
          </button>
        </div>
      </nav>

      <main className="min-h-screen bg-[var(--bg)]" aria-busy={loading}>
        {/* ── Loader ── */}
        {loading && (
          <div className="anim-phase-enter">
            <AnalysisLoader url={url} />
          </div>
        )}

        {/* ── Score Ring + Revenue ── */}
        {result && showCard && (
          <section
            className="pt-24 sm:pt-28 pb-8"
            style={{ animation: "fade-in-up 600ms var(--ease-out-quart) both" }}
          >
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
                {/* Score Ring + Domain Info */}
                <div
                  className="md:col-span-8 bg-[var(--surface)] rounded-3xl p-8 sm:p-10 flex flex-col md:flex-row items-center gap-8 sm:gap-10 relative overflow-hidden"
                  style={{ boxShadow: "var(--shadow-elevated)" }}
                >
                  <div className="absolute top-0 right-0 w-72 h-72 rounded-full -mr-24 -mt-24 blur-3xl pointer-events-none" style={{ background: "var(--brand)", opacity: 0.04 }} />

                  {/* Ring */}
                  <div className="relative shrink-0">
                    <svg className="w-44 h-44 sm:w-48 sm:h-48" viewBox="0 0 192 192" style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
                      <circle cx="96" cy="96" r="88" fill="transparent" stroke="var(--surface-container)" strokeWidth="10" />
                      <circle cx="96" cy="96" r="88" fill="transparent" stroke={scoreColor(result.score)} strokeWidth="10" strokeLinecap="round" strokeDasharray="553" strokeDashoffset={553 - (553 * animatedScore / 100)} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-extrabold text-[var(--on-surface)]" style={{ fontSize: "clamp(40px, 7vw, 56px)", fontFamily: "var(--font-manrope), Manrope, sans-serif", lineHeight: 1, letterSpacing: "-0.02em" }}>
                        {animatedScore}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--on-surface-variant)] opacity-50 mt-1">Score</span>
                    </div>
                  </div>

                  {/* Domain + context */}
                  <div className="space-y-4 text-center md:text-left relative z-10">
                    <div>
                      <span className="inline-block px-3 py-1.5 rounded-full text-xs font-bold mb-3 uppercase tracking-wider" style={{ backgroundColor: scoreColorTintBg(result.score), color: scoreColorText(result.score) }}>
                        {result.score >= 80 ? "Excellent" : result.score >= 60 ? "Above Average" : result.score >= 40 ? "Needs Improvement" : "Critical Issues Found"}
                      </span>
                      <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] tracking-tight" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
                        {domain || url}
                      </h1>
                    </div>
                    <p className="text-[var(--on-surface-variant)] max-w-md text-sm sm:text-base leading-relaxed">{result.summary}</p>
                    <div className="flex gap-3 pt-2 justify-center md:justify-start">
                      <div className="px-4 py-2.5 bg-[var(--surface-container-low)] rounded-xl">
                        <div className="text-[9px] text-[var(--on-surface-variant)] uppercase font-bold tracking-[0.15em]">Issues</div>
                        <div className="text-lg font-bold text-[var(--on-surface)]" style={{ fontVariantNumeric: "tabular-nums" }}>{leaks.length}</div>
                      </div>
                      <div className="px-4 py-2.5 bg-[var(--surface-container-low)] rounded-xl">
                        <div className="text-[9px] text-[var(--on-surface-variant)] uppercase font-bold tracking-[0.15em]">Avg Score</div>
                        <div className="text-lg font-bold text-[var(--on-surface)]" style={{ fontVariantNumeric: "tabular-nums" }}>65</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Revenue Loss Card */}
                {showRevenue && (
                  <div
                    className="md:col-span-4 p-8 rounded-3xl text-white flex flex-col justify-between"
                    style={{ background: "linear-gradient(135deg, var(--brand), var(--primary-dim))", boxShadow: "0 20px 60px rgba(124, 58, 237, 0.25)", animation: "fade-in-up 500ms var(--ease-out-quart) both" }}
                  >
                    <div className="space-y-2">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="opacity-50" aria-hidden="true">
                        <path d="M23 6l-9.5 9.5-5-5L1 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M17 6h6v6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <h3 className="text-base sm:text-lg font-semibold opacity-80 leading-tight">Estimated Monthly Revenue Loss</h3>
                    </div>
                    <div className="space-y-1 my-6">
                      <div className="font-extrabold tracking-tighter" style={{ fontSize: "clamp(28px, 5vw, 44px)", fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
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

        {/* ── Issues Grid ── */}
        {result && showLeaks && (
          <div ref={issuesRef} className="max-w-6xl mx-auto px-4 sm:px-6 pb-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 sm:mb-10 pl-0 sm:pl-1">
              <div className="border-l-[3px] border-[var(--brand)] pl-5">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] tracking-tight" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>Issues Found</h2>
                <p className="text-[var(--on-surface-variant)] text-sm sm:text-base mt-1">{leaks.length} conversion leaks identified. Click any to get the fix.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {leaks.map((leak, i) => (
                <IssueCard
                  key={leak.key}
                  leak={leak}
                  index={i}
                  onClick={() => {
                    setSelectedLeak(leak.key);
                    setEmailStep("form");
                    setEmailError("");
                    captureEvent("issue_clicked", { category: leak.key, impact: leak.impact });
                  }}
                />
              ))}

              {/* CTA Card */}
              <button
                type="button"
                onClick={() => {
                  setSelectedLeak(leaks[0]?.key || null);
                  setEmailStep("form");
                  setEmailError("");
                  captureEvent("cta_card_clicked", { url });
                }}
                className="cursor-pointer group relative rounded-[1.5rem] p-7 flex flex-col items-center justify-center text-center overflow-hidden text-white min-h-[280px]"
                style={{ background: "linear-gradient(135deg, var(--on-surface) 0%, #2d1b42 100%)", animation: `fade-in-up 400ms ease-out ${leaks.length * 70}ms both` }}
              >
                <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "linear-gradient(var(--brand) 1px, transparent 1px), linear-gradient(90deg, var(--brand) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                <div className="relative z-10 space-y-4">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-extrabold" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>Get All Fixes</h3>
                  <p className="text-white/60 text-sm max-w-[200px] mx-auto leading-relaxed">Step-by-step recommendations for all {leaks.length} issues.</p>
                  <span className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-white text-[var(--on-surface)] rounded-full font-bold text-sm group-hover:scale-105 transition-transform">
                    Get Free Report
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── Featured Insight ── */}
        {result && showLeaks && (
          <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16" style={{ animation: "fade-in-up 600ms var(--ease-out-quart) 400ms both" }}>
            <div className="bg-[var(--surface-container-low)] rounded-3xl p-8 sm:p-12 relative overflow-hidden">
              <div className="grid md:grid-cols-2 gap-10 items-center relative z-10">
                <div className="space-y-5">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold bg-[var(--brand-light)] text-[var(--brand)] border border-[var(--brand-border)]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--brand)" aria-hidden="true"><path d="M12 1.5l2.61 6.727 6.89.52-5.23 4.917 1.58 6.836L12 16.56 6.15 20.5l1.58-6.836L2.5 8.747l6.89-.52L12 1.5z"/></svg>
                    Top Insight
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] tracking-tight leading-tight" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
                    {leaks[0] ? `Your "${leaks[0].category}" score of ${leaks[0].catScore} is the #1 revenue blocker.` : "Critical improvements identified."}
                  </h2>
                  <p className="text-[var(--on-surface-variant)] text-base leading-relaxed max-w-lg">{leaks[0]?.tip || result.summary}</p>
                  <button
                    type="button"
                    onClick={() => { if (leaks[0]) { setSelectedLeak(leaks[0].key); setEmailStep("form"); setEmailError(""); } }}
                    className="cursor-pointer group inline-flex items-center gap-2 text-[var(--brand)] font-bold text-base"
                  >
                    Get the detailed fix
                    <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  </button>
                </div>
                <div className="space-y-3">
                  {leaks.slice(0, 5).map((leak) => (
                    <div key={leak.key} className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[var(--on-surface-variant)] w-24 shrink-0 truncate">{leak.category}</span>
                      <div className="flex-1 h-3 bg-[var(--surface-container)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${leak.catScore}%`, backgroundColor: scoreColor(leak.catScore) }} />
                      </div>
                      <span className="text-sm font-bold w-8 text-right" style={{ color: scoreColorText(leak.catScore), fontVariantNumeric: "tabular-nums" }}>{leak.catScore}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full blur-[100px] pointer-events-none" style={{ background: "var(--brand)", opacity: 0.06 }} />
            </div>

            <div className="text-center mt-12">
              <button type="button" onClick={handleScanAnother} className="cursor-pointer inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring bg-gradient-to-r from-[var(--brand)] to-violet-800" style={{ boxShadow: "0 8px 32px rgba(124, 58, 237, 0.2)" }}>
                Analyze Another Page
              </button>
            </div>
          </section>
        )}

        {/* ── Email Modal ── */}
        {(selectedLeak || competitorCTAName) && emailStep && (
          <EmailModal
            emailStep={emailStep}
            modalClosing={modalClosing}
            email={email}
            emailSubmitting={emailSubmitting}
            emailError={emailError}
            leaks={leaks}
            selectedLeak={selectedLeak}
            competitorCTAName={competitorCTAName}
            url={url}
            score={result?.score}
            onEmailChange={setEmail}
            onSubmit={submitEmail}
            onClose={closeModal}
            onStepChange={setEmailStep}
          />
        )}
      </main>
    </>
  );
}

/* ── Issue Card ── */
function IssueCard({ leak, index, onClick }: { leak: LeakCard; index: number; onClick: () => void }) {
  const style = {
    HIGH: { textColor: "var(--error-text)" },
    MED: { textColor: "var(--warning-text)" },
    LOW: { textColor: "var(--success-text)" },
  }[leak.impact] || { textColor: "var(--on-surface)" };

  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer group text-left bg-[var(--surface)] rounded-[1.5rem] p-6 sm:p-7 flex flex-col justify-between border border-[var(--outline-variant)]/20 hover:border-[var(--brand)]/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)]"
      style={{ boxShadow: "var(--shadow-subtle)", animation: `fade-in-up 400ms ease-out ${index * 70}ms both` }}
    >
      <div className="space-y-5">
        <div className="flex justify-between items-start">
          <div className="w-12 h-12 bg-[var(--surface-container-high)] rounded-2xl flex items-center justify-center text-[var(--on-surface-variant)] group-hover:text-[var(--brand)] group-hover:scale-110 transition-all duration-300">
            {CATEGORY_SVG[leak.key] || CATEGORY_SVG.title}
          </div>
          <div className="text-right">
            <div className="text-[9px] font-bold text-[var(--on-surface-variant)] tracking-[0.15em] uppercase">Score</div>
            <div className="text-xl font-extrabold" style={{ color: style.textColor, fontVariantNumeric: "tabular-nums" }}>
              {leak.catScore}<span className="text-xs font-semibold opacity-50">/100</span>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg sm:text-xl font-bold text-[var(--on-surface)] tracking-tight leading-snug">{leak.category}</h3>
          <p className="text-sm text-[var(--on-surface-variant)] leading-relaxed line-clamp-3">{leak.problem}</p>
        </div>
      </div>
      <div className="mt-6 pt-5 border-t border-[var(--surface-container)] flex justify-between items-center">
        <div>
          <div className="text-[9px] font-bold text-[var(--on-surface-variant)] uppercase tracking-[0.15em]">Potential Gain</div>
          <div className="text-base sm:text-lg font-extrabold text-[var(--brand)]">{leak.revenue}</div>
        </div>
        <svg className="w-5 h-5 text-[var(--on-surface-variant)] group-hover:text-[var(--brand)] group-hover:translate-x-1 transition-all duration-200" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
      </div>
    </button>
  );
}

/* ── Email Modal ── */
function EmailModal({
  emailStep, modalClosing, email, emailSubmitting, emailError,
  leaks, selectedLeak, competitorCTAName, url, score,
  onEmailChange, onSubmit, onClose, onStepChange,
}: {
  emailStep: "form" | "queued" | "pricing" | "sent";
  modalClosing: boolean;
  email: string;
  emailSubmitting: boolean;
  emailError: string;
  leaks: LeakCard[];
  selectedLeak: string | null;
  competitorCTAName: string | null;
  url: string;
  score?: number;
  onEmailChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  onStepChange: (step: "form" | "queued" | "pricing" | "sent") => void;
}) {
  return (
    <div
      className={`cursor-pointer fixed inset-0 z-50 flex items-center justify-center md:p-4 ${modalClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"}`}
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Get detailed fix"
    >
      <div
        className={`relative w-full bg-[var(--surface)] overflow-hidden overflow-y-auto
          max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[85vh] max-md:rounded-t-3xl max-md:rounded-b-none
          md:max-w-md md:rounded-3xl md:max-h-[90vh]
          ${modalClosing ? "max-md:drawer-exit md:modal-content-exit" : "max-md:drawer-enter md:modal-content-enter"}`}
        style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}
      >
        <div className="h-1 w-full bg-gradient-to-r from-[var(--brand)] to-violet-800" />
        <button type="button" onClick={onClose} className="cursor-pointer absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>

        <div className="p-6 sm:p-8">
          {emailStep === "form" && (
            <div key="form-step">
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--brand-light)] border border-[var(--brand-border)]">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </div>
                <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">
                  {competitorCTAName
                    ? <>Get a Detailed Plan to Beat &ldquo;{competitorCTAName}&rdquo;</>
                    : <>Get the Fix for &ldquo;{leaks.find(l => l.key === selectedLeak)?.category}&rdquo;</>}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {competitorCTAName
                    ? <>We&apos;ll send you a step-by-step plan to outrank {competitorCTAName}.</>
                    : <>Enter your email and we&apos;ll send you detailed fixes for all {leaks.length} issues.</>}
                </p>
              </div>
              <form onSubmit={onSubmit}>
                <div className="mb-3">
                  <input id="modal-email-input" type="email" required placeholder="your@email.com" value={email} onChange={(e) => onEmailChange(e.target.value)} aria-label="Your email address" autoFocus className="w-full px-4 py-3.5 text-base rounded-xl outline-none border-[1.5px] border-[var(--border)] text-[var(--text-primary)] bg-[var(--bg)] polish-focus-ring" />
                </div>
                <button type="submit" disabled={emailSubmitting} className="cursor-pointer w-full px-6 py-3.5 rounded-xl text-base font-semibold text-white polish-hover-lift polish-focus-ring disabled:opacity-50" style={{ background: emailSubmitting ? "var(--text-tertiary)" : "linear-gradient(135deg, var(--brand), var(--primary-dim))", boxShadow: "0 4px 14px rgba(124, 58, 237, 0.25)" }}>
                  {emailSubmitting ? "Submitting..." : "Send Me the Fixes →"}
                </button>
                {emailError && <p className="text-sm mt-3 text-center text-[var(--error)] font-medium" role="alert">{emailError}</p>}
              </form>
              <p className="text-xs text-center mt-4 text-[var(--text-tertiary)]">No spam. Just your fixes.</p>
            </div>
          )}

          {emailStep === "queued" && (
            <div className="text-center modal-step-enter" key="queued-step">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--success-light)] border border-[var(--success-border)]">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">You&apos;re in the Queue!</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
                Your detailed report will arrive within <strong className="text-[var(--text-primary)]">48 hours</strong>.
              </p>
              <div className="p-5 rounded-2xl border-2 border-dashed mb-4" style={{ borderColor: "var(--brand-border)", background: "linear-gradient(135deg, var(--brand-light), #EEF2FF)" }}>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M13 10V3L4 14h7v7l9-11h-7z" fill="var(--brand)"/></svg>
                  <span className="text-sm font-bold text-[var(--brand)]">Skip the wait</span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-4">Get your full report <strong className="text-[var(--text-primary)]">instantly</strong>.</p>
                <button
                  type="button"
                  onClick={() => {
                    captureEvent("priority_report_clicked", { url, score, email });
                    // Send the actual report immediately via API
                    fetch("/api/send-report-now", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email, url, score, summary: leaks.map(l => `${l.category}: ${l.problem}`).join("\n"), tips: leaks.map(l => l.tip), categories: leaks.reduce((acc, l) => ({ ...acc, [l.key]: l.catScore }), {}) }),
                    }).catch(() => {});
                    onStepChange("pricing");
                  }}
                  className="cursor-pointer w-full px-6 py-3.5 rounded-xl text-base font-semibold text-white polish-hover-lift polish-focus-ring"
                  style={{ background: "linear-gradient(135deg, var(--brand), var(--primary-dim))", boxShadow: "0 4px 14px rgba(124, 58, 237, 0.25)" }}
                >
                  Get Priority Report — Instant
                </button>
                <p className="text-xs text-center mt-2 text-[var(--text-tertiary)]">Full report • Sent to your email now</p>
              </div>
              <button type="button" onClick={onClose} className="cursor-pointer text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors mt-2">
                I&apos;ll wait for the free report →
              </button>
            </div>
          )}

          {emailStep === "pricing" && (
            <div className="modal-step-enter" key="pricing-step">
              <div className="text-center mb-5">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--success-light)] border border-[var(--success-border)]">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <h3 className="text-lg font-bold mb-1 text-[var(--text-primary)]">Your fixes are on the way!</h3>
                <p className="text-sm text-[var(--text-secondary)]">Check your inbox in a few minutes.</p>
              </div>

              <div className="border-t border-[var(--border)] pt-5">
                <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">Quick question to help us build better:</p>
                <p className="text-xs text-[var(--text-secondary)] mb-4">How much would you pay for a full report with AI-written fixes?</p>

                <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">One-time report</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[{ price: "$2.99", label: "Basic" }, { price: "$4.99", label: "Standard" }, { price: "$9.99", label: "Full" }].map((opt) => (
                    <button
                      key={opt.price}
                      type="button"
                      onClick={() => {
                        captureEvent("pricing_vote", { type: "one_time", price: opt.price, url, email });
                        onStepChange("sent");
                      }}
                      className="cursor-pointer p-3 rounded-xl border border-[var(--border)] hover:border-[var(--brand)] hover:bg-[var(--brand-light)] transition-all text-center"
                    >
                      <div className="text-lg font-bold text-[var(--text-primary)]">{opt.price}</div>
                      <div className="text-xs text-[var(--text-tertiary)]">{opt.label}</div>
                    </button>
                  ))}
                </div>

                <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Monthly monitoring</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[{ price: "$19/mo", label: "Starter" }, { price: "$49/mo", label: "Growth" }, { price: "$199/mo", label: "Agency" }].map((opt) => (
                    <button
                      key={opt.price}
                      type="button"
                      onClick={() => {
                        captureEvent("pricing_vote", { type: "subscription", price: opt.price, url, email });
                        onStepChange("sent");
                      }}
                      className="cursor-pointer p-3 rounded-xl border border-[var(--border)] hover:border-[var(--brand)] hover:bg-[var(--brand-light)] transition-all text-center"
                    >
                      <div className="text-lg font-bold text-[var(--text-primary)]">{opt.price}</div>
                      <div className="text-xs text-[var(--text-tertiary)]">{opt.label}</div>
                    </button>
                  ))}
                </div>

                <button type="button" onClick={() => { captureEvent("pricing_vote", { type: "skip", url, email }); onStepChange("sent"); }} className="cursor-pointer w-full text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors py-2">
                  I wouldn&apos;t pay for this
                </button>
              </div>
            </div>
          )}

          {emailStep === "sent" && (
            <div className="text-center modal-step-enter" key="sent-step">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--success-light)] border border-[var(--success-border)]">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">Thank you!</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
                Your report has been sent. We&apos;re building premium features based on your feedback.
              </p>
              <button type="button" onClick={onClose} className="cursor-pointer px-6 py-2.5 rounded-xl text-sm font-semibold text-white polish-hover-lift" style={{ background: "linear-gradient(135deg, var(--brand), var(--primary-dim))" }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--brand)] border-t-transparent" style={{ animation: "spin 0.8s linear infinite" }} />
      </div>
    }>
      <AnalyzePageContent />
    </Suspense>
  );
}
