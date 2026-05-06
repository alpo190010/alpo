"use client";

import { useState, useEffect, useRef, useMemo, memo } from "react";
import { useSession } from "next-auth/react";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import {
  type FreeResult,
  type LeakCard,
  useCountUp,
  captureEvent,
  scoreColor,
  calculateDollarLossPerThousand,
  splitLeaksByScope,
} from "@/lib/analysis";
import {
  CATEGORY_SVG,
  PRODUCT_LEVEL_DIMENSIONS,
} from "@/lib/analysis/constants";
import {
  buildProductDimensions,
  type ProductDimensionGroup,
} from "@/lib/analysis/productChecks";
import { API_URL } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import Button from "@/components/ui/Button";
import ScoreRing from "@/components/analysis/ScoreRing";
import PluginCTACard from "@/components/analysis/PluginCTACard";
import CTACard from "@/components/analysis/CTACard";
import BlurredPlaceholder from "@/components/BlurredPlaceholder";
import ChecksGroup from "@/components/checks/ChecksGroup";
import { severityFor, type Severity } from "@/components/checks/severity";

/* ══════════════════════════════════════════════════════════════
   AnalysisResults — per-product page health.

   Layout (top-to-bottom):
     1. Score ring + revenue summary
     2. "Score breakdown" grid — one card per raw dimension present
        in `result.signals`, sorted worst→best, first selected by
        default. Click to switch the active dimension.
     3. "What's working" + "Issues found" lists for the active
        dimension. Severity chips (All / Critical / Major / Minor)
        filter the issues list. Visuals reuse the storewide
        ChecksGroup / CheckRow primitive.
     4. Analyze again CTA
   ══════════════════════════════════════════════════════════════ */

type SeverityFilter = "all" | Severity;

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

  /* ── Product-only leaks ── */
  const { productLeaks } = useMemo(() => splitLeaksByScope(leaks), [leaks]);

  /* ── Per-dimension view (drives the Score breakdown grid) ──
     `buildProductDimensions` strips per-row fix content and stamps
     `lockedFix: true` on rows that had fix content for non-fixes
     tiers, so CheckRow renders an upgrade-CTA blur in its expand
     drawer. Same UX as the server-gated store-wide checks. */
  const dimensions = useMemo(
    () => buildProductDimensions(result, productLeaks),
    [result, productLeaks],
  );

  const totalMissing = useMemo(
    () =>
      dimensions.reduce(
        (sum, d) => sum + d.checks.filter((c) => !c.passed).length,
        0,
      ),
    [dimensions],
  );
  const totalCritical = useMemo(
    () =>
      dimensions.reduce(
        (sum, d) =>
          sum +
          d.checks.filter((c) => !c.passed && severityFor(c.weight) === "critical")
            .length,
        0,
      ),
    [dimensions],
  );
  // Diagnostic content is gated when EITHER the explicit detailsLocked
  // flag is set OR the server stripped `signals` (free / anon
  // contract). Both the flag and the strip happen together server-side;
  // checking both here makes the locked branch resilient to a stale
  // client cache where one of the two is missing.
  const isDetailsLocked =
    result.detailsLocked === true || !result.signals;

  // Don't trigger the all-pass celebration when the data is gated —
  // free / anon viewers always have totalMissing = 0 because the
  // checks payload was stripped server-side, not because everything
  // actually passed.
  const everythingPassing =
    !isDetailsLocked && dimensions.length > 0 && totalMissing === 0;

  /* ── Active dimension selection ── */
  const [activeDimKey, setActiveDimKey] = useState<string | null>(null);
  // Clear when switching products so each lands on its own first dimension.
  useEffect(() => {
    setActiveDimKey(null);
  }, [url]);
  useEffect(() => {
    if (
      dimensions.length > 0 &&
      (!activeDimKey || !dimensions.some((d) => d.key === activeDimKey))
    ) {
      setActiveDimKey(dimensions[0].key);
    }
  }, [dimensions, activeDimKey]);
  const activeDim =
    dimensions.find((d) => d.key === activeDimKey) ?? dimensions[0] ?? null;
  const activeLeak = activeDim
    ? productLeaks.find((l) => l.key === activeDim.key)
    : undefined;

  /* ── Severity chip filter (resets when active dimension changes) ── */
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  useEffect(() => {
    setSeverityFilter("all");
  }, [activeDimKey]);

  /* ── Score-card grid: collapse to 2 rows by default (8 cards on
     desktop @ 4 cols), "Show more" reveals the remainder. ── */
  const VISIBLE_DEFAULT = 8;
  const [showAllCards, setShowAllCards] = useState(false);
  const hasMoreCards = dimensions.length > VISIBLE_DEFAULT;
  const visibleDimensions = showAllCards
    ? dimensions
    : dimensions.slice(0, VISIBLE_DEFAULT);
  const hiddenCount = dimensions.length - VISIBLE_DEFAULT;

  /* ── Active dimension's working / missing partitions ── */
  const activeWorking = useMemo(
    () => (activeDim ? activeDim.checks.filter((c) => c.passed) : []),
    [activeDim],
  );
  const activeMissing = useMemo(
    () => (activeDim ? activeDim.checks.filter((c) => !c.passed) : []),
    [activeDim],
  );
  const severityCounts = useMemo(() => {
    const counts = { all: activeMissing.length, critical: 0, major: 0, minor: 0 };
    for (const c of activeMissing) counts[severityFor(c.weight)] += 1;
    return counts;
  }, [activeMissing]);
  const filteredMissing = useMemo(() => {
    if (severityFilter === "all") return activeMissing;
    return activeMissing.filter((c) => severityFor(c.weight) === severityFilter);
  }, [activeMissing, severityFilter]);

  /* ── Dollar loss for PluginCTACard ── */
  const dollarLoss = useMemo(
    () => calculateDollarLossPerThousand(result.categories, result.productPrice, result.productCategory),
    [result.categories, result.productPrice, result.productCategory],
  );

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
              leaksCount={totalMissing}
              criticalCount={totalCritical}
              scopedDimensionKeys={PRODUCT_LEVEL_DIMENSIONS}
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

      {/* ═══ SCORE BREAKDOWN + ACTIVE DIMENSION DETAIL ═══ */}
      {showLeaks && dimensions.length > 0 && (
        <div
          ref={issuesRef}
          style={{ animation: "fade-in-up 600ms var(--ease-out-quart) both" }}
        >
          {/* Score breakdown grid */}
          <div className="mb-8">
            <h2 className="font-display font-extrabold text-xl sm:text-2xl tracking-tight text-[var(--ink)] mb-4">
              Score breakdown
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {visibleDimensions.map((d) => (
                <ScoreCard
                  key={d.key}
                  dim={d}
                  selected={d.key === activeDimKey}
                  onSelect={() => setActiveDimKey(d.key)}
                />
              ))}
            </div>
            {hasMoreCards && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowAllCards((v) => !v)}
                  className="text-[13px] font-semibold rounded-full px-4 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]/30"
                  style={{
                    color: "var(--ink-2)",
                    background: "transparent",
                    border: "1px solid var(--rule-2)",
                  }}
                >
                  {showAllCards
                    ? "Show less"
                    : `Show ${hiddenCount} more`}
                </button>
              </div>
            )}
          </div>

          {/* Active dimension detail.
              Three modes:
                1. detailsLocked (free/anon) — no diagnostic data was
                   shipped from the server. Render a locked
                   BlurredPlaceholder; children are unreachable so no
                   real content sneaks into the DOM.
                2. severityCounts.all === 0 — no failing checks.
                   Render the all-pass celebration bare; nothing to
                   gate.
                3. Default — render the full panel (header + severity
                   chips + What's working / What's missing + optional
                   fix callout). Insights tier sees the panel; the
                   DimensionFixCallout is hidden by recommendationsLocked
                   for everyone except fixes tier. */}
          {activeDim && isDetailsLocked && (
            <div className="space-y-5">
              {/* Headline header — shows the dimension, the count of
                  failing checks, and the conversion-loss estimate.
                  All three are derived from scores / numerics (no
                  premium copy), so they advertise the unlock without
                  revealing details. */}
              <div>
                <h3 className="font-display font-extrabold text-lg sm:text-xl tracking-tight text-[var(--ink)]">
                  Issues found{" "}
                  <span
                    className="font-mono text-base font-bold tabular-nums"
                    style={{ color: "var(--ink-3)" }}
                  >
                    ({severityCounts.all})
                  </span>
                </h3>
                <p
                  className="text-[12.5px] mt-0.5"
                  style={{ color: "var(--ink-3)" }}
                >
                  {activeDim.label}
                  {activeDim.conversionLoss > 0 && (
                    <>
                      {" · ~"}
                      {activeDim.conversionLoss.toFixed(1)}% est. conversion loss
                    </>
                  )}
                </p>
              </div>
              <BlurredPlaceholder
                requiredTier="insights"
                currentTier={result.planTier ?? "free"}
                storeDomain={domain ?? null}
                title="Unlock detailed analysis"
                subtitle="See exactly what's broken — and why it's losing you sales."
              >
                {/* Children unreachable for locked viewers — they see
                    the red/green DefaultSkeleton blurred under the
                    CTA. Real data is never shipped server-side. */}
                <></>
              </BlurredPlaceholder>
            </div>
          )}
          {activeDim && !isDetailsLocked && severityCounts.all === 0 && (
            <div className="space-y-5">
              <ActiveDimensionHeader
                dimension={activeDim}
                severityCounts={severityCounts}
                severityFilter={severityFilter}
                onSeverityChange={setSeverityFilter}
              />
              <AllClearBanner label={activeDim.label} />
            </div>
          )}
          {activeDim && !isDetailsLocked && severityCounts.all > 0 && (
            <div className="space-y-5">
              <ActiveDimensionHeader
                dimension={activeDim}
                severityCounts={severityCounts}
                severityFilter={severityFilter}
                onSeverityChange={setSeverityFilter}
              />

              {activeLeak &&
                severityFilter === "all" &&
                !result.recommendationsLocked && (
                  <DimensionFixCallout
                    problem={activeLeak.problem}
                    tip={activeLeak.tip}
                  />
                )}

              {activeWorking.length > 0 && (
                <ChecksGroup
                  heading="What's working"
                  count={activeWorking.length}
                  tone="pass"
                  items={activeWorking}
                  planTier={result.planTier}
                />
              )}

              {filteredMissing.length > 0 ? (
                <ChecksGroup
                  heading={
                    severityFilter === "all"
                      ? "What's missing"
                      : `What's missing — ${capitalize(severityFilter)}`
                  }
                  count={filteredMissing.length}
                  tone="fail"
                  items={filteredMissing}
                  planTier={result.planTier}
                />
              ) : (
                <EmptyFilter />
              )}

              {!isPaid && (
                <CTACard
                  leaksCount={leaks.length}
                  animationDelay={100}
                  onClick={() => {
                    onIssueClick(leaks[0]?.key || "");
                    captureEvent("cta_card_clicked", { url });
                  }}
                />
              )}
            </div>
          )}

          {/* Whole-product celebration when nothing is missing anywhere */}
          {everythingPassing && (
            <div className="mt-6">
              <AllClearBanner
                label="this product"
                body="Every signal we check is in good shape. Re-scan after your next change to keep it that way."
                strong
              />
            </div>
          )}
        </div>
      )}

      {/* ═══ ANALYZE AGAIN ═══ */}
      {showLeaks && (
        <section style={{ animation: "fade-in-up 600ms var(--ease-out-quart) 400ms both" }}>
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

/* ══════════════════════════════════════════════════════════════
   ScoreCard — one tile in the Score breakdown grid. Mirrors the
   editorial paper aesthetic: cream surface, 1px rule, small
   donut-style score ring + display-font label + coral score.
   Selected state: ink border + raised shadow.
   ══════════════════════════════════════════════════════════════ */
function ScoreCard({
  dim,
  selected,
  onSelect,
}: {
  dim: ProductDimensionGroup;
  selected: boolean;
  onSelect: () => void;
}) {
  const icon = CATEGORY_SVG[dim.key];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="text-left rounded-[14px] border px-4 py-3 sm:py-3.5 flex items-center gap-3.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]/30"
      style={{
        background: selected ? "var(--bg-elev)" : "var(--paper)",
        borderColor: selected ? "var(--ink)" : "var(--rule-2)",
        boxShadow: selected
          ? "0 0 0 1px var(--ink), var(--shadow-subtle)"
          : "var(--shadow-subtle)",
      }}
    >
      <ScoreDonut score={dim.score}>
        {icon && (
          <span className="flex items-center justify-center" style={{ fontSize: 0 }}>
            {icon}
          </span>
        )}
      </ScoreDonut>
      <div className="flex-1 min-w-0">
        <div
          className="font-display font-bold text-[14px] leading-tight truncate"
          style={{ color: "var(--ink)" }}
        >
          {dim.label}
        </div>
        <div
          className="font-mono text-[13px] mt-0.5 tabular-nums"
          style={{ color: scoreColor(dim.score) }}
        >
          {dim.score}/100
        </div>
      </div>
    </button>
  );
}

/* ── Donut score ring with optional centered icon (used inside ScoreCard) ── */
function ScoreDonut({
  score,
  children,
}: {
  score: number;
  children?: React.ReactNode;
}) {
  const size = 44;
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = (Math.max(0, Math.min(100, score)) / 100) * c;
  const color = scoreColor(score);
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size, color }}
    >
      <svg width={size} height={size} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--rule-2)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${arc} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 600ms var(--ease-out-quart)" }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {children}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SeverityChips — pill toggle for All / Critical / Major / Minor.
   Active chip is ink-filled; others are outlined and dim.
   ══════════════════════════════════════════════════════════════ */
function SeverityChips({
  counts,
  active,
  onChange,
}: {
  counts: { all: number; critical: number; major: number; minor: number };
  active: SeverityFilter;
  onChange: (next: SeverityFilter) => void;
}) {
  const items: { value: SeverityFilter; label: string; n: number }[] = [
    { value: "all", label: "All", n: counts.all },
    { value: "critical", label: "Critical", n: counts.critical },
    { value: "major", label: "Major", n: counts.major },
    { value: "minor", label: "Minor", n: counts.minor },
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label="Filter issues by severity">
      {items.map((item) => {
        const isActive = active === item.value;
        const disabled = item.n === 0 && item.value !== "all";
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled}
            onClick={() => onChange(item.value)}
            className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]/30"
            style={{
              background: isActive ? "var(--ink)" : "transparent",
              color: isActive ? "var(--paper)" : "var(--ink-2)",
              border: `1px solid ${isActive ? "var(--ink)" : "var(--rule-2)"}`,
            }}
          >
            {item.label} <span className="tabular-nums opacity-80">{item.n}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ActiveDimensionHeader — "Issues found (N)" + dimension label +
   conversion-loss subtext + severity chips. Extracted because the
   panel renders both inside and outside a BlurredPlaceholder
   depending on whether there's any locked content to gate.
   ══════════════════════════════════════════════════════════════ */
function ActiveDimensionHeader({
  dimension,
  severityCounts,
  severityFilter,
  onSeverityChange,
}: {
  dimension: ProductDimensionGroup;
  severityCounts: { all: number; critical: number; major: number; minor: number };
  severityFilter: SeverityFilter;
  onSeverityChange: (next: SeverityFilter) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h3 className="font-display font-extrabold text-lg sm:text-xl tracking-tight text-[var(--ink)]">
          Issues found{" "}
          <span
            className="font-mono text-base font-bold tabular-nums"
            style={{ color: "var(--ink-3)" }}
          >
            ({severityCounts.all})
          </span>
        </h3>
        <p className="text-[12.5px] mt-0.5" style={{ color: "var(--ink-3)" }}>
          {dimension.label}
          {dimension.conversionLoss > 0 && (
            <> · ~{dimension.conversionLoss.toFixed(1)}% est. conversion loss</>
          )}
        </p>
      </div>
      <SeverityChips
        counts={severityCounts}
        active={severityFilter}
        onChange={onSeverityChange}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   AllClearBanner — shown when the active group (or whole product)
   has zero failing checks. Mirrors StoreHealthDetail's "You're
   crushing it" treatment but at product/group scope.
   ══════════════════════════════════════════════════════════════ */
function AllClearBanner({
  label,
  body,
  strong,
}: {
  label: string;
  body?: string;
  strong?: boolean;
}) {
  return (
    <section
      role="status"
      className="rounded-[14px] flex items-center gap-3.5 px-5 py-4"
      style={{
        background: "var(--success-light)",
        border: "1px solid var(--success-border)",
      }}
    >
      <span
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-display font-extrabold text-base"
        style={{ background: "var(--success-text)", color: "var(--paper)" }}
        aria-hidden
      >
        ✓
      </span>
      <div className="min-w-0">
        <h4
          className={
            strong
              ? "font-display font-extrabold text-[18px] leading-tight"
              : "font-display font-bold text-[15px] leading-tight"
          }
          style={{ color: "var(--success-text)", letterSpacing: "-0.01em" }}
        >
          {strong
            ? `${capitalize(label)} is firing on all cylinders`
            : `Nothing missing in ${label}`}
        </h4>
        {body && (
          <p className="text-[13px] mt-1" style={{ color: "var(--ink-2)" }}>
            {body}
          </p>
        )}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════
   DimensionFixCallout — single banner that surfaces the dimension-
   level fix tip above the missing list. Replaces the previous
   per-row stamping which made every failing row's expand drawer
   show the same `leak.tip` text. Per-row drawers now only fire
   for rows with genuinely row-specific payload (PageSpeed
   scorecards, Accessibility axe rules).
   ══════════════════════════════════════════════════════════════ */
function DimensionFixCallout({
  problem,
  tip,
}: {
  problem: string;
  tip: string;
}) {
  return (
    <aside
      className="rounded-[14px] px-5 py-4 flex flex-col gap-2"
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--rule-2)",
        borderLeft: "3px solid var(--brand)",
      }}
    >
      <div
        className="text-[11px] uppercase tracking-[0.12em] font-bold font-mono"
        style={{ color: "var(--ink-3)" }}
      >
        How to fix
      </div>
      <div
        className="text-[14px] font-semibold leading-[1.4]"
        style={{ color: "var(--ink)" }}
      >
        {problem}
      </div>
      <div
        className="text-[13.5px] leading-[1.5]"
        style={{ color: "var(--ink-2)" }}
      >
        {tip}
      </div>
    </aside>
  );
}

/* ══════════════════════════════════════════════════════════════
   EmptyFilter — shown when the chosen severity chip has no items
   in the active group (e.g. user clicked "Critical" but everything
   is major/minor). Encourages switching back to All.
   ══════════════════════════════════════════════════════════════ */
function EmptyFilter() {
  return (
    <p
      className="text-[13px] italic px-1"
      style={{ color: "var(--ink-3)" }}
    >
      No issues at this severity. Pick another chip to see the rest.
    </p>
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
