"use client";

import { useState, useEffect, useRef } from "react";
import {
  ArrowsClockwiseIcon,
  TrendUpIcon,
  WarningCircleIcon,
  CaretRightIcon,
  PlusSquareIcon,
  StarIcon,
  ArrowRightIcon,
} from "@phosphor-icons/react";
import {
  type FreeResult,
  type CompetitorResult,
  type LeakCard,
  scoreColor,
  scoreColorText,
  scoreColorTintBg,
  useCountUp,
  CATEGORY_SVG,
  captureEvent,
} from "@/lib/analysis";
import CompetitorComparison from "@/components/CompetitorComparison";
import CompetitorLoader from "@/components/CompetitorLoader";

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
  onReanalyze?: () => void;
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
  onReanalyze,
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

            {/* ── Score Ring + Domain Info ── */}
            <div
              className="md:col-span-7 bg-[var(--surface)] rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-center gap-6 sm:gap-8 relative overflow-hidden"
              style={{ boxShadow: "var(--shadow-subtle)" }}
            >

              {/* Score ring */}
              <div className="relative shrink-0">
                <svg
                  className="w-36 h-36 sm:w-40 sm:h-40"
                  viewBox="0 0 192 192"
                  style={{ transform: "rotate(-90deg)" }}
                  aria-hidden="true"
                >
                  <circle
                    cx="96" cy="96" r="88"
                    fill="transparent"
                    stroke="var(--surface-container)"
                    strokeWidth="10"
                  />
                  <circle
                    cx="96" cy="96" r="88"
                    fill="transparent"
                    stroke={scoreColor(result.score)}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray="553"
                    strokeDashoffset={553 - (553 * animatedScore / 100)}
                    className="score-ring-progress"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span
                    className="font-extrabold text-[var(--on-surface)]"
                    style={{
                      fontSize: "clamp(36px, 6vw, 48px)",
                      fontFamily: "var(--font-manrope), Manrope, sans-serif",
                      lineHeight: 1,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {animatedScore}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--on-surface-variant)] opacity-50 mt-1">
                    Score
                  </span>
                </div>
              </div>

              {/* Domain + context */}
              <div className="space-y-3 text-center md:text-left relative z-10">
                <div>
                  <span
                    className="inline-block px-3 py-1.5 rounded-full text-xs font-bold mb-3 uppercase tracking-wider"
                    style={{
                      backgroundColor: scoreColorTintBg(result.score),
                      color: scoreColorText(result.score),
                    }}
                  >
                    {result.score >= 80
                      ? "Excellent"
                      : result.score >= 60
                      ? "Above Average"
                      : result.score >= 40
                      ? "Needs Improvement"
                      : "Critical Issues Found"}
                  </span>
                  <h2
                    className="text-xl sm:text-2xl font-extrabold text-[var(--on-surface)] tracking-tight"
                    style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
                  >
                    {domain || url}
                  </h2>
                </div>
                <p className="text-[var(--on-surface-variant)] max-w-md text-sm leading-relaxed">
                  {result.summary}
                </p>
                <div className="flex gap-3 pt-1 justify-center md:justify-start">
                  <div className="px-3 py-2 bg-[var(--surface-container-low)] rounded-xl">
                    <div className="text-[9px] text-[var(--on-surface-variant)] uppercase font-bold tracking-[0.15em]">
                      Issues
                    </div>
                    <div
                      className="text-lg font-bold text-[var(--on-surface)]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {leaks.length}
                    </div>
                  </div>
                  <div className="px-3 py-2 bg-[var(--surface-container-low)] rounded-xl">
                    <div className="text-[9px] text-[var(--on-surface-variant)] uppercase font-bold tracking-[0.15em]">
                      Avg Score
                    </div>
                    <div
                      className="text-lg font-bold text-[var(--on-surface)]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {Math.round(Object.values(result.categories).reduce((a, b) => a + b, 0) / Math.max(Object.values(result.categories).length, 1))}
                    </div>
                  </div>
                </div>

                {onReanalyze && (
                  <button
                    type="button"
                    onClick={onReanalyze}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors text-[var(--on-surface-variant)] bg-[var(--surface-container-low)] border border-[var(--border)] hover:bg-[var(--surface-container)] hover:text-[var(--on-surface)] focus-visible:bg-[var(--surface-container)] focus-visible:text-[var(--on-surface)]"
                  >
                    <ArrowsClockwiseIcon size={14} weight="bold" />
                    Re-analyze
                  </button>
                )}
              </div>
            </div>

            {/* ── Revenue Loss Card ── */}
            {showRevenue && (
              <div
                className="md:col-span-5 p-6 sm:p-8 rounded-3xl text-white flex flex-col justify-between"
                style={{
                  background: "var(--gradient-error)",
                  boxShadow: "var(--shadow-error)",
                  animation: "fade-in-up 500ms var(--ease-out-quart) both",
                }}
              >
                <div className="space-y-2">
                  <TrendUpIcon size={28} weight="regular" color="white" className="opacity-50" />
                  <h3 className="text-sm sm:text-base font-semibold opacity-80 leading-tight">
                    Estimated Monthly Revenue Loss for This Product
                  </h3>
                </div>
                <div className="space-y-1 my-4">
                  <div
                    className="font-extrabold tracking-tighter"
                    style={{
                      fontSize: "clamp(24px, 4vw, 36px)",
                      fontFamily: "var(--font-manrope), Manrope, sans-serif",
                    }}
                  >
                    -${lossLow.toLocaleString()}&ndash;${lossHigh.toLocaleString()}
                  </div>
                  <p className="text-sm font-medium opacity-70">Based on estimated traffic to this product</p>
                </div>
                <button
                  type="button"
                  onClick={() => issuesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="cursor-pointer w-full py-2.5 bg-white/10 backdrop-blur-md rounded-xl font-bold border border-white/20 hover:bg-white/20 transition-all text-sm"
                >
                  View Issue Breakdown &darr;
                </button>
              </div>
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
            {leaks.map((leak, i) => {
              const style = {
                HIGH: { textColor: "var(--error-text)" },
                MED: { textColor: "var(--warning-text)" },
                LOW: { textColor: "var(--success-text)" },
              }[leak.impact as "HIGH" | "MED" | "LOW"];

              return (
                <button
                  key={leak.key}
                  type="button"
                  onClick={() => {
                    onIssueClick(leak.key);
                    captureEvent("issue_clicked", { category: leak.key, impact: leak.impact });
                  }}
                  className="cursor-pointer group text-left bg-[var(--surface)] rounded-[1.5rem] p-5 sm:p-6 flex flex-col justify-between border border-[var(--outline-variant)]/20 hover:border-[var(--brand)]/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)]"
                  style={{
                    boxShadow: "var(--shadow-subtle)",
                    animation: `fade-in-up 400ms ease-out ${i * 70}ms both`,
                  }}
                >
                  <div className="space-y-4">
                    {/* Icon + Score */}
                    <div className="flex justify-between items-start">
                      <div className="w-11 h-11 bg-[var(--surface-container-high)] rounded-2xl flex items-center justify-center text-[var(--on-surface-variant)] group-hover:text-[var(--brand)] group-hover:scale-110 transition-all duration-300">
                        {CATEGORY_SVG[leak.key] || CATEGORY_SVG.title}
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] font-bold text-[var(--on-surface-variant)] tracking-[0.15em] uppercase">
                          Score
                        </div>
                        <div
                          className="text-xl font-extrabold"
                          style={{ color: style.textColor, fontVariantNumeric: "tabular-nums" }}
                        >
                          {leak.catScore}<span className="text-xs font-semibold opacity-50">/100</span>
                        </div>
                      </div>
                    </div>

                    {/* Category + Problem */}
                    <div className="space-y-2">
                      <h3 className="text-base sm:text-lg font-bold text-[var(--on-surface)] tracking-tight leading-snug">
                        {leak.category}
                      </h3>
                      <p className="text-sm text-[var(--on-surface-variant)] leading-relaxed line-clamp-3">
                        {leak.problem}
                      </p>
                    </div>
                  </div>

                  {/* Bottom: Revenue + Arrow */}
                  <div className="mt-5 pt-4 border-t border-[var(--surface-container)] flex justify-between items-center">
                    <div>
                      <div className="text-[9px] font-bold text-[var(--on-surface-variant)] uppercase tracking-[0.15em]">
                        Potential Gain
                      </div>
                      <div className="text-base font-extrabold text-[var(--brand)]">
                        {leak.revenue}
                      </div>
                    </div>
                    <CaretRightIcon
                      className="w-5 h-5 text-[var(--on-surface-variant)] group-hover:text-[var(--brand)] group-hover:translate-x-1 transition-all duration-200"
                      weight="bold"
                    />
                  </div>
                </button>
              );
            })}

            {/* CTA Card — last position */}
            <button
              type="button"
              onClick={() => {
                onIssueClick(leaks[0]?.key || "");
                captureEvent("cta_card_clicked", { url });
              }}
              className="cursor-pointer group relative rounded-[1.5rem] p-6 flex flex-col items-center justify-center text-center overflow-hidden text-white min-h-[240px]"
              style={{
                background: "linear-gradient(135deg, var(--on-surface) 0%, var(--primary-dim) 100%)",
                animation: `fade-in-up 400ms ease-out ${leaks.length * 70}ms both`,
              }}
            >
              {/* Subtle grid pattern overlay */}
              <div
                className="absolute inset-0 opacity-[0.04] pointer-events-none"
                style={{
                  backgroundImage: "linear-gradient(var(--brand) 1px, transparent 1px), linear-gradient(90deg, var(--brand) 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                }}
              />
              <div className="relative z-10 space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
                  <PlusSquareIcon size={22} weight="regular" color="white" />
                </div>
                <h3
                  className="text-lg sm:text-xl font-extrabold"
                  style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
                >
                  Get All Fixes
                </h3>
                <p className="text-white/60 text-sm max-w-[200px] mx-auto leading-relaxed">
                  Step-by-step recommendations for all {leaks.length} issues, sent to your inbox.
                </p>
                <span className="inline-flex items-center gap-1.5 px-5 py-2 bg-white text-[var(--on-surface)] rounded-full font-bold text-sm group-hover:scale-105 transition-transform">
                  Get Free Report
                  <CaretRightIcon className="w-4 h-4" weight="bold" />
                </span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ═══ FEATURED INSIGHT ═══ */}
      {showLeaks && (
        <section style={{ animation: "fade-in-up 600ms var(--ease-out-quart) 400ms both" }}>
          <div className="bg-[var(--surface-container-low)] rounded-3xl p-6 sm:p-10 relative overflow-hidden">
            <div className="grid md:grid-cols-2 gap-8 items-center relative z-10">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold bg-[var(--brand-light)] text-[var(--brand)] border border-[var(--brand-border)]">
                  <StarIcon size={14} weight="fill" color="var(--brand)" />
                  Top Insight
                </div>
                <h2
                  className="text-xl sm:text-2xl font-extrabold text-[var(--on-surface)] tracking-tight leading-tight"
                  style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
                >
                  {leaks[0]
                    ? `Your "${leaks[0].category}" score of ${leaks[0].catScore} is the #1 revenue blocker.`
                    : "Critical improvements identified."}
                </h2>
                <p className="text-[var(--on-surface-variant)] text-sm leading-relaxed max-w-lg">
                  {leaks[0]?.tip || result.summary}
                </p>
                <button
                  type="button"
                  onClick={() => { if (leaks[0]) onIssueClick(leaks[0].key); }}
                  className="cursor-pointer group inline-flex items-center gap-2 text-[var(--brand)] font-bold text-sm"
                >
                  Get the detailed fix
                  <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" weight="bold" />
                </button>
              </div>

              {/* Score breakdown mini-chart */}
              <div className="space-y-3">
                {leaks.slice(0, 5).map((leak) => (
                  <div key={leak.key} className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-[var(--on-surface-variant)] w-20 shrink-0 truncate">
                      {leak.category}
                    </span>
                    <div className="flex-1 h-3 bg-[var(--surface-container)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${leak.catScore}%`,
                          backgroundColor: scoreColor(leak.catScore),
                        }}
                      />
                    </div>
                    <span
                      className="text-sm font-bold w-8 text-right"
                      style={{
                        color: scoreColorText(leak.catScore),
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {leak.catScore}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

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
