"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { WarningCircleIcon, LockKeyIcon } from "@phosphor-icons/react";
import AuthModal from "@/components/AuthModal";
import AnalysisLoader from "@/components/AnalysisLoader";
import PaywallModal from "@/components/PaywallModal";
import ScoreRing from "@/components/analysis/ScoreRing";
import PluginCTACard from "@/components/analysis/PluginCTACard";
import IssueCard from "@/components/analysis/IssueCard";
import CTACard from "@/components/analysis/CTACard";
import { API_URL } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { getUserFriendlyError } from "@/lib/errors";
import { SAMPLE_SCAN } from "@/lib/sample-data";
import {
  type FreeResult,
  type LeakCard,
  type PlanTier,
  captureEvent,
  buildLeaks,
  extractDomain,
  parseAnalysisResponse,
  calculateDollarLossPerThousand,
  useCountUp,
  getDimensionAccess,
  STARTER_DIMENSIONS,
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

  // Derive plan tier from plan data
  const planTier: PlanTier = (planData?.plan as PlanTier) ?? "free";

  // Derived: shallow mode when free-tier
  const isShallow = planTier === "free";

  // Whether user has full access (growth/pro see all dimensions unlocked)
  const hasFullAccess = planTier === "growth" || planTier === "pro";

  // Starter tier: partial access (7 of 18 dimensions)
  const isStarter = planTier === "starter";

  // How many dimensions are unlocked for the current tier
  const unlockedCount = hasFullAccess ? 18 : isStarter ? STARTER_DIMENSIONS.size : 0;

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
          if ((data as Record<string, unknown>).timings) {
            console.log("[analyze timings]", (data as Record<string, unknown>).timings);
          }
          setResult(parseAnalysisResponse(data as Record<string, unknown>));
          setLoading(false);
          captureEvent("scan_completed", { url, score: (data as Record<string, unknown>).score });
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError(err instanceof Error ? err.message : getUserFriendlyError(0));
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
        productPrice: SAMPLE_SCAN.productPrice,
        productCategory: SAMPLE_SCAN.productCategory,
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

  const leaks = result ? buildLeaks(result.categories, result.tips, result.dimensionTips) : [];

  const openIssueModal = useCallback((leak: LeakCard) => {
    if (isTeaser) {
      handleSignIn();
      return;
    }
    // Per-dimension gating: check if this specific dimension is locked for the user's plan
    const access = getDimensionAccess(planTier, leak.key);
    if (access === "locked") {
      setPaywallLeakKey(leak.key);
      setPaywallOpen(true);
      captureEvent("paywall_opened", { category: leak.key, impact: leak.impact, trigger: "issue_card", plan: planTier });
      return;
    }
    // Unlocked dimension: card is expandable inline, no modal needed
    captureEvent("issue_clicked", { category: leak.key, impact: leak.impact, plan: planTier });
  }, [isTeaser, planTier, handleSignIn]);

  const openCTAModal = useCallback(() => {
    if (isTeaser) {
      handleSignIn();
      return;
    }
    // Both free and starter users see upgrade CTAs
    if (!hasFullAccess) {
      setPaywallLeakKey(leaks[0]?.key || null);
      setPaywallOpen(true);
      captureEvent("paywall_opened", { trigger: "cta_card", url, plan: planTier });
      return;
    }
    captureEvent("cta_card_clicked", { url });
  }, [isTeaser, hasFullAccess, handleSignIn, leaks, url, planTier]);


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
          userPlan={planTier}
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
                  <PluginCTACard
                    variant="full"
                    dollarLoss={calculateDollarLossPerThousand(result.categories, result.productPrice, result.productCategory)}
                    onViewBreakdown={() => issuesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  />
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
                    ? `${leaks.length} conversion leaks identified. Subscribe to see detailed fixes.`
                    : isStarter
                      ? `${leaks.length} conversion leaks identified. ${unlockedCount} dimensions unlocked — upgrade to access all ${leaks.length}.`
                      : `${leaks.length} conversion leaks identified. Click any to see the details.`
                  }
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {leaks.map((leak, i) => {
                const dimAccess = isTeaser ? "locked" as const : getDimensionAccess(planTier, leak.key);
                const isUnlocked = dimAccess === "unlocked";
                return (
                  <IssueCard
                    key={leak.key}
                    variant="full"
                    leak={leak}
                    index={i}
                    onClick={() => openIssueModal(leak)}
                    expandable={isUnlocked}
                    locked={!isUnlocked}
                    signals={isUnlocked ? result?.signals : undefined}
                  />
                );
              })}
              {/* CTA card for free, starter, and teaser users */}
              {(isTeaser || !hasFullAccess) && (
                <CTACard
                  variant="full"
                  leaksCount={leaks.length}
                  animationDelay={leaks.length * 70}
                  onClick={openCTAModal}
                  label={
                    isTeaser ? undefined
                    : isShallow ? "Get All Fixes"
                    : isStarter ? "Unlock All Dimensions"
                    : undefined
                  }
                  buttonLabel={
                    isTeaser ? undefined
                    : isShallow ? "Subscribe Now"
                    : isStarter ? "Upgrade Now"
                    : undefined
                  }
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

        {/* Free tier: subscribe CTA */}
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
                Subscribe to Get Fixes
              </h2>
              <p className="text-[var(--on-surface-variant)] text-sm sm:text-base mb-6 max-w-md mx-auto">
                You&apos;re on the free plan. Subscribe to unlock step-by-step fixes, actionable recommendations, and full reports for every issue.
              </p>
              <button
                type="button"
                onClick={() => {
                  setPaywallOpen(true);
                  setPaywallLeakKey(null);
                  captureEvent("paywall_opened", { trigger: "free_subscribe_cta", plan: planTier });
                }}
                className="cursor-pointer inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring hover:brightness-110 transition-all"
                style={{ background: "linear-gradient(135deg, var(--brand), var(--primary-dim))" }}
              >
                Subscribe Now
              </button>
            </div>
            <div className="text-center mt-12">
              <button type="button" onClick={handleScanAnother} className="cursor-pointer inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring" style={{ background: "var(--gradient-primary)" }}>
                Analyze Another Page
              </button>
            </div>
          </section>
        )}

        {/* Starter tier: upgrade CTA to unlock remaining dimensions */}
        {result && showLeaks && !isTeaser && isStarter && (
          <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16" style={{ animation: "fade-in-up 600ms var(--ease-out-quart) 400ms both" }}>
            <div className="rounded-2xl p-8 sm:p-12 text-center border border-[var(--border)]" style={{ background: "var(--surface)" }}>
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--brand-light)] border border-[var(--brand-border)]">
                <LockKeyIcon size={28} weight="regular" color="var(--brand)" />
              </div>
              <h2
                className="text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] mb-3"
                style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
              >
                Unlock All {leaks.length} Dimensions
              </h2>
              <p className="text-[var(--on-surface-variant)] text-sm sm:text-base mb-6 max-w-md mx-auto">
                You&apos;re on Starter with {unlockedCount} dimensions unlocked. Upgrade to Growth to access detailed fixes for all {leaks.length} conversion dimensions.
              </p>
              <button
                type="button"
                onClick={() => {
                  setPaywallOpen(true);
                  setPaywallLeakKey(null);
                  captureEvent("paywall_opened", { trigger: "starter_upgrade_cta", plan: planTier });
                }}
                className="cursor-pointer inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring hover:brightness-110 transition-all"
                style={{ background: "linear-gradient(135deg, var(--brand), var(--primary-dim))" }}
              >
                Upgrade to Growth
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
          userPlan={planTier}
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
