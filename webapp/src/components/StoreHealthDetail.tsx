"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  LockKeyIcon,
} from "@phosphor-icons/react";
import {
  type DimensionCheck,
  type StoreAnalysisData,
  CATEGORY_LABELS,
  CATEGORY_SVG,
  calculateConversionLoss,
  dimensionAvailability,
  scoreColorText,
  scoreColorTintBg,
} from "@/lib/analysis";
import { useDimensionFix } from "@/hooks/useDimensionFix";
import StoreHealthChecks from "@/components/StoreHealthChecks";
import StoreHealthRefreshButton from "@/components/StoreHealthRefreshButton";

/* ══════════════════════════════════════════════════════════════
   StoreHealthDetail — Right-pane fix view for one store-wide
   dimension. Matches the claude.ai/design handoff layout:

     ← Back to results
     [icon]  STORE-WIDE FIX
             {Dimension label}               [score pill]
     ┌ Problem callout
     │ Meta row (revenue gain · effort · scope)
     │ How to fix it  — numbered steps
     │ Code snippet (optional) with Copy
     └

   Data flows from `GET /fix/{dimensionKey}` via `useDimensionFix`.
   Free-tier callers receive `locked: true`; steps/code are swapped
   for an upgrade stub.
   ══════════════════════════════════════════════════════════════ */

interface StoreHealthDetailProps {
  dimensionKey: string;
  storeAnalysis: StoreAnalysisData;
  /** Optional — when provided, enables per-dimension re-analyze at the bottom of the page. */
  domain?: string;
  /** Optional — called with the refreshed StoreAnalysisData after re-analyze succeeds. */
  onStoreAnalysisUpdate?: (next: StoreAnalysisData) => void;
}

function tierName(score: number): string {
  if (score >= 70) return "Good";
  if (score >= 40) return "Needs work";
  return "Critical";
}

export default function StoreHealthDetail({
  dimensionKey,
  storeAnalysis,
  domain,
  onStoreAnalysisUpdate,
}: StoreHealthDetailProps) {
  const score =
    (storeAnalysis.categories as Record<string, number>)[dimensionKey] ?? 0;
  const localLabel = CATEGORY_LABELS[dimensionKey] ?? dimensionKey;
  const icon = CATEGORY_SVG[dimensionKey];
  const availability = dimensionAvailability(dimensionKey, storeAnalysis.signals);
  const checks: DimensionCheck[] | undefined =
    storeAnalysis.checks?.[dimensionKey];

  const { fix, loading, error, retry } = useDimensionFix(dimensionKey, domain);

  const label = fix?.label ?? localLabel;

  // Dimensions whose failing checks carry inline remediation text
  // don't need the separate "How to fix it" steps panel — each
  // missing row expands to its own fix. Checkout is the first
  // dimension on this model; other dimensions still fall back to the
  // legacy FixSteps list until their rubrics are extended.
  const checksHaveRemediation =
    !!checks && checks.some((c) => !c.passed && Boolean(c.remediation));

  return (
    <div
      className="h-full w-full px-6 sm:px-10 pt-8 sm:pt-12"
      style={{
        animation: "fade-in-up 400ms var(--ease-out-quart) both",
        // Keep the verify card well clear of the browser's bottom
        // chrome (URL bar, home indicator). Respects iOS safe area.
        paddingBottom: "calc(8rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        {/* ── Header: icon + title + score pill ── */}
        <header
          className="flex items-start gap-4 pb-5"
          style={{ borderBottom: "1px solid var(--rule-2)" }}
        >
          <span
            className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
            style={{
              background: scoreColorTintBg(score),
              color: scoreColorText(score),
            }}
            aria-hidden="true"
          >
            <span className="scale-[1.4] flex">{icon}</span>
          </span>
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <span
              className="font-mono text-[10px] font-bold uppercase"
              style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}
            >
              Store-wide fix
            </span>
            <h1
              className="font-display font-extrabold text-[28px] leading-[1.1]"
              style={{ color: "var(--ink)", letterSpacing: "-0.02em" }}
            >
              {label}
            </h1>
            {availability && dimensionKey === "accessibility" ? (
              <span
                className="inline-flex items-center w-fit font-mono font-bold text-[11px] uppercase px-2.5 py-1 rounded-full"
                style={{
                  background: "var(--bg-elev)",
                  color: "var(--ink-3)",
                  letterSpacing: "0.08em",
                }}
              >
                {availability.label}
              </span>
            ) : (
              <span
                className="inline-flex items-center w-fit font-display font-bold text-[11px] px-2.5 py-1 rounded-full tabular-nums"
                style={{
                  background: scoreColorTintBg(score),
                  color: scoreColorText(score),
                  letterSpacing: "-0.01em",
                }}
              >
                {tierName(score)} · {score}/100
                {availability ? ` · ${availability.label}` : ""}
              </span>
            )}
          </div>
        </header>

        {availability && (
          <p
            className="text-[13px] leading-[1.55] rounded-[14px] px-4 py-3"
            style={{
              background: "var(--bg-elev)",
              color: "var(--ink-2)",
              border: "1px solid var(--rule-2)",
            }}
            role="status"
          >
            {availability.detail}
          </p>
        )}

        {loading && !fix && <FixSkeleton />}

        {error && !fix && <FixErrorCard message={error} onRetry={retry} />}

        {fix && (
          <>
            {/* ── Problem callout ── */}
            <p
              className="rounded-[14px] text-[15px] leading-[1.55] px-5 py-4"
              style={{
                background: "var(--bg)",
                color: "var(--ink-2)",
                borderLeft: "3px solid var(--warning-text)",
              }}
            >
              {fix.problem}
            </p>

            {/* ── Meta row ── */}
            <section className="grid grid-cols-2 gap-2.5">
              <MetaCard
                label="Est. revenue gain"
                value={`+${calculateConversionLoss(score, dimensionKey)}%`}
                accent="gain"
              />
              <MetaCard label="Effort" value={fix.effort} />
            </section>

            {/* ── Pass/fail checklist for this store ── */}
            <StoreHealthChecks checks={checks} />

            {/* ── Steps or locked stub ──
                When the checklist above already carries per-check
                remediation (expandable failing rows), the generic
                "How to fix it" step list would duplicate content —
                skip it. Locked (free-tier) users still see the
                upgrade prompt because their check rows are stripped
                of remediation server-side. */}
            {fix.locked ? (
              <LockedUpgradePrompt />
            ) : checksHaveRemediation ? null : (
              <FixSteps steps={fix.steps} />
            )}

            {/* ── Code snippet ──
                Hidden when checks carry per-row remediation/code —
                each failing check owns its own snippet now, so the
                generic bottom block would duplicate content. */}
            {!fix.locked && fix.code && !checksHaveRemediation && (
              <FixCodeBlock code={fix.code} />
            )}

            {/* ── Verify (re-analyze) card ── */}
            {!fix.locked && domain && onStoreAnalysisUpdate && (
              <StoreHealthRefreshButton
                domain={domain}
                dimensionKey={dimensionKey}
                dimensionLabel={label}
                onRefreshed={onStoreAnalysisUpdate}
                variant="verify-card"
              />
            )}

            {/* Bottom spacer — explicit breathing room between the
                last content block (typically the Verify card) and
                the browser's bottom chrome. Using a real sibling
                element is more reliable than outer-container padding
                across the nested scroll containers this page lives
                in. Accounts for iOS safe-area inset on mobile. */}
            <div
              aria-hidden
              style={{
                height: "calc(6rem + env(safe-area-inset-bottom, 0px))",
                flexShrink: 0,
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ── Meta card ──────────────────────────────────────────────── */
function MetaCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "gain";
}) {
  return (
    <div
      className="rounded-[14px] border px-4 py-3.5 min-w-0"
      style={{
        background: "var(--paper)",
        borderColor: "var(--rule-2)",
      }}
    >
      <div
        className="font-mono text-[9px] font-bold uppercase mb-1"
        style={{ color: "var(--ink-3)", letterSpacing: "0.12em" }}
      >
        {label}
      </div>
      <div
        className="font-display font-extrabold text-[19px] leading-[1.1] break-words"
        style={{
          color: accent === "gain" ? "var(--success-text)" : "var(--ink)",
          letterSpacing: "-0.02em",
          fontStyle: accent === "gain" ? "italic" : "normal",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* ── Numbered steps ─────────────────────────────────────────── */
function FixSteps({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <h2
        className="font-display font-bold text-[16px]"
        style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}
      >
        How to fix it
      </h2>
      <ol className="flex flex-col gap-2 list-none p-0">
        {steps.map((step, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-[12px] border px-3.5 py-3 transition-colors"
            style={{
              background: "var(--paper)",
              borderColor: "var(--rule-2)",
            }}
          >
            <span
              className="shrink-0 inline-flex items-center justify-center w-[22px] h-[22px] rounded-md font-mono text-[11px] font-bold"
              style={{
                background: "var(--ink)",
                color: "var(--paper)",
                lineHeight: 1,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              className="text-[13.5px] leading-[1.45] flex-1"
              style={{ color: "var(--ink-2)" }}
            >
              {step}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ── Code block with Copy ───────────────────────────────────── */
function FixCodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API unavailable — silently no-op.
    }
  }, [code]);

  return (
    <section>
      <h2
        className="font-display font-bold text-[16px] mb-2.5"
        style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}
      >
        Code snippet
      </h2>
      <div
        className="relative rounded-[14px] font-mono text-[12px] leading-[1.55] overflow-x-auto"
        style={{
          background: "#16130e",
          color: "#e8e4d8",
          whiteSpace: "pre",
          padding: "16px 18px",
        }}
      >
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors"
          style={{
            background: copied
              ? "rgba(130, 200, 140, 0.22)"
              : "rgba(255,255,255,0.08)",
            color: copied ? "#b7e3be" : "rgba(255,255,255,0.75)",
            border: "none",
          }}
          onMouseEnter={(e) => {
            if (!copied)
              e.currentTarget.style.background = "rgba(255,255,255,0.15)";
          }}
          onMouseLeave={(e) => {
            if (!copied)
              e.currentTarget.style.background = "rgba(255,255,255,0.08)";
          }}
          aria-label={copied ? "Copied code to clipboard" : "Copy code to clipboard"}
        >
          {copied ? <CheckIcon size={11} weight="bold" /> : <CopyIcon size={11} weight="bold" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <code>{code}</code>
      </div>
    </section>
  );
}

/* ── Loading skeleton ───────────────────────────────────────── */
function FixSkeleton() {
  const pulse: React.CSSProperties = {
    background:
      "linear-gradient(90deg, var(--bg-elev) 0%, var(--paper) 50%, var(--bg-elev) 100%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s ease-in-out infinite",
    borderRadius: 8,
  };
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      <div style={{ ...pulse, height: 68, borderRadius: 14 }} />
      <div className="grid grid-cols-3 gap-2.5">
        <div style={{ ...pulse, height: 72, borderRadius: 14 }} />
        <div style={{ ...pulse, height: 72, borderRadius: 14 }} />
        <div style={{ ...pulse, height: 72, borderRadius: 14 }} />
      </div>
      <div className="flex flex-col gap-2">
        <div style={{ ...pulse, height: 48, borderRadius: 12 }} />
        <div style={{ ...pulse, height: 48, borderRadius: 12 }} />
        <div style={{ ...pulse, height: 48, borderRadius: 12 }} />
      </div>
    </div>
  );
}

/* ── Error card ─────────────────────────────────────────────── */
function FixErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="rounded-[14px] border px-5 py-4 flex items-start gap-4"
      style={{
        background: "var(--paper)",
        borderColor: "var(--rule-2)",
      }}
    >
      <div className="flex-1 min-w-0">
        <div
          className="font-mono text-[10px] font-bold uppercase mb-1"
          style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}
        >
          Couldn&apos;t load fix
        </div>
        <p
          className="text-[13px] leading-[1.5]"
          style={{ color: "var(--ink-2)" }}
        >
          {message}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-md transition-colors"
        style={{
          background: "var(--ink)",
          color: "var(--paper)",
        }}
      >
        Retry
      </button>
    </div>
  );
}

/* ── Locked upgrade prompt ──────────────────────────────────── */
function LockedUpgradePrompt() {
  return (
    <Link
      href="/pricing"
      aria-label="Upgrade your plan to see the full fix"
      className="group rounded-[14px] border px-5 py-5 flex items-center gap-4 transition-[background,border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-quart)] hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]/30"
      style={{
        background: "var(--paper)",
        borderColor: "var(--rule-2)",
        boxShadow: "var(--shadow-subtle)",
      }}
    >
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: "var(--bg-elev)",
          color: "var(--ink-2)",
        }}
      >
        <LockKeyIcon size={18} weight="bold" />
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="font-display font-bold text-[15px] leading-tight"
          style={{ color: "var(--ink)" }}
        >
          Upgrade to see the full fix
        </div>
        <p
          className="text-[12.5px] leading-[1.5] mt-1"
          style={{ color: "var(--ink-3)" }}
        >
          Numbered steps and the ready-to-paste code snippet unlock on paid
          plans.
        </p>
      </div>
      <span
        className="shrink-0 inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-full transition-transform duration-150 group-hover:translate-x-0.5"
        style={{
          background: "var(--ink)",
          color: "var(--paper)",
        }}
        aria-hidden="true"
      >
        View plans
        <ArrowRightIcon size={14} weight="bold" />
      </span>
    </Link>
  );
}
