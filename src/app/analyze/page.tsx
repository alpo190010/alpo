"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WarningCircleIcon } from "@phosphor-icons/react";
import AnalysisLoader from "@/components/AnalysisLoader";
import Nav from "@/components/Nav";
import EmailModal from "@/components/EmailModal";
import ScoreRing from "@/components/analysis/ScoreRing";
import RevenueLossCard from "@/components/analysis/RevenueLossCard";
import IssueCard from "@/components/analysis/IssueCard";
import CTACard from "@/components/analysis/CTACard";
import FeaturedInsight from "@/components/analysis/FeaturedInsight";
import {
  type FreeResult,
  type LeakCard,
  captureEvent,
  calculateRevenueLoss,
  buildLeaks,
  extractDomain,
  parseAnalysisResponse,
  useCountUp,
} from "@/lib/analysis";

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

  // Reveal state
  const [showCard, setShowCard] = useState(false);
  const [showRevenue, setShowRevenue] = useState(false);
  const [showLeaks, setShowLeaks] = useState(false);
  const issuesRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const animatedScore = useCountUp(showCard ? (result?.score ?? 0) : 0);

  // Run analysis on mount
  useEffect(() => {
    if (!url) { setError("No URL provided."); setLoading(false); return; }
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
          email: email.trim(), url, score: result?.score,
          summary: result?.summary, tips: result?.tips,
          categories: result?.categories, competitorName: competitorCTAName,
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
    setSelectedLeak(null);
    setCompetitorCTAName(null);
    setEmailStep(null);
  }, []);

  const handleScanAnother = useCallback(() => { router.push("/"); }, [router]);

  const { lossLow, lossHigh } = result
    ? calculateRevenueLoss(result.score, result.productPrice, result.estimatedMonthlyVisitors, result.productCategory)
    : { lossLow: 0, lossHigh: 0 };
  const leaks = result ? buildLeaks(result.categories, result.tips, lossLow, lossHigh) : [];

  const openIssueModal = useCallback((leak: LeakCard) => {
    setSelectedLeak(leak.key);
    setEmailStep("form");
    setEmailError("");
    captureEvent("issue_clicked", { category: leak.key, impact: leak.impact });
  }, []);

  const openCTAModal = useCallback(() => {
    setSelectedLeak(leaks[0]?.key || null);
    setEmailStep("form");
    setEmailError("");
    captureEvent("cta_card_clicked", { url });
  }, [leaks, url]);

  const openInsightModal = useCallback(() => {
    if (leaks[0]) { setSelectedLeak(leaks[0].key); setEmailStep("form"); setEmailError(""); }
  }, [leaks]);

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
          <button type="button" onClick={handleScanAnother} className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 primary-gradient text-white rounded-full font-bold text-sm hover:brightness-110 transition-all">
            Try Another URL
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Nav logoText="alpo.ai">
        <button type="button" onClick={handleScanAnother} className="cursor-pointer primary-gradient text-white px-6 py-2 rounded-full font-bold hover:scale-105 active:scale-95 transition-all text-sm">
          {result ? "Scan Another" : "Analyzing..."}
        </button>
      </Nav>

      <main id="main-content" className="min-h-screen bg-[var(--bg)]" aria-busy={loading}>
        {loading && (
          <div className="anim-phase-enter"><AnalysisLoader url={url} /></div>
        )}

        {result && showCard && (
          <section className="pt-24 sm:pt-28 pb-8" style={{ animation: "fade-in-up 600ms var(--ease-out-quart) both" }}>
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
                <ScoreRing variant="full" score={result.score} animatedScore={animatedScore} domain={domain || url} summary={result.summary} categories={result.categories} leaksCount={leaks.length} />
                {showRevenue && (
                  <RevenueLossCard variant="full" lossLow={lossLow} lossHigh={lossHigh} onViewBreakdown={() => issuesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
                )}
              </div>
            </div>
          </section>
        )}

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
                <IssueCard key={leak.key} variant="full" leak={leak} index={i} onClick={() => openIssueModal(leak)} />
              ))}
              <CTACard variant="full" leaksCount={leaks.length} animationDelay={leaks.length * 70} onClick={openCTAModal} />
            </div>
          </div>
        )}

        {result && showLeaks && (
          <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16" style={{ animation: "fade-in-up 600ms var(--ease-out-quart) 400ms both" }}>
            <FeaturedInsight variant="full" leaks={leaks} summary={result.summary} onInsightClick={openInsightModal} />
            <div className="text-center mt-12">
              <button type="button" onClick={handleScanAnother} className="cursor-pointer inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring" style={{ background: "var(--gradient-primary)" }}>
                Analyze Another Page
              </button>
            </div>
          </section>
        )}

        <EmailModal
          isOpen={!!(selectedLeak || competitorCTAName) && !!emailStep}
          emailStep={emailStep}
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
      </main>
    </>
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
