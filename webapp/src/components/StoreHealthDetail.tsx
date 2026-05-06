"use client";

import { useCallback, useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
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
import { meetsRequirement } from "@/lib/tier";
import { useDimensionFix } from "@/hooks/useDimensionFix";
import BlurredPlaceholder from "@/components/BlurredPlaceholder";
import StoreHealthChecks from "@/components/StoreHealthChecks";
import StoreHealthRescanButton from "@/components/StoreHealthRescanButton";
import PageSpeedScorecard from "@/components/analysis/PageSpeedScorecard";

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
  const planTier = storeAnalysis.planTier ?? null;

  const { fix, loading, error, retry } = useDimensionFix(dimensionKey, domain);

  const label = fix?.label ?? localLabel;

  // True when the per-check list already covers the full fix story for
  // this dimension, so the generic FixSteps / FixCodeBlock blocks below
  // would only duplicate it. Two cases:
  //   1. Every failing check carries inline remediation → expandable rows
  //      own the fix.
  //   2. There are no failing checks at all → nothing to fix, period.
  // `every` is vacuously true on an empty array, so case 2 falls out
  // naturally. Dimensions without a checks array (legacy/pre-migration
  // scans) still fall through to the generic FixSteps fallback.
  const checksOwnFixStory =
    !!checks &&
    checks.filter((c) => !c.passed).every((c) => Boolean(c.remediation));

  // True when we have rubric checks and every one passes — the dimension
  // has nothing to fix per the named checklist, so the problem callout
  // and meta row (revenue gain / effort) would mislead the user. The
  // headline score may still be < 100 because it weighs raw axe-core
  // violations beyond the named checks; the user already sees that on
  // the score pill.
  const allChecksPass =
    !!checks && checks.length > 0 && checks.every((c) => c.passed);

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
              {allChecksPass ? "Store-wide status" : "Store-wide fix"}
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
            {/* ── Perfect-state celebration banner ──
                Replaces the problem callout when every named check passes.
                Reads as "you're done here, here's why, come back to confirm
                later" and pairs with the green score pill above. */}
            {allChecksPass && (
              <section
                className="rounded-[14px] flex items-center gap-4 px-5 py-5 sm:px-6 sm:py-6"
                style={{
                  background: "var(--success-light)",
                  border: "1px solid var(--success-border)",
                }}
                role="status"
                aria-label={`${label} is in perfect shape`}
              >
                <span
                  className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: "var(--success-text)",
                    color: "var(--paper)",
                  }}
                  aria-hidden="true"
                >
                  <CheckIcon size={26} weight="bold" />
                </span>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <h2
                    className="font-display font-extrabold text-[22px] sm:text-[24px] leading-[1.15]"
                    style={{
                      color: "var(--success-text)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    You&apos;re crushing it on {label}
                  </h2>
                  <p
                    className="text-[14px] leading-[1.55]"
                    style={{ color: "var(--ink-2)" }}
                  >
                    Every check passed. Rescan after any layout change to keep
                    it that way.
                  </p>
                </div>
              </section>
            )}

            {/* ── Headline metrics ──
                Est. revenue gain + Effort are SHOWN to every tier.
                They're advertising for the unlock — concrete numbers
                that justify the upgrade CTA below. The figures are
                public-information level (revenue gain is a function
                of score, effort is a static estimate) so there's no
                premium content to protect here. */}
            {!allChecksPass && (
              <section className="grid grid-cols-2 gap-2.5">
                <MetaCard
                  label="Est. revenue gain"
                  value={`+${calculateConversionLoss(score, dimensionKey)}%`}
                  accent="gain"
                />
                <MetaCard label="Effort" value={fix.effort} />
              </section>
            )}

            {/* ── Diagnostic zone — problem callout + (PSI) + checks ──
                For non-insights viewers, BlurredPlaceholder renders
                a synthetic red/green check-row imitation under the
                upgrade CTA. The real ``fix.problem``, signals, and
                check rows are NEVER rendered for them — children of
                BlurredPlaceholder are unreachable when locked. At
                perfect score the diagnostic block is skipped and the
                green checklist renders bare. */}
            {!allChecksPass ? (
              <BlurredPlaceholder
                requiredTier="insights"
                currentTier={planTier}
                storeDomain={domain ?? null}
                title="Unlock detailed analysis"
                subtitle="See exactly what's broken — and why it's losing you sales."
              >
                <div className="flex flex-col gap-6">
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
                  {dimensionKey === "pageSpeed" &&
                    storeAnalysis.signals?.pageSpeed && (
                      <PageSpeedScorecard
                        signals={storeAnalysis.signals.pageSpeed}
                      />
                    )}
                  {checks && (
                    <StoreHealthChecks checks={checks} planTier={planTier} storeDomain={domain ?? null} />
                  )}
                </div>
              </BlurredPlaceholder>
            ) : (
              <StoreHealthChecks checks={checks} planTier={planTier} storeDomain={domain ?? null} />
            )}

            {/* ── Fix playbook (steps + code snippet) ──
                Only rendered for viewers at Insights or higher.
                Free / anonymous viewers see only the upstream
                "Get Insights" wrap above; promoting "Get Fixes"
                before they've bought Insights would skip the
                logical upgrade ladder. Insights viewers see ONE
                combined "Get Fixes" overlay covering both the
                steps and the code snippet. Skipped at perfect
                score and when the per-check list already owns the
                fix story. */}
            {!allChecksPass &&
              !checksOwnFixStory &&
              meetsRequirement(planTier, "insights") && (
                <BlurredPlaceholder
                  requiredTier="fixes"
                  currentTier={planTier}
                  storeDomain={domain ?? null}
                  title="Unlock the full fix"
                  subtitle="Step-by-step instructions and copy-paste code to repair this dimension."
                >
                  <div className="flex flex-col gap-6">
                    <FixSteps steps={fix.steps} />
                    {fix.code && <FixCodeBlock code={fix.code} />}
                  </div>
                </BlurredPlaceholder>
              )}

            {/* ── Verify (rescan) card ──
                Hidden at perfect score — the celebration banner already
                tells the user to rescan after layout changes; a second
                rescan affordance below the checklist would be noise. */}
            {!fix.locked && !allChecksPass && domain && onStoreAnalysisUpdate && (
              <StoreHealthRescanButton
                domain={domain}
                dimensionKey={dimensionKey}
                dimensionLabel={label}
                onRescanned={onStoreAnalysisUpdate}
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
          background: "var(--code-bg)",
          color: "var(--code-fg)",
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
              ? "var(--code-button-bg-success)"
              : "var(--code-button-bg)",
            color: copied
              ? "var(--code-button-fg-success)"
              : "var(--code-button-fg)",
            border: "none",
          }}
          onMouseEnter={(e) => {
            if (!copied)
              e.currentTarget.style.background = "var(--code-button-bg-hover)";
          }}
          onMouseLeave={(e) => {
            if (!copied)
              e.currentTarget.style.background = "var(--code-button-bg)";
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

