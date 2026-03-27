"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import { CATEGORY_SVG, type LeakCard } from "@/lib/analysis";

interface IssueCardProps {
  leak: LeakCard;
  index: number;
  onClick: () => void;
  variant?: "compact" | "full";
}

export default function IssueCard({
  leak,
  index,
  onClick,
  variant = "compact",
}: IssueCardProps) {
  const full = variant === "full";

  const impactStyle = {
    HIGH: { textColor: "var(--error-text)" },
    MED: { textColor: "var(--warning-text)" },
    LOW: { textColor: "var(--success-text)" },
  }[leak.impact as "HIGH" | "MED" | "LOW"] || { textColor: "var(--on-surface)" };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer group text-left bg-[var(--surface)] rounded-[1.5rem] ${full ? "p-6 sm:p-7" : "p-5 sm:p-6"} flex flex-col justify-between border border-[var(--outline-variant)]/20 hover:border-[var(--brand)]/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)]`}
      style={{
        boxShadow: "var(--shadow-subtle)",
        animation: `fade-in-up 400ms ease-out ${index * 70}ms both`,
      }}
    >
      <div className={full ? "space-y-5" : "space-y-4"}>
        {/* Icon + Score */}
        <div className="flex justify-between items-start">
          <div className={`${full ? "w-12 h-12" : "w-11 h-11"} bg-[var(--surface-container-high)] rounded-2xl flex items-center justify-center text-[var(--on-surface-variant)] group-hover:text-[var(--brand)] group-hover:scale-110 transition-all duration-300`}>
            {CATEGORY_SVG[leak.key] || CATEGORY_SVG.title}
          </div>
          <div className="text-right">
            <div className="text-[9px] font-bold text-[var(--on-surface-variant)] tracking-[0.15em] uppercase">Score</div>
            <div
              className="text-xl font-extrabold"
              style={{ color: impactStyle.textColor, fontVariantNumeric: "tabular-nums" }}
            >
              {leak.catScore}<span className="text-xs font-semibold opacity-50">/100</span>
            </div>
          </div>
        </div>

        {/* Category + Problem */}
        <div className="space-y-2">
          <h3 className={`${full ? "text-lg sm:text-xl" : "text-base sm:text-lg"} font-bold text-[var(--on-surface)] tracking-tight leading-snug`}>
            {leak.category}
          </h3>
          <p className="text-sm text-[var(--on-surface-variant)] leading-relaxed line-clamp-3">
            {leak.problem}
          </p>
        </div>
      </div>

      {/* Bottom: Revenue + Arrow */}
      <div className={`${full ? "mt-6 pt-5" : "mt-5 pt-4"} border-t border-[var(--surface-container)] flex justify-between items-center`}>
        <div>
          <div className="text-[9px] font-bold text-[var(--on-surface-variant)] uppercase tracking-[0.15em]">Potential Gain</div>
          <div className={`${full ? "text-base sm:text-lg" : "text-base"} font-extrabold text-[var(--success)]`}>
            {leak.revenue}
          </div>
        </div>
        <CaretRightIcon
          className="w-5 h-5 text-[var(--on-surface-variant)] group-hover:text-[var(--brand)] group-hover:translate-x-1 transition-all duration-200"
          weight="bold"
        />
      </div>
    </button>
  );
}
