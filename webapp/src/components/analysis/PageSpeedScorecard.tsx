"use client";

import {
  GaugeIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { PageSpeedSignals } from "@/lib/analysis";

/* ══════════════════════════════════════════════════════════════
   PageSpeedScorecard — header + Core Web Vitals tiles for the
   Page Speed dimension. Mirrors the layout users already know
   from pagespeed.web.dev: numeric Lighthouse score in a colored
   chip on top, four CWV tiles (LCP / CLS / TBT / FCP) in a row
   with Google's official thresholds, and a footer line for
   Speed Index plus CrUX field data when available.

   Used in two places:
     • IssueCard's PageSpeedChecklist  — product-page card
     • StoreHealthDetail (pageSpeed)   — store-wide dimension page
   ══════════════════════════════════════════════════════════════ */

type Tier = "good" | "needs-work" | "poor" | "unknown";

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

interface Props {
  signals: PageSpeedSignals;
}

export default function PageSpeedScorecard({ signals }: Props) {
  if (signals.performanceScore == null) {
    return <PsiUnavailableNotice />;
  }

  const score = Math.round(signals.performanceScore);
  const scoreTier = tierForScore(score);
  const scoreColors = tierColor(scoreTier);

  return (
    <section
      aria-label="Lighthouse performance scorecard"
      className="flex flex-col gap-3"
    >
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
          {score}/100 · {TIER_LABEL[scoreTier]}
        </span>
      </div>

      {/* Core Web Vitals tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Tile
          label="LCP"
          fullName="Largest Contentful Paint"
          value={formatSeconds(signals.lcpMs)}
          tier={tierForLcp(signals.lcpMs)}
        />
        <Tile
          label="CLS"
          fullName="Cumulative Layout Shift"
          value={formatCls(signals.clsValue)}
          tier={tierForCls(signals.clsValue)}
        />
        <Tile
          label="TBT"
          fullName="Total Blocking Time"
          value={formatMs(signals.tbtMs)}
          tier={tierForTbt(signals.tbtMs)}
        />
        <Tile
          label="FCP"
          fullName="First Contentful Paint"
          value={formatSeconds(signals.fcpMs)}
          tier={tierForFcp(signals.fcpMs)}
        />
      </div>

      {/* Speed Index + field data footer */}
      <FooterLine signals={signals} />
    </section>
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
function FooterLine({ signals }: { signals: PageSpeedSignals }) {
  const speedIdx = signals.speedIndexMs != null
    ? `Speed Index ${formatSeconds(signals.speedIndexMs)}`
    : null;

  const fieldParts: string[] = [];
  if (signals.hasFieldData) {
    if (signals.fieldLcpMs != null) fieldParts.push(`LCP ${formatSeconds(signals.fieldLcpMs)}`);
    if (signals.fieldClsValue != null) fieldParts.push(`CLS ${formatCls(signals.fieldClsValue)}`);
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
