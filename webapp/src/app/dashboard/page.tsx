"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/api";
import { extractDomain, scoreColorText, scoreColorTintBg } from "@/lib/analysis";
import { Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/format";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import Button from "@/components/ui/Button";
import Modal, { ModalTitle, ModalDescription } from "@/components/ui/Modal";
import {
  isPaddleConfigured,
  openInsightsCheckout,
  openFixesCheckout,
} from "@/lib/paddle";
import { waitForPaidStoreThenReload } from "@/lib/paddleSuccess";


interface Scan {
  id: string;
  url: string;
  score: number;
  productCategory: string;
  createdAt: string;
}

interface PaidStore {
  domain: string;
  tier: string;
  currentPeriodEnd: string | null;
}

interface PlanInfo {
  userId: string;
  paidStores: PaidStore[];
  hasSubscription: boolean;
  customerPortalUrl: string | null;
}

interface StoreEntry {
  domain: string;
  name: string | null;
  score: number;
  analyzedAt: string | null;
  planTier: string;
  currentPeriodEnd: string | null;
  canDelete: boolean;
}

interface StoresPayload {
  stores: StoreEntry[];
}

type PageState = "loading" | "ready" | "empty" | "error";
type StoresState = "loading" | "ready" | "error";

export default function DashboardPage() {
  const { data: session } = useSession();
  const [scans, setScans] = useState<Scan[]>([]);
  const [state, setState] = useState<PageState>("loading");
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [storesPayload, setStoresPayload] = useState<StoresPayload | null>(null);
  const [storesState, setStoresState] = useState<StoresState>("loading");
  const [deleteTarget, setDeleteTarget] = useState<StoreEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [upgradingDomain, setUpgradingDomain] = useState<string | null>(null);

  const handleUpgrade = useCallback(
    async (domain: string, tier: "insights" | "fixes") => {
      const userId = session?.user?.id;
      if (!userId) return;
      setUpgradingDomain(`${domain}:${tier}`);
      try {
        const open = tier === "insights" ? openInsightsCheckout : openFixesCheckout;
        await open({
          userId,
          storeDomain: domain,
          email: session?.user?.email ?? undefined,
          // Paddle's ``checkout.completed`` fires before the webhook records
          // the new tier — wait for /user/plan to reflect it before reloading
          // so the dashboard row shows the new badge instead of "free".
          onSuccess: () => {
            void waitForPaidStoreThenReload(domain, tier);
          },
        });
      } finally {
        setUpgradingDomain(null);
      }
    },
    [session],
  );

  const fetchScans = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    try {
      const res = await authFetch(`${API_URL}/user/scans`, { signal });
      if (!res.ok) throw new Error(`Failed to load scans (${res.status})`);
      const data: Scan[] = await res.json();
      if (data.length === 0) {
        setState("empty");
      } else {
        setScans(data);
        setState("ready");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setState("error");
    }
  }, []);

  const fetchPlan = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await authFetch(`${API_URL}/user/plan`, { signal });
      if (res.ok) {
        const data: PlanInfo = await res.json();
        setPlanInfo(data);
      }
    } catch {
      // Plan fetch failure is non-blocking — dashboard still shows scans
    }
  }, []);

  const fetchStores = useCallback(async (signal?: AbortSignal) => {
    setStoresState("loading");
    try {
      const res = await authFetch(`${API_URL}/user/stores`, { signal });
      if (!res.ok) throw new Error(`Failed to load stores (${res.status})`);
      const data: StoresPayload = await res.json();
      setStoresPayload(data);
      setStoresState("ready");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setStoresState("error");
    }
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await authFetch(
        `${API_URL}/user/stores/${encodeURIComponent(deleteTarget.domain)}`,
        { method: "DELETE" },
      );
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as {
          detail?: { error?: string };
          error?: string;
        };
        const msg =
          body.detail?.error ??
          body.error ??
          "This store has an active paid plan and can't be deleted.";
        setDeleteError(msg);
        return;
      }
      if (!res.ok) {
        throw new Error(`Delete failed (${res.status})`);
      }
      setDeleteTarget(null);
      await fetchStores();
    } catch {
      setDeleteError("Could not delete this store. Please try again.");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, fetchStores]);

  useEffect(() => {
    const controller = new AbortController();
    fetchScans(controller.signal);
    fetchPlan(controller.signal);
    fetchStores(controller.signal);
    return () => controller.abort();
  }, [fetchScans, fetchPlan, fetchStores]);

  return (
    <>
      <main
        id="main-content"
        className="min-h-screen bg-[var(--bg)] pt-8 sm:pt-12 pb-16 px-4 sm:px-8"
      >
        <div className="max-w-4xl mx-auto">
          {/* Plan status card — paid stores summary */}
          {planInfo ? (
            <div
              className="mb-8 rounded-2xl border border-[var(--outline-variant)] p-5 sm:p-6"
              style={{ background: "var(--surface-container-lowest)" }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="font-display text-lg font-bold text-[var(--on-surface)] mb-2">
                    Your plans
                  </h2>
                  {planInfo.paidStores.length === 0 ? (
                    <p className="text-sm text-[var(--on-surface-variant)]">
                      You have no active paid plans. Scans are unlimited; pick
                      a store below to unlock fixes for it.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {planInfo.paidStores.map((s) => (
                        <li
                          key={s.domain}
                          className="flex justify-between gap-3 text-[var(--on-surface)]"
                        >
                          <span className="font-mono">{s.domain}</span>
                          <span className="text-[var(--on-surface-variant)]">
                            {s.tier}
                            {s.currentPeriodEnd
                              ? ` until ${formatDate(s.currentPeriodEnd)}`
                              : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {planInfo.customerPortalUrl && (
                  <div className="shrink-0">
                    <Button asChild variant="secondary" size="sm" shape="pill">
                      <a href={planInfo.customerPortalUrl} target="_blank" rel="noopener noreferrer">
                        Manage Billing →
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : state === "loading" ? (
            <Skeleton className="mb-8 h-[140px] rounded-2xl" />
          ) : null}

          {/* My Stores */}
          <section aria-labelledby="my-stores-heading" className="mb-10">
            <div className="flex items-baseline justify-between gap-4 mb-4">
              <h2
                id="my-stores-heading"
                className="font-display text-xl sm:text-2xl font-extrabold text-[var(--on-surface)] tracking-tight"
              >
                My Stores
              </h2>
            </div>

            {storesState === "loading" && (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-[72px] rounded-2xl" />
                ))}
              </div>
            )}

            {storesState === "error" && (
              <ErrorState
                title="Failed to load stores"
                message="Something went wrong. Please try again."
                onRetry={() => fetchStores()}
                disabled={false}
              />
            )}

            {storesState === "ready" && storesPayload && (
              <>
                {storesPayload.stores.length === 0 ? (
                  <p className="text-sm text-[var(--on-surface-variant)]">
                    You haven&apos;t scanned any stores yet.{" "}
                    <Link href="/" className="text-[var(--brand)] font-semibold">
                      Run your first scan.
                    </Link>
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {storesPayload.stores.map((store) => {
                      const isPaid =
                        store.planTier === "insights" ||
                        store.planTier === "fixes";
                      const paddleReady = isPaddleConfigured();
                      const upgradeKeyInsights = `${store.domain}:insights`;
                      const upgradeKeyFixes = `${store.domain}:fixes`;
                      return (
                        <li
                          key={store.domain}
                          className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl border border-[var(--outline-variant)]"
                          style={{ background: "var(--surface-container-lowest)" }}
                        >
                          <div
                            className="font-display shrink-0 w-11 h-11 rounded-xl flex items-center justify-center font-extrabold text-sm"
                            style={{
                              background: scoreColorTintBg(store.score),
                              color: scoreColorText(store.score),
                            }}
                          >
                            {store.score}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-[var(--on-surface)] truncate">
                                {store.name || store.domain}
                              </p>
                              <span
                                className="text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                                style={{
                                  background: isPaid
                                    ? "var(--brand-light)"
                                    : "var(--surface-container-high)",
                                  color: isPaid
                                    ? "var(--brand)"
                                    : "var(--on-surface-variant)",
                                }}
                              >
                                {store.planTier}
                              </span>
                            </div>
                            <p className="text-xs text-[var(--on-surface-variant)] mt-0.5 truncate">
                              {store.domain}
                              {store.analyzedAt && (
                                <span> · Last scanned {formatDate(store.analyzedAt)}</span>
                              )}
                              {store.currentPeriodEnd && (
                                <span> · Plan until {formatDate(store.currentPeriodEnd)}</span>
                              )}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <Button
                              asChild
                              variant="secondary"
                              size="sm"
                              shape="pill"
                            >
                              <Link href={`/scan/${encodeURIComponent(store.domain)}`}>
                                Open
                              </Link>
                            </Button>
                            {!isPaid && paddleReady && (
                              <>
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  shape="pill"
                                  onClick={() =>
                                    handleUpgrade(store.domain, "insights")
                                  }
                                  disabled={upgradingDomain === upgradeKeyInsights}
                                >
                                  {upgradingDomain === upgradeKeyInsights
                                    ? "Opening…"
                                    : "Get Insights"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  shape="pill"
                                  onClick={() =>
                                    handleUpgrade(store.domain, "fixes")
                                  }
                                  disabled={upgradingDomain === upgradeKeyFixes}
                                >
                                  {upgradingDomain === upgradeKeyFixes
                                    ? "Opening…"
                                    : "Get Fixes"}
                                </Button>
                              </>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              shape="pill"
                              onClick={() => {
                                setDeleteError(null);
                                setDeleteTarget(store);
                              }}
                              disabled={!store.canDelete}
                              title={
                                store.canDelete
                                  ? undefined
                                  : "Active paid plan — wait for it to expire to delete this store."
                              }
                              className="text-[var(--error)] hover:bg-[var(--error-light)] disabled:opacity-40"
                            >
                              Delete
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </section>

          <h1
            className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] mb-8 tracking-tight"
          >
            Your Scans
          </h1>

          {/* Loading skeleton */}
          {state === "loading" && (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {state === "empty" && (
            <EmptyState
              title="No scans yet"
              description="Scan a product page to see your results here."
              action={
                <Button asChild variant="primary" size="sm" shape="pill">
                  <Link href="/">Scan Your First Page</Link>
                </Button>
              }
            />
          )}

          {/* Error state */}
          {state === "error" && (
            <ErrorState
              title="Failed to load scans"
              message="Something went wrong. Please try again."
              onRetry={() => fetchScans()}
              disabled={false}
            />
          )}

          {/* Scan list */}
          {state === "ready" && (
            <div className="grid gap-4 md:grid-cols-2">
              {scans.map((scan) => {
                const domain = extractDomain(scan.url) || scan.url;
                return (
                  <Link
                    key={scan.id}
                    href={`/analyze?url=${encodeURIComponent(scan.url)}`}
                    className="flex items-center gap-4 p-5 rounded-2xl border border-[var(--outline-variant)] transition-all hover:border-[var(--brand)]/40 hover:shadow-[var(--shadow-brand-sm)]"
                    style={{ background: "var(--surface-container-lowest)" }}
                  >
                    {/* Score badge */}
                    <div
                      className="font-display shrink-0 w-14 h-14 rounded-xl flex items-center justify-center font-extrabold text-lg"
                      style={{
                        background: scoreColorTintBg(scan.score),
                        color: scoreColorText(scan.score),
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

      <Modal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        ariaLabel="Confirm delete store"
        size="sm"
      >
        <div className="p-6">
          <ModalTitle className="font-display text-lg font-bold text-[var(--on-surface)] mb-2">
            Delete this store?
          </ModalTitle>
          <ModalDescription className="text-sm text-[var(--on-surface-variant)] mb-5">
            This removes your scan data for{" "}
            <strong className="text-[var(--on-surface)]">
              {deleteTarget?.name || deleteTarget?.domain}
            </strong>
            . The store stays available to re-scan later.
          </ModalDescription>
          {deleteError && (
            <p
              role="alert"
              className="mb-4 text-sm"
              style={{ color: "var(--error)" }}
            >
              {deleteError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              shape="pill"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              shape="pill"
              onClick={handleDelete}
              disabled={deleting}
              style={{ background: "var(--error)" }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
