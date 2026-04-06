"use client";

import { useState } from "react";
import { InfoIcon } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";

/* ══════════════════════════════════════════════════════════════
   DollarLossTooltip — Reusable (i) icon + hover/click tooltip
   explaining how dollar loss is calculated.

   Usage:
     <DollarLossTooltip />                     — default 16px, white icon
     <DollarLossTooltip size={13} variant="muted" />  — smaller, muted color
   ══════════════════════════════════════════════════════════════ */

interface DollarLossTooltipProps {
  /** Icon size in px. Default 16. */
  size?: number;
  /** "light" = white icon (on dark bg), "muted" = muted icon (on light bg). */
  variant?: "light" | "muted";
}

const TOOLTIP_TEXT =
  "Based on product price, category conversion rate benchmarks (Shopify & industry data), and page scores — estimating lost revenue per 1,000 visitors vs. top stores in your category.";

export default function DollarLossTooltip({
  size = 16,
  variant = "light",
}: DollarLossTooltipProps) {
  const [show, setShow] = useState(false);

  const iconClass =
    variant === "light"
      ? "text-white/40 hover:text-white/70"
      : "text-[var(--warning-text)] opacity-40 hover:opacity-70";

  return (
    <div
      className="relative flex-shrink-0"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="How we calculate this"
        className={`transition-colors ${iconClass} w-auto h-auto p-0`}
        onClick={() => setShow((v) => !v)}
      >
        <InfoIcon size={size} weight="regular" />
      </Button>
      {show && (
        <div
          className="absolute top-full left-0 sm:right-0 sm:left-auto mt-2 w-64 rounded-xl px-4 py-3 text-xs leading-relaxed text-white/90 z-50"
          style={{ background: "var(--tooltip-bg)", boxShadow: "var(--shadow-tooltip)" }}
        >
          <p className="font-semibold text-white mb-1">How we calculate this</p>
          <p>{TOOLTIP_TEXT}</p>
          {/* Arrow */}
          <div
            className="absolute bottom-full left-3 sm:left-auto sm:right-3 w-0 h-0"
            style={{
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderBottom: "6px solid var(--tooltip-bg)",
            }}
          />
        </div>
      )}
    </div>
  );
}
