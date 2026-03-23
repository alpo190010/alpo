"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface StressTest {
  attack: string;
  severity: "fatal" | "severe" | "moderate" | "low";
  finding: string;
  survived: boolean;
}

interface EdgeCase {
  scenario: string;
  risk: string;
  mitigation: string;
}

interface Competitor {
  name: string;
  pricing: string;
  strengths: string;
  weaknesses: string;
  threat: "high" | "medium" | "low";
}

interface UserQuote {
  quote: string;
  source: string;
  url?: string;
  upvotes?: string;
}

interface IdeaDetail {
  slug: string;
  name: string;
  headline: string;
  status: "alive" | "killed" | "building";
  lastUpdated: string;
  score: string;

  // Pain
  painSummary: string;
  userQuotes: UserQuote[];

  // Solution
  description: string;
  mvpFeatures: string[];
  userFlow: string[];
  techStack: string;
  pricing: { tier: string; price: string; includes: string }[];

  // Competition
  competitors: Competitor[];
  competitiveEdge: string;

  // Stress Tests
  stressTests: StressTest[];
  overallVerdict: string;

  // Edge Cases
  edgeCases: EdgeCase[];

  // Go-to-Market
  firstCustomers: string;
  distributionChannels: string[];
  
  // Metrics
  tam: string;
  timeToMvp: string;
  monthlyBurnEstimate?: string;

  // Research Log
  researchRounds: { date: string; focus: string; finding: string }[];
}

const severityColor: Record<string, string> = {
  fatal: "bg-red-500/20 text-red-400",
  severe: "bg-orange-500/20 text-orange-400",
  moderate: "bg-yellow-500/20 text-yellow-400",
  low: "bg-green-500/20 text-green-400",
};

const threatColor: Record<string, string> = {
  high: "bg-red-500/20 text-red-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  low: "bg-green-500/20 text-green-400",
};

export default function IdeaDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [data, setData] = useState<IdeaDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch(`/ideas/${slug}.json?` + Date.now())
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then(setData)
        .catch(() => setError(true));
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, [slug]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">
      <div className="text-center">
        <p className="text-lg mb-2">Idea not found: {slug}</p>
        <a href="/dashboard/research" className="text-indigo-400 hover:underline text-sm">← Back to Research</a>
      </div>
    </div>
  );

  if (!data) return <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">Loading...</div>;

  const survived = data.stressTests.filter(t => t.survived).length;
  const total = data.stressTests.length;

  return (
    <main className="min-h-screen px-4 py-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <a href="/dashboard/research" className="text-xs text-indigo-400 hover:underline">← Back to Research</a>
        <span className="text-xs text-[var(--muted)]">Last updated: {data.lastUpdated}</span>
      </div>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{data.score}</span>
        <h1 className="text-2xl font-bold">{data.name}</h1>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
          data.status === "alive" ? "bg-green-500/20 text-green-400" :
          data.status === "building" ? "bg-blue-500/20 text-blue-400 animate-pulse" :
          "bg-red-500/20 text-red-400"
        }`}>{data.status}</span>
      </div>
      <p className="text-lg text-[var(--muted)] mb-1 italic">&ldquo;{data.headline}&rdquo;</p>
      <p className="text-sm text-[var(--muted)] mb-8">{data.description}</p>

      {/* Key Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] text-center">
          <div className="text-2xl font-bold text-green-400">{survived}/{total}</div>
          <div className="text-xs text-[var(--muted)] mt-1">Stress Tests Survived</div>
        </div>
        <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] text-center">
          <div className="text-2xl font-bold">{data.tam}</div>
          <div className="text-xs text-[var(--muted)] mt-1">TAM</div>
        </div>
        <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] text-center">
          <div className="text-2xl font-bold">{data.timeToMvp}</div>
          <div className="text-xs text-[var(--muted)] mt-1">Time to MVP</div>
        </div>
        <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] text-center">
          <div className="text-2xl font-bold">{data.competitors.length}</div>
          <div className="text-xs text-[var(--muted)] mt-1">Competitors Tracked</div>
        </div>
      </section>

      {/* Pain + User Quotes */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">💢 The Pain</h2>
        <p className="text-sm mb-4">{data.painSummary}</p>
        <div className="space-y-3">
          {data.userQuotes.map((q, i) => (
            <div key={i} className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-4">
              <p className="text-sm italic text-[var(--muted)]">&ldquo;{q.quote}&rdquo;</p>
              <div className="flex items-center gap-2 mt-2">
                {q.url ? (
                  <a href={q.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline">{q.source}</a>
                ) : (
                  <span className="text-xs text-[var(--muted)]">{q.source}</span>
                )}
                {q.upvotes && <span className="text-xs text-[var(--muted)]">· {q.upvotes}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Stress Tests */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">🔴 Stress Tests</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden mb-4">
          {data.stressTests.map((t, i) => (
            <div key={i} className="px-5 py-4 border-b border-[var(--border)] last:border-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{t.survived ? "✅" : "💀"}</span>
                  <span className="text-sm font-medium">{t.attack}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${severityColor[t.severity]}`}>{t.severity}</span>
              </div>
              <p className="text-xs text-[var(--muted)]">{t.finding}</p>
            </div>
          ))}
        </div>
        <div className="rounded-lg bg-[var(--card)] border border-purple-500/20 p-4">
          <span className="text-xs font-semibold text-purple-400">OVERALL VERDICT</span>
          <p className="text-sm mt-1">{data.overallVerdict}</p>
        </div>
      </section>

      {/* Edge Cases */}
      {data.edgeCases.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-3">⚠️ Edge Cases</h2>
          <div className="space-y-3">
            {data.edgeCases.map((e, i) => (
              <div key={i} className="rounded-lg bg-[var(--card)] border border-yellow-500/20 p-4">
                <p className="text-sm font-medium">{e.scenario}</p>
                <p className="text-xs text-red-400/80 mt-1">Risk: {e.risk}</p>
                <p className="text-xs text-green-400/80 mt-1">Mitigation: {e.mitigation}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Competition */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">⚔️ Competition</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden mb-4">
          {data.competitors.map((c, i) => (
            <div key={i} className="px-5 py-4 border-b border-[var(--border)] last:border-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold">{c.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-green-400">{c.pricing}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${threatColor[c.threat]}`}>threat: {c.threat}</span>
                </div>
              </div>
              <p className="text-xs text-[var(--muted)]">💪 {c.strengths}</p>
              <p className="text-xs text-red-400/70 mt-1">🩸 {c.weaknesses}</p>
            </div>
          ))}
        </div>
        <div className="rounded-lg bg-[var(--card)] border border-emerald-500/20 p-4">
          <span className="text-xs font-semibold text-emerald-400">OUR EDGE</span>
          <p className="text-sm mt-1">{data.competitiveEdge}</p>
        </div>
      </section>

      {/* Product Spec */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">🛠️ Product Spec</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-4">
            <span className="text-xs font-semibold text-emerald-400">MVP FEATURES</span>
            <ul className="mt-2 space-y-1.5">
              {data.mvpFeatures.map((f, i) => (
                <li key={i} className="text-xs text-[var(--muted)] flex items-start gap-1.5">
                  <span className="text-emerald-400 mt-0.5">•</span>{f}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-4">
            <span className="text-xs font-semibold text-emerald-400">USER FLOW</span>
            <ol className="mt-2 space-y-1.5">
              {data.userFlow.map((s, i) => (
                <li key={i} className="text-xs text-[var(--muted)] flex items-start gap-1.5">
                  <span className="text-emerald-400 font-mono mt-0.5">{i + 1}.</span>{s}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-[var(--card)] border border-[var(--border)] p-4">
          <span className="text-xs font-semibold text-emerald-400">⚙️ TECH STACK</span>
          <p className="text-sm text-[var(--muted)] mt-1">{data.techStack}</p>
        </div>
      </section>

      {/* Pricing */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">💰 Pricing</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {data.pricing.map((p, i) => (
            <div key={i} className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-4 text-center">
              <div className="text-xs font-semibold text-[var(--muted)] mb-1">{p.tier}</div>
              <div className="text-xl font-bold text-green-400 mb-2">{p.price}</div>
              <p className="text-xs text-[var(--muted)]">{p.includes}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Go-to-Market */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">🚀 Go-to-Market</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-4 mb-3">
          <span className="text-xs font-semibold text-cyan-400">FIRST 10 CUSTOMERS</span>
          <p className="text-sm text-[var(--muted)] mt-1">{data.firstCustomers}</p>
        </div>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-4">
          <span className="text-xs font-semibold text-cyan-400">DISTRIBUTION CHANNELS</span>
          <ul className="mt-2 space-y-1">
            {data.distributionChannels.map((c, i) => (
              <li key={i} className="text-xs text-[var(--muted)] flex items-start gap-1.5">
                <span className="text-cyan-400 mt-0.5">→</span>{c}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Research Log */}
      {data.researchRounds.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-3">📋 Research Rounds</h2>
          <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden max-h-72 overflow-y-auto">
            {data.researchRounds.map((r, i) => (
              <div key={i} className="px-5 py-3 border-b border-[var(--border)] last:border-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-xs font-mono text-[var(--muted)]">{r.date}</span>
                  <span className="text-xs font-medium">{r.focus}</span>
                </div>
                <p className="text-xs text-[var(--muted)]">{r.finding}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="text-center text-xs text-[var(--muted)] pt-8">
        {data.name} · Deep Focus Research · Auto-refreshes every 15s
      </footer>
    </main>
  );
}
