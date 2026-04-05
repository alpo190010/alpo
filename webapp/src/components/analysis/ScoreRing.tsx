"use client";

import { scoreColor, scoreColorText, scoreColorTintBg, type CategoryScores, ACTIVE_DIMENSIONS } from "@/lib/analysis";

interface ScoreRingProps {
  score: number;
  animatedScore: number;
  domain: string;
  productName?: string;
  productUrl?: string;
  productImage?: string;
  summary: string;
  categories: CategoryScores;
  leaksCount: number;
  variant?: "compact" | "full";
}

export default function ScoreRing({
  score,
  animatedScore,
  domain,
  productName,
  productUrl,
  productImage,
  summary,
  categories,
  leaksCount,
  variant = "compact",
}: ScoreRingProps) {
  const full = variant === "full";
  const activeEntries = Object.entries(categories).filter(([k]) => ACTIVE_DIMENSIONS.has(k));
  const criticalCount = activeEntries.filter(([, s]) => s < 40).length;
  const ringSize = full ? "w-28 h-28 sm:w-32 sm:h-32" : "w-24 h-24 sm:w-28 sm:h-28";
  const HeadingTag = full ? "h1" : "h2";

  return (
    <div
      className={`${full ? "md:col-span-8 p-6 sm:p-8" : "md:col-span-7 p-5 sm:p-6"} bg-[var(--surface)] rounded-3xl relative overflow-hidden`}
      style={{ boxShadow: "var(--shadow-subtle)" }}
    >
      {/* ── Zone 1: Product identity ── */}
      <div className="flex items-center gap-3 mb-5">
        {productImage && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={productImage}
            alt=""
            className={`${full ? "w-11 h-11" : "w-9 h-9"} rounded-xl object-cover shrink-0`}
            style={{ border: "1px solid var(--outline-variant)" }}
          />
        )}
        <div className="min-w-0 flex-1">
          <HeadingTag
            className={`${full ? "text-lg sm:text-xl" : "text-base sm:text-lg"} font-bold text-[var(--on-surface)] truncate capitalize leading-tight font-display`}
          >
            {productName || domain}
          </HeadingTag>
          {productName ? (
            <a
              href={productUrl || `https://${domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] hover:underline transition-colors"
            >
              {domain} ↗
            </a>
          ) : (
            <p className="text-xs text-[var(--on-surface-variant)]">{leaksCount} issues found</p>
          )}
        </div>
        <span
          className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0"
          style={{ backgroundColor: scoreColorTintBg(score), color: scoreColorText(score) }}
        >
          {score >= 80 ? "Excellent" : score >= 60 ? "Above Avg" : score >= 40 ? "Needs Work" : "Critical"}
        </span>
      </div>

      {/* ── Zone 2: Score ring + summary side by side ── */}
      <div className="flex items-center gap-5 sm:gap-6">
        <div className={`relative shrink-0 ${ringSize}`}>
          <svg
            className="w-full h-full"
            viewBox="0 0 128 128"
            style={{ transform: "rotate(-90deg)" }}
            aria-hidden="true"
          >
            <circle cx="64" cy="64" r="56" fill="transparent" stroke="var(--surface-container)" strokeWidth="8" />
            <circle
              cx="64" cy="64" r="56"
              fill="transparent"
              stroke={scoreColor(score)}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray="352"
              strokeDashoffset={352 - (352 * animatedScore) / 100}
              className="score-ring-progress"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="font-extrabold text-[var(--on-surface)] font-display"
              style={{
                fontSize: full ? "clamp(28px, 5vw, 40px)" : "clamp(24px, 4vw, 34px)",
                lineHeight: 1,
                letterSpacing: "-0.02em",
              }}
            >
              {animatedScore}
            </span>
            <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-[var(--on-surface-variant)] opacity-50 mt-0.5">
              /100
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className={`text-[var(--on-surface-variant)] ${full ? "text-sm" : "text-xs sm:text-sm"} leading-relaxed line-clamp-3`}>
            {summary}
          </p>
        </div>
      </div>

      {/* ── Zone 3: Stats strip ── */}
      <div className="flex gap-2 mt-5 pt-5" style={{ borderTop: "1px solid var(--outline-variant)", borderTopColor: "color-mix(in oklch, var(--outline-variant) 40%, transparent)" }}>
        <div className="flex-1 text-center py-1.5">
          <div
            className={`${full ? "text-xl" : "text-lg"} font-extrabold text-[var(--on-surface)] font-display`}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {leaksCount}
          </div>
          <div className="text-[9px] text-[var(--on-surface-variant)] uppercase font-semibold tracking-[0.1em]">Issues</div>
        </div>
        <div className="w-px self-stretch" style={{ background: "color-mix(in oklch, var(--outline-variant) 40%, transparent)" }} />
        <div className="flex-1 text-center py-1.5">
          <div
            className={`${full ? "text-xl" : "text-lg"} font-extrabold font-display`}
            style={{ color: criticalCount > 0 ? "var(--error)" : "var(--success)", fontVariantNumeric: "tabular-nums" }}
          >
            {criticalCount}
          </div>
          <div className="text-[9px] text-[var(--on-surface-variant)] uppercase font-semibold tracking-[0.1em]">Critical</div>
        </div>
        <div className="w-px self-stretch" style={{ background: "color-mix(in oklch, var(--outline-variant) 40%, transparent)" }} />
        <div className="flex-1 text-center py-1.5">
          <div
            className={`${full ? "text-xl" : "text-lg"} font-extrabold text-[var(--on-surface)] font-display`}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {activeEntries.length}
          </div>
          <div className="text-[9px] text-[var(--on-surface-variant)] uppercase font-semibold tracking-[0.1em]">Dimensions</div>
        </div>
      </div>
    </div>
  );
}
