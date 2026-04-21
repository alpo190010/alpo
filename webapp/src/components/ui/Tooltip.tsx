"use client";

import { type ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

/* ── Variant tokens ── */

type TooltipVariant = "default" | "compact";

const variantClasses: Record<TooltipVariant, string> = {
  default: "rounded-xl px-4 py-3 text-xs leading-relaxed",
  compact: "rounded-xl px-2.5 py-1 text-xs font-medium whitespace-nowrap",
};

/* ── Props ── */

export interface TooltipProps {
  /** The trigger element (rendered via asChild) */
  children: ReactNode;
  /** Tooltip content — text or ReactNode */
  content: ReactNode;
  /** Which side to show the tooltip on — default 'top' */
  side?: "top" | "bottom" | "left" | "right";
  /** Offset from trigger in px — default 8 */
  sideOffset?: number;
  /** Delay before showing in ms — default 200 */
  delayDuration?: number;
  /** 'default' for rich content, 'compact' for label-style tooltips — default 'default' */
  variant?: TooltipVariant;
  /** Additional className for the content panel */
  className?: string;
}

/* ── Tooltip ── */

export default function Tooltip({
  children,
  content,
  side = "top",
  sideOffset = 8,
  delayDuration = 200,
  variant = "default",
  className = "",
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={sideOffset}
            className={`z-50 ${variantClasses[variant]} ${className}`}
            style={{
              background: "var(--tooltip-bg)",
              boxShadow: "var(--shadow-tooltip)",
              color: "var(--paper)",
            }}
          >
            {content}
            <TooltipPrimitive.Arrow
              style={{ fill: "var(--tooltip-bg)" }}
            />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

Tooltip.displayName = "Tooltip";
