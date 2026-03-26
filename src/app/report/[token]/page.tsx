interface CategoryScores {
  title: number;
  images: number;
  pricing: number;
  socialProof: number;
  cta: number;
  description: number;
  trust: number;
}

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

const SECTIONS: {
  key: string;
  title: string;
  getScore: (c: CategoryScores) => number;
}[] = [
  { key: "title", title: "Product Title", getScore: (c) => c.title },
  { key: "images", title: "Images", getScore: (c) => c.images },
  { key: "pricing", title: "Pricing & Anchoring", getScore: (c) => c.pricing },
  { key: "socialProof", title: "Social Proof", getScore: (c) => c.socialProof },
  { key: "cta", title: "CTA Strength", getScore: (c) => c.cta },
  { key: "description", title: "Description Quality", getScore: (c) => c.description },
  { key: "trust", title: "Trust Signals", getScore: (c) => c.trust },
  { key: "mobile", title: "Mobile Experience", getScore: (c) => (c.cta < 50 ? Math.min(c.cta, 35) : Math.min(100, Math.round((c.cta + c.images) / 2))) },
  { key: "seo", title: "SEO Discoverability", getScore: (c) => Math.min(100, Math.max(0, c.title)) },
];

/* ── Semantic color helpers using CSS variable values ── */
function scoreColor(score: number): string {
  if (score >= 70) return "var(--success)";
  if (score >= 40) return "var(--warning)";
  return "var(--error)";
}

/** High-contrast variant for text on tinted backgrounds */
function scoreColorText(score: number): string {
  if (score >= 70) return "var(--success-text)";
  if (score >= 40) return "var(--warning-text)";
  return "var(--error-text)";
}

function sectionScoreColor(score: number): string {
  if (score >= 70) return "var(--success-text)";
  if (score >= 40) return "var(--warning-text)";
  return "var(--error-text)";
}

function sectionScoreBg(score: number): string {
  if (score >= 70) return "var(--success-light)";
  if (score >= 40) return "var(--warning-light)";
  return "var(--error-light)";
}

function sectionBorderColor(score: number): string {
  if (score >= 70) return "var(--success)";
  if (score >= 40) return "var(--warning)";
  return "var(--error)";
}

function getStatusLabel(score: number): string {
  if (score >= 70) return "Strong";
  if (score >= 40) return "Room to improve";
  return "Critical issue";
}

function getExplanation(key: string, score: number): string {
  const explanations: Record<string, Record<string, string>> = {
    title: {
      high: "Your product title is well-optimized with clear keywords and benefit-driven language that helps both SEO and conversions.",
      mid: "Your title could use stronger keyword targeting and benefit-driven language. Consider including the primary use case or key differentiator.",
      low: "Your product title needs urgent attention. It likely lacks keywords, is too generic, or doesn't communicate value. Rewrite with your top keyword + key benefit.",
    },
    images: {
      high: "Strong image presentation with multiple angles, lifestyle shots, and good quality. This builds buyer confidence effectively.",
      mid: "Your images are functional but could be stronger. Add lifestyle shots, zoom-capable high-res images, and show the product in use.",
      low: "Critical image issues detected. Missing multiple angles, poor quality, or no lifestyle context. Product images are the #1 conversion driver — fix this first.",
    },
    pricing: {
      high: "Good pricing presentation with effective anchoring, clear value proposition, and strategic use of compare-at prices or bundles.",
      mid: "Your pricing display could better communicate value. Consider adding compare-at prices, bundle savings, or per-unit cost breakdowns.",
      low: "Pricing presentation is hurting conversions. No anchoring, no perceived value, or confusing price structure. Add compare-at prices and emphasize savings.",
    },
    socialProof: {
      high: "Strong social proof with reviews, ratings, and trust indicators that help overcome purchase hesitation.",
      mid: "Some social proof present but underutilized. Feature review count more prominently, add photo reviews, or highlight specific testimonials.",
      low: "Critically low social proof. Missing or hidden reviews severely impact trust. Prioritize collecting and displaying customer reviews immediately.",
    },
    cta: {
      high: "Your call-to-action is clear, prominent, and compelling. Good use of urgency or benefit-driven button copy.",
      mid: "Your CTA could be stronger. Consider more compelling button text (not just 'Add to Cart'), better visual prominence, or adding urgency.",
      low: "Your CTA is weak or hard to find. This is directly costing you sales. Make the buy button unmissable, use action-oriented copy, and reduce friction.",
    },
    description: {
      high: "Well-written description with clear benefits, scannable formatting, and persuasive copy that addresses buyer concerns.",
      mid: "Description is adequate but could convert better. Break into scannable sections, lead with benefits over features, and address common objections.",
      low: "Product description needs a complete rewrite. It's either too thin, feature-only, wall-of-text, or missing entirely. Lead with benefits and use bullet points.",
    },
    trust: {
      high: "Good trust signals including shipping info, return policy, secure payment badges, and brand credibility indicators.",
      mid: "Some trust signals present but gaps remain. Add visible return policy, shipping timeline, payment security badges, and guarantee info near the buy button.",
      low: "Missing critical trust signals. Buyers don't feel safe purchasing. Add return policy, shipping info, security badges, and guarantees immediately.",
    },
    mobile: {
      high: "Mobile experience is well-optimized with touch-friendly elements, readable text, and fast-loading images.",
      mid: "Mobile experience has issues. Buttons may be too small, text hard to read, or layout breaks on smaller screens. Test on actual devices.",
      low: "Serious mobile issues detected. With 60%+ of Shopify traffic on mobile, this is critically hurting conversions. Fix touch targets, readability, and layout.",
    },
    seo: {
      high: "Good SEO foundation with optimized title, proper meta tags, and structured data that helps search visibility.",
      mid: "SEO could be improved. Title may lack target keywords, meta description may be generic, or structured data may be missing.",
      low: "Poor SEO setup means you're invisible in search results. Optimize your title tag, add a compelling meta description, and implement product schema markup.",
    },
  };

  const level = score >= 70 ? "high" : score >= 40 ? "mid" : "low";
  return explanations[key]?.[level] || (score >= 70
    ? "This section is performing well."
    : score >= 40
    ? "There's room for improvement in this area."
    : "This needs urgent attention.");
}

async function fetchReport(token: string): Promise<ReportData | null> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  try {
    const res = await fetch(`${baseUrl}/api/report/${token}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
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
      {/* ═══ NAV ═══ */}
      <nav className="w-full h-16 bg-[var(--bg)] border-b border-[var(--border)]" aria-label="Main navigation">
        <div className="max-w-2xl mx-auto px-4 h-full flex items-center">
          <a href="/" className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]" aria-label="alpo.ai home">
            alpo.ai
          </a>
        </div>
      </nav>

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
            style={{
              padding: "clamp(24px, 5vw, 48px)",
              boxShadow: "0 4px 32px rgba(0,0,0,0.10)",
            }}
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
              <p
                className="font-extrabold mt-1 text-[var(--error-text)]"
                style={{ fontSize: "clamp(22px, 4vw, 28px)" }}
              >
                ${lossLow}–${lossHigh}/month
              </p>
            </div>

            {/* Score pills */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: sectionScoreBg(score), color: scoreColorText(score) }}
              >
                Your score: {score}
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[var(--success-light)] text-[var(--success)]">
                Avg Shopify store: 65
              </span>
            </div>
          </div>

          {/* Sections */}
          <div className="grid gap-4 mb-8">
            {SECTIONS.map((section) => {
              const sectionScore = section.getScore(categories);
              const explanation = getExplanation(section.key, sectionScore);

              return (
                <div
                  key={section.key}
                  className="bg-[var(--surface)] border-[1.5px] border-[var(--border)] rounded-xl"
                  style={{
                    borderLeft: `4px solid ${sectionBorderColor(sectionScore)}`,
                    padding: "clamp(16px, 3vw, 24px)",
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                    <h2 className="font-semibold text-base sm:text-lg text-[var(--text-primary)]">{section.title}</h2>
                    <span
                      className="px-3 py-1 rounded-full text-xs font-semibold self-start sm:self-auto whitespace-nowrap"
                      style={{ backgroundColor: sectionScoreBg(sectionScore), color: sectionScoreColor(sectionScore) }}
                    >
                      {sectionScore}/100 · {getStatusLabel(sectionScore)}
                    </span>
                  </div>
                  <p className="text-sm sm:text-[15px] leading-relaxed text-[var(--text-secondary)]">
                    {explanation}
                  </p>
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
