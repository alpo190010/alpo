import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PageScore — Founder Dashboard",
  robots: "noindex, nofollow",
};

const metrics = {
  lastUpdated: "2026-03-21 22:30 GMT+4",
  day: 1,
  visitors: "Pending",
  scans: "6+",
  reportClicks: "0",
  revenue: "$0",
};

const product = [
  { feature: "Free scan (score + 3 tips)", status: "live" },
  { feature: "$7 full report flow", status: "live" },
  { feature: "PostHog analytics", status: "live" },
  { feature: "Share buttons", status: "live" },
  { feature: "OG meta tags + SEO", status: "live" },
  { feature: "Blog page 1 (analyzed 50 sites)", status: "live" },
  { feature: "Blog page 2 (conversion rate tips)", status: "ready" },
  { feature: "Roast Mode", status: "planned" },
  { feature: "Competitor Comparison", status: "planned" },
  { feature: "PDF Export", status: "planned" },
  { feature: "Before/After Re-scan", status: "planned" },
  { feature: "Chrome Extension", status: "planned" },
];

const distribution = [
  { channel: "Reddit r/SaaS post", status: "live", url: "https://www.reddit.com/r/SaaS/comments/1rzxea9/" },
  { channel: "Reddit value comments", status: "live", url: null },
  { channel: "DEV.to article", status: "live", url: "https://dev.to/alpo190010/i-built-a-free-ai-tool-that-scores-your-landing-page-in-30-seconds-40ip" },
  { channel: "Hacker News", status: "blocked", url: null },
  { channel: "Product Hunt", status: "blocked", url: null },
  { channel: "AI directories", status: "blocked", url: null },
];

const agents = [
  { name: "voice-editor", job: "Humanize content before posting", lastRun: "22:02 ✅" },
  { name: "seo-writer", job: "Write SEO blog posts", lastRun: "22:21 ✅" },
  { name: "reddit-scout", job: "Find engagement targets", lastRun: "22:22 ✅" },
  { name: "competitor-research", job: "Analyze competing tools", lastRun: "22:22 ✅" },
];

const competitors = [
  { name: "HubSpot Grader", weakness: "Email-gated, generic, no AI", edge: "No signup, AI-powered" },
  { name: "VWO Analyzer", weakness: "Self-assessment quiz", edge: "We actually scan the page" },
  { name: "RoastMyLandingPage", weakness: "48hr wait, ~$150", edge: "30 seconds, free" },
  { name: "WooRank", weakness: "SEO-only, $80/mo", edge: "Conversion-focused, free" },
];

const dailyLog = [
  "Built entire MVP in 2 hours",
  "Set up Lemon Squeezy, Vercel, PostHog",
  "Deployed to production",
  "Fixed OpenRouter API, currency to USD",
  "Posted on Reddit r/SaaS + DEV.to",
  "Built voice-editor agent pipeline",
  "Installed ClawHub skills (seo, marketing, automation)",
  "Set up HEARTBEAT.md for autonomous ops",
  "Deployed 3 parallel agents",
  "Posted first value-first Reddit comment",
  "Created founder dashboard",
];

const statusBadge = (s: string) => {
  const colors: Record<string, string> = {
    live: "bg-green-500/20 text-green-400",
    ready: "bg-yellow-500/20 text-yellow-400",
    planned: "bg-indigo-500/20 text-indigo-400",
    blocked: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[s] || "bg-gray-500/20 text-gray-400"}`}>
      {s}
    </span>
  );
};

export default function Dashboard() {
  return (
    <main className="min-h-screen px-4 py-12 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">PageScore — Founder Dashboard</h1>
        <span className="text-xs text-[var(--muted)]">Updated: {metrics.lastUpdated}</span>
      </div>

      {/* Metrics */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-10">
        {[
          { label: "Day", value: metrics.day },
          { label: "Visitors", value: metrics.visitors },
          { label: "Scans", value: metrics.scans },
          { label: "Report Clicks", value: metrics.reportClicks },
          { label: "Revenue", value: metrics.revenue },
        ].map((m) => (
          <div key={m.label} className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] text-center">
            <div className="text-2xl font-bold">{String(m.value)}</div>
            <div className="text-xs text-[var(--muted)] mt-1">{m.label}</div>
          </div>
        ))}
      </section>

      {/* Product Status */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">Product</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          {product.map((p) => (
            <div key={p.feature} className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] last:border-0">
              <span className="text-sm">{p.feature}</span>
              {statusBadge(p.status)}
            </div>
          ))}
        </div>
      </section>

      {/* Distribution */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">Distribution</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          {distribution.map((d) => (
            <div key={d.channel} className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] last:border-0">
              <span className="text-sm">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                    {d.channel}
                  </a>
                ) : (
                  d.channel
                )}
              </span>
              {statusBadge(d.status)}
            </div>
          ))}
        </div>
      </section>

      {/* Agent Team */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">Agent Team</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          {agents.map((a) => (
            <div key={a.name} className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] last:border-0">
              <div>
                <span className="text-sm font-mono text-indigo-400">{a.name}</span>
                <span className="text-xs text-[var(--muted)] ml-2">{a.job}</span>
              </div>
              <span className="text-xs text-[var(--muted)]">{a.lastRun}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Competitors */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">Competitive Edge</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          {competitors.map((c) => (
            <div key={c.name} className="px-4 py-3 border-b border-[var(--border)] last:border-0">
              <div className="text-sm font-semibold">{c.name}</div>
              <div className="text-xs text-red-400 mt-1">Weakness: {c.weakness}</div>
              <div className="text-xs text-green-400">Our edge: {c.edge}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Daily Log */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">Day {metrics.day} Log</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-4">
          {dailyLog.map((item, i) => (
            <div key={i} className="text-sm py-1">
              <span className="text-green-400 mr-2">✓</span>
              {item}
            </div>
          ))}
        </div>
      </section>

      <footer className="text-center text-xs text-[var(--muted)] pt-8">
        PageScore Founder Dashboard — noindex, private
      </footer>
    </main>
  );
}
