"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  WarningCircleIcon,
  TrendUpIcon,
  PlusSquareIcon,
  CaretRightIcon,
  StarIcon,
  ArrowRightIcon,
  XIcon,
  CheckCircleIcon,
  LightningIcon,
} from "@phosphor-icons/react";
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
  CATEGORY_SVG,
} from "@/lib/analysis";

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
            <WarningCircleIcon size={28} weight="regular" color="var(--error)" />
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
      <nav className="fixed top-0 w-full z-50 backdrop-blur-xl" style={{ background: "color-mix(in srgb, var(--nav-bg) 80%, transparent)", boxShadow: "var(--nav-shadow)" }} aria-label="Main navigation">
        <div className="flex justify-between items-center w-full px-4 sm:px-8 py-4 max-w-screen-2xl mx-auto">
          <a href="/" className="text-2xl font-black tracking-tighter" style={{ color: "var(--nav-logo)", fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>alpo.ai</a>
          <button
            type="button"
            onClick={handleScanAnother}
            className="cursor-pointer primary-gradient text-white px-6 py-2 rounded-full font-bold hover:scale-105 active:scale-95 transition-all text-sm"
          >
            {result ? "Scan Another" : "Analyzing..."}
          </button>
        </div>
      </nav>

      <main id="main-content" className="min-h-screen bg-[var(--bg)]" aria-busy={loading}>
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
                  style={{ boxShadow: "var(--shadow-subtle)" }}
                >

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
                        <div className="text-lg font-bold text-[var(--on-surface)]" style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(Object.values(result.categories).reduce((a, b) => a + b, 0) / Math.max(Object.values(result.categories).length, 1))}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Revenue Loss Card */}
                {showRevenue && (
                  <div
                    className="md:col-span-4 p-8 rounded-3xl text-white flex flex-col justify-between"
                    style={{ background: "var(--gradient-error)", boxShadow: "var(--shadow-error)", animation: "fade-in-up 500ms var(--ease-out-quart) both" }}
                  >
                    <div className="space-y-2">
                      <TrendUpIcon size={32} weight="regular" color="white" className="opacity-50" />
                      <h3 className="text-base sm:text-lg font-semibold opacity-80 leading-tight">Estimated Monthly Revenue Loss for This Product</h3>
                    </div>
                    <div className="space-y-1 my-6">
                      <div className="font-extrabold tracking-tighter" style={{ fontSize: "clamp(28px, 5vw, 44px)", fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
                        -${lossLow.toLocaleString()}&ndash;${lossHigh.toLocaleString()}
                      </div>
                      <p className="text-sm font-medium opacity-70">Based on estimated traffic to this product</p>
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
                style={{ background: "var(--gradient-dark-cta)", animation: `fade-in-up 400ms ease-out ${leaks.length * 70}ms both` }}
              >
                <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "linear-gradient(var(--brand) 1px, transparent 1px), linear-gradient(90deg, var(--brand) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                <div className="relative z-10 space-y-4">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
                    <PlusSquareIcon size={24} weight="regular" color="white" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-extrabold" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>Get All Fixes</h3>
                  <p className="text-white/60 text-sm max-w-[200px] mx-auto leading-relaxed">Step-by-step recommendations for all {leaks.length} issues.</p>
                  <span className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-white text-[var(--on-surface)] rounded-full font-bold text-sm group-hover:scale-105 transition-transform">
                    Get Free Report
                    <CaretRightIcon className="w-4 h-4" weight="bold" />
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
                    <StarIcon size={14} weight="fill" color="var(--brand)" />
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
                    <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" weight="bold" />
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
            </div>

            <div className="text-center mt-12">
              <button type="button" onClick={handleScanAnother} className="cursor-pointer inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring" style={{ background: "var(--gradient-primary)" }}>
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
      className="cursor-pointer group text-left bg-[var(--surface)] rounded-[1.5rem] p-6 sm:p-7 flex flex-col justify-between border border-[var(--outline-variant)]/20 hover:border-[var(--brand)]/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)]"
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
        <CaretRightIcon className="w-5 h-5 text-[var(--on-surface-variant)] group-hover:text-[var(--brand)] group-hover:translate-x-1 transition-all duration-200" weight="bold" />
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
      style={{ backgroundColor: "var(--overlay-backdrop)", backdropFilter: "blur(4px)" }}
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
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        <div className="h-1 w-full" style={{ background: "var(--gradient-primary)" }} />
        <button type="button" onClick={onClose} className="cursor-pointer absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" aria-label="Close">
          <XIcon size={16} weight="bold" />
        </button>

        <div className="p-6 sm:p-8">
          {emailStep === "form" && (
            <div key="form-step">
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--brand-light)] border border-[var(--brand-border)]">
                  <PlusSquareIcon size={28} weight="regular" color="var(--brand)" />
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
                <button type="submit" disabled={emailSubmitting} className="cursor-pointer w-full px-6 py-3.5 rounded-xl text-base font-semibold text-white polish-hover-lift polish-focus-ring disabled:opacity-50" style={{ background: emailSubmitting ? "var(--text-tertiary)" : "linear-gradient(135deg, var(--brand), var(--primary-dim))" }}>
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
                <CheckCircleIcon size={28} weight="regular" color="var(--success)" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">You&apos;re in the Queue!</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
                Your detailed report will arrive within <strong className="text-[var(--text-primary)]">48 hours</strong>.
              </p>
              <div className="p-5 rounded-2xl border-2 border-dashed mb-4" style={{ borderColor: "var(--brand-border)", background: "linear-gradient(135deg, var(--brand-light), var(--surface-brand-tint))" }}>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <LightningIcon size={18} weight="fill" color="var(--brand)" />
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
                  style={{ background: "linear-gradient(135deg, var(--brand), var(--primary-dim))" }}
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
                  <CheckCircleIcon size={28} weight="regular" color="var(--success)" />
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
                <CheckCircleIcon size={28} weight="regular" color="var(--success)" />
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
