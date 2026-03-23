"use client";

import { useEffect, useState } from "react";

interface ProductSolution {
  headline: string;
  description: string;
  mvpFeatures: string[];
  userFlow: string[];
  techStack: string;
  firstCustomers: string;
}

interface ResearchIdea {
  name: string;
  status: string;
  score?: string;
  slug?: string;
  pain: string;
  evidence?: string;
  evidenceUrl?: string;
  price: string;
  competition?: string;
  tam?: string;
  aiAdvantage?: string;
  stressTest?: string;
  solution?: ProductSolution;
}

interface ResearchData {
  lastUpdated: string;
  topIdeas: ResearchIdea[];
  otherSignals: { name: string; pain: string; url?: string; price: string }[];
  killedIdeas: { name: string; reason: string }[];
  metaPatterns: string[];
  researchLog: { date: string; round: string; focus: string; findings: string }[];
}

const stressTestBadge = (s?: string) => {
  if (!s || s === "pending") return <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 animate-pulse">⏳ stress test pending</span>;
  if (s === "passed") return <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">✅ survived</span>;
  return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">❌ killed</span>;
};

export default function ResearchDashboard() {
  const [data, setData] = useState<ResearchData | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/research.json?" + Date.now())
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, []);

  if (!data) return <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">Loading research...</div>;

  const alive = data.topIdeas.filter(i => i.stressTest !== "killed").length + data.otherSignals.length;
  const killed = data.killedIdeas.length + data.topIdeas.filter(i => i.stressTest === "killed").length;

  return (
    <main className="min-h-screen px-4 py-12 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">🔬 B2B Micro SaaS Research</h1>
        <a href="/dashboard" className="text-xs text-indigo-400 hover:underline">← Back to Dashboard</a>
      </div>
      <p className="text-xs text-[var(--muted)] mb-6">Last updated: {data.lastUpdated} · Auto-refreshes every 15s · 3x daily research cycles</p>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-3 mb-10">
        <div className="p-4 rounded-lg bg-[var(--card)] border border-green-500/30 text-center">
          <div className="text-3xl font-bold text-green-400">{alive}</div>
          <div className="text-xs text-[var(--muted)] mt-1">Ideas Alive</div>
        </div>
        <div className="p-4 rounded-lg bg-[var(--card)] border border-red-500/30 text-center">
          <div className="text-3xl font-bold text-red-400">{killed}</div>
          <div className="text-xs text-[var(--muted)] mt-1">Ideas Killed</div>
        </div>
        <div className="p-4 rounded-lg bg-[var(--card)] border border-purple-500/30 text-center">
          <div className="text-3xl font-bold text-purple-400">{data.metaPatterns.length}</div>
          <div className="text-xs text-[var(--muted)] mt-1">Patterns Found</div>
        </div>
      </section>

      {/* Top Ideas */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-4">🎯 Top Ideas</h2>
        <div className="space-y-4">
          {data.topIdeas.map((idea) => (
            <div key={idea.name} className={`rounded-lg bg-[var(--card)] border ${idea.stressTest === "killed" ? "border-red-500/30 opacity-60" : "border-[var(--border)]"} overflow-hidden`}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {idea.score && <span className="text-xl">{idea.score}</span>}
                    {idea.slug ? (
                      <a href={`/dashboard/research/${idea.slug}`} className={`text-base font-bold hover:text-indigo-400 transition-colors ${idea.stressTest === "killed" ? "line-through text-[var(--muted)]" : ""}`}>{idea.name} →</a>
                    ) : (
                      <h3 className={`text-base font-bold ${idea.stressTest === "killed" ? "line-through text-[var(--muted)]" : ""}`}>{idea.name}</h3>
                    )}
                  </div>
                  {stressTestBadge(idea.stressTest)}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs font-semibold text-red-400">💢 PAIN</span>
                      <p className="text-sm text-[var(--muted)] mt-0.5">{idea.pain}</p>
                    </div>
                    {idea.evidence && (
                      <div>
                        <span className="text-xs font-semibold text-blue-400">📊 EVIDENCE</span>
                        <p className="text-sm text-[var(--muted)] mt-0.5">
                          {idea.evidenceUrl ? (
                            <a href={idea.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">{idea.evidence}</a>
                          ) : idea.evidence}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-xs font-semibold text-green-400">💰 PRICE</span>
                        <p className="text-sm font-mono text-green-400 mt-0.5">{idea.price}</p>
                      </div>
                      {idea.tam && (
                        <div>
                          <span className="text-xs font-semibold text-yellow-400">📈 TAM</span>
                          <p className="text-sm font-mono text-yellow-400 mt-0.5">{idea.tam}</p>
                        </div>
                      )}
                    </div>
                    {idea.competition && (
                      <div>
                        <span className="text-xs font-semibold text-orange-400">⚔️ COMPETITION</span>
                        <p className="text-sm text-[var(--muted)] mt-0.5">{idea.competition}</p>
                      </div>
                    )}
                    {idea.aiAdvantage && (
                      <div>
                        <span className="text-xs font-semibold text-cyan-400">🤖 AI ADVANTAGE</span>
                        <p className="text-sm mt-0.5">{idea.aiAdvantage}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Product Solution */}
                {idea.solution && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <div className="mb-3">
                      <span className="text-xs font-semibold text-emerald-400">💡 PROPOSED SOLUTION</span>
                      <p className="text-base font-bold mt-1">&ldquo;{idea.solution.headline}&rdquo;</p>
                      <p className="text-sm text-[var(--muted)] mt-1">{idea.solution.description}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <span className="text-xs font-semibold text-emerald-400">🛠️ MVP FEATURES</span>
                        <ul className="mt-1 space-y-1">
                          {idea.solution.mvpFeatures.map((f, i) => (
                            <li key={i} className="text-xs text-[var(--muted)] flex items-start gap-1.5">
                              <span className="text-emerald-400 mt-0.5">•</span>{f}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-emerald-400">🔄 USER FLOW</span>
                        <ol className="mt-1 space-y-1">
                          {idea.solution.userFlow.map((s, i) => (
                            <li key={i} className="text-xs text-[var(--muted)] flex items-start gap-1.5">
                              <span className="text-emerald-400 font-mono mt-0.5">{i + 1}.</span>{s}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                    <div className="flex gap-6 mt-3">
                      <div>
                        <span className="text-xs font-semibold text-emerald-400">⚙️ TECH</span>
                        <p className="text-xs text-[var(--muted)] mt-0.5">{idea.solution.techStack}</p>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-emerald-400">🎯 FIRST 10 CUSTOMERS</span>
                        <p className="text-xs text-[var(--muted)] mt-0.5">{idea.solution.firstCustomers}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Other Signals */}
      {data.otherSignals.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-4">📡 Other Signals</h2>
          <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden">
            {data.otherSignals.map((s) => (
              <div key={s.name} className="px-5 py-4 border-b border-[var(--border)] last:border-0 hover:bg-white/5 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-400 hover:underline font-bold">{s.name}</a>
                  ) : (
                    <span className="text-sm font-bold">{s.name}</span>
                  )}
                  <span className="text-xs font-mono text-green-400 shrink-0 ml-3">{s.price}</span>
                </div>
                <p className="text-xs text-[var(--muted)]">{s.pain}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Meta Patterns */}
      {data.metaPatterns.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-4">🧠 Meta Patterns</h2>
          <div className="rounded-lg bg-[var(--card)] border border-purple-500/20 p-5">
            <div className="space-y-3">
              {data.metaPatterns.map((p, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-purple-400 text-lg mt-0">→</span>
                  <span className="text-sm">{p}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Killed Ideas */}
      {data.killedIdeas.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-4">💀 Graveyard ({data.killedIdeas.length} killed)</h2>
          <div className="rounded-lg bg-[var(--card)] border border-red-500/10 overflow-hidden">
            {data.killedIdeas.map((k) => (
              <div key={k.name} className="px-5 py-3 border-b border-[var(--border)] last:border-0 opacity-60">
                <span className="text-sm font-medium line-through">{k.name}</span>
                <p className="text-xs text-red-400/70 mt-1">{k.reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Research Log */}
      {data.researchLog && data.researchLog.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-4">📋 Research Log</h2>
          <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden max-h-72 overflow-y-auto">
            {data.researchLog.map((r, i) => (
              <div key={i} className="px-5 py-3 border-b border-[var(--border)] last:border-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-xs font-mono text-[var(--muted)]">{r.date}</span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/20 text-indigo-400">{r.round}</span>
                </div>
                <p className="text-sm font-medium">{r.focus}</p>
                <p className="text-xs text-[var(--muted)] mt-1">{r.findings}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="text-center text-xs text-[var(--muted)] pt-8">
        B2B Research Dashboard · 3x daily cycles · Auto-refreshes every 15s
      </footer>
    </main>
  );
}
