"use client";

import { useState } from "react";
import {
  DesktopIcon,
  DeviceMobileIcon,
  GaugeIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { PageSpeedSignals } from "@/lib/analysis";

/* ══════════════════════════════════════════════════════════════
   PageSpeedScorecard — header + Core Web Vitals tiles for the
   Page Speed dimension. Mirrors the layout users already know
   from pagespeed.web.dev: a Mobile/Desktop segmented control on
   top, then the numeric Lighthouse score in a colored chip,
   four CWV tiles (LCP / CLS / TBT / FCP) using Google's official
   thresholds, and a footer line for Speed Index plus CrUX field
   data when available.

   Mobile is canonical for our scoring rubric, so the Mobile tab
   is the default. Desktop is display-only — the per-check
   checklist below the scorecard never switches with the toggle.

   Used in two places:
     • IssueCard's PageSpeedChecklist  — product-page card
     • StoreHealthDetail (pageSpeed)   — store-wide dimension page
   ══════════════════════════════════════════════════════════════ */

type Tier = "good" | "needs-work" | "poor" | "unknown";
type Strategy = "mobile" | "desktop";

const TIER_LABEL: Record<Tier, string> = {
  good: "Good",
  "needs-work": "Needs work",
  poor: "Poor",
  unknown: "—",
};

function tierColor(tier: Tier): { dot: string; chipBg: string; chipText: string } {
  switch (tier) {
    case "good":
      return {
        dot: "var(--success-text)",
        chipBg: "var(--success-light)",
        chipText: "var(--success-text)",
      };
    case "needs-work":
      return {
        dot: "var(--warning-text)",
        chipBg: "var(--warning-light)",
        chipText: "var(--warning-text)",
      };
    case "poor":
      return {
        dot: "var(--error-text)",
        chipBg: "var(--error-light)",
        chipText: "var(--error-text)",
      };
    case "unknown":
      return {
        dot: "var(--ink-3)",
        chipBg: "var(--bg-elev)",
        chipText: "var(--ink-3)",
      };
  }
}

function tierForScore(s: number | null | undefined): Tier {
  if (s == null) return "unknown";
  if (s >= 90) return "good";
  if (s >= 50) return "needs-work";
  return "poor";
}

// Google CWV thresholds — these are the official ones used by
// PageSpeed Insights / web.dev. Don't tweak without a reason.
function tierForLcp(ms: number | null | undefined): Tier {
  if (ms == null) return "unknown";
  if (ms <= 2500) return "good";
  if (ms <= 4000) return "needs-work";
  return "poor";
}

function tierForCls(v: number | null | undefined): Tier {
  if (v == null) return "unknown";
  if (v <= 0.1) return "good";
  if (v <= 0.25) return "needs-work";
  return "poor";
}

function tierForTbt(ms: number | null | undefined): Tier {
  if (ms == null) return "unknown";
  if (ms <= 200) return "good";
  if (ms <= 600) return "needs-work";
  return "poor";
}

function tierForFcp(ms: number | null | undefined): Tier {
  if (ms == null) return "unknown";
  if (ms <= 1800) return "good";
  if (ms <= 3000) return "needs-work";
  return "poor";
}

function formatSeconds(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`;
}

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${Math.round(ms)} ms`;
}

function formatCls(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(v < 0.01 ? 3 : 2);
}

/** The 9 PSI fields rendered in the scorecard, in either flavor. */
interface ActiveMetrics {
  performanceScore: number | null;
  lcpMs: number | null;
  clsValue: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  speedIndexMs: number | null;
  hasFieldData: boolean;
  fieldLcpMs: number | null;
  fieldClsValue: number | null;
}

function metricsFor(signals: PageSpeedSignals, strategy: Strategy): ActiveMetrics {
  if (strategy === "desktop" && signals.desktop) {
    return signals.desktop;
  }
  return {
    performanceScore: signals.performanceScore,
    lcpMs: signals.lcpMs,
    clsValue: signals.clsValue,
    tbtMs: signals.tbtMs,
    fcpMs: signals.fcpMs,
    speedIndexMs: signals.speedIndexMs,
    hasFieldData: signals.hasFieldData,
    fieldLcpMs: signals.fieldLcpMs,
    fieldClsValue: signals.fieldClsValue,
  };
}

interface Props {
  signals: PageSpeedSignals;
}

export default function PageSpeedScorecard({ signals }: Props) {
  // Mobile is the canonical strategy our rubric scores against, so
  // it's also the default tab. Desktop reveals only when the
  // backend successfully ran the desktop PSI strategy.
  const [strategy, setStrategy] = useState<Strategy>("mobile");
  const desktopAvailable = signals.desktop?.performanceScore != null;

  // Mobile is the gate — if mobile PSI didn't return, the rubric
  // can't score and the per-check list below is blank. Surface the
  // notice rather than showing partial desktop-only data.
  if (signals.performanceScore == null) {
    return <PsiUnavailableNotice />;
  }

  // Guard: if user somehow lands on desktop and desktop disappeared
  // (e.g. cached row reload), fall back to mobile silently.
  const activeStrategy: Strategy =
    strategy === "desktop" && desktopAvailable ? "desktop" : "mobile";
  const m = metricsFor(signals, activeStrategy);
  const score = m.performanceScore != null ? Math.round(m.performanceScore) : null;
  const scoreTier = tierForScore(score);
  const scoreColors = tierColor(scoreTier);

  return (
    <section
      aria-label="Lighthouse performance scorecard"
      className="flex flex-col gap-3"
    >
      {/* Mobile / Desktop segmented control */}
      <StrategyTabs
        strategy={activeStrategy}
        onChange={setStrategy}
        desktopAvailable={desktopAvailable}
      />

      {/* Score header */}
      <div
        className="flex items-center gap-3 rounded-[14px] border px-4 py-3.5"
        style={{
          background: "var(--paper)",
          borderColor: "var(--rule-2)",
        }}
      >
        <GaugeIcon
          size={20}
          weight="fill"
          color={scoreColors.chipText}
          aria-hidden
        />
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <span
            className="font-mono text-[10px] font-bold uppercase"
            style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}
          >
            Lighthouse performance
          </span>
        </div>
        <span
          className="inline-flex items-center gap-1.5 font-display font-bold text-[13px] px-2.5 py-1 rounded-full tabular-nums"
          style={{
            background: scoreColors.chipBg,
            color: scoreColors.chipText,
            letterSpacing: "-0.01em",
          }}
        >
          <span
            aria-hidden
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: scoreColors.dot }}
          />
          {score != null ? `${score}/100` : "—"} · {TIER_LABEL[scoreTier]}
        </span>
      </div>

      {/* Core Web Vitals tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Tile
          label="LCP"
          fullName="Largest Contentful Paint"
          value={formatSeconds(m.lcpMs)}
          tier={tierForLcp(m.lcpMs)}
        />
        <Tile
          label="CLS"
          fullName="Cumulative Layout Shift"
          value={formatCls(m.clsValue)}
          tier={tierForCls(m.clsValue)}
        />
        <Tile
          label="TBT"
          fullName="Total Blocking Time"
          value={formatMs(m.tbtMs)}
          tier={tierForTbt(m.tbtMs)}
        />
        <Tile
          label="FCP"
          fullName="First Contentful Paint"
          value={formatSeconds(m.fcpMs)}
          tier={tierForFcp(m.fcpMs)}
        />
      </div>

      {/* Speed Index + field data footer */}
      <FooterLine metrics={m} />
    </section>
  );
}

/* ── Mobile / Desktop segmented control ─────────────────────── */
function StrategyTabs({
  strategy,
  onChange,
  desktopAvailable,
}: {
  strategy: Strategy;
  onChange: (next: Strategy) => void;
  desktopAvailable: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="Lighthouse strategy"
      className="inline-flex self-start rounded-full p-1 gap-1"
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--rule-2)",
      }}
    >
      <TabButton
        active={strategy === "mobile"}
        onClick={() => onChange("mobile")}
        icon={<DeviceMobileIcon size={13} weight="fill" />}
        label="Mobile"
      />
      <TabButton
        active={strategy === "desktop"}
        onClick={() => desktopAvailable && onChange("desktop")}
        icon={<DesktopIcon size={13} weight="fill" />}
        label="Desktop"
        disabled={!desktopAvailable}
        disabledHint="No desktop data for this scan"
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  disabled = false,
  disabledHint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      title={disabled ? disabledHint : undefined}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-semibold transition-colors"
      style={{
        background: active ? "var(--paper)" : "transparent",
        color: disabled
          ? "var(--ink-3)"
          : active
            ? "var(--ink)"
            : "var(--ink-2)",
        boxShadow: active ? "var(--shadow-subtle)" : "none",
        cursor: disabled ? "not-allowed" : active ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
        letterSpacing: "0.01em",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/* ── Single Core Web Vital tile ─────────────────────────────── */
function Tile({
  label,
  fullName,
  value,
  tier,
}: {
  label: string;
  fullName: string;
  value: string;
  tier: Tier;
}) {
  const colors = tierColor(tier);
  return (
    <div
      className="rounded-[12px] border px-3 py-3 min-w-0"
      style={{
        background: "var(--paper)",
        borderColor: "var(--rule-2)",
      }}
      title={fullName}
    >
      <div
        className="font-mono text-[9px] font-bold uppercase mb-1.5"
        style={{ color: "var(--ink-3)", letterSpacing: "0.12em" }}
      >
        {label}
      </div>
      <div
        className="font-display font-extrabold text-[18px] leading-[1.1] tabular-nums break-words"
        style={{
          color: "var(--ink)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      <div className="flex items-center gap-1.5 mt-1.5">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: colors.dot }}
        />
        <span
          className="text-[11px] font-semibold"
          style={{ color: colors.chipText }}
        >
          {TIER_LABEL[tier]}
        </span>
      </div>
    </div>
  );
}

/* ── Speed Index + CrUX field data footer ───────────────────── */
function FooterLine({ metrics }: { metrics: ActiveMetrics }) {
  const speedIdx = metrics.speedIndexMs != null
    ? `Speed Index ${formatSeconds(metrics.speedIndexMs)}`
    : null;

  const fieldParts: string[] = [];
  if (metrics.hasFieldData) {
    if (metrics.fieldLcpMs != null) fieldParts.push(`LCP ${formatSeconds(metrics.fieldLcpMs)}`);
    if (metrics.fieldClsValue != null) fieldParts.push(`CLS ${formatCls(metrics.fieldClsValue)}`);
  }

  if (!speedIdx && fieldParts.length === 0) return null;

  return (
    <p
      className="text-[12px] leading-[1.5] px-1"
      style={{ color: "var(--ink-3)" }}
    >
      {speedIdx}
      {speedIdx && fieldParts.length > 0 && " · "}
      {fieldParts.length > 0 && (
        <>
          <span style={{ color: "var(--ink-2)", fontWeight: 600 }}>
            Real users:
          </span>{" "}
          {fieldParts.join(" · ")}
        </>
      )}
    </p>
  );
}

/* ── Fallback when PSI didn't run ───────────────────────────── */
function PsiUnavailableNotice() {
  return (
    <div
      className="flex items-start gap-3 rounded-[14px] border px-4 py-3.5"
      style={{
        background: "var(--bg-elev)",
        borderColor: "var(--rule-2)",
      }}
      role="status"
    >
      <WarningCircleIcon
        size={18}
        weight="fill"
        color="var(--ink-3)"
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div
          className="font-mono text-[10px] font-bold uppercase mb-1"
          style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}
        >
          Lab metrics unavailable
        </div>
        <p className="text-[12.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
          Google PageSpeed Insights didn&apos;t return a result for this page.
          The score below is derived from HTML-only signals.
        </p>
      </div>
    </div>
  );
}
