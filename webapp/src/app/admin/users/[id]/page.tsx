"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { authFetch, getAuthToken } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/api";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

/* ══════════════════════════════════════════════════════════════
   /admin/users/[id] — User detail with inline editing
   Editable fields: plan_tier, credits_used, email_verified, role
   Self-demotion protection (R111) enforced server-side.
   ══════════════════════════════════════════════════════════════ */

interface PaidStore {
  domain: string;
  tier: string;
  currentPeriodEnd: string | null;
}

interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  role: string;
  email_verified: boolean;
  created_at: string | null;
  updated_at: string | null;
  picture: string | null;
  google_linked: boolean;
  scan_count: number;
  analysis_count: number;
  paid_stores: PaidStore[];
  paid_store_count: number;
}

type PageState = "loading" | "ready" | "not-found" | "error";

const ROLES = ["user", "admin"] as const;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const router = useRouter();

  const [user, setUser] = useState<UserDetail | null>(null);
  const [state, setState] = useState<PageState>("loading");
  const [impersonating, setImpersonating] = useState(false);

  // Editable field state (tracks current form values)
  const [emailVerified, setEmailVerified] = useState(false);
  const [role, setRole] = useState("");

  // Save state
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchUser = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    setMessage(null);
    try {
      const res = await authFetch(`${API_URL}/admin/users/${userId}`, { signal });
      if (res.status === 404) {
        setState("not-found");
        return;
      }
      if (!res.ok) throw new Error(`Failed to load user (${res.status})`);

      const data: UserDetail = await res.json();
      setUser(data);
      // Initialise editable fields from fetched data
      setEmailVerified(data.email_verified);
      setRole(data.role);
      setState("ready");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setState("error");
    }
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchUser(controller.signal);
    return () => controller.abort();
  }, [fetchUser]);

  async function handleImpersonate() {
    setImpersonating(true);
    setMessage(null);
    try {
      // Backup the admin's current token before switching
      const currentToken = await getAuthToken();
      if (currentToken) {
        localStorage.setItem("admin_token_backup", currentToken);
      }

      const res = await authFetch(`${API_URL}/admin/impersonate/${userId}`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setMessage({
          type: "error",
          text: data?.detail ?? "Failed to start impersonation.",
        });
        return;
      }

      const data = await res.json();

      // Store impersonation state in localStorage
      localStorage.setItem("impersonation_token", data.token);
      localStorage.setItem("impersonation_user", JSON.stringify(data.user));

      router.push("/dashboard");
    } catch {
      setMessage({
        type: "error",
        text: "Network error starting impersonation.",
      });
    } finally {
      setImpersonating(false);
    }
  }

  /** Build a PATCH body with only the fields that changed. */
  function getChangedFields(): Record<string, unknown> | null {
    if (!user) return null;
    const changes: Record<string, unknown> = {};
    if (emailVerified !== user.email_verified)
      changes.email_verified = emailVerified;
    if (role !== user.role) changes.role = role;
    return Object.keys(changes).length > 0 ? changes : null;
  }

  const hasChanges = getChangedFields() !== null;

  async function handleSave() {
    const changes = getChangedFields();
    if (!changes) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await authFetch(`${API_URL}/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setMessage({
          type: "error",
          text: data?.detail ?? "Failed to save changes.",
        });
        return;
      }

      // Update local user state with the response
      const updated: UserDetail = await res.json();
      setUser(updated);
      setEmailVerified(updated.email_verified);
      setRole(updated.role);
      setMessage({ type: "success", text: "Changes saved successfully." });
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  /* ── Loading state ─────────────────────────────────────────── */
  if (state === "loading") {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div
            className="h-5 w-24 rounded animate-pulse"
            style={{ background: "var(--surface-container)" }}
          />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-xl animate-pulse"
              style={{ background: "var(--surface-container-low)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  /* ── Not found ─────────────────────────────────────────────── */
  if (state === "not-found") {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="font-display text-lg font-semibold text-[var(--on-surface)] mb-2">
          User not found
        </p>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          The user may have been deleted or the ID is invalid.
        </p>
        <Button asChild variant="secondary">
          <Link href="/admin/users">← Back to Users</Link>
        </Button>
      </div>
    );
  }

  /* ── Error state ───────────────────────────────────────────── */
  if (state === "error") {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="font-display text-lg font-semibold text-[var(--on-surface)] mb-2">
          Failed to load user
        </p>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Something went wrong. Please try again.
        </p>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={false}
          onClick={() => fetchUser()}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!user) return null;

  /* ── Ready state ───────────────────────────────────────────── */
  return (
    <div className="max-w-2xl mx-auto">
      {/* Back link */}
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--brand)] transition-colors mb-6 polish-focus-ring"
      >
        ← Back to Users
      </Link>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1
            className="font-display text-2xl font-extrabold text-[var(--on-surface)] tracking-tight truncate"
          >
            {user.name || user.email}
          </h1>
          {user.name && (
            <p className="text-sm text-[var(--text-secondary)] mt-1 truncate">
              {user.email}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={impersonating}
          onClick={handleImpersonate}
          className="shrink-0 border-[1.5px] border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand)] hover:text-white"
        >
          {impersonating ? "Switching…" : "Sign in as"}
        </Button>
      </div>

      {/* Read-only info */}
      <section
        className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface-container-lowest)] p-5 mb-6"
        aria-labelledby="info-heading"
      >
        <h2
          id="info-heading"
          className="font-display text-base font-semibold text-[var(--text-primary)] mb-4"
        >
          User Info
        </h2>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">
              Email
            </span>
            <span className="text-[var(--text-primary)] break-all">{user.email}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">
              Name
            </span>
            <span className="text-[var(--text-primary)] truncate">
              {user.name || "—"}
            </span>
          </div>
          <div>
            <span className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">
              Google Linked
            </span>
            <span
              className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold"
              style={
                user.google_linked
                  ? {
                      background: "var(--success-light)",
                      color: "var(--success-text)",
                    }
                  : {
                      background: "var(--surface-container)",
                      color: "var(--text-secondary)",
                    }
              }
            >
              {user.google_linked ? "Yes" : "No"}
            </span>
          </div>
          <div>
            <span className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">
              Scans
            </span>
            <span className="text-[var(--text-primary)]">
              {user.scan_count}
            </span>
          </div>
          <div>
            <span className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">
              Analyses
            </span>
            <span className="text-[var(--text-primary)]">
              {user.analysis_count}
            </span>
          </div>
          <div>
            <span className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">
              Paid Stores
            </span>
            <span className="text-[var(--text-primary)]">
              {user.paid_store_count}
            </span>
          </div>
          <div>
            <span className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">
              Created
            </span>
            <span className="text-[var(--text-primary)]">
              {formatDate(user.created_at)}
            </span>
          </div>
          <div>
            <span className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">
              Updated
            </span>
            <span className="text-[var(--text-primary)]">
              {formatDate(user.updated_at)}
            </span>
          </div>
        </div>
      </section>

      {/* Editable fields */}
      <section
        className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface-container-lowest)] p-5 mb-6"
        aria-labelledby="edit-heading"
      >
        <h2
          id="edit-heading"
          className="font-display text-base font-semibold text-[var(--text-primary)] mb-4"
        >
          Edit User
        </h2>

        <div className="space-y-4">
          {/* Email verified */}
          <div className="flex items-center gap-3">
            <input
              id="email_verified"
              type="checkbox"
              checked={emailVerified}
              onChange={(e) => setEmailVerified(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--border)] accent-[var(--brand)]"
            />
            <label
              htmlFor="email_verified"
              className="text-sm font-medium text-[var(--text-primary)]"
            >
              Email Verified
            </label>
          </div>

          {/* Role */}
          <div>
            <label
              htmlFor="role"
              className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1"
            >
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-2.5 text-sm rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] outline-none polish-focus-ring"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <PaidStoresEditor
            paidStores={user.paid_stores ?? []}
            userId={user.id}
            onChange={(updated) => {
              setUser(updated);
              setMessage({ type: "success", text: "Subscription updated." });
            }}
          />
        </div>

        {/* Save */}
        <div className="mt-6 flex items-center gap-4">
          <Button
            type="button"
            variant="gradient"
            size="md"
            disabled={!hasChanges || saving}
            onClick={handleSave}
            className="px-6"
            style={{
              background:
                !hasChanges || saving
                  ? "var(--text-tertiary)"
                  : undefined,
            }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>

          {hasChanges && !saving && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!user) return;
                setEmailVerified(user.email_verified);
                setRole(user.role);
                setMessage(null);
              }}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Discard
            </Button>
          )}
        </div>

        {/* Success / error message */}
        {message && (
          <p
            className="mt-4 text-sm font-medium break-words"
            style={{
              color:
                message.type === "success"
                  ? "var(--success)"
                  : "var(--error)",
            }}
            role={message.type === "error" ? "alert" : "status"}
          >
            {message.text}
          </p>
        )}
      </section>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════
   PaidStoresEditor — admin-only per-store subscription manager
   ══════════════════════════════════════════════════════════════ */

interface PaidStoresEditorProps {
  paidStores: PaidStore[];
  userId: string;
  onChange: (updatedUser: UserDetail) => void;
}

type AdminTier = "free" | "insights" | "fixes";

function PaidStoresEditor({ paidStores, userId, onChange }: PaidStoresEditorProps) {
  const [domain, setDomain] = useState("");
  const [tier, setTier] = useState<AdminTier>("fixes");
  const [periodEnd, setPeriodEnd] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const submit = useCallback(
    async (
      submitDomain: string,
      submitTier: AdminTier,
      submitPeriodEnd: string | null,
    ) => {
      const body: Record<string, unknown> = {
        store_domain: submitDomain,
        plan_tier: submitTier,
      };
      // <input type="date"> emits YYYY-MM-DD; treat as end-of-day UTC.
      // Period is meaningless when tier=free (the row is deleted), so skip it.
      if (submitTier !== "free" && submitPeriodEnd) {
        body.current_period_end = `${submitPeriodEnd}T23:59:59Z`;
      }
      setErrMsg(null);
      setBusy(submitDomain);
      try {
        const res = await authFetch(
          `${API_URL}/admin/users/${userId}/store-subscriptions`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setErrMsg(
            (data && (data.detail || data.error)) || "Failed to save subscription.",
          );
          return;
        }
        const updated: UserDetail = await res.json();
        onChange(updated);
        setDomain("");
        setPeriodEnd("");
      } finally {
        setBusy(null);
      }
    },
    [userId, onChange],
  );

  const remove = useCallback(
    async (removeDomain: string) => {
      setErrMsg(null);
      setBusy(removeDomain);
      try {
        const res = await authFetch(
          `${API_URL}/admin/users/${userId}/store-subscriptions/${encodeURIComponent(removeDomain)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setErrMsg(
            (data && (data.detail || data.error)) || "Failed to revoke subscription.",
          );
          return;
        }
        // Refetch user to get the updated paid_stores list.
        const refreshed = await authFetch(`${API_URL}/admin/users/${userId}`);
        if (refreshed.ok) {
          const next: UserDetail = await refreshed.json();
          onChange(next);
        }
      } finally {
        setBusy(null);
      }
    },
    [userId, onChange],
  );

  return (
    <div className="border-t border-[var(--border)] pt-4">
      <label className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
        Paid Stores
      </label>

      {paidStores.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] mb-3">
          No active paid plans for this user.
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {paidStores.map((s) => (
            <li
              key={s.domain}
              className="flex flex-wrap items-center gap-2 text-sm rounded-xl border border-[var(--border)] px-3 py-2"
            >
              <span className="font-mono text-[var(--text-primary)] flex-1 min-w-0 break-all">
                {s.domain}
              </span>
              <select
                value={s.tier}
                onChange={(e) =>
                  submit(
                    s.domain,
                    e.target.value as AdminTier,
                    s.currentPeriodEnd
                      ? s.currentPeriodEnd.slice(0, 10)
                      : null,
                  )
                }
                disabled={busy === s.domain}
                className="text-xs font-semibold px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] outline-none polish-focus-ring"
              >
                <option value="free">Free</option>
                <option value="insights">Insights</option>
                <option value="fixes">Fixes</option>
              </select>
              {s.currentPeriodEnd && (
                <span className="text-xs text-[var(--text-secondary)]">
                  until {formatDate(s.currentPeriodEnd)}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy === s.domain}
                onClick={() => remove(s.domain)}
                className="text-[var(--error)]"
              >
                {busy === s.domain ? "…" : "Revoke"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-xl border border-dashed border-[var(--border)] p-3">
        <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
          Grant or update plan
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
          <div>
            <label htmlFor="grant_domain" className="block text-xs text-[var(--text-secondary)] mb-1">
              Store domain
            </label>
            <Input
              id="grant_domain"
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              className="text-sm py-2"
            />
          </div>
          <div>
            <label htmlFor="grant_tier" className="block text-xs text-[var(--text-secondary)] mb-1">
              Tier
            </label>
            <select
              id="grant_tier"
              value={tier}
              onChange={(e) => setTier(e.target.value as AdminTier)}
              className="px-3 py-2 text-sm rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] outline-none polish-focus-ring"
            >
              <option value="free">Free</option>
              <option value="insights">Insights</option>
              <option value="fixes">Fixes</option>
            </select>
          </div>
          <div>
            <label htmlFor="grant_period" className="block text-xs text-[var(--text-secondary)] mb-1">
              Until (optional)
            </label>
            <Input
              id="grant_period"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              disabled={tier === "free"}
              className="text-sm py-2"
            />
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!domain || busy !== null}
            onClick={() => submit(domain.trim().toLowerCase(), tier, periodEnd || null)}
          >
            {busy === domain ? "Saving…" : tier === "free" ? "Set free" : "Grant plan"}
          </Button>
        </div>
        {errMsg && (
          <p role="alert" className="mt-2 text-xs text-[var(--error)]">
            {errMsg}
          </p>
        )}
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          Existing rows for the same domain are updated in place. Leave the
          date blank for the default 1-year window. Setting a domain to
          <em className="not-italic font-semibold"> Free</em> deletes its
          subscription row.
        </p>
      </div>
    </div>
  );
}
