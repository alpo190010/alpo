"use client";

import { useMemo } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import {
  type StoreAnalysisData,
  CATEGORY_LABELS,
  CATEGORY_PROBLEMS,
  CATEGORY_SVG,
  STORE_WIDE_DIMENSIONS,
  dimensionAvailability,
  scoreColorText,
  scoreColorTintBg,
} from "@/lib/analysis";

/* ══════════════════════════════════════════════════════════════
   StoreHealthTab — Dimension cards for the "Store Health" tab
   Renders each of the 7 store-wide dimensions with icon, label,
   score chip, diagnosis tip, and a "View fix" button.
   ══════════════════════════════════════════════════════════════ */

interface StoreHealthTabProps {
  storeAnalysis: StoreAnalysisData;
  /** Currently highlighted dimension (mirrors the right-pane detail). */
  selectedKey?: string | null;
  /** Called when a dimension card is clicked. */
  onSelect?: (dimensionKey: string) => void;
}

export default function StoreHealthTab({
  storeAnalysis,
  selectedKey,
  onSelect,
}: StoreHealthTabProps) {
  const cards = useMemo(() => {
    const categories = storeAnalysis.categories ?? {};
    const signals = storeAnalysis.signals;
    // Hide Shopify-only dimensions on non-Shopify scans — backend
    // populates skippedDimensions on the StoreAnalysis row.
    const skipped = new Set(storeAnalysis.skippedDimensions ?? []);
    return Array.from(STORE_WIDE_DIMENSIONS)
      .filter((key) => !skipped.has(key))
      .map((key) => ({
        key,
        label: CATEGORY_LABELS[key] || key,
        icon: CATEGORY_SVG[key],
        score: (categories as Record<string, number>)[key] ?? 0,
        availability: dimensionAvailability(key, signals),
        tip:
          CATEGORY_PROBLEMS[key]?.mid ||
          CATEGORY_PROBLEMS[key]?.low ||
          `Improve your ${key} to increase conversions.`,
      }))
      .filter((c) => Number.isFinite(c.score))
      .sort((a, b) => a.score - b.score); // worst-first
  }, [storeAnalysis]);

  if (cards.length === 0) {
    return (
      <p className="text-sm text-[var(--ink-3)] px-1 py-6 text-center">
        No store-wide dimensions available yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {cards.map((card) => {
        const isSelected = selectedKey === card.key;
        return (
          <button
            type="button"
            key={card.key}
            onClick={() => onSelect?.(card.key)}
            aria-pressed={isSelected}
            aria-label={`View fix for ${card.label}`}
            className="text-left rounded-[14px] border p-[12px_14px] flex flex-col gap-2 transition-[background,border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-quart)] hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40"
            style={{
              background: isSelected
                ? "var(--bg-elev)"
                : "var(--paper)",
              borderColor: isSelected
                ? "var(--ink)"
                : "var(--rule-2)",
              boxShadow: isSelected
                ? "0 0 0 1px var(--ink), var(--shadow-subtle)"
                : "var(--shadow-subtle)",
            }}
          >
            {/* Head: icon + label + score */}
            <header className="flex items-center gap-2.5">
              <span
                className="w-7 h-7 rounded-[9px] flex items-center justify-center shrink-0"
                style={{
                  background: scoreColorTintBg(card.score),
                  color: scoreColorText(card.score),
                }}
              >
                {card.icon}
              </span>
              <span
                className="flex-1 min-w-0 text-[13px] font-semibold leading-tight truncate"
                style={{ color: "var(--ink)" }}
              >
                {card.label}
              </span>
              {card.availability && card.key === "accessibility" ? (
                <span
                  className="font-mono text-[10px] font-bold uppercase px-2 py-1 rounded shrink-0"
                  style={{
                    background: "var(--bg-elev)",
                    color: "var(--ink-3)",
                    letterSpacing: "0.08em",
                  }}
                >
                  {card.availability.label}
                </span>
              ) : (
                <span
                  className="font-display font-extrabold text-[14px] px-2 py-0.5 rounded tabular-nums shrink-0"
                  style={{
                    background: scoreColorTintBg(card.score),
                    color: scoreColorText(card.score),
                    letterSpacing: "-0.01em",
                  }}
                >
                  {card.score}
                </span>
              )}
            </header>

            {/* Tip (or availability note when dimension ran in a limited mode) */}
            <p
              className="text-[11.5px] leading-[1.45] pl-[38px]"
              style={{ color: card.availability ? "var(--ink-3)" : "var(--ink-2)" }}
            >
              {card.availability ? card.availability.detail : card.tip}
            </p>

            {/* Footer: View fix affordance */}
            <div className="flex items-center justify-between pl-[38px] pt-0.5">
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold"
                style={{ color: "var(--accent)" }}
              >
                {isSelected ? "Viewing" : "View fix"}
                <ArrowRightIcon size={10} weight="bold" />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
