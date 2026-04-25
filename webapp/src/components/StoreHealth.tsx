"use client";

import { ArrowsClockwiseIcon, ArrowUpRightIcon, ClockIcon } from "@phosphor-icons/react";
import {
  type StoreAnalysisData,
  domainToBrand,
  scoreColor,
  scoreColorText,
  scoreColorTintBg,
} from "@/lib/analysis";

/** Minimal store-health score ring — inline SVG, no deps. */
function HeroRing({ score, size = 88, stroke = 7 }: { score: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, score));
  const dashoffset = circumference * (1 - clamped / 100);
  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="var(--surface-container)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={scoreColor(score)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          style={{ transition: "stroke-dashoffset 1.2s var(--ease-out-quart)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-display font-extrabold tabular-nums leading-none"
          style={{ fontSize: size * 0.36, letterSpacing: "-0.02em", color: "var(--ink)" }}
        >
          {clamped}
        </span>
        <span
          className="text-[8px] font-bold uppercase tracking-[0.15em] mt-0.5"
          style={{ color: "var(--ink-3)", opacity: 0.6 }}
        >
          Score
        </span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   StoreHealth — Hero card at top of the left sidebar
   Renders store identity + health ring + revenue-loss column,
   matching the claude.ai/design sidebar-polish-A.jsx direction.
   ══════════════════════════════════════════════════════════════ */

interface StoreHealthProps {
  storeAnalysis: StoreAnalysisData;
  /** Display name for the store (e.g. "Gymshark"). */
  storeName: string;
  /** Canonical domain (e.g. "gymshark.com"). */
  domain: string;
  /** Aggregated product-level totals for the revenue-loss column. */
  productTotals?: {
    avgDollarLoss: number;
    avgConversionLoss: number;
  } | null;
  /** Handler to force a fresh store-wide scan (bypasses 7-day cache). */
  onRescan?: () => void | Promise<void>;
  /** Whether a rescan is currently in flight. */
  rescanning?: boolean;
}

function formatRelative(iso: string | undefined): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWk = Math.floor(diffDay / 7);
  if (diffWk < 5) return `${diffWk}w ago`;
  const diffMo = Math.floor(diffDay / 30);
  return `${diffMo}mo ago`;
}

function tierLabel(score: number): string {
  if (score >= 70) return "Healthy";
  if (score >= 40) return "Needs work";
  return "Critical";
}

export default function StoreHealth({
  storeAnalysis,
  storeName,
  domain,
  productTotals,
  onRescan,
  rescanning = false,
}: StoreHealthProps) {
  const { score, updatedAt } = storeAnalysis;
  const relative = formatRelative(updatedAt);
  const tier = tierLabel(score);

  const storeHref = domain.startsWith("http") ? domain : `https://${domain}`;
  const displayName = domainToBrand(storeName) || domainToBrand(domain);

  return (
    <section
      className="rounded-2xl border overflow-hidden"
      style={{
        background: "var(--paper)",
        borderColor: "var(--rule-2)",
        boxShadow: "var(--shadow-subtle)",
      }}
    >
      <div className="relative px-[18px] pt-4 pb-[14px] flex flex-col gap-3">
        {/* ── Status tier pill (top-right) ── */}
        <div className="absolute top-4 right-[18px]">
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
            style={{
              background: scoreColorTintBg(score),
              color: scoreColorText(score),
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: scoreColorText(score) }}
              aria-hidden="true"
            />
            {tier}
          </span>
        </div>

        {/* ── Store name (big serif link) ── */}
        <a
          href={storeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start inline-flex items-center gap-2 font-display font-bold text-[32px] leading-none tracking-tight text-[var(--ink)] hover:text-[var(--accent)] transition-colors capitalize"
          style={{ letterSpacing: "-0.025em" }}
          title={`Open ${domain} in a new tab`}
        >
          <span className="truncate max-w-[260px]">{displayName}</span>
          <span className="text-[var(--ink-3)] inline-flex items-center mt-1 shrink-0 transition-colors" style={{ alignSelf: "flex-start" }}>
            <ArrowUpRightIcon size={16} weight="regular" />
          </span>
        </a>

        {/* ── Score ring + revenue loss column ── */}
        <div className="flex items-center gap-[18px] pt-1">
          <HeroRing score={score} size={88} stroke={7} />

          <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
            <span
              className="text-[9px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--ink-3)" }}
            >
              Revenue loss
            </span>
            {productTotals && productTotals.avgDollarLoss > 0 ? (
              <>
                <span
                  className="font-display font-extrabold italic leading-none"
                  style={{
                    color: "var(--error-text)",
                    fontSize: "30px",
                    letterSpacing: "-0.03em",
                  }}
                >
                  {`−$${productTotals.avgDollarLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                </span>
                <span
                  className="text-[10.5px] flex items-center gap-1.5 mt-0.5"
                  style={{ color: "var(--ink-3)" }}
                >
                  <span>per 1k visitors</span>
                  {productTotals.avgConversionLoss > 0 && (
                    <>
                      <span
                        className="w-[3px] h-[3px] rounded-full"
                        style={{ background: "currentColor", opacity: 0.5 }}
                        aria-hidden="true"
                      />
                      <span>~{productTotals.avgConversionLoss.toFixed(1)}%</span>
                    </>
                  )}
                </span>
              </>
            ) : (
              <>
                <span
                  className="font-display italic leading-none"
                  style={{
                    color: "var(--ink-2)",
                    fontSize: "22px",
                    letterSpacing: "-0.02em",
                  }}
                >
                  No scans yet
                </span>
                <span
                  className="text-[10.5px] mt-0.5"
                  style={{ color: "var(--ink-3)" }}
                >
                  Run a product scan to estimate
                </span>
              </>
            )}

            {/* ── Meta strip: scanned time + rescan ── */}
            <div
              className="flex items-center justify-between mt-2 pt-2 text-[11px]"
              style={{ color: "var(--ink-3)", borderTop: "1px solid var(--rule-2)" }}
            >
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon size={11} weight="regular" />
                {relative ? `Scanned ${relative}` : "Not yet scanned"}
              </span>
              {onRescan && (
                <button
                  type="button"
                  onClick={() => { if (!rescanning) onRescan(); }}
                  disabled={rescanning}
                  aria-label="Re-run store-wide scan"
                  title="Re-run store-wide scan"
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: "var(--accent)" }}
                >
                  <ArrowsClockwiseIcon
                    size={11}
                    weight="bold"
                    className={rescanning ? "animate-spin" : ""}
                  />
                  {rescanning ? "Rescanning…" : "Rescan"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
