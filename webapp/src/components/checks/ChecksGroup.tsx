"use client";

import type { DimensionCheck } from "@/lib/analysis/types";
import type { PlanTier } from "@/lib/tier";
import CheckRow from "./CheckRow";

/* ══════════════════════════════════════════════════════════════
   ChecksGroup — heading + bordered <ul> of CheckRow items.
   Used by both storewide dimension detail and per-product page
   health surfaces to render either the "What's working" or
   "What's missing" section.
   ══════════════════════════════════════════════════════════════ */

interface ChecksGroupProps {
  heading: string;
  count: number;
  tone: "pass" | "fail";
  items: DimensionCheck[];
  /** Forwarded to CheckRow so locked-fix rows can render the lock CTA. */
  planTier?: PlanTier | null;
  /** Forwarded to CheckRow → BlurredPlaceholder for per-store checkout binding. */
  storeDomain?: string | null;
}

export default function ChecksGroup({
  heading,
  count,
  tone,
  items,
  planTier,
  storeDomain,
}: ChecksGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <h3
        className="font-mono text-[10px] font-bold uppercase flex items-center gap-1.5"
        style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}
      >
        <span>{heading}</span>
        <span
          className="font-display text-[11px] tabular-nums"
          style={{ color: "var(--ink-2)" }}
        >
          ({count})
        </span>
      </h3>
      <ul
        className="flex flex-col rounded-[14px] border overflow-hidden list-none p-0"
        style={{
          background: "var(--paper)",
          borderColor: "var(--rule-2)",
        }}
      >
        {items.map((item, i) => (
          <CheckRow
            key={item.id}
            item={item}
            tone={tone}
            isLast={i === items.length - 1}
            planTier={planTier}
            storeDomain={storeDomain}
          />
        ))}
      </ul>
    </div>
  );
}
