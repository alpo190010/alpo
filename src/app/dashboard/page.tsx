"use client";

import { useEffect, useState } from "react";

interface Status {
  lastUpdated: string;
  day: number;
  metrics: Record<string, string>;
  activeTasks: { task: string; status: string; progress: string }[];
  recentActions: { time: string; action: string }[];
  product: { feature: string; status: string }[];
  distribution: { channel: string; status: string; url?: string; detail?: string }[];
  agents: { name: string; status: string; lastRun: string; result: string }[];
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
      <p className="text-xs text-[var(--muted)] mb-8">Last updated: {data.lastUpdated} · Auto-refreshes every 15s</p>

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
              <span className="text-sm">{a.action}</span>
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
              <span className="text-sm">{p.feature}</span>
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

      <footer className="text-center text-xs text-[var(--muted)] pt-8">
        PageScore Founder Dashboard · Private · Auto-refreshes every 15s
      </footer>
    </main>
  );
}
