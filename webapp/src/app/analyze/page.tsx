"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { WarningCircleIcon, LockKeyIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import AnalysisLoader from "@/components/AnalysisLoader";
const AuthModal = dynamic(() => import("@/components/AuthModal"), { ssr: false });
import ScoreRing from "@/components/analysis/ScoreRing";
import PluginCTACard from "@/components/analysis/PluginCTACard";
import IssueCard from "@/components/analysis/IssueCard";
import CTACard from "@/components/analysis/CTACard";
import Button from "@/components/ui/Button";
import { API_URL } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { getUserFriendlyError } from "@/lib/errors";
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

  // Plan data for tier gating
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  // Credit exhaustion state (403 from POST /analyze)
  const [creditExhausted, setCreditExhausted] = useState<{
    creditsUsed: number;
    creditsLimit: number;
    plan: string;
  } | null>(null);

  // Reveal state
  const [showCard, setShowCard] = useState(false);
  const [showRevenue, setShowRevenue] = useState(false);
  const [showLeaks, setShowLeaks] = useState(false);
  const issuesRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const animatedScore = useCountUp(showCard ? (result?.score ?? 0) : 0);

  // Derive plan tier from plan data
  const planTier: PlanTier = (planData?.plan as PlanTier) ?? "free";

  // All authenticated users have full access (D-07); only anonymous users are gated
  const isAnonymous = status === "unauthenticated";

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
          if (analyzeRes.status === 429) {
            throw new Error(getUserFriendlyError(429));
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

    // --- Anonymous real scan (D-01) ---
    if (status === "unauthenticated") {
      const controller = new AbortController();
      abortRef.current = controller;

      fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (res.status === 429) throw new Error(getUserFriendlyError(429));
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error((d as { error?: string }).error || `Analysis failed (${res.status})`);
          }
          return res.json();
        })
        .then((data) => {
          setResult(parseAnalysisResponse(data as Record<string, unknown>));
          setLoading(false);
          captureEvent("anon_scan_completed", { url });
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError(err instanceof Error ? err.message : getUserFriendlyError(0));
          setLoading(false);
        });

      return () => { controller.abort(); };
    }
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

  const handleScanAnother = useCallback(() => { router.push("/"); }, [router]);

  const leaks = useMemo(
    () => result ? buildLeaks(result.categories, result.tips, result.dimensionTips) : [],
    [result]
  );

  const openIssueModal = useCallback((leak: LeakCard) => {
    if (isAnonymous) {
      setAuthModalOpen(true);
      captureEvent("locked_card_clicked", { category: leak.key, trigger: "issue_card" });
      return;
    }
    captureEvent("issue_clicked", { category: leak.key, impact: leak.impact, plan: planTier });
  }, [isAnonymous, planTier]);


  // ── Credit exhaustion screen ──
  if (creditExhausted && !loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6 anim-phase-enter">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--brand-light)] flex items-center justify-center">
            <LockKeyIcon size={28} weight="regular" color="var(--brand)" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-[var(--text-primary)] mb-2">
              Scan Limit Reached
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              You&apos;ve used all {creditExhausted.creditsUsed}/{creditExhausted.creditsLimit} scans
              this month. Upgrade your plan to keep scanning.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button
              variant="gradient"
              size="md"
              shape="pill"
              onClick={() => router.push("/pricing")}
              className="text-sm"
            >
              Join Pro Waitlist
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleScanAnother}
            >
              ← Back to Home
            </Button>
          </div>
        </div>
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
            <h1 className="font-display text-xl font-bold text-[var(--text-primary)] mb-2">Analysis Failed</h1>
            <p className="text-sm text-[var(--text-secondary)] break-words">{error}</p>
          </div>
          <Button variant="gradient" size="md" shape="pill" onClick={handleScanAnother} className="text-sm">
            Try Another URL
          </Button>
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
                <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] tracking-tight">Issues Found</h2>
                <p className="text-[var(--on-surface-variant)] text-sm sm:text-base mt-1">
                  {isAnonymous
                    ? `${leaks.length} conversion leaks identified. Sign up to see detailed fixes.`
                    : `${leaks.length} conversion leaks identified. Click any to see the details.`
                  }
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {leaks.map((leak, i) => {
                const dimAccess = isAnonymous ? "locked" as const : getDimensionAccess(planTier, leak.key);
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
              {/* CTA card for anonymous users */}
              {isAnonymous && (
                <CTACard
                  variant="full"
                  leaksCount={leaks.length}
                  animationDelay={leaks.length * 80}
                  onClick={() => {
                    setAuthModalOpen(true);
                    captureEvent("cta_card_clicked", { url, trigger: "inline_cta" });
                  }}
                  isAnonymous
                />
              )}
            </div>
          </div>
        )}

        {/* Analyze Another Page — for anonymous users (D-10: bottom banner removed) */}
        {result && showLeaks && isAnonymous && (
          <div className="flex justify-center mt-8 mb-16">
            <Button
              variant="gradient"
              size="lg"
              shape="pill"
              onClick={() => {
                setResult(null);
                router.push("/");
              }}
              className="polish-hover-lift"
            >
              Analyze Another Page
            </Button>
          </div>
        )}

        {/* Scan-another — for authenticated users */}
        {result && showLeaks && !isAnonymous && (
          <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16" style={{ animation: "fade-in-up 600ms var(--ease-out-quart) 400ms both" }}>
            <div className="text-center mt-12">
              <Button variant="gradient" size="lg" shape="card" onClick={handleScanAnother} className="polish-hover-lift">
                Analyze Another Page
              </Button>
            </div>
          </section>
        )}

        {/* AuthModal — opens in signup mode for anonymous entry points */}
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          callbackUrl={authCallbackUrl}
          initialMode="signup"
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
