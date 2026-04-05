"use client";

import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/api";
import { Badge, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/format";
import ErrorState from "@/components/ErrorState";

/* ══════════════════════════════════════════════════════════════
   /admin — Platform analytics dashboard
   Stat cards, CSS bar charts, plan distribution.
   Protected by proxy.ts admin route guard (S01).
   ══════════════════════════════════════════════════════════════ */

interface AnalyticsData {
  total_users: number;
  signups_over_time: { date: string; count: number }[];
  total_scans: number;
  scans_over_time: { date: string; count: number }[];
  plan_distribution: { plan_tier: string; count: number }[];
  total_credits_used: number;
}

/** Format a large number with locale grouping (e.g. 1,234) */
function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_URL}/admin/analytics`, { signal });
      if (!res.ok) throw new Error(`Failed to load analytics (${res.status})`);
      const json: AnalyticsData = await res.json();
      setData(json);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load analytics. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAnalytics(controller.signal);
    return () => controller.abort();
  }, [fetchAnalytics]);

  return (
    <div>
      <h1
        className="text-2xl font-extrabold text-[var(--on-surface)] tracking-tight mb-6"
        style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
      >
        Dashboard
      </h1>

      {/* Error state */}
      {error && <ErrorState message={error} onRetry={fetchAnalytics} />}

      {/* Loading skeleton */}
      {loading && !error && (
        <div className="space-y-6">
          {/* Skeleton stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          {/* Skeleton chart areas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
          {/* Skeleton plan distribution */}
          <Skeleton className="h-32 rounded-xl" />
        </div>
      )}

      {/* Dashboard content */}
      {!loading && !error && data && (
        <div className="space-y-6">
          {/* ── Stat cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Total Users" value={fmtNum(data.total_users)} />
            <StatCard label="Total Scans" value={fmtNum(data.total_scans)} />
            <StatCard
              label="Credits Used"
              value={fmtNum(data.total_credits_used)}
            />
          </div>

          {/* ── Bar charts ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BarChart
              title="Signups (Last 30 Days)"
              data={data.signups_over_time}
              barColor="var(--brand)"
            />
            <BarChart
              title="Scans (Last 30 Days)"
              data={data.scans_over_time}
              barColor="var(--success)"
            />
          </div>

          {/* ── Plan distribution ── */}
          <div
            className="rounded-xl border border-[var(--border)] p-5"
            style={{ background: "var(--surface-container-lowest)" }}
          >
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
              Plan Distribution
            </h2>

            {data.plan_distribution.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                No plan data yet.
              </p>
            ) : (
              <div className="space-y-3">
                {data.plan_distribution.map((p) => {
                  const maxCount = Math.max(
                    ...data.plan_distribution.map((d) => d.count),
                  );
                  const pct = maxCount > 0 ? (p.count / maxCount) * 100 : 0;
                  return (
                    <div key={p.plan_tier} className="flex items-center gap-3">
                      <Badge plan={p.plan_tier} className="min-w-[64px] text-center">
                        {p.plan_tier}
                      </Badge>
                      <div className="flex-1 h-6 rounded-md overflow-hidden bg-[var(--surface-container-low)]">
                        <div
                          className="h-full rounded-md transition-all"
                          style={{
                            width: `${pct}%`,
                            background: planBarColor(p.plan_tier),
                            minWidth: pct > 0 ? "4px" : undefined,
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-[var(--text-primary)] min-w-[32px] text-right tabular-nums">
                        {fmtNum(p.count)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Sub-components ─────────────────────── */

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border border-[var(--border)] p-5"
      style={{ background: "var(--surface-container-lowest)" }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1">
        {label}
      </p>
      <p className="text-3xl font-extrabold text-[var(--text-primary)] tabular-nums">
        {value}
      </p>
    </div>
  );
}

function BarChart({
  title,
  data,
  barColor,
}: {
  title: string;
  data: { date: string; count: number }[];
  barColor: string;
}) {
  const maxVal = Math.max(...data.map((d) => d.count), 1);

  return (
    <div
      className="rounded-xl border border-[var(--border)] p-5"
      style={{ background: "var(--surface-container-lowest)" }}
    >
      <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
        {title}
      </h2>

      {data.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] py-8 text-center">
          No data yet.
        </p>
      ) : (
        <div className="flex items-end gap-[3px] h-36">
          {data.map((d) => {
            const heightPct = (d.count / maxVal) * 100;
            return (
              <div
                key={d.date}
                className="flex-1 flex flex-col items-center justify-end h-full group"
              >
                {/* Count label — visible on hover */}
                <span className="text-[10px] font-semibold text-[var(--text-secondary)] mb-1 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                  {d.count}
                </span>
                {/* Bar */}
                <div
                  className="w-full rounded-t-sm transition-all"
                  style={{
                    height: `${heightPct}%`,
                    minHeight: d.count > 0 ? "3px" : "1px",
                    background:
                      d.count > 0
                        ? barColor
                        : "var(--surface-container-high)",
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* X-axis date labels — show first, middle, last to avoid crowding */}
      {data.length > 0 && (
        <div className="flex justify-between mt-2">
          <span className="text-[10px] text-[var(--text-secondary)]">
            {formatDate(data[0].date, { includeYear: false })}
          </span>
          {data.length > 2 && (
            <span className="text-[10px] text-[var(--text-secondary)]">
              {formatDate(data[Math.floor(data.length / 2)].date, { includeYear: false })}
            </span>
          )}
          {data.length > 1 && (
            <span className="text-[10px] text-[var(--text-secondary)]">
              {formatDate(data[data.length - 1].date, { includeYear: false })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Map plan tier to a bar fill color */
function planBarColor(tier: string): string {
  switch (tier) {
    case "pro":
      return "var(--brand)";
    case "growth":
      return "var(--success)";
    case "starter":
      return "var(--surface-container-high)";
    default:
      return "var(--surface-container)";
  }
}
