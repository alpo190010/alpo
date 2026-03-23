"use client";

import { useState } from "react";
import posthog from "posthog-js";

interface FreeResult {
  score: number;
  summary: string;
  tips: string[];
  categories: CategoryScores;
}

interface CategoryScores {
  title: number;
  images: number;
  pricing: number;
  socialProof: number;
  cta: number;
  description: number;
  trust: number;
}

interface CompetitorData {
  yourPage: {
    score: number;
    summary: string;
    tips: string[];
    categories: CategoryScores;
    url: string;
  };
  competitors: {
    name: string;
    url: string;
    score: number;
    summary: string;
    categories: CategoryScores;
  }[];
}

const CATEGORY_LABELS: Record<keyof CategoryScores, string> = {
  title: "Title",
  images: "Images",
  pricing: "Pricing",
  socialProof: "Social Proof",
  cta: "CTA",
  description: "Description",
  trust: "Trust",
};

const SECTION_META: { key: keyof CategoryScores | "mobile" | "seo" | "actionPlan"; icon: string; title: string }[] = [
  { key: "title", icon: "📝", title: "Product Title Score" },
  { key: "images", icon: "🖼️", title: "Image Analysis" },
  { key: "pricing", icon: "💰", title: "Pricing & Anchoring" },
  { key: "socialProof", icon: "⭐", title: "Social Proof" },
  { key: "cta", icon: "🎯", title: "CTA Strength" },
  { key: "description", icon: "📄", title: "Description Quality" },
  { key: "trust", icon: "🛡️", title: "Trust Signals" },
  { key: "mobile", icon: "📱", title: "Mobile Experience" },
  { key: "seo", icon: "🔍", title: "SEO & Discoverability" },
  { key: "actionPlan", icon: "📋", title: "Action Plan" },
];

function getSectionScore(key: string, categories: CategoryScores, overallScore: number): number {
  if (key === "mobile") return Math.min(10, Math.max(0, Math.round(overallScore / 10 - 1)));
  if (key === "seo") return Math.min(10, Math.max(0, Math.round((overallScore / 10) - 0.5)));
  if (key === "actionPlan") return -1; // not scored
  return (categories as unknown as Record<string, number>)[key] ?? 5;
}

function getSectionExplanation(key: string, score: number, tips: string[]): string {
  if (key === "actionPlan") {
    return tips.length > 0
      ? `Top priorities: ${tips.map((t, i) => `${i + 1}. ${t}`).join(" ")}`
      : "No critical issues detected. Focus on incremental improvements.";
  }
  if (score >= 7) return "Strong performance here. This section is well-optimized and contributing positively to conversions.";
  if (score >= 4) return "Room for improvement. This section is functional but leaving conversion potential on the table.";
  return "Critical issue. This section needs urgent attention — it's likely hurting your conversion rate significantly.";
}

function scoreColor(score: number): string {
  if (score >= 7) return "text-green-400";
  if (score >= 4) return "text-yellow-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 7) return "bg-green-400/10";
  if (score >= 4) return "bg-yellow-400/10";
  return "bg-red-400/10";
}

const PRICING_TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "Try it out",
    features: [
      "3 scans per month",
      "Overall score",
      "Top 3 issues only",
    ],
    cta: "Start Free",
    ctaStyle: "border border-[var(--border)] hover:border-indigo-500/50 text-white",
    highlight: false,
  },
  {
    name: "Starter",
    price: "$29",
    period: "/mo",
    description: "For growing stores",
    features: [
      "Full 10-section reports",
      "AI fix suggestions",
      "Up to 10 products",
      "Competitor comparison",
      "Email support",
    ],
    cta: "Start Free Trial",
    ctaStyle: "bg-indigo-500 hover:bg-indigo-400 text-white",
    highlight: true,
  },
  {
    name: "Growth",
    price: "$79",
    period: "/mo",
    description: "Scale with confidence",
    features: [
      "Weekly monitoring + alerts",
      "AI rewrites for titles & descriptions",
      "Up to 100 products",
      "Competitive benchmarking",
      "Score history & trends",
    ],
    cta: "Start Free Trial",
    ctaStyle: "bg-indigo-500 hover:bg-indigo-400 text-white",
    highlight: false,
  },
  {
    name: "Agency",
    price: "$199",
    period: "/mo",
    description: "For teams & agencies",
    features: [
      "Unlimited products",
      "Multiple stores",
      "White-label PDF reports",
      "Team seats",
      "Priority support",
    ],
    cta: "Contact Us",
    ctaStyle: "border border-[var(--border)] hover:border-indigo-500/50 text-white",
    highlight: false,
  },
];

function CompetitorAnalysis({
  data,
  url,
}: {
  data: CompetitorData;
  url: string;
}) {
  const { yourPage, competitors } = data;
  const allPages = [
    { label: "Your Page", ...yourPage },
    ...competitors.map((c) => ({ label: c.name, ...c })),
  ];
  const categories = Object.keys(CATEGORY_LABELS) as (keyof CategoryScores)[];

  return (
    <div className="w-full">
      {/* Overall scores */}
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: `repeat(${allPages.length}, 1fr)` }}>
        {allPages.map((page, i) => (
          <div
            key={i}
            className={`p-4 rounded-lg border text-center ${
              i === 0
                ? "bg-indigo-500/10 border-indigo-500/30"
                : "bg-[var(--card)] border-[var(--border)]"
            }`}
          >
            <div className="text-xs text-[var(--muted)] mb-1 truncate">
              {page.label}
            </div>
            <div className={`text-2xl font-bold ${
              page.score >= 70
                ? "text-green-400"
                : page.score >= 40
                ? "text-yellow-400"
                : "text-red-400"
            }`}>
              {i === 0 ? page.score : (
                <span className="blur-[6px] select-none">{page.score}</span>
              )}
            </div>
            <div className="text-xs text-[var(--muted)]">/100</div>
          </div>
        ))}
      </div>

      {/* Category comparison table */}
      <div className="rounded-lg border border-[var(--border)] overflow-hidden">
        {/* Header */}
        <div
          className="grid gap-0 bg-[var(--card)] border-b border-[var(--border)]"
          style={{ gridTemplateColumns: `140px repeat(${allPages.length}, 1fr)` }}
        >
          <div className="p-3 text-xs font-semibold text-[var(--muted)]">
            Category
          </div>
          {allPages.map((page, i) => (
            <div
              key={i}
              className={`p-3 text-xs font-semibold text-center truncate ${
                i === 0 ? "text-indigo-400" : "text-[var(--muted)]"
              }`}
            >
              {i === 0 ? "You" : page.label}
            </div>
          ))}
        </div>

        {/* Rows */}
        {categories.map((cat) => (
          <div
            key={cat}
            className="grid gap-0 border-b border-[var(--border)] last:border-b-0"
            style={{ gridTemplateColumns: `140px repeat(${allPages.length}, 1fr)` }}
          >
            <div className="p-3 text-sm font-medium">
              {CATEGORY_LABELS[cat]}
            </div>
            {allPages.map((page, i) => {
              const val = page.categories[cat] ?? 0;
              return (
                <div key={i} className="p-3 text-center">
                  {i === 0 ? (
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-sm font-bold ${scoreColor(val)} ${scoreBg(val)}`}
                    >
                      {val}/10
                    </span>
                  ) : (
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-sm font-bold blur-[5px] select-none ${scoreColor(val)} ${scoreBg(val)}`}
                    >
                      {val}/10
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Locked overlay CTA */}
      <div className="mt-4 p-5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-center relative">
        <div className="text-sm text-[var(--muted)] mb-2">
          Competitor scores are blurred. Unlock to see exactly where you beat them and where you&apos;re behind.
        </div>
        <a
          href={`/report?url=${encodeURIComponent(url)}`}
          className="inline-block px-6 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold transition text-sm"
        >
          Unlock Full Report — Start Free Trial
        </a>
        <p className="text-xs text-[var(--muted)] mt-2">
          Includes full competitor breakdown + your action plan
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FreeResult | null>(null);
  const [error, setError] = useState("");
  const [compLoading, setCompLoading] = useState(false);
  const [compData, setCompData] = useState<CompetitorData | null>(null);
  const [compError, setCompError] = useState("");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [reportUnlocked, setReportUnlocked] = useState(false);

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setCompData(null);
    setCompError("");
    setReportUnlocked(false);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Analysis failed");
      }
      const data = await res.json();
      setResult(data);
      posthog.capture("scan_completed", { url, score: data.score });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function fetchCompetitors() {
    setCompLoading(true);
    setCompError("");
    try {
      const res = await fetch("/api/analyze-competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Competitor analysis failed");
      }
      const data = await res.json();
      setCompData(data);
      posthog.capture("competitor_analysis_completed", { url, competitors: data.competitors?.length });
    } catch (err: unknown) {
      setCompError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCompLoading(false);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailSubmitting(true);
    setEmailError("");
    try {
      const res = await fetch("/api/request-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          url,
          score: result?.score,
          summary: result?.summary,
          tips: result?.tips,
          categories: result?.categories,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit");
      }
      setShowEmailModal(false);
      setReportUnlocked(true);
      posthog.capture("report_email_submitted", { url, score: result?.score, email });
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEmailSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4">
      {/* Hero */}
      <section className="max-w-2xl w-full text-center pt-24 pb-16">
        <div className="inline-block px-3 py-1 mb-6 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          AI-Powered Analysis
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          Your Shopify product page is{" "}
          <span className="text-indigo-400">losing sales every day</span>
        </h1>
        <p className="text-lg text-[var(--muted)] mb-3 max-w-lg mx-auto">
          AI scores your product page on 7 conversion factors — title, images, pricing, reviews, CTA, and more. 30 seconds. Free.
        </p>
        <p className="text-sm text-[var(--muted)] mb-10 max-w-lg mx-auto">
          Paste any Shopify product URL and see exactly what&apos;s costing you sales.
        </p>

        <form onSubmit={analyze} className="flex gap-3 max-w-lg mx-auto">
          <input
            type="url"
            required
            placeholder="https://yourstore.myshopify.com/products/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 px-4 py-3 rounded-lg bg-[var(--card)] border border-[var(--border)] text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-indigo-500 transition"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {loading ? "Analyzing…" : "Scan Free"}
          </button>
        </form>
      </section>

      {/* Error */}
      {error && (
        <div className="max-w-2xl w-full p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-8">
          {error}
        </div>
      )}

      {/* Free Result */}
      {result && (
        <section className="max-w-2xl w-full mb-16">
          {/* Score + Top 3 Issues */}
          <div className="p-6 rounded-xl bg-[var(--card)] border border-[var(--border)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Quick Score</h2>
              <div
                className={`text-3xl font-bold ${
                  result.score >= 70
                    ? "text-green-400"
                    : result.score >= 40
                    ? "text-yellow-400"
                    : "text-red-400"
                }`}
              >
                {result.score}/100
              </div>
            </div>
            <p className="text-[var(--muted)] mb-4">{result.summary}</p>
            <h3 className="font-semibold mb-2">Top 3 Issues:</h3>
            <ul className="space-y-2">
              {result.tips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-indigo-400 mt-0.5">→</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Share */}
          <div className="mt-4 flex gap-2 items-center">
            <span className="text-xs text-[var(--muted)]">Share your score:</span>
            <a
              href={`https://twitter.com/intent/tweet?text=My%20landing%20page%20scored%20${result.score}%2F100%20on%20PageScore%20%F0%9F%93%8A%0A%0AGet%20your%20free%20score%3A%20https%3A%2F%2Falpo.ai`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 text-xs rounded-md bg-[var(--border)] hover:bg-[var(--muted)] transition"
            >
              𝕏 Tweet
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `My Shopify product page scored ${result.score}/100 on PageScore 📊\n\nFind out what's costing you sales: https://alpo.ai`
                );
              }}
              className="px-3 py-1 text-xs rounded-md bg-[var(--border)] hover:bg-[var(--muted)] transition"
            >
              📋 Copy
            </button>
          </div>

          {/* Competitor Analysis */}
          <div className="mt-6">
            {!compData && !compLoading && (
              <button
                onClick={fetchCompetitors}
                className="w-full py-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-semibold transition text-sm"
              >
                See how you compare to competitors
              </button>
            )}
            {compLoading && (
              <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)] text-center">
                <div className="text-sm text-[var(--muted)] animate-pulse">
                  Finding competitors and scoring their pages... this takes ~30 seconds
                </div>
              </div>
            )}
            {compError && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {compError}
              </div>
            )}
            {compData && (
              <div>
                <h3 className="text-lg font-bold mb-3">Competitor Comparison</h3>
                <CompetitorAnalysis data={compData} url={url} />
              </div>
            )}
          </div>

          {/* Full Report: locked or unlocked */}
          {!reportUnlocked ? (
            <>
              {/* Locked Full Report Preview (blurred sections) */}
              <div className="mt-6 space-y-3">
                <h3 className="text-lg font-bold mb-1">Full report preview</h3>
                <p className="text-[var(--muted)] text-sm mb-4">Here&apos;s what the deep-dive covers — unlock all 10 sections:</p>

                {SECTION_META.map((section) => (
                  <div
                    key={section.title}
                    className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] relative overflow-hidden"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span>{section.icon}</span>
                      <span className="font-semibold text-sm">{section.title}</span>
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        🔒 Locked
                      </span>
                    </div>
                    <p className="text-sm text-[var(--muted)] blur-[5px] select-none pointer-events-none">
                      This section contains detailed analysis and actionable recommendations for improvement.
                    </p>
                  </div>
                ))}
              </div>

              {/* Get Full Report CTA */}
              <div className="mt-6 p-6 rounded-xl bg-indigo-500/5 border border-indigo-500/20 text-center">
                <h3 className="text-xl font-bold mb-2">Unlock your full report</h3>
                <p className="text-sm text-[var(--muted)] mb-4">
                  All 10 sections scored, every fix prioritized, estimated revenue impact per change.
                  <br />
                  <span className="text-indigo-400">Most Shopify agencies charge $500 for a CRO audit.</span>
                </p>
                <button
                  onClick={() => {
                    setShowEmailModal(true);
                    posthog.capture("report_cta_clicked", { url, score: result.score });
                  }}
                  className="px-8 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold transition cursor-pointer"
                >
                  Get Full Report
                </button>
                <p className="text-xs text-[var(--muted)] mt-2">Free — just enter your email</p>
              </div>
            </>
          ) : (
            <>
              {/* Unlocked Full Report */}
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-lg font-bold">Full Conversion Audit</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                    Unlocked
                  </span>
                </div>
                <p className="text-[var(--muted)] text-sm mb-4">10-section breakdown with AI fix suggestions.</p>

                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-4">
                  Report unlocked! Check your email for a copy.
                </div>

                <div className="space-y-3">
                  {SECTION_META.map((section) => {
                    const sectionScore = getSectionScore(section.key, result.categories, result.score);
                    const explanation = getSectionExplanation(section.key, sectionScore, result.tips);
                    const isActionPlan = section.key === "actionPlan";

                    return (
                      <div
                        key={section.title}
                        className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span>{section.icon}</span>
                          <span className="font-semibold text-sm">{section.title}</span>
                          {!isActionPlan && (
                            <span
                              className={`ml-auto inline-block px-2 py-0.5 rounded text-sm font-bold ${scoreColor(sectionScore)} ${scoreBg(sectionScore)}`}
                            >
                              {sectionScore}/10
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[var(--muted)]">{explanation}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Upsell card after full report */}
              <div className="mt-6 p-6 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                <h3 className="text-lg font-bold mb-2">Want weekly monitoring + AI rewrites?</h3>
                <ul className="space-y-2 mb-4 text-sm text-[var(--muted)]">
                  <li className="flex gap-2">
                    <span className="text-indigo-400 shrink-0">•</span>
                    Score alerts when something drops
                  </li>
                  <li className="flex gap-2">
                    <span className="text-indigo-400 shrink-0">•</span>
                    AI-generated rewrites for every low section
                  </li>
                  <li className="flex gap-2">
                    <span className="text-indigo-400 shrink-0">•</span>
                    Track improvements over time
                  </li>
                </ul>
                <a
                  href="#pricing"
                  className="inline-block px-6 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold transition text-sm"
                >
                  Upgrade to Starter — $29/mo
                </a>
              </div>
            </>
          )}

          {/* PRIORITY 4 — AI-Generated Rewrites Upsell */}
          <div className="mt-6 rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="p-5 bg-[var(--card)] border-b border-[var(--border)]">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">✨</span>
                <h3 className="text-lg font-bold">AI-Generated Rewrites</h3>
              </div>
              <p className="text-sm text-[var(--muted)]">
                See what your product title and description would look like rewritten by AI for maximum conversions.
              </p>
            </div>
            <div className="p-5 space-y-4">
              {/* Blurred title rewrite preview */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">Optimized Title</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">🔒 Locked</span>
                </div>
                <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                  <p className="text-sm blur-[6px] select-none pointer-events-none">
                    Premium Organic Cotton T-Shirt — Ultra-Soft, Ethically Made | Free Shipping Over $50
                  </p>
                </div>
              </div>
              {/* Blurred description rewrite preview */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">Optimized Description</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">🔒 Locked</span>
                </div>
                <div className="p-3 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                  <p className="text-sm blur-[6px] select-none pointer-events-none">
                    Transform your everyday wardrobe with our best-selling organic cotton tee. Crafted from 100% GOTS-certified organic cotton, this shirt feels impossibly soft against your skin while lasting wash after wash. Over 2,400 five-star reviews from customers who switched and never looked back.
                  </p>
                </div>
              </div>
              {/* CTA */}
              <div className="text-center pt-2">
                <a
                  href={`/report?url=${encodeURIComponent(url)}&feature=rewrites`}
                  onClick={() => posthog.capture("ai_rewrite_cta_clicked", { url, score: result.score })}
                  className="inline-block px-6 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold transition text-sm"
                >
                  Get AI Rewrites — $29/mo
                </a>
                <p className="text-xs text-[var(--muted)] mt-2">Included with Starter plan</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* PRIORITY 2 — Never Miss a Score Drop (monitoring teaser) */}
      <section className="max-w-2xl w-full mb-16">
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="p-6 bg-[var(--card)]">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">📉</span>
              <h2 className="text-xl font-bold">Never Miss a Score Drop</h2>
            </div>
            <p className="text-sm text-[var(--muted)] mb-6">
              Your product pages change. Competitors update theirs. Theme updates break things. Stay on top of it automatically.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                {
                  icon: "🔄",
                  title: "Weekly Re-Scans",
                  desc: "Every product page re-analyzed automatically, every week.",
                },
                {
                  icon: "🔔",
                  title: "Email Alerts",
                  desc: "Get notified the moment your score drops below your threshold.",
                },
                {
                  icon: "📈",
                  title: "Track Improvements",
                  desc: "See your score history over time. Know what changes moved the needle.",
                },
                {
                  icon: "🏆",
                  title: "Competitive Benchmarking",
                  desc: "Weekly competitor tracking so you always know where you stand.",
                },
              ].map((item) => (
                <div key={item.title} className="p-4 rounded-lg bg-[#0a0a0a] border border-[var(--border)]">
                  <div className="text-lg mb-2">{item.icon}</div>
                  <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
                  <p className="text-xs text-[var(--muted)]">{item.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 text-center">
              <span className="inline-block px-4 py-2 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Available on Starter plan and above — $29/mo
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* PRIORITY 1 — Subscription Pricing Tiers */}
      <section className="max-w-5xl w-full mb-16" id="pricing">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-3">Simple, transparent pricing</h2>
          <p className="text-[var(--muted)]">Start free. Upgrade when you need more.</p>
        </div>
        <div className="grid md:grid-cols-4 gap-4">
          {PRICING_TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`p-6 rounded-xl border flex flex-col ${
                tier.highlight
                  ? "bg-indigo-500/5 border-indigo-500/30 relative"
                  : "bg-[var(--card)] border-[var(--border)]"
              }`}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold bg-indigo-500 text-white">
                  Most Popular
                </div>
              )}
              <div className="mb-4">
                <h3 className="font-bold text-lg">{tier.name}</h3>
                <p className="text-xs text-[var(--muted)]">{tier.description}</p>
              </div>
              <div className="mb-4">
                <span className="text-3xl font-bold">{tier.price}</span>
                {tier.period && <span className="text-[var(--muted)]">{tier.period}</span>}
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm">
                    <span className="text-indigo-400 shrink-0">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {/* TODO: Replace href with actual Lemon Squeezy subscription checkout URLs per tier */}
              <a
                href={tier.name === "Agency" ? "mailto:hello@pagescore.app" : "#pricing"}
                className={`block text-center px-4 py-3 rounded-lg font-semibold transition text-sm ${tier.ctaStyle}`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Social Proof / Features — shown when no results */}
      {!result && (
        <section className="max-w-3xl w-full grid md:grid-cols-3 gap-6 pb-24">
          {[
            {
              icon: "⚡",
              title: "30-Second Product Audit",
              desc: "AI analyzes your page instantly. No signup required for the free scan.",
            },
            {
              icon: "🎯",
              title: "Actionable Fixes",
              desc: "Not vague advice. Specific changes you can make today to improve conversions.",
            },
            {
              icon: "📊",
              title: "10-Section Report",
              desc: "Copy, SEO, CRO, design, accessibility, performance, mobile UX, and more.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="p-5 rounded-xl bg-[var(--card)] border border-[var(--border)]"
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-[var(--muted)]">{f.desc}</p>
            </div>
          ))}
        </section>
      )}

      {/* Footer */}
      <footer className="pb-8 text-xs text-[var(--muted)]">
        © {new Date().getFullYear()} PageScore. Built with AI.
      </footer>

      {/* Email Gate Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowEmailModal(false)}
          />
          <div className="relative w-full max-w-md p-6 rounded-xl bg-[var(--card)] border border-[var(--border)]">
            <button
              onClick={() => setShowEmailModal(false)}
              className="absolute top-3 right-3 text-[var(--muted)] hover:text-white transition text-lg cursor-pointer"
            >
              ✕
            </button>
            <h2 className="text-xl font-bold mb-1">Get your full conversion audit</h2>
            <p className="text-sm text-[var(--muted)] mb-6">
              10-section breakdown + AI fix suggestions. Free.
            </p>
            <form onSubmit={submitEmail}>
              <input
                type="email"
                required
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-[#0a0a0a] border border-[var(--border)] text-white placeholder:text-[var(--muted)] focus:outline-none focus:border-indigo-500 transition mb-3"
              />
              {emailError && (
                <p className="text-red-400 text-sm mb-3">{emailError}</p>
              )}
              <button
                type="submit"
                disabled={emailSubmitting}
                className="w-full py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {emailSubmitting ? "Submitting…" : "Send My Report"}
              </button>
            </form>
            <p className="text-xs text-[var(--muted)] mt-3 text-center">
              No spam. Unsubscribe anytime.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
