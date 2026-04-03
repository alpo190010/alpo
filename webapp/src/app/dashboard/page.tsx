"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/api";
import { extractDomain, scoreColorText, scoreColorTintBg } from "@/lib/analysis";

interface Scan {
  id: string;
  url: string;
  score: number;
  productCategory: string;
  createdAt: string;
}

interface PlanInfo {
  plan: string;
  creditsUsed: number;
  creditsLimit: number;
  creditsResetAt: string | null;
  currentPeriodEnd: string | null;
  hasCreditsRemaining: boolean;
  customerPortalUrl: string | null;
}

type PageState = "loading" | "ready" | "empty" | "error";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function DashboardPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [state, setState] = useState<PageState>("loading");
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);

  const fetchScans = useCallback(async () => {
    setState("loading");
    try {
      const res = await authFetch(`${API_URL}/user/scans`);
      if (!res.ok) throw new Error(`Failed to load scans (${res.status})`);
      const data: Scan[] = await res.json();
      if (data.length === 0) {
        setState("empty");
      } else {
        setScans(data);
        setState("ready");
      }
    } catch {
      setState("error");
    }
  }, []);

  const fetchPlan = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/user/plan`);
      if (res.ok) {
        const data: PlanInfo = await res.json();
        setPlanInfo(data);
      }
    } catch {
      // Plan fetch failure is non-blocking — dashboard still shows scans
    }
  }, []);

  useEffect(() => {
    fetchScans();
    fetchPlan();
  }, [fetchScans, fetchPlan]);

  return (
    <>
      <main
        id="main-content"
        className="min-h-screen bg-[var(--bg)] pt-8 sm:pt-12 pb-16 px-4 sm:px-8"
      >
        <div className="max-w-4xl mx-auto">
          {/* Plan status card */}
          {planInfo ? (
            <div
              className="mb-8 rounded-2xl border border-[var(--outline-variant)] p-5 sm:p-6"
              style={{ background: "var(--surface-container-lowest)" }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-lg font-bold text-[var(--on-surface)]">
                      {planInfo.plan.charAt(0).toUpperCase() + planInfo.plan.slice(1)} Plan
                    </h2>
                    <span
                      className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                      style={{
                        background: planInfo.plan === "free" ? "var(--surface-container-high)" : "var(--brand-light)",
                        color: planInfo.plan === "free" ? "var(--on-surface-variant)" : "var(--brand)",
                      }}
                    >
                      {planInfo.plan === "free" ? "Free" : "Active"}
                    </span>
                  </div>
                  {/* Credits progress */}
                  <div className="mb-2">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm text-[var(--on-surface-variant)]">
                        {planInfo.creditsUsed} of {planInfo.creditsLimit} scans used this month
                      </span>
                      <span className="text-sm font-semibold text-[var(--on-surface)]">
                        {planInfo.creditsLimit - planInfo.creditsUsed} remaining
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--surface-container-high)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${planInfo.creditsLimit > 0 ? Math.min((planInfo.creditsUsed / planInfo.creditsLimit) * 100, 100) : 0}%`,
                          background: planInfo.creditsUsed >= planInfo.creditsLimit ? "var(--error)" : "var(--brand)",
                        }}
                      />
                    </div>
                  </div>
                  {planInfo.creditsResetAt && (
                    <p className="text-xs text-[var(--on-surface-variant)]">
                      Resets {formatDate(planInfo.creditsResetAt)}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {planInfo.plan === "free" ? (
                    <Link
                      href="/pricing"
                      className="inline-block primary-gradient text-white px-6 py-2.5 rounded-full font-bold text-sm hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      Upgrade
                    </Link>
                  ) : planInfo.customerPortalUrl ? (
                    <a
                      href={planInfo.customerPortalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block border border-[var(--outline-variant)] text-[var(--on-surface)] px-6 py-2.5 rounded-full font-bold text-sm hover:bg-[var(--surface-container-low)] transition-all"
                    >
                      Manage Subscription →
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ) : state === "loading" ? (
            <div
              className="mb-8 h-[140px] rounded-2xl animate-pulse"
              style={{ background: "var(--surface-container-low)" }}
            />
          ) : null}

          <h1
            className="text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] mb-8 tracking-tight"
            style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
          >
            Your Scans
          </h1>

          {/* Loading skeleton */}
          {state === "loading" && (
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 rounded-2xl animate-pulse"
                  style={{ background: "var(--surface-container-low)" }}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {state === "empty" && (
            <div
              className="text-center py-16 rounded-2xl border border-[var(--outline-variant)]"
              style={{ background: "var(--surface-container-lowest)" }}
            >
              <p className="text-lg font-semibold text-[var(--on-surface)] mb-2">
                No scans yet
              </p>
              <p className="text-sm text-[var(--on-surface-variant)] mb-6">
                Scan a product page to see your results here.
              </p>
              <Link
                href="/"
                className="inline-block primary-gradient text-white px-8 py-3 rounded-full font-bold text-sm hover:scale-[1.02] active:scale-95 transition-all"
              >
                Scan Your First Page
              </Link>
            </div>
          )}

          {/* Error state */}
          {state === "error" && (
            <div
              className="text-center py-16 rounded-2xl border border-[var(--outline-variant)]"
              style={{ background: "var(--surface-container-lowest)" }}
            >
              <p className="text-lg font-semibold text-[var(--on-surface)] mb-2">
                Failed to load scans
              </p>
              <p className="text-sm text-[var(--on-surface-variant)] mb-6">
                Something went wrong. Please try again.
              </p>
              <button
                type="button"
                onClick={fetchScans}
                className="inline-block primary-gradient text-white px-8 py-3 rounded-full font-bold text-sm hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Scan list */}
          {state === "ready" && (
            <div className="grid gap-4">
              {scans.map((scan) => {
                const domain = extractDomain(scan.url) || scan.url;
                return (
                  <Link
                    key={scan.id}
                    href={`/analyze?url=${encodeURIComponent(scan.url)}`}
                    className="flex items-center gap-4 p-5 rounded-2xl border border-[var(--outline-variant)] transition-all hover:border-[var(--brand)]/40 hover:shadow-md"
                    style={{ background: "var(--surface-container-lowest)" }}
                  >
                    {/* Score badge */}
                    <div
                      className="shrink-0 w-14 h-14 rounded-xl flex items-center justify-center font-extrabold text-lg"
                      style={{
                        background: scoreColorTintBg(scan.score),
                        color: scoreColorText(scan.score),
                        fontFamily: "var(--font-manrope), Manrope, sans-serif",
                      }}
                    >
                      {scan.score}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--on-surface)] truncate">
                        {domain}
                      </p>
                      <p className="text-xs text-[var(--on-surface-variant)] mt-0.5">
                        {formatDate(scan.createdAt)}
                        {scan.productCategory && (
                          <span> · {scan.productCategory}</span>
                        )}
                      </p>
                    </div>

                    {/* Arrow */}
                    <span className="shrink-0 text-[var(--on-surface-variant)] text-sm">
                      →
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
