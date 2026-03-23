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
  { key: "mobile", title: "Mobile Experience", getScore: (c) => (c.cta < 6 ? Math.min(c.cta, 4) : Math.min(10, Math.round((c.cta + c.images) / 2))) },
  { key: "seo", title: "SEO Discoverability", getScore: (c) => Math.min(10, Math.max(0, c.title)) },
];

function scoreColor(score: number): string {
  if (score >= 70) return "#16A34A";
  if (score >= 40) return "#D97706";
  return "#DC2626";
}

function sectionScoreColor(score: number): string {
  if (score >= 8) return "#16A34A";
  if (score >= 5) return "#D97706";
  return "#DC2626";
}

function sectionScoreBg(score: number): string {
  if (score >= 8) return "#F0FDF4";
  if (score >= 5) return "#FFFBEB";
  return "#FEF2F2";
}

function getStatusLabel(score: number): string {
  if (score >= 8) return "Strong";
  if (score >= 5) return "Room to improve";
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
      mid: "Your CTA could be stronger. Consider more compelling button text, better visual prominence, or adding urgency.",
      low: "Your CTA is weak or hard to find. This is directly costing you sales. Make the buy button unmissable and use action-oriented copy.",
    },
    description: {
      high: "Well-written description with clear benefits, scannable formatting, and persuasive copy that addresses buyer concerns.",
      mid: "Description is adequate but could convert better. Break into scannable sections, lead with benefits over features, and address common objections.",
      low: "Product description needs a complete rewrite. Lead with benefits and use bullet points.",
    },
    trust: {
      high: "Good trust signals including shipping info, return policy, secure payment badges, and brand credibility indicators.",
      mid: "Some trust signals present but gaps remain. Add visible return policy, shipping timeline, payment security badges, and guarantee info near the buy button.",
      low: "Missing critical trust signals. Add return policy, shipping info, security badges, and guarantees immediately.",
    },
    mobile: {
      high: "Mobile experience is well-optimized with touch-friendly elements, readable text, and fast-loading images.",
      mid: "Mobile experience has issues. Buttons may be too small, text hard to read, or layout breaks on smaller screens.",
      low: "Serious mobile issues detected. With 60%+ of Shopify traffic on mobile, this is critically hurting conversions.",
    },
    seo: {
      high: "Good SEO foundation with optimized title, proper meta tags, and structured data that helps search visibility.",
      mid: "SEO could be improved. Title may lack target keywords, meta description may be generic, or structured data may be missing.",
      low: "Poor SEO setup means you're invisible in search results. Optimize your title tag and add a compelling meta description.",
    },
  };

  const level = score >= 8 ? "high" : score >= 5 ? "mid" : "low";
  return explanations[key]?.[level] || (score >= 8
    ? "This section is performing well."
    : score >= 5
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
      <main className="min-h-screen flex flex-col items-center justify-center px-4" style={{ backgroundColor: "#F8F7F4", color: "#111111" }}>
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-3 text-[#111111]">Report not found or expired</h1>
          <p className="text-[#6B6B6B] mb-6">This report link may have expired or is invalid. Try scanning your page again.</p>
          <a
            href="/"
            className="inline-block px-6 py-3 rounded-lg text-white font-semibold transition no-underline"
            style={{ backgroundColor: "#2563EB" }}
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
    const tip = tips[i] || `Improve your ${cat.key} score (currently ${cat.score}/10)`;
    return { priority: i + 1, category: cat.key, score: cat.score, tip };
  });

  let domain = "";
  try { domain = new URL(url).hostname; } catch { domain = url; }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12" style={{ backgroundColor: "#F8F7F4", color: "#111111" }}>
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <a href="/" className="inline-block mb-6 text-lg font-bold text-[#111111] no-underline" style={{ letterSpacing: "-0.02em" }}>
            PageScore
          </a>
          <h1 className="text-2xl font-bold mb-2 text-[#111111]" style={{ letterSpacing: "-0.02em" }}>Full Conversion Report</h1>
          <p className="text-sm text-[#9E9E9E]">{domain}</p>
        </div>

        {/* Score hero */}
        <div
          className="rounded-2xl p-8 text-center mb-8"
          style={{
            backgroundColor: "#FFFFFF",
            border: "1.5px solid #E5E7EB",
            borderRadius: "16px",
            boxShadow: "0 4px 32px rgba(0,0,0,0.10)",
          }}
        >
          <div className="mb-2">
            <span
              className="font-bold font-[family-name:var(--font-mono)]"
              style={{ fontSize: "80px", lineHeight: 1, color: scoreColor(score) }}
            >
              {score}
            </span>
            <span className="text-2xl font-semibold text-[#9E9E9E]">/100</span>
          </div>
          <p className="text-[15px] text-[#6B6B6B] mb-4">{summary}</p>

          {/* Revenue impact */}
          <div className="mt-4 p-5 rounded-xl" style={{ backgroundColor: "#FEF2F2", borderRadius: "12px" }}>
            <p className="text-sm text-[#6B6B6B]">Estimated monthly revenue loss</p>
            <p className="text-2xl font-extrabold text-[#DC2626] my-1">${lossLow}&ndash;${lossHigh}/month</p>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-4 mb-8">
          {SECTIONS.map((section) => {
            const sectionScore = section.getScore(categories);
            const explanation = getExplanation(section.key, sectionScore);

            return (
              <div
                key={section.key}
                className="rounded-xl p-5"
                style={{ backgroundColor: "#FFFFFF", border: "1.5px solid #E5E7EB", borderRadius: "12px" }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="font-semibold flex-1 text-[#111111] text-lg">{section.title}</h2>
                  <span
                    className="px-3 py-1 rounded-full text-sm font-semibold"
                    style={{ backgroundColor: sectionScoreBg(sectionScore), color: sectionScoreColor(sectionScore) }}
                  >
                    {sectionScore}/10
                  </span>
                </div>
                <div className="text-xs font-medium mb-2" style={{ color: sectionScoreColor(sectionScore) }}>
                  {getStatusLabel(sectionScore)}
                </div>
                <p className="text-[15px] leading-relaxed text-[#6B6B6B]">
                  {explanation}
                </p>
              </div>
            );
          })}

          {/* Action Plan */}
          <div
            className="rounded-xl p-5"
            style={{ backgroundColor: "#FFFFFF", border: "1.5px solid #E5E7EB", borderRadius: "12px" }}
          >
            <h2 className="font-semibold text-[#111111] text-lg mb-1">Action Plan</h2>
            <p className="text-xs font-medium mb-4" style={{ color: "#2563EB" }}>
              Top 3 prioritized fixes (ordered by lowest score)
            </p>
            <div className="space-y-3">
              {actionPlanItems.map((item) => (
                <div key={item.priority} className="flex gap-3 items-start">
                  <span
                    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ backgroundColor: "#EFF6FF", color: "#2563EB" }}
                  >
                    {item.priority}
                  </span>
                  <div className="flex-1">
                    <p className="text-[15px] font-medium text-[#111111]">{item.tip}</p>
                    <p className="text-xs mt-0.5 text-[#6B6B6B]">
                      {item.category} &mdash; currently {item.score}/10
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Upsell card */}
        <div
          className="rounded-2xl p-6 text-center mb-8"
          style={{ backgroundColor: "#EFF6FF", border: "1.5px solid #BFDBFE", borderRadius: "16px" }}
        >
          <h3 className="text-lg font-bold text-[#111111] mb-2">Get weekly monitoring + AI rewrites</h3>
          <ul className="space-y-2 mb-5 text-[15px] text-[#6B6B6B] list-none p-0">
            <li>Score alerts when something drops</li>
            <li>AI-generated rewrites for every low section</li>
            <li>Track improvements over time</li>
          </ul>
          <a
            href="#upgrade"
            className="inline-block px-8 py-3 rounded-lg text-white font-bold transition no-underline"
            style={{ backgroundColor: "#2563EB" }}
          >
            Upgrade &mdash; $49/mo
          </a>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs pb-8 text-[#9E9E9E]">
          PageScore &bull; alpo.ai
        </footer>
      </div>
    </main>
  );
}
