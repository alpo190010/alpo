"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { StoreAnalysisData } from "@/lib/analysis";
import {
  getRescanState,
  startRescan,
  subscribeRescan,
} from "@/lib/storeHealthRescan";

/* ══════════════════════════════════════════════════════════════
   StoreHealthRescanButton — Re-runs the *single* dimension the
   user is viewing so they can verify whether a fix worked without
   leaving the detail page. Calls POST /store/{domain}/rescan
   ?dimension={dimensionKey}, which runs only the targeted detector
   (and only the external API calls it needs — axe for accessibility,
   PSI for pageSpeed, etc.). 2–3× faster than a full 7-dimension
   rescan, ~10–25s typical.

   Free users are rate-limited per-user to 1 rescan/min (rotating
   dimensions does NOT reset the cooldown — see store.py). Paid
   users are unlimited. Free users also pay 1 credit per rescan.

   Rescan state is keyed by (domain, dimensionKey), shared across
   every mount of this component via the module store in
   lib/storeHealthRescan.ts. Navigating between dimensions
   mid-flight keeps the per-dimension "Re-scanning…" state alive,
   and rescanning different dimensions in parallel works.

   States: idle → loading → success → idle (auto after 2.5s).
   On 429, 403, or network error: loading → error → idle (auto after 6s).
   On success: the module holds the result briefly; the mounted
   parent's onRescanned is invoked once to update storeAnalysis.
   ══════════════════════════════════════════════════════════════ */

interface StoreHealthRescanButtonProps {
  domain: string;
  /** Dimension key (e.g. "checkout", "pageSpeed"). Scopes rescan state + backend call. */
  dimensionKey: string;
  dimensionLabel: string;
  onRescanned: (updated: StoreAnalysisData) => void;
  /**
   * "card" (default) — standalone card with a heading.
   * "inline" — just the button + status text, for embedding.
   * "step-item" — a full <li><button> styled to match a FixSteps step card,
   *               where the whole row is the click target.
   */
  variant?: "card" | "inline" | "step-item" | "verify-card";
  /** Required when variant="step-item". Two-digit step number like "05". */
  stepNumber?: string;
}

export default function StoreHealthRescanButton({
  domain,
  dimensionKey,
  dimensionLabel,
  onRescanned,
  variant = "card",
  stepNumber,
}: StoreHealthRescanButtonProps) {
  // Subscribe to the shared rescan state for this (domain, dimensionKey).
  // Each dimension has an independent rescan lifecycle — clicking
  // "Re-scan Shipping" doesn't affect the Checkout button state.
  const getSnapshot = useCallback(
    () => getRescanState(domain, dimensionKey),
    [domain, dimensionKey],
  );
  const subscribe = useCallback(
    (cb: () => void) => subscribeRescan(domain, dimensionKey, cb),
    [domain, dimensionKey],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const status = state.status;

  // Always invoke the latest onRescanned without re-triggering the
  // success effect — keeps dependency array clean.
  const onRescannedRef = useRef(onRescanned);
  useEffect(() => {
    onRescannedRef.current = onRescanned;
  }, [onRescanned]);

  // When the module transitions to success with a payload, propagate
  // it to the parent. Idempotent: two mounts firing this for the same
  // data produce the same storeAnalysis state.
  useEffect(() => {
    if (state.status.kind === "success" && state.data) {
      onRescannedRef.current(state.data);
    }
  }, [state.status.kind, state.data]);

  const handleClick = useCallback(() => {
    if (status.kind === "loading") return;
    startRescan(domain, dimensionKey);
  }, [domain, dimensionKey, status.kind]);

  const controls = (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={handleClick}
        disabled={status.kind === "loading"}
        aria-busy={status.kind === "loading"}
        className="inline-flex items-center gap-2 font-display font-bold text-[13px] px-4 py-2.5 rounded-[10px] transition-opacity"
        style={{
          background: "var(--ink)",
          color: "var(--paper)",
          opacity: status.kind === "loading" ? 0.7 : 1,
          cursor: status.kind === "loading" ? "progress" : "pointer",
        }}
      >
        <ArrowClockwiseIcon
          size={14}
          weight="bold"
          className={status.kind === "loading" ? "animate-spin" : ""}
        />
        {status.kind === "loading"
          ? "Re-scanning…"
          : `Re-scan ${dimensionLabel}`}
      </button>
      {status.kind === "loading" && (
        <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
          This takes about a minute.
        </span>
      )}
      {status.kind === "success" && (
        <span
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold"
          style={{ color: "var(--success-text)" }}
        >
          <CheckCircleIcon size={14} weight="fill" />
          Updated just now
        </span>
      )}
      {status.kind === "error" && (
        <span
          className="inline-flex items-center gap-1.5 text-[12px]"
          style={{ color: "var(--error-text)" }}
        >
          <WarningCircleIcon size={14} weight="fill" />
          {status.message}
        </span>
      )}
    </div>
  );

  if (variant === "inline") return controls;

  if (variant === "step-item") {
    const isLoading = status.kind === "loading";
    return (
      <li className="list-none">
        <button
          type="button"
          onClick={handleClick}
          disabled={isLoading}
          aria-busy={isLoading}
          className="group flex items-center gap-3 rounded-[12px] px-3.5 py-3 w-full text-left transition-all"
          style={{
            background: "var(--ink)",
            color: "var(--paper)",
            border: "1px solid var(--ink)",
            cursor: isLoading ? "progress" : "pointer",
            boxShadow: "0 2px 10px color-mix(in srgb, var(--ink) 18%, transparent)",
          }}
          onMouseEnter={(e) => {
            if (!isLoading) e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <span
            className="shrink-0 inline-flex items-center justify-center w-[22px] h-[22px] rounded-md font-mono text-[11px] font-bold"
            style={{
              background: "var(--paper)",
              color: "var(--ink)",
              lineHeight: 1,
            }}
          >
            {stepNumber ?? ""}
          </span>
          <ArrowClockwiseIcon
            size={16}
            weight="bold"
            color="var(--paper)"
            className={isLoading ? "animate-spin" : ""}
          />
          <span
            className="font-display text-[14px] leading-[1.4] font-bold flex-1 min-w-0 truncate"
            style={{ color: "var(--paper)", letterSpacing: "-0.01em" }}
          >
            {isLoading ? "Re-scanning…" : `Re-scan ${dimensionLabel}`}
          </span>
          {status.kind === "idle" && (
            <ArrowRightIcon
              size={14}
              weight="bold"
              color="var(--paper)"
              className="shrink-0 transition-transform group-hover:translate-x-0.5"
              style={{ opacity: 0.7 }}
            />
          )}
          {status.kind === "loading" && (
            <span
              className="shrink-0 text-[11px] hidden sm:inline"
              style={{ color: "var(--paper)", opacity: 0.7 }}
            >
              ~1 min
            </span>
          )}
          {status.kind === "success" && (
            <span
              className="shrink-0 inline-flex items-center gap-1 text-[12px] font-semibold font-mono uppercase px-2 py-0.5 rounded-md"
              style={{
                background: "var(--paper)",
                color: "var(--success-text)",
                letterSpacing: "0.05em",
              }}
            >
              <CheckCircleIcon size={12} weight="fill" />
              Updated
            </span>
          )}
          {status.kind === "error" && (
            <span
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold font-mono uppercase px-2 py-0.5 rounded-md"
              style={{
                background: "var(--paper)",
                color: "var(--error-text)",
                letterSpacing: "0.05em",
              }}
            >
              <WarningCircleIcon size={12} weight="fill" />
              Retry
            </span>
          )}
        </button>
      </li>
    );
  }

  if (variant === "verify-card") {
    const isLoading = status.kind === "loading";
    return (
      <section
        aria-labelledby={`verify-${dimensionKey}-heading`}
        className="rounded-[16px] border px-5 py-6 sm:px-7 sm:py-7 flex flex-col items-center text-center gap-4"
        style={{
          background: "var(--paper)",
          borderColor: "color-mix(in srgb, var(--accent) 40%, var(--rule-2))",
          boxShadow: "0 2px 14px color-mix(in srgb, var(--accent) 10%, transparent)",
        }}
      >
        <div className="flex flex-col gap-1.5 items-center">
          <span
            className="font-mono text-[10px] font-bold uppercase"
            style={{ color: "var(--accent)", letterSpacing: "0.16em" }}
          >
            Final step
          </span>
          <h3
            id={`verify-${dimensionKey}-heading`}
            className="font-display font-bold text-[17px] sm:text-[18px] leading-[1.25]"
            style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}
          >
            Check if your fix worked
          </h3>
          <p
            className="text-[13px] leading-[1.5] max-w-[380px]"
            style={{ color: "var(--ink-2)" }}
          >
            We&apos;ll re-scan {dimensionLabel.toLowerCase()} and update your
            score. Usually takes about a minute.
          </p>
        </div>

        <button
          type="button"
          onClick={handleClick}
          disabled={isLoading}
          aria-busy={isLoading}
          aria-label={
            isLoading ? "Re-scanning" : `Re-scan ${dimensionLabel}`
          }
          className="group inline-flex items-center justify-center gap-2.5 w-full sm:w-auto min-h-[56px] px-8 rounded-[12px] transition-all font-display font-bold text-[15px]"
          style={{
            background: "var(--accent)",
            color: "var(--accent-ink)",
            border: "1px solid var(--accent)",
            cursor: isLoading ? "progress" : "pointer",
            boxShadow:
              "0 6px 20px color-mix(in srgb, var(--accent) 30%, transparent)",
            letterSpacing: "-0.01em",
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.background = "var(--accent-dim)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.background = "var(--accent)";
          }}
        >
          <ArrowClockwiseIcon
            size={18}
            weight="bold"
            className={isLoading ? "animate-spin" : ""}
          />
          <span>
            {isLoading ? "Re-scanning…" : `Re-scan ${dimensionLabel}`}
          </span>
          {status.kind === "idle" && (
            <ArrowRightIcon
              size={14}
              weight="bold"
              className="transition-transform group-hover:translate-x-0.5"
              style={{ opacity: 0.85 }}
            />
          )}
        </button>

        {status.kind === "success" && (
          <div
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
            style={{ color: "var(--success-text)" }}
          >
            <CheckCircleIcon size={14} weight="fill" />
            Score updated just now
          </div>
        )}
        {status.kind === "error" && (
          <div
            className="inline-flex items-center gap-1.5 text-[12.5px]"
            style={{ color: "var(--error-text)" }}
          >
            <WarningCircleIcon size={14} weight="fill" />
            {status.message}
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      className="rounded-[14px] border px-5 py-4 flex flex-col gap-2.5"
      style={{
        background: "var(--paper)",
        borderColor: "var(--rule-2)",
      }}
    >
      <div
        className="font-mono text-[10px] font-bold uppercase"
        style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}
      >
        Finished applying the fix?
      </div>
      {controls}
    </section>
  );
}
