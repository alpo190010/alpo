"use client";

import Link from "next/link";
import { ArrowRightIcon, LockKeyIcon } from "@phosphor-icons/react";
import { meetsRequirement, type PlanTier } from "@/lib/tier";

/**
 * Reusable paywall wrapper for tier-gated content.
 *
 * Behaviour:
 *   - When the current tier meets the requirement, renders ``children``
 *     unchanged. Zero visual cost.
 *   - When the current tier does NOT meet the requirement, renders the
 *     ``placeholder`` content with a blur filter and a centered upgrade
 *     CTA on top.
 *
 * The placeholder is the SAME for every locked viewer, so we never leak
 * the actual locked content via DOM inspection — gating happens
 * server-side; this component only handles the visual paywall.
 */
interface BlurredPlaceholderProps {
  /** Tier required to unlock the children — "insights" or "fixes". */
  requiredTier: PlanTier;
  /** Caller's current tier ("free" | "insights" | "fixes" | null). */
  currentTier?: string | null;
  /** Heading on the upgrade overlay (defaults to a tier-specific string). */
  title?: string;
  /** Subhead on the upgrade overlay. */
  subtitle?: string;
  /** CTA button label. */
  cta?: string;
  /** Skeleton-style filler shown blurred under the overlay. */
  placeholder?: React.ReactNode;
  /** Real content rendered when unlocked. */
  children: React.ReactNode;
}

export default function BlurredPlaceholder({
  requiredTier,
  currentTier,
  title,
  subtitle,
  cta,
  placeholder,
  children,
}: BlurredPlaceholderProps) {
  if (meetsRequirement(currentTier, requiredTier)) {
    return <>{children}</>;
  }

  const heading =
    title ??
    (requiredTier === "insights"
      ? "Unlock detailed analysis"
      : "Unlock the full fix");
  const sub =
    subtitle ??
    (requiredTier === "insights"
      ? "See exactly what's working and what's missing on every product page."
      : "Step-by-step instructions and copy-paste code to repair each issue.");
  const ctaLabel =
    cta ?? (requiredTier === "insights" ? "Get Insights" : "Get Fixes");

  return (
    <div className="relative">
      <div
        aria-hidden
        className="select-none pointer-events-none"
        style={{ filter: "blur(8px)", opacity: 0.55 }}
      >
        {placeholder ?? <DefaultSkeleton />}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <Link
          href="/pricing"
          aria-label={ctaLabel}
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
              {heading}
            </div>
            <p
              className="text-[12.5px] leading-[1.5] mt-1"
              style={{ color: "var(--ink-3)" }}
            >
              {sub}
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
            {ctaLabel}
            <ArrowRightIcon size={14} weight="bold" />
          </span>
        </Link>
      </div>
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div
        className="rounded-[10px] h-4 w-full"
        style={{ background: "var(--bg-elev)" }}
      />
      <div
        className="rounded-[10px] h-4 w-[88%]"
        style={{ background: "var(--bg-elev)" }}
      />
      <div
        className="rounded-[10px] h-4 w-[72%]"
        style={{ background: "var(--bg-elev)" }}
      />
      <div
        className="rounded-[10px] h-20 w-full mt-1"
        style={{ background: "var(--bg-elev)" }}
      />
    </div>
  );
}
