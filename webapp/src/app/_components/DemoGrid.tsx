"use client";

import {
  CATEGORY_SVG,
  CATEGORY_LABELS,
  CATEGORY_REVENUE_IMPACT,
  ACTIVE_DIMENSIONS,
} from "@/lib/analysis/constants";
import { scoreColorText } from "@/lib/analysis/helpers";
import { SAMPLE_SCAN } from "@/lib/sample-data";

export default function DemoGrid() {
  const sorted = Object.entries(SAMPLE_SCAN.categories)
    .filter(([key]) => ACTIVE_DIMENSIONS.has(key))
    .sort((a, b) => a[1] - b[1]);

  return (
    <div
      className="bg-[var(--surface-container-lowest)] rounded-2xl p-6 sm:p-8"
      style={{ animation: "fade-in-up 400ms var(--ease-out-quart) 240ms both" }}
    >
      <div className="flex justify-between items-center mb-5">
        <p className="text-sm font-bold text-[var(--on-surface-variant)] uppercase tracking-wider">
          Social Proof Analysis
        </p>
        <p className="text-xs text-[var(--on-surface-variant)]">Sorted by severity</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {sorted.map(([key, val]) => {
          const score = val as number;
          const pct = score;
          const barColor =
            score >= 70
              ? "var(--success)"
              : score >= 40
                ? "var(--warning)"
                : "var(--error)";
          return (
            <div
              key={key}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--surface-container-low)] transition-colors"
            >
              <div className="w-8 h-8 rounded-xl bg-[var(--surface-container-high)] flex items-center justify-center text-[var(--on-surface-variant)] shrink-0">
                {CATEGORY_SVG[key] || CATEGORY_SVG.title}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-[var(--on-surface)] truncate">
                    {CATEGORY_LABELS[key] || key}
                  </span>
                  <span
                    className="text-xs font-bold ml-2"
                    style={{ color: scoreColorText(score) }}
                  >
                    {score}
                  </span>
                </div>
                <div className="h-1.5 bg-[var(--surface-container-high)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: barColor }}
                  />
                </div>
                <span className="text-[10px] text-[var(--on-surface-variant)]">
                  {CATEGORY_REVENUE_IMPACT[key]} impact
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
