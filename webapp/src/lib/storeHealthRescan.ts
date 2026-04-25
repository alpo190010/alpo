/* ══════════════════════════════════════════════════════════════
   Module-level rescan store for POST /store/{domain}/rescan.

   Why this exists: StoreHealthRescanButton is rendered inside per-
   dimension pages that unmount when the user navigates to another
   dimension. If state lived in useState, clicking "Re-scan" and
   then switching dimensions would reset the button back to "idle"
   even though the backend request is still running — the user could
   click it a second time, or miss the result.

   State is keyed by (domain, dimensionKey) so each dimension has its
   own rescan lifecycle. That lets a paid user kick off Checkout and
   Shipping rescans in parallel: each button reflects only its own
   dimension's status.
   ══════════════════════════════════════════════════════════════ */

import { API_URL } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import type { StoreAnalysisData } from "@/lib/analysis";

export type RescanStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export interface RescanState {
  status: RescanStatus;
  /** Present only during the transient "success" window; consumed by mounted parents. */
  data?: StoreAnalysisData;
}

// Stable reference for the default idle entry — critical for
// useSyncExternalStore to avoid infinite re-renders.
const IDLE_ENTRY: RescanState = Object.freeze({
  status: { kind: "idle" as const },
}) as RescanState;

const entries = new Map<string, RescanState>();
const listeners = new Map<string, Set<() => void>>();
const resetTimers = new Map<string, ReturnType<typeof setTimeout>>();

const SUCCESS_RESET_MS = 2500;
const ERROR_RESET_MS = 6000;

function keyOf(domain: string, dimensionKey: string): string {
  return `${domain}::${dimensionKey}`;
}

function notify(key: string): void {
  listeners.get(key)?.forEach((cb) => cb());
}

function setEntry(key: string, next: RescanState): void {
  entries.set(key, next);
  notify(key);
}

function clearResetTimer(key: string): void {
  const t = resetTimers.get(key);
  if (t !== undefined) {
    clearTimeout(t);
    resetTimers.delete(key);
  }
}

function scheduleReset(key: string, delayMs: number): void {
  clearResetTimer(key);
  const timer = setTimeout(() => {
    resetTimers.delete(key);
    const current = entries.get(key);
    if (!current) return;
    if (current.status.kind === "success" || current.status.kind === "error") {
      setEntry(key, { status: { kind: "idle" } });
    }
  }, delayMs);
  resetTimers.set(key, timer);
}

export function getRescanState(
  domain: string,
  dimensionKey: string,
): RescanState {
  return entries.get(keyOf(domain, dimensionKey)) ?? IDLE_ENTRY;
}

export function subscribeRescan(
  domain: string,
  dimensionKey: string,
  cb: () => void,
): () => void {
  const key = keyOf(domain, dimensionKey);
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(cb);
  return () => {
    const s = listeners.get(key);
    if (!s) return;
    s.delete(cb);
    if (s.size === 0) listeners.delete(key);
  };
}

/**
 * Kick off a per-dimension rescan. No-op if one is already in flight
 * for the same (domain, dimensionKey). Other dimensions on the same
 * domain are unaffected and can rescan in parallel.
 */
export function startRescan(domain: string, dimensionKey: string): void {
  const key = keyOf(domain, dimensionKey);
  const current = entries.get(key) ?? IDLE_ENTRY;
  if (current.status.kind === "loading") return;

  clearResetTimer(key);
  setEntry(key, { status: { kind: "loading" } });

  void (async () => {
    try {
      const url =
        `${API_URL}/store/${encodeURIComponent(domain)}/rescan` +
        `?dimension=${encodeURIComponent(dimensionKey)}`;
      const res = await authFetch(url, { method: "POST" });
      if (res.status === 429) {
        let message = "Please wait a minute before rescanning again.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // Non-JSON body — use default.
        }
        setEntry(key, { status: { kind: "error", message } });
        scheduleReset(key, ERROR_RESET_MS);
        return;
      }
      if (res.status === 403) {
        // Credits or quota exhausted — surface a tier-aware message.
        let message = "Rescan blocked. Upgrade your plan to continue.";
        try {
          const body = (await res.json()) as {
            error?: string;
            errorCode?: string;
          };
          if (body?.errorCode === "credit_exhausted") {
            message =
              "You're out of credits this month. Upgrade to keep rescanning.";
          } else if (body?.errorCode === "store_quota_exhausted") {
            message = "Store limit reached. Manage your stores in the dashboard.";
          } else if (body?.error) {
            message = body.error;
          }
        } catch {
          // Non-JSON body — use default.
        }
        setEntry(key, { status: { kind: "error", message } });
        scheduleReset(key, ERROR_RESET_MS);
        return;
      }
      if (!res.ok) {
        setEntry(key, {
          status: {
            kind: "error",
            message: "Rescan failed. Please try again.",
          },
        });
        scheduleReset(key, ERROR_RESET_MS);
        return;
      }
      const data = (await res.json()) as StoreAnalysisData;
      setEntry(key, { status: { kind: "success" }, data });
      scheduleReset(key, SUCCESS_RESET_MS);
    } catch {
      setEntry(key, {
        status: {
          kind: "error",
          message: "Network error. Please try again.",
        },
      });
      scheduleReset(key, ERROR_RESET_MS);
    }
  })();
}
