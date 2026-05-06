"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircleIcon,
  CopyIcon,
  LockKeyIcon,
  TrashSimpleIcon,
} from "@phosphor-icons/react";
import Modal, { ModalDescription, ModalTitle } from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { API_URL } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { meetsRequirement, tierDisplayName, type PlanTier } from "@/lib/tier";

/* ══════════════════════════════════════════════════════════════
   ShareModal — owner-side UI for managing /share/{token} links
   on a single store. Tier ceiling is enforced server-side; the
   radio cards just disable above-ceiling options as a UX courtesy.
   ══════════════════════════════════════════════════════════════ */

const ALL_TIERS: readonly PlanTier[] = ["free", "insights", "fixes"] as const;

interface ShareRow {
  id: string;
  token: string;
  shareTier: PlanTier;
  createdAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  ownerCurrentTier: PlanTier;
  isExpiredByOwnerTier: boolean;
}

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Domain of the store this modal manages share links for. */
  domain: string;
  /** The owner's current effective tier on this store. Drives ceiling. */
  ownerCurrentTier: PlanTier;
}

export default function ShareModal({
  open,
  onOpenChange,
  domain,
  ownerCurrentTier,
}: ShareModalProps) {
  const [rows, setRows] = useState<ShareRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to the highest tier the owner currently has — that's the
  // "I'm sharing my best content" preset.
  const [tier, setTier] = useState<PlanTier>(ownerCurrentTier);

  // Sync if ownerCurrentTier changes between mounts (e.g., after a
  // subscription refresh).
  useEffect(() => {
    setTier(ownerCurrentTier);
  }, [ownerCurrentTier]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await authFetch(
        `${API_URL}/user/stores/${encodeURIComponent(domain)}/shares`,
      );
      if (!resp.ok) {
        setError("Couldn't load share links. Please try again.");
        setRows([]);
        return;
      }
      const data = await resp.json();
      setRows(data.shares ?? []);
    } catch {
      setError("Network error — please retry.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [domain]);

  // Load on open.
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const resp = await authFetch(
        `${API_URL}/user/stores/${encodeURIComponent(domain)}/shares`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shareTier: tier }),
        },
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        if (resp.status === 403) {
          setError(
            body.error ??
              `You can't share at ${tierDisplayName(tier)} on this store.`,
          );
        } else {
          setError(body.error ?? "Could not create share link.");
        }
        return;
      }
      const data = await resp.json();
      const created: ShareRow = data.share;
      setRows((prev) => (prev ? [created, ...prev] : [created]));
    } catch {
      setError("Network error — please retry.");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (shareId: string) => {
    setError(null);
    try {
      const resp = await authFetch(
        `${API_URL}/user/stores/${encodeURIComponent(
          domain,
        )}/shares/${shareId}`,
        { method: "DELETE" },
      );
      if (resp.status !== 204 && !resp.ok) {
        setError("Could not revoke this link.");
        return;
      }
      setRows((prev) =>
        prev
          ? prev.map((r) =>
              r.id === shareId
                ? { ...r, revokedAt: new Date().toISOString() }
                : r,
            )
          : prev,
      );
    } catch {
      setError("Network error — please retry.");
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel="Share this report"
      size="2xl"
    >
      <div className="p-7 sm:p-8 max-h-[80vh] overflow-y-auto">
        <ModalTitle className="font-display text-lg font-bold text-[var(--ink)] mb-1">
          Share{" "}
          <span className="font-mono text-[var(--ink-2)]">{domain}</span>
        </ModalTitle>
        <ModalDescription className="text-sm text-[var(--ink-3)] mb-5">
          Anyone with the link can view this report at the tier you choose.
          Free shares never expire. Paid shares stop working if your plan
          ends.
        </ModalDescription>

        {/* ── Tier picker ── */}
        <div
          className="rounded-2xl border p-4 sm:p-5 flex flex-col gap-3 mb-5"
          style={{
            background: "var(--paper)",
            borderColor: "var(--rule-2)",
          }}
        >
          <div
            className="text-[11px] font-mono font-bold uppercase tracking-[0.08em]"
            style={{ color: "var(--ink-3)" }}
          >
            New share link
          </div>
          <div
            role="radiogroup"
            aria-label="Pick the tier this link will render at"
            className="grid grid-cols-1 sm:grid-cols-3 gap-2"
          >
            {ALL_TIERS.map((opt) => {
              const allowed = meetsRequirement(ownerCurrentTier, opt);
              const selected = tier === opt && allowed;
              return (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!allowed}
                  onClick={() => allowed && setTier(opt)}
                  className="rounded-xl border p-3 text-left flex flex-col gap-1 transition-colors disabled:cursor-not-allowed"
                  style={{
                    background: selected
                      ? "var(--bg-elev)"
                      : "var(--paper)",
                    borderColor: selected ? "var(--ink)" : "var(--rule-2)",
                    opacity: allowed ? 1 : 0.55,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="font-display text-[14px] font-extrabold"
                      style={{ color: "var(--ink)" }}
                    >
                      {tierDisplayName(opt)}
                    </span>
                    {!allowed && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-[0.08em]"
                        style={{ color: "var(--ink-3)" }}
                      >
                        <LockKeyIcon size={10} weight="bold" />
                        Requires {tierDisplayName(opt)}
                      </span>
                    )}
                  </div>
                  <p
                    className="text-[12.5px] leading-[1.45]"
                    style={{ color: "var(--ink-3)" }}
                  >
                    {opt === "free"
                      ? "Viewer sees the same blurred preview as a logged-out user."
                      : opt === "insights"
                        ? "Viewer sees diagnostic prose, no fix code."
                        : "Viewer sees everything — diagnostics + fix code."}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="primary"
              size="md"
              shape="pill"
              disabled={creating}
              onClick={handleCreate}
            >
              {creating ? "Creating…" : "Create link"}
            </Button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg px-3.5 py-2.5 text-[12.5px] leading-[1.45] mb-4"
            style={{
              background: "var(--error-bg)",
              color: "var(--error-text)",
              border: "1px solid var(--error-text)",
            }}
          >
            {error}
          </div>
        )}

        {/* ── Existing links ── */}
        <div
          className="text-[11px] font-mono font-bold uppercase tracking-[0.08em] mb-2"
          style={{ color: "var(--ink-3)" }}
        >
          Your share links
        </div>
        {loading && rows == null ? (
          <p className="text-sm text-[var(--ink-3)]">Loading…</p>
        ) : rows && rows.length > 0 ? (
          <ul className="flex flex-col gap-2 list-none p-0 m-0">
            {rows.map((r) => (
              <ShareRowCard
                key={r.id}
                row={r}
                onRevoke={() => void handleRevoke(r.id)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--ink-3)]">No share links yet.</p>
        )}
      </div>
    </Modal>
  );
}

/* ── ShareRowCard ─────────────────────────────────────────────────── */

function ShareRowCard({
  row,
  onRevoke,
}: {
  row: ShareRow;
  onRevoke: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/share/${row.token}`
      : `/share/${row.token}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Best-effort — clipboard may be blocked
    }
  };

  const isRevoked = row.revokedAt != null;
  const isExpired = row.isExpiredByOwnerTier;
  const isInactive = isRevoked || isExpired;

  return (
    <li
      className="rounded-xl border p-3 flex flex-col gap-2"
      style={{
        background: "var(--paper)",
        borderColor: "var(--rule-2)",
        opacity: isInactive ? 0.65 : 1,
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-mono font-bold uppercase tracking-[0.08em]"
            style={{
              background: "var(--bg-elev)",
              color: "var(--ink-2)",
            }}
          >
            {tierDisplayName(row.shareTier)}
          </span>
          {isRevoked && (
            <span
              className="text-[11px] font-semibold"
              style={{ color: "var(--ink-3)" }}
            >
              Revoked
            </span>
          )}
          {!isRevoked && isExpired && (
            <span
              className="text-[11px] font-semibold"
              style={{ color: "var(--error-text)" }}
            >
              Expired — you downgraded
            </span>
          )}
          <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
            {row.viewCount} view{row.viewCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isInactive && (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full transition-colors hover:bg-[var(--bg-elev)]"
              style={{ color: "var(--ink-2)" }}
              aria-label={copied ? "Copied" : "Copy link"}
            >
              {copied ? (
                <>
                  <CheckCircleIcon size={12} weight="fill" />
                  Copied
                </>
              ) : (
                <>
                  <CopyIcon size={12} weight="bold" />
                  Copy
                </>
              )}
            </button>
          )}
          {!isRevoked && (
            <button
              type="button"
              onClick={onRevoke}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full transition-colors hover:bg-[color-mix(in_srgb,var(--error-text)_8%,transparent)]"
              style={{ color: "var(--error-text)" }}
              aria-label="Revoke link"
            >
              <TrashSimpleIcon size={12} weight="bold" />
              Revoke
            </button>
          )}
        </div>
      </div>
      {!isInactive && (
        <code
          className="text-[11.5px] block break-all"
          style={{ color: "var(--ink-3)" }}
        >
          {url}
        </code>
      )}
    </li>
  );
}
