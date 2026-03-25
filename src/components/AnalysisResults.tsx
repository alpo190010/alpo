"use client";

import { useState, useEffect, useRef } from "react";
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
  onScanAnother: () => void;
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
  onScanAnother,
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
    const t3 = setTimeout(() => {
      issuesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
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
              style={{ boxShadow: "var(--shadow-elevated)" }}
            >
              {/* Decorative glow */}
              <div
                className="absolute top-0 right-0 w-72 h-72 rounded-full -mr-24 -mt-24 blur-3xl pointer-events-none"
                style={{ background: "var(--brand)", opacity: 0.04 }}
              />

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
                      65
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Revenue Loss Card ── */}
            {showRevenue && (
              <div
                className="md:col-span-5 p-6 sm:p-8 rounded-3xl text-white flex flex-col justify-between"
                style={{
                  background: "linear-gradient(135deg, var(--brand), var(--primary-dim))",
                  boxShadow: "0 20px 60px rgba(124, 58, 237, 0.25)",
                  animation: "fade-in-up 500ms var(--ease-out-quart) both",
                }}
              >
                <div className="space-y-2">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="opacity-50" aria-hidden="true">
                    <path d="M23 6l-9.5 9.5-5-5L1 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M17 6h6v6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <h3 className="text-sm sm:text-base font-semibold opacity-80 leading-tight">
                    Estimated Monthly Revenue Loss
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
                  <p className="text-sm font-medium opacity-70">Based on estimated store traffic</p>
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="var(--error)" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--error-text)]">{competitorError}</p>
              </div>
              <button
                type="button"
                onClick={onRetryCompetitors}
                className="cursor-pointer shrink-0 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[var(--brand)] to-violet-800 hover:scale-105 transition-transform"
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
                  className="cursor-pointer group text-left bg-[var(--surface)] rounded-[1.5rem] p-5 sm:p-6 flex flex-col justify-between border border-[var(--outline-variant)]/20 hover:border-[var(--brand)]/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)]"
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
                    <svg
                      className="w-5 h-5 text-[var(--on-surface-variant)] group-hover:text-[var(--brand)] group-hover:translate-x-1 transition-all duration-200"
                      viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
                    >
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
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
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
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
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--brand)" aria-hidden="true">
                    <path d="M12 1.5l2.61 6.727 6.89.52-5.23 4.917 1.58 6.836L12 16.56 6.15 20.5l1.58-6.836L2.5 8.747l6.89-.52L12 1.5z"/>
                  </svg>
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
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
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

            {/* Decorative blur */}
            <div
              className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full blur-[100px] pointer-events-none"
              style={{ background: "var(--brand)", opacity: 0.06 }}
            />
          </div>

          {/* Scan another CTA */}
          <div className="text-center mt-8">
            <button
              type="button"
              onClick={onScanAnother}
              className="cursor-pointer inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring bg-gradient-to-r from-[var(--brand)] to-violet-800"
              style={{ boxShadow: "0 8px 32px rgba(124, 58, 237, 0.2)" }}
            >
              Analyze Another Page
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
