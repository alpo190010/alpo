"use client";

/* ── Types (local copy — component stays self-contained) ── */
interface CategoryScores {
  title: number;
  images: number;
  pricing: number;
  socialProof: number;
  cta: number;
  description: number;
  trust: number;
}

interface CompetitorComparisonProps {
  competitors: Array<{
    name: string;
    url: string;
    score: number;
    summary: string;
    categories: CategoryScores;
  }>;
  userCategories: CategoryScores;
  userScore: number;
  onBeatCompetitor?: (name: string) => void;
}

/* ── Constants ── */
const CATEGORY_LABELS: Record<string, string> = {
  title: "Title",
  images: "Images",
  pricing: "Pricing",
  socialProof: "Social Proof",
  cta: "CTA",
  description: "Description",
  trust: "Trust",
};

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as (keyof CategoryScores)[];

/* ── Score color helpers (0-100 scale, mirrors page.tsx) ── */
function overallScoreColor(score: number): string {
  if (score >= 70) return "var(--success)";
  if (score >= 40) return "var(--warning)";
  return "var(--error)";
}

function overallScoreBg(score: number): string {
  if (score >= 70) return "var(--success-light)";
  if (score >= 40) return "var(--warning-light)";
  return "var(--error-light)";
}

/* ── Win/loss bar color ── */
function resultBarColor(userVal: number, compVal: number): string {
  if (userVal > compVal) return "var(--success)";
  if (userVal < compVal) return "var(--error)";
  return "var(--brand)";
}

function resultTextColor(userVal: number, compVal: number): string {
  if (userVal > compVal) return "var(--success-text)";
  if (userVal < compVal) return "var(--error-text)";
  return "var(--text-primary)";
}

/* ══════════════════════════════════════════════════════════ */

export default function CompetitorComparison({
  competitors,
  userCategories,
  userScore,
  onBeatCompetitor,
}: CompetitorComparisonProps) {
  /* ── Empty state: 0 competitors ── */
  if (competitors.length === 0) {
    return (
      <section
        className="text-center mt-12 mb-4"
        style={{ animation: "fade-in-up 400ms ease-out both" }}
        aria-label="No competitors found"
      >
        <div
          className="max-w-md mx-auto w-full p-8 rounded-2xl bg-[var(--surface)] border border-[var(--border)]"
          style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
        >
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--surface-dim)] border border-[var(--border)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M21 21l-4.35-4.35M11 6v5m0 0v5m0-5h5m-5 0H6"
                stroke="var(--text-tertiary)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="11" cy="11" r="8" stroke="var(--text-tertiary)" strokeWidth="1.5" />
            </svg>
          </div>
          <h3
            className="text-lg font-semibold mb-2 text-[var(--text-primary)]"
            style={{ textWrap: "balance" }}
          >
            No competitors found
          </h3>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            We couldn&apos;t find similar products to compare against.
            This can happen with very niche or unique products.
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-3">
            Try scanning a different product page for comparison
          </p>
        </div>
      </section>
    );
  }

  /* ── Comparison results ── */
  return (
    <section className="mt-12 mb-4 anim-phase-enter" aria-label="Competitor comparison">
      {/* Section heading */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--brand-light)] border border-[var(--brand-border)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M16 3h5v5M4 20L20.586 3.414M8 21H3v-5M20 4L3.414 20.586"
              stroke="var(--brand)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <h2
            className="text-xl font-bold text-[var(--text-primary)]"
            style={{ textWrap: "balance" }}
          >
            Competitive Breakdown
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            How your page compares category by category
          </p>
        </div>
      </div>

      {/* Competitor cards */}
      <div className="flex flex-col gap-5">
        {competitors.map((comp, i) => {
          const wins = CATEGORY_KEYS.filter(
            (k) => (userCategories[k] ?? 0) > (comp.categories[k] ?? 0)
          ).length;
          const losses = CATEGORY_KEYS.filter(
            (k) => (userCategories[k] ?? 0) < (comp.categories[k] ?? 0)
          ).length;
          const ties = CATEGORY_KEYS.length - wins - losses;
          const userLeads = userScore > comp.score;
          const scoreTied = userScore === comp.score;
          const scoreDiff = Math.abs(userScore - comp.score);

          return (
            <article
              key={comp.url}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden polish-hover-lift"
              style={{
                boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                animation: `fade-in-up 400ms ease-out ${i * 150}ms both`,
              }}
            >
              {/* ─── Card header ─── */}
              <div className="px-5 py-5 sm:px-7 sm:py-6 border-b border-[var(--border)]">
                {/* Name + W/L record */}
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                      vs
                    </span>
                    <h3 className="text-base font-semibold text-[var(--text-primary)] truncate">
                      {comp.name}
                    </h3>
                  </div>
                  <span
                    className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      backgroundColor:
                        wins > losses
                          ? "var(--success-light)"
                          : wins < losses
                            ? "var(--error-light)"
                            : "var(--surface-dim)",
                      color:
                        wins > losses
                          ? "var(--success-text)"
                          : wins < losses
                            ? "var(--error-text)"
                            : "var(--text-secondary)",
                    }}
                  >
                    {wins}W · {losses}L{ties > 0 ? ` · ${ties}T` : ""}
                  </span>
                </div>

                {/* Overall score badges */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* User badge */}
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                    style={{
                      backgroundColor: overallScoreBg(userScore),
                      border: `1.5px solid ${
                        userLeads ? "var(--success-border)" : "var(--border)"
                      }`,
                    }}
                  >
                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                      You
                    </span>
                    <span
                      className="text-sm font-bold font-[family-name:var(--font-mono)]"
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        color: overallScoreColor(userScore),
                      }}
                    >
                      {userScore}
                    </span>
                  </div>

                  <span className="text-xs text-[var(--text-tertiary)]">vs</span>

                  {/* Competitor badge */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-dim)] border-[1.5px] border-[var(--border)]">
                    <span className="text-xs font-medium text-[var(--text-secondary)] truncate max-w-[100px]">
                      {comp.name}
                    </span>
                    <span
                      className="text-sm font-bold font-[family-name:var(--font-mono)]"
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        color: overallScoreColor(comp.score),
                      }}
                    >
                      {comp.score}
                    </span>
                  </div>

                  {/* Lead indicator */}
                  {!scoreTied && (
                    <span
                      className="text-xs font-medium"
                      style={{
                        color: userLeads
                          ? "var(--success-text)"
                          : "var(--error-text)",
                      }}
                    >
                      {userLeads ? "You lead" : "They lead"} by {scoreDiff}
                    </span>
                  )}
                </div>
              </div>

              {/* ─── Per-category breakdown ─── */}
              <div className="px-5 py-4 sm:px-7 sm:py-5">
                {CATEGORY_KEYS.map((key, j) => {
                  const userCat = userCategories[key] ?? 0;
                  const compCat = comp.categories[key] ?? 0;
                  const isWin = userCat > compCat;
                  const isLoss = userCat < compCat;

                  return (
                    <div
                      key={key}
                      className={`py-3 ${
                        j < CATEGORY_KEYS.length - 1
                          ? "border-b border-[var(--track)]"
                          : ""
                      }`}
                      style={{
                        animation: `fade-in-up 300ms ease-out ${i * 150 + j * 40}ms both`,
                      }}
                    >
                      {/* Category label + win/loss indicator */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {CATEGORY_LABELS[key]}
                        </span>
                        {isWin ? (
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center bg-[var(--success-light)]"
                            aria-label="You win this category"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 16 16"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M3 8.5L6.5 12L13 4"
                                stroke="var(--success)"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        ) : isLoss ? (
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center bg-[var(--error-light)]"
                            aria-label="Competitor wins this category"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 16 16"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M4 4L12 12M12 4L4 12"
                                stroke="var(--error)"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          </span>
                        ) : (
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center bg-[var(--surface-dim)]"
                            aria-label="Tied in this category"
                          >
                            <span className="text-[10px] font-bold text-[var(--text-tertiary)]">
                              =
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Dual score bars */}
                      <div className="flex flex-col gap-1.5">
                        {/* User bar */}
                        <div className="flex items-center gap-2.5">
                          <span className="text-[11px] font-medium text-[var(--text-tertiary)] w-11 shrink-0">
                            You
                          </span>
                          <div className="flex-1 h-2 rounded-sm bg-[var(--track)] overflow-hidden">
                            <div
                              className="h-full rounded-sm"
                              style={{
                                width: `${(userCat / 10) * 100}%`,
                                backgroundColor: resultBarColor(
                                  userCat,
                                  compCat
                                ),
                                transition:
                                  "width 600ms cubic-bezier(0.25, 1, 0.5, 1)",
                              }}
                            />
                          </div>
                          <span
                            className="text-xs font-bold font-[family-name:var(--font-mono)] w-6 text-right"
                            style={{
                              fontVariantNumeric: "tabular-nums",
                              color: resultTextColor(userCat, compCat),
                            }}
                          >
                            {userCat}
                          </span>
                        </div>

                        {/* Competitor bar */}
                        <div className="flex items-center gap-2.5">
                          <span className="text-[11px] font-medium text-[var(--text-tertiary)] w-11 shrink-0 truncate">
                            Them
                          </span>
                          <div className="flex-1 h-2 rounded-sm bg-[var(--track)] overflow-hidden">
                            <div
                              className="h-full rounded-sm"
                              style={{
                                width: `${(compCat / 10) * 100}%`,
                                backgroundColor: "var(--text-tertiary)",
                                transition:
                                  "width 600ms cubic-bezier(0.25, 1, 0.5, 1)",
                              }}
                            />
                          </div>
                          <span
                            className="text-xs font-bold font-[family-name:var(--font-mono)] w-6 text-right text-[var(--text-tertiary)]"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {compCat}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ─── AI summary ─── */}
              {comp.summary && (
                <div className="px-5 py-4 sm:px-7 sm:py-5 border-t border-[var(--border)] bg-[var(--surface-dim)]">
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    {comp.summary}
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* ─── Beat-competitor CTA ─── */}
      {competitors.length > 0 && onBeatCompetitor && (() => {
        const topCompetitor = competitors.reduce((best, c) =>
          c.score > best.score ? c : best
        );
        return (
          <div className="mt-10 text-center" style={{ animation: "fade-in-up 400ms ease-out 300ms both" }}>
            <button
              type="button"
              onClick={() => onBeatCompetitor(topCompetitor.name)}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white polish-hover-lift polish-focus-ring bg-gradient-to-r from-[var(--brand)] to-blue-700"
              style={{
                boxShadow: "0 8px 32px color-mix(in srgb, var(--brand) 20%, transparent)",
              }}
            >
              Get a Detailed Plan to Beat {topCompetitor.name} →
            </button>
          </div>
        );
      })()}
    </section>
  );
}
