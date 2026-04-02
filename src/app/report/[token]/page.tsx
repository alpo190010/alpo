import Nav from "@/components/Nav";
import type { CategoryScores } from "@/lib/analysis/types";
import {
  REPORT_CATEGORY_LABELS,
  scoreColor, scoreColorText, scoreColorTintBg,
  getStatusLabel, getExplanation,
} from "@/lib/report-helpers";

interface ReportData {
  id: string;
  email: string;
  url: string;
  score: number;
  summary: string;
  tips: string[];
  categories: CategoryScores;
  timestamp: string;
  used: boolean;
}

/** Safely map a loose Record<string, number> to the 20-field CategoryScores (0-defaults). */
function toSafeCategories(raw: Record<string, number>): CategoryScores {
  return {
    pageSpeed: Number(raw.pageSpeed) || 0,
    images: Number(raw.images) || 0,
    socialProof: Number(raw.socialProof) || 0,
    checkout: Number(raw.checkout) || 0,
    mobileCta: Number(raw.mobileCta) || 0,
    title: Number(raw.title) || 0,
    aiDiscoverability: Number(raw.aiDiscoverability) || 0,
    structuredData: Number(raw.structuredData) || 0,
    pricing: Number(raw.pricing) || 0,
    description: Number(raw.description) || 0,
    shipping: Number(raw.shipping) || 0,
    crossSell: Number(raw.crossSell) || 0,
    cartRecovery: Number(raw.cartRecovery) || 0,
    trust: Number(raw.trust) || 0,
    merchantFeed: Number(raw.merchantFeed) || 0,
    socialCommerce: Number(raw.socialCommerce) || 0,
    sizeGuide: Number(raw.sizeGuide) || 0,
    variantUx: Number(raw.variantUx) || 0,
    accessibility: Number(raw.accessibility) || 0,
    contentFreshness: Number(raw.contentFreshness) || 0,
  };
}

async function fetchReport(token: string): Promise<ReportData | null> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${baseUrl}/api/report/${token}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return { ...data, categories: toSafeCategories(data.categories ?? {}) };
  } catch {
    return null;
  }
}

export default async function ReportTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await fetchReport(token);

  if (!report) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-[var(--bg)] text-[var(--text-primary)]">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-3 tracking-[-0.02em] text-[var(--text-primary)]">Report not found or expired</h1>
          <p className="text-[15px] mb-6 text-[var(--text-secondary)]">This report link may have expired or is invalid. Try scanning your page again.</p>
          <a
            href="/"
            className="inline-block px-6 py-3 rounded-lg text-white font-semibold transition-opacity hover:opacity-90 bg-[var(--brand)] polish-focus-ring"
            aria-label="Go back and scan a new page"
          >
            Scan a New Page
          </a>
        </div>
      </main>
    );
  }

  const { score, url, summary, tips, categories } = report;
  const lossLow = (100 - score) * 4;
  const lossHigh = (100 - score) * 8;

  const sortedCategories = Object.entries(categories)
    .map(([key, val]) => ({ key, score: val as number }))
    .sort((a, b) => a.score - b.score);
  const actionPlanItems = sortedCategories.slice(0, 3).map((cat, i) => {
    const tip = tips[i] || `Improve your ${cat.key} score (currently ${cat.score}/100)`;
    return { priority: i + 1, category: cat.key, score: cat.score, tip };
  });

  return (
    <>
      <Nav variant="simple" logoText="alpo.ai" />

      <main className="min-h-screen flex flex-col items-center px-4 py-8 sm:py-12 bg-[var(--bg)] text-[var(--text-primary)]">
        <div className="max-w-2xl w-full">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-xl sm:text-2xl font-bold mb-2 tracking-[-0.02em] text-[var(--text-primary)]">Full Conversion Report</h1>
            <p className="text-sm break-all text-[var(--text-secondary)]">{url}</p>
          </div>

          {/* Score card */}
          <div
            className="text-center mb-8 bg-[var(--surface)] rounded-2xl border-[1.5px] border-[var(--border)]"
            style={{ padding: "clamp(24px, 5vw, 48px)", boxShadow: "var(--shadow-card-elevated)" }}
          >
            <div className="mb-2">
              <span
                className="font-bold font-[family-name:var(--font-mono)]"
                style={{ fontSize: "clamp(56px, 10vw, 80px)", lineHeight: 1, color: scoreColor(score) }}
              >
                {score}
              </span>
              <span className="text-xl sm:text-2xl font-semibold text-[var(--text-tertiary)]">/100</span>
            </div>
            <p className="text-sm mb-4 text-[var(--text-secondary)]">{summary}</p>

            {/* Revenue impact */}
            <div className="mt-6 p-4 sm:p-5 text-center rounded-xl bg-[var(--error-light)]">
              <p className="text-sm text-[var(--text-secondary)]">Estimated revenue loss for this product</p>
              <p className="font-extrabold mt-1 text-[var(--error-text)]" style={{ fontSize: "clamp(22px, 4vw, 28px)" }}>
                ${lossLow}–${lossHigh}/month
              </p>
            </div>

            {/* Score pills */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: scoreColorTintBg(score), color: scoreColorText(score) }}
              >
                Your score: {score}
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[var(--success-light)] text-[var(--success)]">
                Avg Shopify store: 65
              </span>
            </div>
          </div>

          {/* Category sections — all 20 */}
          <div className="grid gap-4 mb-8">
            {Object.entries(categories).map(([key, catScore]) => {
              const label = REPORT_CATEGORY_LABELS[key] || key;
              const explanation = getExplanation(key, catScore);

              return (
                <div
                  key={key}
                  className="bg-[var(--surface)] border-[1.5px] border-[var(--border)] rounded-xl"
                  style={{ borderLeft: `4px solid ${scoreColor(catScore)}`, padding: "clamp(16px, 3vw, 24px)" }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                    <h2 className="font-semibold text-base sm:text-lg text-[var(--text-primary)]">{label}</h2>
                    <span
                      className="px-3 py-1 rounded-full text-xs font-semibold self-start sm:self-auto whitespace-nowrap"
                      style={{ backgroundColor: scoreColorTintBg(catScore), color: scoreColorText(catScore) }}
                    >
                      {catScore}/100 · {getStatusLabel(catScore)}
                    </span>
                  </div>
                  <p className="text-sm sm:text-[15px] leading-relaxed text-[var(--text-secondary)]">{explanation}</p>
                </div>
              );
            })}

            {/* Action Plan */}
            <div
              className="bg-[var(--surface)] border-[1.5px] border-[var(--border)] rounded-xl"
              style={{ padding: "clamp(16px, 3vw, 24px)" }}
            >
              <h2 className="font-semibold text-base sm:text-lg mb-1 text-[var(--text-primary)]">Action Plan</h2>
              <p className="text-xs font-medium mb-4 text-[var(--brand)]">
                Top 3 prioritized fixes (ordered by lowest score)
              </p>
              <div className="grid gap-3">
                {actionPlanItems.map((item) => (
                  <div key={item.priority} className="flex gap-3 items-start">
                    <span
                      className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold bg-[var(--brand-light)] text-[var(--brand)]"
                      aria-label={`Priority ${item.priority}`}
                    >
                      {item.priority}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{item.tip}</p>
                      <p className="text-xs mt-0.5 text-[var(--text-secondary)]">
                        {item.category} — currently {item.score}/100
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Upsell */}
          <div
            className="text-center mb-8 bg-[var(--brand-light)] border-[1.5px] border-[var(--brand-border)] rounded-xl"
            style={{ padding: "clamp(20px, 4vw, 32px)" }}
          >
            <h3 className="text-base sm:text-lg font-semibold mb-2 text-[var(--text-primary)]">Get weekly monitoring + AI rewrites</h3>
            <ul className="space-y-2 mb-5 text-sm text-left max-w-xs mx-auto text-[var(--text-secondary)]">
              <li>Score alerts when something drops</li>
              <li>AI-generated rewrites for every low section</li>
              <li>Track improvements over time</li>
            </ul>
            <a
              href="#upgrade"
              className="inline-block px-8 py-3 rounded-lg text-white font-semibold transition-opacity hover:opacity-90 bg-[var(--brand)] polish-focus-ring"
              aria-label="Upgrade to paid plan for $49 per month"
            >
              Upgrade — $49/mo
            </a>
          </div>

          {/* Footer */}
          <footer className="text-center text-xs pb-8 text-[var(--text-tertiary)]">
            &copy; {new Date().getFullYear()} alpo.ai
          </footer>
        </div>
      </main>
    </>
  );
}
