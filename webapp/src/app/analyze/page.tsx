"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { WarningCircleIcon, LockKeyIcon } from "@phosphor-icons/react";
import AuthModal from "@/components/AuthModal";
import AnalysisLoader from "@/components/AnalysisLoader";
import PaywallModal from "@/components/PaywallModal";
import ScoreRing from "@/components/analysis/ScoreRing";
import RevenueLossCard from "@/components/analysis/RevenueLossCard";
import IssueCard from "@/components/analysis/IssueCard";
import CTACard from "@/components/analysis/CTACard";
import { API_URL } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { SAMPLE_SCAN } from "@/lib/sample-data";
import {
  type FreeResult,
  type LeakCard,
  type SocialProofSignals,
  captureEvent,
  calculateRevenueLoss,
  buildLeaks,
  extractDomain,
  parseAnalysisResponse,
  useCountUp,
} from "@/lib/analysis";

/* ── Plan data shape from GET /user/plan ── */
interface PlanData {
  userId: string;
  plan: string;
  creditsUsed: number;
  creditsLimit: number;
  hasCreditsRemaining: boolean;
}

function AnalyzePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const url = searchParams.get("url") || "";
  const domain = extractDomain(url);

  const { status } = useSession();

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<FreeResult | null>(null);
  const [error, setError] = useState("");
  const [isTeaser, setIsTeaser] = useState(false);

  // Plan data for tier gating
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  // Credit exhaustion state (403 from POST /analyze)
  const [creditExhausted, setCreditExhausted] = useState<{
    creditsUsed: number;
    creditsLimit: number;
    plan: string;
  } | null>(null);

  // PaywallModal state
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallLeakKey, setPaywallLeakKey] = useState<string | null>(null);

  // Reveal state
  const [showCard, setShowCard] = useState(false);
  const [showRevenue, setShowRevenue] = useState(false);
  const [showLeaks, setShowLeaks] = useState(false);
  const issuesRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const animatedScore = useCountUp(showCard ? (result?.score ?? 0) : 0);

  // Derived: shallow mode when free-tier
  const isShallow = planData?.plan === "free";

  // Session-aware analysis: teaser for anonymous, real scan for authenticated
  useEffect(() => {
    if (!url) { setError("No URL provided."); setLoading(false); return; }
    if (status === "loading") return; // wait for session to resolve

    if (status === "authenticated") {
      // 1. Fetch user plan first
      setPlanLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;

      authFetch(`${API_URL}/user/plan`, { signal: controller.signal })
        .then(async (planRes) => {
          if (planRes.ok) {
            const data = await planRes.json() as PlanData;
            setPlanData(data);
          }
          setPlanLoading(false);

          // 2. Check for cached analysis first
          setIsTeaser(false);
          const cacheRes = await fetch(
            `${API_URL}/analysis?url=${encodeURIComponent(url)}`,
            { signal: controller.signal },
          );
          if (cacheRes.ok) return cacheRes.json();

          // 3. No cache — run real analysis against backend
          const analyzeRes = await authFetch(`${API_URL}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
            signal: controller.signal,
          });
          if (analyzeRes.status === 403) {
            const errData = await analyzeRes.json().catch(() => ({})) as Record<string, unknown>;
            setCreditExhausted({
              creditsUsed: (errData.creditsUsed as number) ?? 0,
              creditsLimit: (errData.creditsLimit as number) ?? 0,
              plan: (errData.plan as string) ?? "free",
            });
            setLoading(false);
            captureEvent("credit_exhausted", { url, plan: errData.plan });
            return null;
          }
          if (!analyzeRes.ok) {
            const errData = await analyzeRes.json().catch(() => ({}));
            throw new Error((errData as { error?: string }).error || `Analysis failed (${analyzeRes.status})`);
          }
          return analyzeRes.json();
        })
        .then((data) => {
          if (!data) return;
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
    }

    // Unauthenticated: show teaser scan from SAMPLE_SCAN (no backend call)
    const timer = setTimeout(() => {
      setResult({
        score: SAMPLE_SCAN.score,
        summary: SAMPLE_SCAN.summary,
        tips: SAMPLE_SCAN.tips,
        categories: SAMPLE_SCAN.categories,
        productPrice: 0,
        productCategory: "other",
        estimatedMonthlyVisitors: 1000,
      });
      setIsTeaser(true);
      setLoading(false);
      captureEvent("teaser_scan_shown", { url });
    }, 2500);
    return () => clearTimeout(timer);
  }, [url, status]);

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

  // AuthModal state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const authCallbackUrl = `/analyze?url=${encodeURIComponent(url)}`;

  const handleSignIn = useCallback(() => {
    setAuthModalOpen(true);
  }, []);

  const handleScanAnother = useCallback(() => { router.push("/"); }, [router]);

  const closePaywall = useCallback(() => {
    setPaywallOpen(false);
    setPaywallLeakKey(null);
  }, []);

  const { lossLow, lossHigh } = result
    ? calculateRevenueLoss(result.score, result.productPrice, result.estimatedMonthlyVisitors, result.productCategory)
    : { lossLow: 0, lossHigh: 0 };
  const leaks = result ? buildLeaks(result.categories, result.tips, lossLow, lossHigh) : [];

  const openIssueModal = useCallback((leak: LeakCard) => {
    if (isTeaser) {
      handleSignIn();
      return;
    }
    if (isShallow) {
      setPaywallLeakKey(leak.key);
      setPaywallOpen(true);
      captureEvent("paywall_opened", { category: leak.key, impact: leak.impact, trigger: "issue_card" });
      return;
    }
    // Paid users: no modal from analyze page anymore (full report is visible inline)
    captureEvent("issue_clicked", { category: leak.key, impact: leak.impact });
  }, [isTeaser, isShallow, handleSignIn]);

  const openCTAModal = useCallback(() => {
    if (isTeaser) {
      handleSignIn();
      return;
    }
    if (isShallow) {
      setPaywallLeakKey(leaks[0]?.key || null);
      setPaywallOpen(true);
      captureEvent("paywall_opened", { trigger: "cta_card", url });
      return;
    }
    captureEvent("cta_card_clicked", { url });
  }, [isTeaser, isShallow, handleSignIn, leaks, url]);


  // ── Credit exhaustion screen ──
  if (creditExhausted && !loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6 anim-phase-enter">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--brand-light)] flex items-center justify-center">
            <LockKeyIcon size={28} weight="regular" color="var(--brand)" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">
              Scan Limit Reached
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              You&apos;ve used all {creditExhausted.creditsUsed}/{creditExhausted.creditsLimit} scans
              this month. Upgrade your plan to keep scanning.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                setPaywallOpen(true);
                captureEvent("paywall_opened", { trigger: "credit_exhaustion" });
              }}
              className="cursor-pointer inline-flex items-center justify-center gap-2 px-6 py-3 text-white rounded-full font-bold text-sm hover:brightness-110 transition-all"
              style={{ background: "linear-gradient(135deg, var(--brand), var(--primary-dim))" }}
            >
              Upgrade Plan
            </button>
            <button
              type="button"
              onClick={handleScanAnother}
              className="cursor-pointer text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              ← Back to Home
            </button>
          </div>
        </div>

        {/* PaywallModal for credit exhaustion upgrade */}
        <PaywallModal
          isOpen={paywallOpen}
          onClose={closePaywall}
          userId={planData?.userId ?? ""}
          analyzedUrl={url}
          leakKey={null}
        />
      </div>
    );
  }

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
      <main id="main-content" className="min-h-screen bg-[var(--bg)]" aria-busy={loading}>
        <div className="sr-only" aria-live="polite">
          {result && !loading && `Analysis complete. Score: ${result.score} out of 100. ${leaks.length} issues found.`}
        </div>
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
                <p className="text-[var(--on-surface-variant)] text-sm sm:text-base mt-1">
                  {isShallow
                    ? `${leaks.length} conversion leaks identified. Upgrade to see detailed fixes.`
                    : `${leaks.length} conversion leaks identified. Click any to see the details.`
                  }
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {leaks.map((leak, i) => (
                <IssueCard
                  key={leak.key}
                  variant="full"
                  leak={leak}
                  index={i}
                  onClick={() => openIssueModal(leak)}
                  expandable={!isTeaser && !isShallow}
                  signals={!isTeaser && !isShallow ? result?.signals : undefined}
                />
              ))}
              {(isTeaser || isShallow) && (
                <CTACard
                  variant="full"
                  leaksCount={leaks.length}
                  animationDelay={leaks.length * 70}
                  onClick={openCTAModal}
                  label={isShallow ? "Unlock Full Report" : undefined}
                  buttonLabel={isShallow ? "Upgrade Now" : undefined}
                />
              )}
            </div>
          </div>
        )}

        {/* Sign-in gate for anonymous teaser mode */}
        {result && showLeaks && isTeaser && (
          <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16" style={{ animation: "fade-in-up 600ms var(--ease-out-quart) 400ms both" }}>
            <div className="rounded-2xl p-8 sm:p-12 text-center" style={{ background: "var(--gradient-primary)" }}>
              <h2
                className="text-2xl sm:text-3xl font-extrabold text-white mb-3"
                style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
              >
                Sign in to get your real analysis
              </h2>
              <p className="text-white/80 text-sm sm:text-base mb-6 max-w-md mx-auto">
                These are sample results. Sign in to scan your actual page and get personalized fixes.
              </p>
              <button
                type="button"
                onClick={handleSignIn}
                className="cursor-pointer inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold bg-white text-[var(--primary)] polish-hover-lift polish-focus-ring hover:brightness-95 transition-all"
              >
                Sign In to Get Started
              </button>
            </div>
            <div className="text-center mt-12">
              <button type="button" onClick={handleScanAnother} className="cursor-pointer inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring" style={{ background: "var(--gradient-primary)" }}>
                Analyze Another Page
              </button>
            </div>
          </section>
        )}

        {/* Scan-another — for authenticated paid users (not shallow) */}
        {result && showLeaks && !isTeaser && !isShallow && (
          <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16" style={{ animation: "fade-in-up 600ms var(--ease-out-quart) 400ms both" }}>
            <div className="text-center mt-12">
              <button type="button" onClick={handleScanAnother} className="cursor-pointer inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring" style={{ background: "var(--gradient-primary)" }}>
                Analyze Another Page
              </button>
            </div>
          </section>
        )}

        {/* Shallow mode: upgrade CTA instead of FeaturedInsight */}
        {result && showLeaks && !isTeaser && isShallow && (
          <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16" style={{ animation: "fade-in-up 600ms var(--ease-out-quart) 400ms both" }}>
            <div className="rounded-2xl p-8 sm:p-12 text-center border border-[var(--border)]" style={{ background: "var(--surface)" }}>
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--brand-light)] border border-[var(--brand-border)]">
                <LockKeyIcon size={28} weight="regular" color="var(--brand)" />
              </div>
              <h2
                className="text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] mb-3"
                style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
              >
                Unlock Detailed Fixes
              </h2>
              <p className="text-[var(--on-surface-variant)] text-sm sm:text-base mb-6 max-w-md mx-auto">
                You&apos;re seeing a preview. Upgrade to get step-by-step fixes, actionable recommendations, and full reports for every issue.
              </p>
              <button
                type="button"
                onClick={() => {
                  setPaywallOpen(true);
                  setPaywallLeakKey(null);
                  captureEvent("paywall_opened", { trigger: "shallow_upgrade_cta" });
                }}
                className="cursor-pointer inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring hover:brightness-110 transition-all"
                style={{ background: "linear-gradient(135deg, var(--brand), var(--primary-dim))" }}
              >
                Upgrade to Full Report
              </button>
            </div>
            <div className="text-center mt-12">
              <button type="button" onClick={handleScanAnother} className="cursor-pointer inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring" style={{ background: "var(--gradient-primary)" }}>
                Analyze Another Page
              </button>
            </div>
          </section>
        )}

        {/* PaywallModal — for shallow mode and credit exhaustion */}
        <PaywallModal
          isOpen={paywallOpen}
          onClose={closePaywall}
          userId={planData?.userId ?? ""}
          analyzedUrl={url}
          leakKey={paywallLeakKey}
        />

        {/* AuthModal for teaser sign-in */}
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          callbackUrl={authCallbackUrl}
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
