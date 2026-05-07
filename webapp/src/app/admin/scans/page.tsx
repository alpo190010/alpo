"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/api";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Skeleton, Select, PlatformBadge } from "@/components/ui";
import { formatDate } from "@/lib/format";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";

/* ══════════════════════════════════════════════════════════════
   /admin/scans — Domain-level audit log with rescan action.
   One row per scanned domain (e.g. allbirds.com), aggregated across
   every product URL and every user. Protected by proxy.ts admin guard.
   ══════════════════════════════════════════════════════════════ */

interface AdminScannedDomain {
  domain: string;
  scanCount: number;
  uniqueUsers: number;
  lastScannedAt: string | null;
  latestScore: number | null;
  isShopify: boolean | null;
}

interface ScansResponse {
  scans: AdminScannedDomain[];
  total: number;
  page: number;
  perPage: number;
}

const PLATFORM_OPTIONS = ["all", "true", "false", "unknown"] as const;

export default function AdminScansPage() {
  const [scans, setScans] = useState<AdminScannedDomain[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rescanInFlight, setRescanInFlight] = useState<Record<string, boolean>>({});
  const [rescanToast, setRescanToast] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [platformFilter]);

  const fetchScans = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", String(perPage));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (platformFilter !== "all") params.set("is_shopify", platformFilter);

      const res = await authFetch(`${API_URL}/admin/scans?${params}`, { signal });
      if (!res.ok) throw new Error(`Failed to load scans (${res.status})`);

      const data: ScansResponse = await res.json();
      setScans(data.scans);
      setTotal(data.total);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load scans. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, debouncedSearch, platformFilter]);

  useEffect(() => {
    const controller = new AbortController();
    fetchScans(controller.signal);
    return () => controller.abort();
  }, [fetchScans]);

  const handleRescan = useCallback(async (domain: string) => {
    setRescanInFlight((m) => ({ ...m, [domain]: true }));
    setRescanToast(null);
    try {
      const res = await authFetch(
        `${API_URL}/admin/scans/${encodeURIComponent(domain)}/rescan`,
        { method: "POST", timeoutMs: 180_000 },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { detail?: string }).detail || `Rescan failed (${res.status})`,
        );
      }
      const fresh = await res.json() as {
        domain: string;
        score: number | null;
        isShopify: boolean | null;
      };
      setRescanToast(
        `${domain}: rescanned. Score ${fresh.score ?? "—"}${
          fresh.isShopify === false ? " (non-Shopify)" : fresh.isShopify === true ? " (Shopify)" : ""
        }`,
      );
      const controller = new AbortController();
      fetchScans(controller.signal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Rescan failed";
      setRescanToast(`${domain}: ${msg}`);
    } finally {
      setRescanInFlight((m) => {
        const copy = { ...m };
        delete copy[domain];
        return copy;
      });
    }
  }, [fetchScans]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="font-display text-2xl font-extrabold text-[var(--on-surface)] tracking-tight">
          Scans
        </h1>
        <span className="text-sm text-[var(--text-secondary)]">
          {total.toLocaleString()} domain{total !== 1 ? "s" : ""} scanned
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Input
          type="text"
          placeholder="Search by domain…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search domains"
          maxLength={253}
          className="flex-1 text-sm py-2.5"
        />

        <Select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          aria-label="Filter by platform"
        >
          {PLATFORM_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p === "all"
                ? "All platforms"
                : p === "true"
                  ? "Shopify only"
                  : p === "false"
                    ? "Non-Shopify only"
                    : "Unknown only"}
            </option>
          ))}
        </Select>
      </div>

      {rescanToast && (
        <div
          role="status"
          className="mb-4 px-4 py-3 rounded-xl border text-sm"
          style={{
            background: "var(--surface-container-low)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        >
          {rescanToast}
        </div>
      )}

      {error && <ErrorState message={error} onRetry={fetchScans} disabled={loading} />}

      {loading && !error && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && !error && scans.length === 0 && (
        <EmptyState
          title="No domains found"
          description={
            debouncedSearch || platformFilter !== "all"
              ? "Try adjusting your search or filter."
              : "Nothing has been scanned yet."
          }
        />
      )}

      {!loading && !error && scans.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b border-[var(--border)]"
                  style={{ background: "var(--surface-container-low)" }}
                >
                  <th className="text-left px-4 py-3 font-semibold text-[var(--text-secondary)]">Domain</th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--text-secondary)]">Score</th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--text-secondary)]">Platform</th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--text-secondary)]">Scans</th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--text-secondary)]">Users</th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--text-secondary)]">Last scan</th>
                  <th className="text-right px-4 py-3 font-semibold text-[var(--text-secondary)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => {
                  const isRescanning = Boolean(rescanInFlight[scan.domain]);
                  return (
                    <tr
                      key={scan.domain}
                      className="border-b border-[var(--border)] last:border-b-0 transition-colors hover:bg-[var(--surface-container-low)]"
                    >
                      <td className="px-4 py-3 max-w-[280px]">
                        <Link
                          href={`/scan/${encodeURIComponent(scan.domain)}`}
                          className="block group"
                        >
                          <span className="font-medium text-[var(--text-primary)] group-hover:text-[var(--brand)] transition-colors break-all">
                            {scan.domain}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--text-primary)]">
                        {scan.latestScore ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <PlatformBadge isShopify={scan.isShopify} />
                      </td>
                      <td className="px-4 py-3 text-[var(--text-primary)]">
                        {scan.scanCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-primary)]">
                        {scan.uniqueUsers.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {formatDate(scan.lastScannedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={isRescanning}
                          onClick={() => handleRescan(scan.domain)}
                          className="rounded-xl"
                        >
                          {isRescanning ? "Rescanning…" : "Rescan"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl"
            >
              ← Previous
            </Button>
            <span className="text-sm text-[var(--text-secondary)]">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-xl"
            >
              Next →
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
