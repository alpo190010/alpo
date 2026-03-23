"use client";

import { useState } from "react";
import posthog from "posthog-js";

interface FreeResult {
  score: number;
  summary: string;
  tips: string[];
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
          Competitor scores are blurred. Unlock to see exactly where you beat them and where you're behind.
        </div>
        <a
          href={`/report?url=${encodeURIComponent(url)}`}
          className="inline-block px-6 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold transition text-sm"
        >
          Unlock Full Report — $7
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

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setCompData(null);
    setCompError("");

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
          Paste any Shopify product URL and see exactly what's costing you sales.
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
            <h3 className="font-semibold mb-2">Top 3 Quick Fixes:</h3>
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

          {/* Locked Section Previews */}
          <div className="mt-6 space-y-3">
            <h3 className="text-lg font-bold mb-1">Full report preview</h3>
            <p className="text-[var(--muted)] text-sm mb-4">Here&apos;s what the deep-dive covers — unlock all 10 sections:</p>
            
            {[
              { icon: "📝", title: "Product Title Score", teaser: "Your title is missing the key benefit. Add size/variant info and a power word..." },
              { icon: "🖼️", title: "Image Analysis", teaser: "Only 2 images detected. Top converting stores use 6-8 with lifestyle shots..." },
              { icon: "💰", title: "Pricing & Anchoring", teaser: "No compare-at price shown. Adding original price can increase conversion 15%..." },
              { icon: "⭐", title: "Social Proof", teaser: "No review count visible above the fold. 94% of buyers read reviews before..." },
              { icon: "🎯", title: "CTA Strength", teaser: "Add to Cart button lacks urgency. 'Only 3 left' or 'Ships today' adds..." },
              { icon: "📄", title: "Description Quality", teaser: "Description is feature-heavy. Lead with the transformation, not the specs..." },
              { icon: "🛡️", title: "Trust Signals", teaser: "Missing money-back guarantee badge and secure checkout icon above fold..." },
              { icon: "📱", title: "Mobile Experience", teaser: "CTA button too small on mobile. 67% of Shopify traffic is mobile..." },
              { icon: "🔍", title: "SEO & Discoverability", teaser: "Meta title missing target keyword. Missing structured data for rich snippets..." },
              { icon: "📋", title: "Action Plan", teaser: "Priority #1: Add lifestyle images (+23% CVR est). Priority #2: Show review count..." },
            ].map((section) => (
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
                  {section.teaser}
                </p>
              </div>
            ))}
          </div>

          {/* Upsell CTA — Menu Upsell (Hormozi) */}
          <div className="mt-6 rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] bg-[var(--card)]">
              <p className="text-sm font-semibold text-center text-[var(--muted)]">What do you want next?</p>
            </div>
            <div className="grid md:grid-cols-2">
              {/* Option A — Free */}
              <div className="p-6 border-r border-[var(--border)] text-center flex flex-col">
                <div className="text-2xl font-bold mb-1">Free</div>
                <div className="text-sm text-[var(--muted)] mb-4 flex-1">Keep your 3 tips above and fix them yourself</div>
                <div className="text-xs text-[var(--muted)] py-2 border border-[var(--border)] rounded-lg">You're done ✓</div>
              </div>
              {/* Option B — $7 */}
              <div className="p-6 bg-indigo-500/5 text-center flex flex-col">
                <div className="text-2xl font-bold mb-1 text-indigo-400">$7</div>
                <div className="text-sm text-[var(--muted)] mb-1 flex-1">
                  Complete teardown — all 10 sections scored, every fix prioritized, estimated revenue impact per change
                </div>
                <p className="text-xs text-[var(--muted)] mb-4">Most Shopify agencies charge $500 for a CRO audit. Yours for $7.</p>
                <a
                  href={`/report?url=${encodeURIComponent(url)}`}
                  onClick={() => posthog.capture("report_cta_clicked", { url, score: result.score })}
                  className="inline-block px-6 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold transition text-sm"
                >
                  Get the Complete Teardown — $7
                </a>
                <p className="text-xs text-[var(--muted)] mt-2">One-time · Instant · No subscription</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Social Proof / Features */}
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
    </main>
  );
}
