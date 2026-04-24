"use client";

import { useCallback, useState } from "react";
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { API_URL } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import type { StoreAnalysisData } from "@/lib/analysis";

/* ══════════════════════════════════════════════════════════════
   StoreHealthRefreshButton — Re-analyzes the current store so the
   user can verify whether a fix worked without leaving the detail
   page. Calls the existing POST /store/{domain}/refresh-analysis
   endpoint (runs all 7 detectors, ~45–60s, 1/min rate-limit per IP).

   States: idle → loading → success (brief checkmark) → idle.
   On 429: stays in an error state with a rate-limit message.
   On success: invokes onRefreshed with the new payload so the parent
   can update its storeAnalysis state and re-render the score + checks.
   ══════════════════════════════════════════════════════════════ */

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

interface StoreHealthRefreshButtonProps {
  domain: string;
  dimensionLabel: string;
  onRefreshed: (updated: StoreAnalysisData) => void;
  /**
   * "card" (default) — standalone card with a heading.
   * "inline" — just the button + status text, for embedding.
   * "step-item" — a full <li><button> styled to match a FixSteps step card,
   *               where the whole row is the click target.
   */
  variant?: "card" | "inline" | "step-item";
  /** Required when variant="step-item". Two-digit step number like "05". */
  stepNumber?: string;
}

export default function StoreHealthRefreshButton({
  domain,
  dimensionLabel,
  onRefreshed,
  variant = "card",
  stepNumber,
}: StoreHealthRefreshButtonProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const handleClick = useCallback(async () => {
    if (status.kind === "loading") return;
    setStatus({ kind: "loading" });
    try {
      const res = await authFetch(
        `${API_URL}/store/${encodeURIComponent(domain)}/refresh-analysis`,
        { method: "POST" },
      );
      if (res.status === 429) {
        let message = "Please wait a minute before re-analyzing again.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // Non-JSON body — fall back to default message.
        }
        setStatus({ kind: "error", message });
        return;
      }
      if (!res.ok) {
        setStatus({
          kind: "error",
          message: "Re-analysis failed. Please try again.",
        });
        return;
      }
      const data = (await res.json()) as StoreAnalysisData;
      onRefreshed(data);
      setStatus({ kind: "success" });
      window.setTimeout(() => setStatus({ kind: "idle" }), 2500);
    } catch {
      setStatus({
        kind: "error",
        message: "Network error. Please try again.",
      });
    }
  }, [domain, status.kind, onRefreshed]);

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
          ? "Re-analyzing…"
          : `Re-analyze ${dimensionLabel}`}
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
            {isLoading ? "Re-analyzing…" : `Re-analyze ${dimensionLabel}`}
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
