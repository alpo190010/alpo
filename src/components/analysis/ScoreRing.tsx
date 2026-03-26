"use client";

import { scoreColor, scoreColorText, scoreColorTintBg, type CategoryScores } from "@/lib/analysis";

interface ScoreRingProps {
  score: number;
  animatedScore: number;
  domain: string;
  summary: string;
  categories: CategoryScores;
  leaksCount: number;
  variant?: "compact" | "full";
}

export default function ScoreRing({
  score,
  animatedScore,
  domain,
  summary,
  categories,
  leaksCount,
  variant = "compact",
}: ScoreRingProps) {
  const full = variant === "full";
  const avgScore = Math.round(
    Object.values(categories).reduce((a, b) => a + b, 0) /
      Math.max(Object.values(categories).length, 1),
  );

  return (
    <div
      className={`${full ? "md:col-span-8 p-8 sm:p-10 gap-8 sm:gap-10" : "md:col-span-7 p-6 sm:p-8 gap-6 sm:gap-8"} bg-[var(--surface)] rounded-3xl flex flex-col md:flex-row items-center relative overflow-hidden`}
      style={{ boxShadow: "var(--shadow-subtle)" }}
    >
      {/* Score ring */}
      <div className="relative shrink-0">
        <svg
          className={full ? "w-44 h-44 sm:w-48 sm:h-48" : "w-36 h-36 sm:w-40 sm:h-40"}
          viewBox="0 0 192 192"
          style={{ transform: "rotate(-90deg)" }}
          aria-hidden="true"
        >
          <circle cx="96" cy="96" r="88" fill="transparent" stroke="var(--surface-container)" strokeWidth="10" />
          <circle
            cx="96" cy="96" r="88"
            fill="transparent"
            stroke={scoreColor(score)}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray="553"
            strokeDashoffset={553 - (553 * animatedScore) / 100}
            className="score-ring-progress"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-extrabold text-[var(--on-surface)]"
            style={{
              fontSize: full ? "clamp(40px, 7vw, 56px)" : "clamp(36px, 6vw, 48px)",
              fontFamily: "var(--font-manrope), Manrope, sans-serif",
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            {animatedScore}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--on-surface-variant)] opacity-50 mt-1">
            Score
          </span>
        </div>
      </div>

      {/* Domain + context */}
      <div className={`${full ? "space-y-4" : "space-y-3"} text-center md:text-left relative z-10`}>
        <div>
          <span
            className="inline-block px-3 py-1.5 rounded-full text-xs font-bold mb-3 uppercase tracking-wider"
            style={{ backgroundColor: scoreColorTintBg(score), color: scoreColorText(score) }}
          >
            {score >= 80 ? "Excellent" : score >= 60 ? "Above Average" : score >= 40 ? "Needs Improvement" : "Critical Issues Found"}
          </span>
          {full ? (
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] tracking-tight" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
              {domain}
            </h1>
          ) : (
            <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--on-surface)] tracking-tight" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
              {domain}
            </h2>
          )}
        </div>
        <p className={`text-[var(--on-surface-variant)] max-w-md ${full ? "text-sm sm:text-base" : "text-sm"} leading-relaxed`}>
          {summary}
        </p>
        <div className={`flex gap-3 ${full ? "pt-2" : "pt-1"} justify-center md:justify-start`}>
          <div className={`${full ? "px-4 py-2.5" : "px-3 py-2"} bg-[var(--surface-container-low)] rounded-xl`}>
            <div className="text-[9px] text-[var(--on-surface-variant)] uppercase font-bold tracking-[0.15em]">Issues</div>
            <div className="text-lg font-bold text-[var(--on-surface)]" style={{ fontVariantNumeric: "tabular-nums" }}>
              {leaksCount}
            </div>
          </div>
          <div className={`${full ? "px-4 py-2.5" : "px-3 py-2"} bg-[var(--surface-container-low)] rounded-xl`}>
            <div className="text-[9px] text-[var(--on-surface-variant)] uppercase font-bold tracking-[0.15em]">Avg Score</div>
            <div className="text-lg font-bold text-[var(--on-surface)]" style={{ fontVariantNumeric: "tabular-nums" }}>
              {avgScore}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
