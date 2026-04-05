"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/api";
import { Badge, Skeleton, Select } from "@/components/ui";
import { formatDate } from "@/lib/format";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";

/* ══════════════════════════════════════════════════════════════
   /admin/users — Searchable, filterable user list with pagination
   Protected by proxy.ts admin route guard (S01).
   ══════════════════════════════════════════════════════════════ */

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  plan_tier: string;
  credits_used: number;
  email_verified: boolean;
  created_at: string | null;
  updated_at: string | null;
}

interface UsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  per_page: number;
}

const ROLE_OPTIONS = ["all", "user", "admin"] as const;
const PLAN_OPTIONS = ["all", "free", "starter", "growth", "pro"] as const;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to first page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [roleFilter, planFilter]);

  const fetchUsers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", String(perPage));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (planFilter !== "all") params.set("plan_tier", planFilter);

      const res = await authFetch(`${API_URL}/admin/users?${params}`, { signal });
      if (!res.ok) throw new Error(`Failed to load users (${res.status})`);

      const data: UsersResponse = await res.json();
      setUsers(data.users);
      setTotal(data.total);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load users. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, debouncedSearch, roleFilter, planFilter]);

  useEffect(() => {
    const controller = new AbortController();
    fetchUsers(controller.signal);
    return () => controller.abort();
  }, [fetchUsers]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1
          className="font-display text-2xl font-extrabold text-[var(--on-surface)] tracking-tight"
        >
          Users
        </h1>
        <span className="text-sm text-[var(--text-secondary)]">
          {total} user{total !== 1 ? "s" : ""} total
        </span>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search users"
          className="flex-1 px-4 py-2.5 text-sm rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] outline-none polish-focus-ring"
        />

        <Select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter by role"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r === "all" ? "All roles" : r.charAt(0).toUpperCase() + r.slice(1)}
            </option>
          ))}
        </Select>

        <Select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          aria-label="Filter by plan"
        >
          {PLAN_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p === "all" ? "All plans" : p.charAt(0).toUpperCase() + p.slice(1)}
            </option>
          ))}
        </Select>
      </div>

      {/* Error state */}
      {error && <ErrorState message={error} onRetry={fetchUsers} />}

      {/* Loading skeleton */}
      {loading && !error && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && users.length === 0 && (
        <EmptyState
          title="No users found"
          description={
            debouncedSearch || roleFilter !== "all" || planFilter !== "all"
              ? "Try adjusting your search or filters."
              : "No users have signed up yet."
          }
        />
      )}

      {/* User table */}
      {!loading && !error && users.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b border-[var(--border)]"
                  style={{ background: "var(--surface-container-low)" }}
                >
                  <th className="text-left px-4 py-3 font-semibold text-[var(--text-secondary)]">
                    Name / Email
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--text-secondary)]">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--text-secondary)]">
                    Plan
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-[var(--text-secondary)]">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-[var(--border)] last:border-b-0 transition-colors hover:bg-[var(--surface-container-low)]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="block group"
                      >
                        <span className="font-medium text-[var(--text-primary)] group-hover:text-[var(--brand)] transition-colors">
                          {user.name || "—"}
                        </span>
                        <span className="block text-xs text-[var(--text-secondary)] mt-0.5">
                          {user.email}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge role={user.role}>
                        {user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge plan={user.plan_tier}>
                        {user.plan_tier}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {formatDate(user.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--border)] text-[var(--text-primary)] bg-[var(--bg)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors hover:bg-[var(--surface-container-low)]"
            >
              ← Previous
            </button>
            <span className="text-sm text-[var(--text-secondary)]">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--border)] text-[var(--text-primary)] bg-[var(--bg)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors hover:bg-[var(--surface-container-low)]"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
