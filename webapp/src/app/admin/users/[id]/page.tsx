"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { authFetch, getAuthToken } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/api";

/* ══════════════════════════════════════════════════════════════
   /admin/users/[id] — User detail with inline editing
   Editable fields: plan_tier, credits_used, email_verified, role
   Self-demotion protection (R111) enforced server-side.
   ══════════════════════════════════════════════════════════════ */

interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  role: string;
  plan_tier: string;
  credits_used: number;
  email_verified: boolean;
  created_at: string | null;
  updated_at: string | null;
  picture: string | null;
  google_linked: boolean;
  scan_count: number;
  analysis_count: number;
}

type PageState = "loading" | "ready" | "not-found" | "error";

const PLAN_TIERS = ["free", "starter", "growth", "pro"] as const;
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
  const [planTier, setPlanTier] = useState("");
  const [creditsUsed, setCreditsUsed] = useState(0);
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
      setPlanTier(data.plan_tier);
      setCreditsUsed(data.credits_used);
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
    if (planTier !== user.plan_tier) changes.plan_tier = planTier;
    if (creditsUsed !== user.credits_used) changes.credits_used = creditsUsed;
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
      setPlanTier(updated.plan_tier);
      setCreditsUsed(updated.credits_used);
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
        <p className="text-lg font-semibold text-[var(--on-surface)] mb-2">
          User not found
        </p>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          The user may have been deleted or the ID is invalid.
        </p>
        <Link
          href="/admin/users"
          className="inline-block px-6 py-2 rounded-xl text-sm font-semibold border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-container-low)] transition-colors polish-focus-ring"
        >
          ← Back to Users
        </Link>
      </div>
    );
  }

  /* ── Error state ───────────────────────────────────────────── */
  if (state === "error") {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-lg font-semibold text-[var(--on-surface)] mb-2">
          Failed to load user
        </p>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Something went wrong. Please try again.
        </p>
        <button
          type="button"
          disabled={state === "loading"}
          onClick={fetchUser}
          className="px-6 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed polish-focus-ring"
          style={{ background: "var(--brand)" }}
        >
          Retry
        </button>
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
        <button
          type="button"
          disabled={impersonating}
          onClick={handleImpersonate}
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-semibold border-[1.5px] border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand)] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer polish-focus-ring"
        >
          {impersonating ? "Switching…" : "Sign in as"}
        </button>
      </div>

      {/* Read-only info */}
      <section
        className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface-container-lowest)] p-5 mb-6"
        aria-labelledby="info-heading"
      >
        <h2
          id="info-heading"
          className="text-base font-semibold text-[var(--text-primary)] mb-4"
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
              className="inline-block px-2 py-0.5 rounded-full text-xs font-bold"
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
          className="text-base font-semibold text-[var(--text-primary)] mb-4"
        >
          Edit User
        </h2>

        <div className="space-y-4">
          {/* Plan tier */}
          <div>
            <label
              htmlFor="plan_tier"
              className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1"
            >
              Plan Tier
            </label>
            <select
              id="plan_tier"
              value={planTier}
              onChange={(e) => setPlanTier(e.target.value)}
              className="w-full px-4 py-2.5 text-sm rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] outline-none polish-focus-ring"
            >
              {PLAN_TIERS.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Credits used */}
          <div>
            <label
              htmlFor="credits_used"
              className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1"
            >
              Credits Used
            </label>
            <input
              id="credits_used"
              type="number"
              min={0}
              max={999999}
              value={creditsUsed}
              onChange={(e) =>
                setCreditsUsed(Math.min(999999, Math.max(0, parseInt(e.target.value, 10) || 0)))
              }
              className="w-full px-4 py-2.5 text-sm rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] outline-none polish-focus-ring"
            />
          </div>

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
        </div>

        {/* Save */}
        <div className="mt-6 flex items-center gap-4">
          <button
            type="button"
            disabled={!hasChanges || saving}
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors polish-focus-ring"
            style={{
              background:
                !hasChanges || saving
                  ? "var(--text-tertiary)"
                  : "var(--brand)",
            }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>

          {hasChanges && !saving && (
            <button
              type="button"
              onClick={() => {
                if (!user) return;
                setPlanTier(user.plan_tier);
                setCreditsUsed(user.credits_used);
                setEmailVerified(user.email_verified);
                setRole(user.role);
                setMessage(null);
              }}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors polish-focus-ring"
            >
              Discard
            </button>
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
