"use client";

import { useState, useEffect, useRef } from "react";
import {
  ArrowsClockwiseIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import {
  type FreeResult,
  type CompetitorResult,
  type LeakCard,
  useCountUp,
  captureEvent,
} from "@/lib/analysis";
import CompetitorComparison from "@/components/CompetitorComparison";
import CompetitorLoader from "@/components/CompetitorLoader";
import ScoreRing from "@/components/analysis/ScoreRing";
import RevenueLossCard from "@/components/analysis/RevenueLossCard";
import IssueCard from "@/components/analysis/IssueCard";
import CTACard from "@/components/analysis/CTACard";
import FeaturedInsight from "@/components/analysis/FeaturedInsight";

/* ══════════════════════════════════════════════════════════════
   AnalysisResults — Complete results display for right-pane
   ══════════════════════════════════════════════════════════════ */

interface AnalysisResultsProps {
  result: FreeResult;
  leaks: LeakCard[];
  lossLow: number;
  lossHigh: number;
  domain: string;
  url: string;
  onIssueClick: (key: string) => void;
  onAnalyzeAgain: () => void;
  onFetchCompetitors: () => void;
  competitorLoading: boolean;
  competitorResult: CompetitorResult | null;
  competitorError: string;
  onRetryCompetitors: () => void;
  onBeatCompetitor: (name: string) => void;
}

export default function AnalysisResults({
  result,
  leaks,
  lossLow,
  lossHigh,
  domain,
  url,
  onIssueClick,
  onAnalyzeAgain,
  onFetchCompetitors,
  competitorLoading,
  competitorResult,
  competitorError,
  onRetryCompetitors,
  onBeatCompetitor,
}: AnalysisResultsProps) {
  /* ── Staggered reveal ── */
  const [showCard, setShowCard] = useState(false);
  const [showRevenue, setShowRevenue] = useState(false);
  const [showLeaks, setShowLeaks] = useState(false);
  const issuesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowCard(true);
    const t1 = setTimeout(() => setShowRevenue(true), 1500);
    const t2 = setTimeout(() => setShowLeaks(true), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const animatedScore = useCountUp(showCard ? result.score : 0);

  return (
    <div className="space-y-8">
      {/* ═══ SCORE RING + REVENUE SUMMARY ═══ */}
      {showCard && (
        <section style={{ animation: "fade-in-up 600ms var(--ease-out-quart) both" }}>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
            <ScoreRing
              score={result.score}
              animatedScore={animatedScore}
              domain={domain || url}
              summary={result.summary}
              categories={result.categories}
              leaksCount={leaks.length}
            />

            {showRevenue && (
              <RevenueLossCard
                lossLow={lossLow}
                lossHigh={lossHigh}
                onViewBreakdown={() => issuesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              />
            )}
          </div>
        </section>
      )}

      {/* ═══ COMPETITOR LOADER ═══ */}
      {showLeaks && competitorLoading && (
        <div style={{ animation: "fade-in-up 300ms ease-out both" }}>
          <CompetitorLoader url={url} />
        </div>
      )}

      {/* ═══ COMPETITOR ERROR ═══ */}
      {showLeaks && competitorError && (
        <div style={{ animation: "fade-in-up 300ms ease-out both" }}>
          <div className="p-5 rounded-2xl bg-[var(--error-light)] border border-red-200">
            <div className="flex items-center gap-4">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <WarningCircleIcon size={20} weight="regular" color="var(--error)" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--error-text)]">{competitorError}</p>
              </div>
              <button
                type="button"
                onClick={onRetryCompetitors}
                className="cursor-pointer shrink-0 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:scale-105 transition-transform"
                style={{ background: "var(--gradient-primary)" }}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ COMPETITOR RESULTS ═══ */}
      {showLeaks && competitorResult && (
        <div>
          {competitorResult.competitors.length > 0 ? (
            <CompetitorComparison
              competitors={competitorResult.competitors}
              userCategories={result.categories}
              userScore={result.score}
              onBeatCompetitor={onBeatCompetitor}
            />
          ) : (
            <CompetitorComparison
              competitors={[]}
              userCategories={result.categories}
              userScore={result.score}
            />
          )}
        </div>
      )}

      {/* ═══ ISSUES BENTO GRID — 2-column for pane context ═══ */}
      {showLeaks && (
        <div ref={issuesRef}>
          {/* Section header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-8">
            <div className="border-l-[3px] border-[var(--brand)] pl-5">
              <h2
                className="text-xl sm:text-2xl font-extrabold text-[var(--on-surface)] tracking-tight"
                style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
              >
                Issues Found
              </h2>
              <p className="text-[var(--on-surface-variant)] text-sm mt-1">
                {leaks.length} conversion leaks identified. Click any to get the fix.
              </p>
            </div>
          </div>

          {/* Bento Grid — 2-col for pane, not 3-col */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {leaks.map((leak, i) => (
              <IssueCard
                key={leak.key}
                leak={leak}
                index={i}
                onClick={() => {
                  onIssueClick(leak.key);
                  captureEvent("issue_clicked", { category: leak.key, impact: leak.impact });
                }}
              />
            ))}

            {/* CTA Card — last position */}
            <CTACard
              leaksCount={leaks.length}
              animationDelay={leaks.length * 70}
              onClick={() => {
                onIssueClick(leaks[0]?.key || "");
                captureEvent("cta_card_clicked", { url });
              }}
            />
          </div>
        </div>
      )}

      {/* ═══ FEATURED INSIGHT ═══ */}
      {showLeaks && (
        <section style={{ animation: "fade-in-up 600ms var(--ease-out-quart) 400ms both" }}>
          <FeaturedInsight
            leaks={leaks}
            summary={result.summary}
            onInsightClick={() => { if (leaks[0]) onIssueClick(leaks[0].key); }}
          />

          {/* Analyze again CTA */}
          <div className="text-center mt-8">
            <button
              type="button"
              onClick={onAnalyzeAgain}
              className="cursor-pointer inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring"
              style={{ background: "var(--gradient-primary)" }}
            >
              <ArrowsClockwiseIcon size={16} weight="bold" />
              Analyze Again
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
