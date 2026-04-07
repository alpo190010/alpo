"use client";

import { useState, useEffect, useRef, useMemo, memo } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
} from "@phosphor-icons/react";
import {
  type FreeResult,
  type LeakCard,
  useCountUp,
  captureEvent,
  groupLeaks,
  scoreColor,
  calculateDollarLossPerThousand,
} from "@/lib/analysis";
import { API_URL } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import Button from "@/components/ui/Button";
import ScoreRing from "@/components/analysis/ScoreRing";
import PluginCTACard from "@/components/analysis/PluginCTACard";
import IssueCard from "@/components/analysis/IssueCard";
import CTACard from "@/components/analysis/CTACard";

/* ══════════════════════════════════════════════════════════════
   AnalysisResults — Complete results display for right-pane
   ══════════════════════════════════════════════════════════════ */

interface AnalysisResultsProps {
  result: FreeResult;
  leaks: LeakCard[];
  domain: string;
  url: string;
  productName?: string;
  productUrl?: string;
  productImage?: string;
  onIssueClick: (key: string) => void;
  onAnalyzeAgain: () => void;
}

const AnalysisResults = memo(function AnalysisResults({
  result,
  leaks,
  domain,
  url,
  productName,
  productUrl,
  productImage,
  onIssueClick,
  onAnalyzeAgain,
}: AnalysisResultsProps) {
  const { status } = useSession();

  /* ── Plan-based gating ── */
  const [userPlan, setUserPlan] = useState<string>("free");
  useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    authFetch(`${API_URL}/user/plan`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.plan) setUserPlan(data.plan); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.warn("Failed to fetch user plan:", err);
      });
    return () => controller.abort();
  }, [status]);
  const isPaid = status === "authenticated" && userPlan !== "free";

  /* ── Staggered reveal ── */
  const [showCard, setShowCard] = useState(false);
  const [showRevenue, setShowRevenue] = useState(false);
  const [showLeaks, setShowLeaks] = useState(false);
  const issuesRef = useRef<HTMLDivElement>(null);

  /* ── Grouped leaks ── */
  const grouped = useMemo(() => groupLeaks(leaks), [leaks]);

  /* ── Dollar loss for PluginCTACard ── */
  const dollarLoss = useMemo(
    () => calculateDollarLossPerThousand(result.categories, result.productPrice, result.productCategory),
    [result.categories, result.productPrice, result.productCategory],
  );

  /* ── Collapsed groups — worst group (index 0) starts expanded, rest collapsed ── */
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (grouped.length > 0) {
      setCollapsedGroups(new Set(grouped.slice(1).map((g) => g.group.id)));
    }
  }, [grouped]);

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
              productName={productName}
              productUrl={productUrl}
              productImage={productImage}
              summary={result.summary}
              categories={result.categories}
              leaksCount={leaks.length}
            />

            {showRevenue && (
              <PluginCTACard
                dollarLoss={dollarLoss}
                onViewBreakdown={() => issuesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              />
            )}
          </div>
        </section>
      )}

      {/* ═══ GROUPED ISSUES ═══ */}
      {showLeaks && (
        <div ref={issuesRef}>
          {/* Section header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-8">
            <div className="border-l-[3px] border-[var(--brand)] pl-5">
              <h2
                className="text-xl sm:text-2xl font-extrabold text-[var(--on-surface)] tracking-tight font-display"
              >
                Issues Found
              </h2>
              <p className="text-[var(--on-surface-variant)] text-sm mt-1">
                {leaks.length} conversion leak{leaks.length !== 1 ? "s" : ""} across {grouped.length} area{grouped.length !== 1 ? "s" : ""}.{" "}
                {isPaid ? "Click any to see the details." : "Click any to get the fix."}
              </p>
            </div>
          </div>

          {/* Grouped sections */}
          <div className="space-y-4">
            {grouped.map((g, gi) => {
              const isCollapsed = collapsedGroups.has(g.group.id);

              return (
                <div
                  key={g.group.id}
                  className="rounded-2xl border border-[var(--outline-variant)]/20 overflow-hidden"
                  style={{
                    animation: `fade-in-up 400ms var(--ease-out-quart) ${gi * 100}ms both`,
                  }}
                >
                  {/* Group header — always visible */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={() => toggleGroup(g.group.id)}
                    aria-expanded={!isCollapsed}
                    className="w-full flex items-center gap-4 px-5 py-4 bg-[var(--surface)] hover:bg-[var(--surface-container-low)] rounded-t-2xl h-auto rounded-b-none"
                  >
                    {/* Score pill */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0 font-display"
                      style={{
                        background: `color-mix(in oklch, ${scoreColor(g.avgScore)} 12%, transparent)`,
                        color: scoreColor(g.avgScore),
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {g.avgScore}
                    </div>

                    {/* Label + question */}
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm font-bold text-[var(--on-surface)] truncate font-display"
                        >
                          {g.group.label}
                        </span>
                        <span className="text-xs text-[var(--on-surface-variant)] font-medium shrink-0">
                          {g.leaks.length} issue{g.leaks.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--on-surface-variant)] mt-0.5 truncate">
                        {g.group.question}
                      </p>
                    </div>

                    {/* Group conversion loss */}
                    <div className="text-right shrink-0 mr-2">
                      <div className="text-xs font-bold text-[var(--warning-text)] font-display">
                        ~{g.conversionLoss.toFixed(1)}% conversion loss
                      </div>
                    </div>

                    {/* Chevron */}
                    <CaretDownIcon
                      size={16}
                      weight="bold"
                      className="text-[var(--on-surface-variant)] shrink-0 transition-transform duration-300"
                      style={{
                        transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                      }}
                    />
                  </Button>

                  {/* Cards grid — collapsible via grid-template-rows for smooth animation */}
                  <div
                    className="grid transition-[grid-template-rows] duration-300 ease-[var(--ease-out-quart)]"
                    style={{
                      gridTemplateRows: isCollapsed ? "0fr" : "1fr",
                    }}
                  >
                    <div className="overflow-hidden">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
                        {g.leaks.map((leak, i) => (
                          <IssueCard
                            key={leak.key}
                            leak={leak}
                            index={i}
                            onClick={() => {
                              onIssueClick(leak.key);
                              captureEvent("issue_clicked", {
                                category: leak.key,
                                impact: leak.impact,
                                group: g.group.id,
                              });
                            }}
                            expandable={isPaid}
                            signals={isPaid ? result.signals : undefined}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* CTA Card — only for free users */}
            {!isPaid && (
              <CTACard
                leaksCount={leaks.length}
                animationDelay={grouped.length * 100}
                onClick={() => {
                  onIssueClick(leaks[0]?.key || "");
                  captureEvent("cta_card_clicked", { url });
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* ═══ ANALYZE AGAIN ═══ */}
      {showLeaks && (
        <section style={{ animation: "fade-in-up 600ms var(--ease-out-quart) 400ms both" }}>
          {/* Analyze again CTA */}
          <div className="text-center mt-8">
            <Button
              type="button"
              variant="gradient"
              size="md"
              shape="card"
              onClick={onAnalyzeAgain}
              className="px-7 py-3.5 font-semibold polish-hover-lift"
            >
              <ArrowsClockwiseIcon size={16} weight="bold" />
              Analyze Again
            </Button>
          </div>
        </section>
      )}
    </div>
  );
});

export default AnalysisResults;
