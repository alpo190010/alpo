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
  scoreColorTintBg,
  calculateDollarLossPerThousand,
} from "@/lib/analysis";
import { API_URL } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import Button from "@/components/ui/Button";
import CollapsibleRegion from "@/components/ui/CollapsibleRegion";
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

  const allCollapsed = grouped.length > 0 && collapsedGroups.size === grouped.length;
  const toggleAllGroups = () => {
    setCollapsedGroups(allCollapsed ? new Set() : new Set(grouped.map((g) => g.group.id)));
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
            {grouped.length > 1 && (
              <button
                type="button"
                onClick={toggleAllGroups}
                className="self-start sm:self-auto text-xs font-semibold text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors px-3 py-1.5 rounded-lg hover:bg-[var(--surface-container-low)]"
              >
                {allCollapsed ? "Expand all" : "Collapse all"}
              </button>
            )}
          </div>

          {/* Grouped sections */}
          <div className="space-y-6">
            {grouped.map((g, gi) => {
              const isCollapsed = collapsedGroups.has(g.group.id);
              const groupBodyId = `group-body-${g.group.id}`;

              return (
                <section
                  key={g.group.id}
                  style={{
                    animation: `fade-in-up 400ms var(--ease-out-quart) ${gi * 100}ms both`,
                  }}
                >
                  {/* Section header — clickable, section-styled (no wrapper card) */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.group.id)}
                    aria-expanded={!isCollapsed}
                    aria-controls={groupBodyId}
                    className="w-full flex items-center gap-4 px-3 py-3 -mx-3 rounded-xl text-left hover:bg-[var(--surface-container-low)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40"
                  >
                    {/* Score pill — solid tint bg for contrast */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0 font-display"
                      style={{
                        background: scoreColorTintBg(g.avgScore),
                        color: scoreColor(g.avgScore),
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {g.avgScore}
                    </div>

                    {/* Label + question */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-base sm:text-lg font-semibold text-[var(--on-surface)] tracking-tight font-display">
                          {g.group.label}
                        </h3>
                        <span className="text-xs text-[var(--on-surface-variant)] font-medium">
                          {g.leaks.length} issue{g.leaks.length !== 1 ? "s" : ""}
                        </span>
                        <span className="ml-auto text-xs font-bold text-[var(--warning-text)] font-display shrink-0">
                          ~{g.conversionLoss.toFixed(1)}% conversion loss
                        </span>
                      </div>
                      <p className="text-xs text-[var(--on-surface-variant)] mt-0.5">
                        {g.group.question}
                      </p>
                    </div>

                    {/* Chevron */}
                    <CaretDownIcon
                      size={16}
                      weight="bold"
                      className="text-[var(--on-surface-variant)] shrink-0 transition-transform duration-300"
                      style={{
                        transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                      }}
                      aria-hidden="true"
                    />
                  </button>

                  {/* Section body — expanded IssueCards span both columns via
                      lg:col-span-2 so details render inline without stretching siblings. */}
                  <CollapsibleRegion isOpen={!isCollapsed} id={groupBodyId}>
                    <div className="pt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {g.leaks.map((leak, i) => (
                        <IssueCard
                          key={leak.key}
                          leak={leak}
                          index={i}
                          onClick={() => onIssueClick(leak.key)}
                          expandable
                          signals={result.signals}
                        />
                      ))}
                    </div>
                  </CollapsibleRegion>
                </section>
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
