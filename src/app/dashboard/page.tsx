"use client";

import { useEffect, useState } from "react";

interface ResearchIdea {
  name: string;
  status: string;
  score?: string;
  pain: string;
  evidence?: string;
  evidenceUrl?: string;
  price: string;
  competition?: string;
  tam?: string;
  aiAdvantage?: string;
  stressTest?: string;
  url?: string;
  reason?: string;
}

interface Status {
  lastUpdated: string;
  day: number;
  metrics: Record<string, string>;
  activeTasks: { task: string; status: string; progress: string; url?: string }[];
  recentActions: { time: string; action: string; url?: string }[];
  product: { feature: string; status: string; url?: string }[];
  distribution: { channel: string; status: string; url?: string; detail?: string }[];
  agents: { name: string; status: string; lastRun: string; result: string }[];
  research?: {
    topIdeas: ResearchIdea[];
    otherSignals: { name: string; pain: string; url?: string; price: string }[];
    killedIdeas: { name: string; reason: string }[];
    metaPatterns: string[];
  };
}

const badge = (s: string) => {
  const c: Record<string, string> = {
    live: "bg-green-500/20 text-green-400",
    ready: "bg-yellow-500/20 text-yellow-400",
    planned: "bg-indigo-500/20 text-indigo-400",
    blocked: "bg-red-500/20 text-red-400",
    in_progress: "bg-orange-500/20 text-orange-400",
    idle: "bg-gray-500/20 text-gray-400",
    running: "bg-orange-500/20 text-orange-400 animate-pulse",
    queued: "bg-purple-500/20 text-purple-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${c[s] || "bg-gray-500/20 text-gray-400"}`}>
      {s.replace("_", " ")}
    </span>
  );
};

export default function Dashboard() {
  const [data, setData] = useState<Status | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/status.json?" + Date.now())
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, []);

  if (!data) return <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">Loading dashboard...</div>;

  return (
    <main className="min-h-screen px-4 py-12 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">PageScore — Founder Dashboard</h1>
        <span className="text-xs text-[var(--muted)]">Day {data.day}</span>
      </div>
      <p className="text-xs text-[var(--muted)] mb-2">Last updated: {data.lastUpdated} · Auto-refreshes every 15s</p>
      <div className="flex gap-3 mb-8">
        <a href="/dashboard/hormozi" className="text-xs px-3 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30">💰 Hormozi CMO</a>
        <a href="/dashboard/virality" className="text-xs px-3 py-1 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30">🔥 Virality Research</a>
        <a href="/dashboard/tos" className="text-xs px-3 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30">🛡️ Platform Rules</a>
      </div>

      {/* Metrics */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        {Object.entries(data.metrics).map(([k, v]) => (
          <div key={k} className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] text-center">
            <div className="text-2xl font-bold">{v}</div>
            <div className="text-xs text-[var(--muted)] mt-1 capitalize">{k.replace(/([A-Z])/g, " $1")}</div>
          </div>
        ))}
      </section>

      {/* Active Tasks */}
      {data.activeTasks.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-3">🔥 Active Right Now</h2>
          <div className="rounded-lg bg-[var(--card)] border border-orange-500/30 overflow-hidden">
            {data.activeTasks.map((t, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] last:border-0">
                <div>
                  <div className="text-sm">{t.task}</div>
                  <div className="text-xs text-[var(--muted)] mt-1">{t.progress}</div>
                </div>
                {badge(t.status)}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Actions */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">Recent Activity</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden max-h-64 overflow-y-auto">
          {data.recentActions.map((a, i) => (
            <div key={i} className="flex gap-3 px-4 py-2 border-b border-[var(--border)] last:border-0">
              <span className="text-xs text-[var(--muted)] font-mono w-12 shrink-0">{a.time}</span>
              {a.url ? (
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-400 hover:underline">{a.action}</a>
              ) : (
                <span className="text-sm">{a.action}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Product */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">Product</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          {data.product.map((p) => (
            <div key={p.feature} className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] last:border-0">
              {p.url ? (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-400 hover:underline">{p.feature}</a>
              ) : (
                <span className="text-sm">{p.feature}</span>
              )}
              {badge(p.status)}
            </div>
          ))}
        </div>
      </section>

      {/* Distribution */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">Distribution</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          {data.distribution.map((d) => (
            <div key={d.channel} className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] last:border-0">
              <div>
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-400 hover:underline">{d.channel}</a>
                ) : (
                  <span className="text-sm">{d.channel}</span>
                )}
                {d.detail && <span className="text-xs text-[var(--muted)] ml-2">{d.detail}</span>}
              </div>
              {badge(d.status)}
            </div>
          ))}
        </div>
      </section>

      {/* Agents */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">Agent Team</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          {data.agents.map((a) => (
            <div key={a.name} className="px-4 py-3 border-b border-[var(--border)] last:border-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-indigo-400">{a.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--muted)]">{a.lastRun}</span>
                  {badge(a.status)}
                </div>
              </div>
              <div className="text-xs text-[var(--muted)] mt-1">{a.result}</div>
            </div>
          ))}
        </div>
      </section>

      {/* B2B Research */}
      {data.research && (
        <>
          {/* Top Ideas */}
          <section className="mb-10">
            <h2 className="text-lg font-bold mb-3">🎯 Top B2B Ideas</h2>
            <div className="space-y-3">
              {data.research.topIdeas.map((idea) => (
                <div key={idea.name} className="rounded-lg bg-[var(--card)] border border-[var(--border)] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{idea.score}</span>
                      <span className="text-sm font-bold">{idea.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-green-400">{idea.price}</span>
                      {idea.stressTest === "pending" ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400">stress test pending</span>
                      ) : idea.stressTest === "passed" ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">survived</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">killed</span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-[var(--muted)] mb-1">💢 <strong>Pain:</strong> {idea.pain}</p>
                  {idea.evidence && (
                    <p className="text-xs text-[var(--muted)] mb-1">
                      📊 <strong>Evidence:</strong>{" "}
                      {idea.evidenceUrl ? (
                        <a href={idea.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">{idea.evidence}</a>
                      ) : (
                        idea.evidence
                      )}
                    </p>
                  )}
                  {idea.competition && <p className="text-xs text-[var(--muted)] mb-1">⚔️ <strong>Competition:</strong> {idea.competition}</p>}
                  {idea.tam && <p className="text-xs text-[var(--muted)] mb-1">📈 <strong>TAM:</strong> {idea.tam}</p>}
                  {idea.aiAdvantage && <p className="text-xs text-[var(--muted)]">🤖 <strong>AI Advantage:</strong> {idea.aiAdvantage}</p>}
                </div>
              ))}
            </div>
          </section>

          {/* Other Signals */}
          {data.research.otherSignals.length > 0 && (
            <section className="mb-10">
              <h2 className="text-lg font-bold mb-3">📡 Other Signals</h2>
              <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden">
                {data.research.otherSignals.map((s) => (
                  <div key={s.name} className="px-4 py-3 border-b border-[var(--border)] last:border-0">
                    <div className="flex items-center justify-between">
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-400 hover:underline font-medium">{s.name}</a>
                      ) : (
                        <span className="text-sm font-medium">{s.name}</span>
                      )}
                      <span className="text-xs font-mono text-green-400">{s.price}</span>
                    </div>
                    <p className="text-xs text-[var(--muted)] mt-1">{s.pain}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Killed Ideas */}
          {data.research.killedIdeas.length > 0 && (
            <section className="mb-10">
              <h2 className="text-lg font-bold mb-3">💀 Killed Ideas</h2>
              <div className="rounded-lg bg-[var(--card)] border border-red-500/20 overflow-hidden">
                {data.research.killedIdeas.map((k) => (
                  <div key={k.name} className="px-4 py-3 border-b border-[var(--border)] last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium line-through text-[var(--muted)]">{k.name}</span>
                    </div>
                    <p className="text-xs text-red-400/80 mt-1">{k.reason}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Meta Patterns */}
          {data.research.metaPatterns.length > 0 && (
            <section className="mb-10">
              <h2 className="text-lg font-bold mb-3">🧠 Meta Patterns</h2>
              <div className="rounded-lg bg-[var(--card)] border border-purple-500/20 p-4">
                <ul className="space-y-2">
                  {data.research.metaPatterns.map((p, i) => (
                    <li key={i} className="text-sm text-[var(--muted)] flex items-start gap-2">
                      <span className="text-purple-400 mt-0.5">→</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}

      <footer className="text-center text-xs text-[var(--muted)] pt-8">
        PageScore Founder Dashboard · Private · Auto-refreshes every 15s
      </footer>
    </main>
  );
}
