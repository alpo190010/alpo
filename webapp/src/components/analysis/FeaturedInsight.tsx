"use client";

import { ArrowRightIcon } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import { scoreColor, scoreColorText, scoreColorTintBg, type LeakCard } from "@/lib/analysis";

interface FeaturedInsightProps {
  leaks: LeakCard[];
  summary: string;
  onInsightClick: () => void;
  variant?: "compact" | "full";
}

export default function FeaturedInsight({
  leaks,
  summary,
  onInsightClick,
  variant = "compact",
}: FeaturedInsightProps) {
  const full = variant === "full";
  const worst = leaks[0];
  const runners = leaks.slice(1, 5);

  if (!worst) return null;

  return (
    <div
      className={`rounded-2xl overflow-hidden ${full ? "mb-4" : ""}`}
      style={{ border: "1px solid var(--outline-variant)", borderColor: "color-mix(in oklch, var(--outline-variant) 40%, transparent)" }}
    >
      {/* ── Hero: #1 issue ── */}
      <div className={`${full ? "p-6 sm:p-8" : "p-5 sm:p-6"} bg-[var(--surface)]`}>
        <div className="flex items-start gap-4">
          {/* Score as the anchor */}
          <div
            className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0"
            style={{ background: scoreColorTintBg(worst.catScore) }}
          >
            <span
              className="text-xl font-extrabold leading-none font-display"
              style={{
                color: scoreColorText(worst.catScore),
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {worst.catScore}
            </span>
            <span
              className="text-[7px] font-bold uppercase tracking-wide mt-0.5"
              style={{ color: scoreColorText(worst.catScore), opacity: 0.6 }}
            >
              /100
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-1">
              Biggest revenue blocker
            </p>
            <h2
              className={`${full ? "text-lg sm:text-xl" : "text-base sm:text-lg"} font-extrabold text-[var(--on-surface)] leading-snug font-display`}
            >
              {worst.category}
            </h2>
            <p className={`text-[var(--on-surface-variant)] ${full ? "text-sm" : "text-xs sm:text-sm"} leading-relaxed mt-1.5 line-clamp-2`}>
              {worst.tip || summary}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="gradient"
          size="sm"
          onClick={onInsightClick}
          className={`mt-4 w-full ${full ? "py-3" : "py-2.5"} rounded-xl font-bold text-sm`}
        >
          Get the fix for this
          <ArrowRightIcon size={14} weight="bold" />
        </Button>
      </div>

      {/* ── Runners-up ── */}
      {runners.length > 0 && (
        <div
          className="px-5 sm:px-6 py-4 flex flex-col gap-2.5"
          style={{ background: "var(--surface-container-low)" }}
        >
          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)]">
            Also hurting your revenue
          </p>
          {runners.map((leak) => (
            <div key={leak.key} className="flex items-center gap-3">
              <span
                className="w-8 text-right text-xs font-extrabold shrink-0 font-display"
                style={{
                  color: scoreColorText(leak.catScore),
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {leak.catScore}
              </span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-[var(--surface-container)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${leak.catScore}%`,
                    backgroundColor: scoreColor(leak.catScore),
                    transition: "width 700ms var(--ease-out-quart)",
                  }}
                />
              </div>
              <span className="text-xs font-medium text-[var(--on-surface)] truncate max-w-[45%]">
                {leak.category}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
