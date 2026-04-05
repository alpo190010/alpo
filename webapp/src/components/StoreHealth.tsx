"use client";

import { useState } from "react";
import { CaretDownIcon, CaretUpIcon, CheckCircleIcon, XCircleIcon, StorefrontIcon } from "@phosphor-icons/react";
import {
  type StoreAnalysisData,
  scoreColorTintBg,
  scoreColorText,
  CATEGORY_LABELS,
  CATEGORY_SVG,
  STORE_WIDE_DIMENSIONS,
} from "@/lib/analysis";

/* ══════════════════════════════════════════════════════════════
   StoreHealth — Store-wide dimension scores (7 dimensions)
   Renders above the ProductGrid on /scan/[domain] pages.
   ══════════════════════════════════════════════════════════════ */

interface StoreHealthProps {
  storeAnalysis: StoreAnalysisData;
}

/** Format signal key → human label: "hasShopPay" → "Has Shop Pay" */
function formatSignalKey(key: string): string {
  return key
    .replace(/^(has|is|uses)/, (m) => m + " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

export default function StoreHealth({ storeAnalysis }: StoreHealthProps) {
  const [expandedDimension, setExpandedDimension] = useState<string | null>(null);
  const { score, categories, tips, signals } = storeAnalysis;

  const storeKeys = Array.from(STORE_WIDE_DIMENSIONS).filter(
    (k) => categories[k as keyof typeof categories] !== undefined,
  );

  if (storeKeys.length === 0) return null;

  return (
    <section
      className="rounded-2xl border p-4 mb-4"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-subtle)",
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "var(--brand)", color: "var(--on-primary)" }}
        >
          <StorefrontIcon size={20} weight="fill" />
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="text-sm font-bold leading-tight font-display"
            style={{
              color: "var(--on-surface)",
            }}
          >
            Store Health
          </h3>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--on-surface-variant)" }}>
            Store-wide scores · applies to all products
          </p>
        </div>
        <div
          className="rounded-lg px-2.5 py-1 text-sm font-extrabold tabular-nums font-display"
          style={{
            background: scoreColorTintBg(score),
            color: scoreColorText(score),
          }}
        >
          {score}
        </div>
      </div>

      {/* ── Dimension grid ── */}
      <div className="grid grid-cols-1 gap-1.5">
        {storeKeys.map((key) => {
          const dimScore = (categories as Record<string, number>)[key] ?? 0;
          const label = CATEGORY_LABELS[key] || key;
          const icon = CATEGORY_SVG[key];
          const dimSignals = signals?.[key as keyof typeof signals] as
            | Record<string, boolean>
            | undefined;
          const isExpanded = expandedDimension === key;
          const hasSignals = dimSignals && Object.keys(dimSignals).length > 0;

          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => setExpandedDimension(isExpanded ? null : key)}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-[var(--surface-container-low)]"
                style={{ cursor: hasSignals ? "pointer" : "default" }}
              >
                <span
                  className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{
                    background: scoreColorTintBg(dimScore),
                    color: scoreColorText(dimScore),
                  }}
                >
                  {icon}
                </span>
                <span
                  className="flex-1 text-left text-xs font-medium truncate"
                  style={{ color: "var(--on-surface)" }}
                >
                  {label}
                </span>
                <span
                  className="text-xs font-bold tabular-nums rounded px-1.5 py-0.5 font-display"
                  style={{
                    background: scoreColorTintBg(dimScore),
                    color: scoreColorText(dimScore),
                  }}
                >
                  {dimScore}
                </span>
                {hasSignals && (
                  <span style={{ color: "var(--on-surface-variant)" }}>
                    {isExpanded ? (
                      <CaretUpIcon size={12} weight="bold" />
                    ) : (
                      <CaretDownIcon size={12} weight="bold" />
                    )}
                  </span>
                )}
              </button>

              {/* ── Signal checklist (expanded) ── */}
              {isExpanded && hasSignals && (
                <div className="pl-11 pr-2 pb-2 space-y-1">
                  {Object.entries(dimSignals!).map(([sigKey, sigVal]) => (
                    <div
                      key={sigKey}
                      className="flex items-center gap-1.5 text-[11px]"
                      style={{ color: "var(--on-surface-variant)" }}
                    >
                      {sigVal ? (
                        <CheckCircleIcon
                          size={13}
                          weight="fill"
                          style={{ color: "var(--success-text)" }}
                        />
                      ) : (
                        <XCircleIcon
                          size={13}
                          weight="fill"
                          style={{ color: "var(--error-text)" }}
                        />
                      )}
                      <span className="truncate">{formatSignalKey(sigKey)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Tips ── */}
      {tips && tips.length > 0 && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
          <p
            className="text-[10px] font-semibold uppercase tracking-wide mb-1.5"
            style={{ color: "var(--on-surface-variant)" }}
          >
            Store-wide tips
          </p>
          <ul className="space-y-1">
            {tips.slice(0, 5).map((tip, i) => (
              <li
                key={i}
                className="text-[11px] leading-snug pl-3 relative"
                style={{ color: "var(--on-surface-variant)" }}
              >
                <span
                  className="absolute left-0 top-[5px] w-1 h-1 rounded-full"
                  style={{ background: "var(--brand)" }}
                />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
