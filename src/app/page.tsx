"use client";

import { useState } from "react";
import posthog from "posthog-js";

interface FreeResult {
  score: number;
  summary: string;
  tips: string[];
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FreeResult | null>(null);
  const [error, setError] = useState("");

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

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

  return (
    <main className="min-h-screen flex flex-col items-center px-4">
      {/* Hero */}
      <section className="max-w-2xl w-full text-center pt-24 pb-16">
        <div className="inline-block px-3 py-1 mb-6 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          AI-Powered Analysis
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          Your landing page is{" "}
          <span className="text-indigo-400">leaving money on the table</span>
        </h1>
        <p className="text-lg text-[var(--muted)] mb-3 max-w-lg mx-auto">
          Get an AI-powered score with 3 specific fixes in 30 seconds.
          No signup. No email. Completely free.
        </p>
        <p className="text-sm text-[var(--muted)] mb-10 max-w-lg mx-auto">
          Join 100+ founders who improved their conversion rates after scanning.
        </p>

        <form onSubmit={analyze} className="flex gap-3 max-w-lg mx-auto">
          <input
            type="url"
            required
            placeholder="https://your-landing-page.com"
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
              href={`https://twitter.com/intent/tweet?text=My%20landing%20page%20scored%20${result.score}%2F100%20on%20PageScore%20%F0%9F%93%8A%0A%0AGet%20your%20free%20score%3A%20https%3A%2F%2Fpagescore-tau.vercel.app`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 text-xs rounded-md bg-[var(--border)] hover:bg-[var(--muted)] transition"
            >
              𝕏 Tweet
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `My landing page scored ${result.score}/100 on PageScore 📊\n\nGet your free score: https://pagescore-tau.vercel.app`
                );
              }}
              className="px-3 py-1 text-xs rounded-md bg-[var(--border)] hover:bg-[var(--muted)] transition"
            >
              📋 Copy
            </button>
          </div>

          {/* Locked Section Previews */}
          <div className="mt-6 space-y-3">
            <h3 className="text-lg font-bold mb-1">Full report preview</h3>
            <p className="text-[var(--muted)] text-sm mb-4">Here&apos;s what the deep-dive covers — unlock all 10 sections:</p>
            
            {[
              { icon: "📝", title: "Copy Teardown", teaser: "Your headline scores a 6/10. The subhead is too vague and your CTA..." },
              { icon: "🔍", title: "SEO Audit", teaser: "Missing 3 critical meta tags. Title tag is 12 characters too long..." },
              { icon: "🎯", title: "CRO Opportunities", teaser: "Found 4 conversion blockers above the fold. Your form has..." },
              { icon: "🎨", title: "Design & Visual Hierarchy", teaser: "Primary CTA doesn't have enough contrast. Visual flow breaks at..." },
              { icon: "♿", title: "Accessibility", teaser: "2 WCAG AA violations found. Alt text missing on hero image..." },
              { icon: "⚡", title: "Performance", teaser: "Largest Contentful Paint is slow. 3 render-blocking resources..." },
              { icon: "📱", title: "Mobile UX", teaser: "Tap targets too small on mobile. Text overflows viewport at..." },
              { icon: "🤝", title: "Trust Signals", teaser: "No social proof above the fold. Missing trust badges near..." },
              { icon: "🏆", title: "Competitor Positioning", teaser: "Your value prop overlaps with 2 major competitors. Differentiate by..." },
              { icon: "📋", title: "Action Plan", teaser: "Priority #1: Fix your CTA copy (est. +15% conversion). Priority #2..." },
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

          {/* Upsell CTA */}
          <div className="mt-6 p-6 rounded-xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 text-center">
            <h3 className="text-lg font-bold mb-2">
              Unlock all 10 sections for $7
            </h3>
            <p className="text-[var(--muted)] text-sm mb-4">
              One-time payment. Delivered to your email in 5 minutes. 
              Specific fixes with estimated conversion impact.
            </p>
            <a
              href={`/report?url=${encodeURIComponent(url)}`}
              onClick={() => posthog.capture("report_cta_clicked", { url, score: result.score })}
              className="inline-block px-8 py-4 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-lg transition"
            >
              Get Full Report — $7
            </a>
            <p className="text-xs text-[var(--muted)] mt-3">
              💰 If your page converts even 0.1% better, this pays for itself in a day
            </p>
          </div>
        </section>
      )}

      {/* Social Proof / Features */}
      {!result && (
        <section className="max-w-3xl w-full grid md:grid-cols-3 gap-6 pb-24">
          {[
            {
              icon: "⚡",
              title: "30-Second Scan",
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
