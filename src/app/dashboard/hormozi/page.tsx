"use client";

import Link from "next/link";

const valueEquation = {
  dreamOutcome: { score: 8, note: "Know exactly why landing page isn't converting — clear and specific" },
  likelihood: { score: 8, note: "AI gives concrete score + 3 fixes — believable" },
  timeDelay: { score: 10, note: "30 seconds — our biggest moat. Zero wait." },
  effort: { score: 10, note: "No signup, paste URL, done. Lowest possible friction." },
  overall: 7,
  weakness: "Missing social proof. $7 report needs Menu Upsell reframe.",
};

const offerStack = [
  { name: "Attraction Offer", description: "Free scan — no signup, 30 seconds", status: "live", price: "$0", verdict: "✅ Strong" },
  { name: "Upsell", description: "$7 full report — needs Menu Upsell reframe (A or B, not yes/no)", status: "weak", price: "$7", verdict: "⚠️ Reframe needed" },
  { name: "Downsell", description: "'Not ready for $7? Get 1 tip emailed to you' — capture the no", status: "missing", price: "$0", verdict: "❌ Build this" },
  { name: "Continuity", description: "$19/mo — unlimited scans, history, competitor comparison", status: "missing", price: "$19/mo", verdict: "❌ Build this" },
];

const ruleOf100 = [
  { action: "Reddit comments", target: 100, current: 15, unit: "/day" },
  { action: "Tweets", target: 3, current: 1, unit: "/day" },
  { action: "DEV.to articles", target: 1, current: 0.5, unit: "/day" },
  { action: "IndieHackers posts", target: 1, current: 0, unit: "/day" },
];

const directives = [
  {
    priority: "🔴 URGENT",
    title: "Reframe $7 offer with Menu Upsell",
    detail: "Don't ask yes/no. Ask 'Do you want 3 tips (free) or the complete teardown ($7)?' Always present highest value first.",
  },
  {
    priority: "🔴 URGENT",
    title: "10x content volume — Rule of 100",
    detail: "We're doing 15 actions/day. Target is 100. Apply More→Better→New. More comes first.",
  },
  {
    priority: "🟡 THIS WEEK",
    title: "Build the Lead Magnet",
    detail: "47-point Landing Page Conversion Checklist. Free. Gives value, reveals they need PageScore. Salty pretzel strategy.",
  },
  {
    priority: "🟡 THIS WEEK",
    title: "Add referral system after every scan",
    detail: "Goodwill = Value Delivered − Price Charged. We charge $0 so goodwill is max. Show: 'Know a founder who needs this?'",
  },
  {
    priority: "🟢 NEXT WEEK",
    title: "Build Continuity offer ($19/mo)",
    detail: "Unlimited scans + history + competitor comparison. Add continuity bonus worth more than first 3 payments.",
  },
  {
    priority: "🟢 NEXT WEEK",
    title: "Post on IndieHackers",
    detail: "TOS = green light. Most founder-friendly platform. Self-promotion is expected. Post milestone update.",
  },
];

const contentFormula = [
  "Hook: Specific number + counterintuitive finding",
  "Example: 'I analyzed 500 landing pages. 73% had the same problem nobody talks about.'",
  "Body: Story → Data → Insight → Soft CTA",
  "CTA: 'if you want to check yours, pagescore-tau.vercel.app'",
  "Never: 'Check out my tool!' Always: wrap in a story or finding",
];

const statusBg: Record<string, string> = {
  "🔴 URGENT": "border-l-red-500 bg-red-500/5",
  "🟡 THIS WEEK": "border-l-yellow-500 bg-yellow-500/5",
  "🟢 NEXT WEEK": "border-l-green-500 bg-green-500/5",
};

export default function HormoziPage() {
  return (
    <main className="min-h-screen px-4 py-12 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">💰 Alex Hormozi — CMO</h1>
        <Link href="/dashboard" className="text-xs text-indigo-400 hover:underline">← Dashboard</Link>
      </div>
      <p className="text-xs text-[var(--muted)] mb-8">$100M Offers + $100M Leads + $100M Money Models · Chief Marketing Officer · All marketing decisions run through him</p>

      {/* Current Bottleneck */}
      <section className="mb-10">
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-5 py-4">
          <div className="text-sm font-bold text-red-400 mb-1">🎯 Current Bottleneck: LEADS</div>
          <p className="text-sm text-[var(--muted)]">Working product. Zero paying customers. Problem is not the offer — it's volume. Apply: <span className="text-white font-mono">More → Better → New</span>. We are at step 1.</p>
        </div>
      </section>

      {/* Value Equation */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">📐 Value Equation Analysis</h2>
        <p className="text-xs text-[var(--muted)] mb-3">Value = (Dream Outcome × Likelihood) ÷ (Time Delay × Effort)</p>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          {[
            { label: "Dream Outcome", ...valueEquation.dreamOutcome },
            { label: "Likelihood of Achievement", ...valueEquation.likelihood },
            { label: "Time Delay (lower = better)", ...valueEquation.timeDelay },
            { label: "Effort & Sacrifice (lower = better)", ...valueEquation.effort },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border)] last:border-0">
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-sm shrink-0">{item.score}</div>
              <div>
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs text-[var(--muted)]">{item.note}</div>
              </div>
            </div>
          ))}
          <div className="px-4 py-3 bg-yellow-500/10">
            <div className="text-sm text-yellow-400">⚠️ Weakness: {valueEquation.weakness}</div>
          </div>
        </div>
      </section>

      {/* Offer Stack */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">🏗️ Offer Stack</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          {offerStack.map((offer) => (
            <div key={offer.name} className="px-4 py-3 border-b border-[var(--border)] last:border-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold">{offer.name} <span className="text-[var(--muted)] font-normal">· {offer.price}</span></span>
                <span className="text-xs">{offer.verdict}</span>
              </div>
              <div className="text-xs text-[var(--muted)]">{offer.description}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Rule of 100 */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">💯 Rule of 100 — Daily Volume</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          {ruleOf100.map((item) => {
            const pct = Math.min(100, Math.round((item.current / item.target) * 100));
            return (
              <div key={item.action} className="px-4 py-3 border-b border-[var(--border)] last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm">{item.action}</span>
                  <span className="text-xs text-[var(--muted)]">{item.current}/{item.target}{item.unit}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--border)]">
                  <div className={`h-1.5 rounded-full ${pct < 30 ? "bg-red-500" : pct < 70 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Directives */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">📋 Directives</h2>
        <div className="space-y-3">
          {directives.map((d, i) => (
            <div key={i} className={`rounded-lg border border-[var(--border)] border-l-2 px-4 py-3 ${statusBg[d.priority]}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold">{d.priority}</span>
                <span className="text-sm font-semibold">{d.title}</span>
              </div>
              <div className="text-xs text-[var(--muted)]">{d.detail}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Content Formula */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">✍️ Approved Content Formula</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-4 space-y-2">
          {contentFormula.map((line, i) => (
            <div key={i} className={`text-sm ${line.startsWith("Never") ? "text-red-400" : line.startsWith("Example") ? "text-indigo-400 font-mono text-xs" : "text-[var(--muted)]"}`}>
              {line}
            </div>
          ))}
        </div>
      </section>

      <footer className="text-center text-xs text-[var(--muted)] pt-8">
        PageScore · Hormozi CMO Dashboard · Private
      </footer>
    </main>
  );
}
