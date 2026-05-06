"use client";

import { CheckIcon } from "@phosphor-icons/react";
import type { DimensionCheck } from "@/lib/analysis/types";
import type { PlanTier } from "@/lib/tier";
import ChecksGroup from "./ChecksGroup";

/* ══════════════════════════════════════════════════════════════
   ChecksList — splits a DimensionCheck[] into "What's working"
   and "What's missing", sorts missing by weight desc, renders
   both ChecksGroup sections.

   Optional `allPassingMessage` prop renders a celebration banner
   when every check passes — used by the per-product surface to
   mirror the storewide "You're crushing it" treatment without
   forcing the storewide dimension detail (which renders its own
   banner separately) to opt in.
   ══════════════════════════════════════════════════════════════ */

interface AllPassingMessage {
  headline: string;
  body: string;
}

interface ChecksListProps {
  checks: DimensionCheck[] | undefined;
  allPassingMessage?: AllPassingMessage;
  /** Forwarded to ChecksGroup → CheckRow for locked-fix rendering. */
  planTier?: PlanTier | null;
  /** Forwarded down to BlurredPlaceholder for per-store checkout binding. */
  storeDomain?: string | null;
}

export default function ChecksList({
  checks,
  allPassingMessage,
  planTier,
  storeDomain,
}: ChecksListProps) {
  if (!checks || checks.length === 0) return null;

  const passing = checks.filter((c) => c.passed);
  const missing = checks
    .filter((c) => !c.passed)
    .slice()
    .sort((a, b) => b.weight - a.weight);

  if (missing.length === 0 && allPassingMessage) {
    return (
      <section
        className="rounded-[14px] flex items-center gap-4 px-5 py-5 sm:px-6 sm:py-6"
        style={{
          background: "var(--success-light)",
          border: "1px solid var(--success-border)",
        }}
        role="status"
        aria-label="All checks passing"
      >
        <span
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "var(--success-text)", color: "var(--paper)" }}
          aria-hidden
        >
          <CheckIcon size={26} weight="bold" />
        </span>
        <div className="flex flex-col gap-1.5 min-w-0">
          <h2
            className="font-display font-extrabold text-[22px] sm:text-[24px] leading-[1.15]"
            style={{ color: "var(--success-text)", letterSpacing: "-0.02em" }}
          >
            {allPassingMessage.headline}
          </h2>
          <p
            className="text-[14px] leading-[1.55]"
            style={{ color: "var(--ink-2)" }}
          >
            {allPassingMessage.body}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Dimension checks">
      {passing.length > 0 && (
        <ChecksGroup
          heading="What's working"
          count={passing.length}
          tone="pass"
          items={passing}
          planTier={planTier}
          storeDomain={storeDomain}
        />
      )}
      {missing.length > 0 && (
        <ChecksGroup
          heading="What's missing"
          count={missing.length}
          tone="fail"
          items={missing}
          planTier={planTier}
          storeDomain={storeDomain}
        />
      )}
    </section>
  );
}
