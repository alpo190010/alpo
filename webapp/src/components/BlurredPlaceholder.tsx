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
 *     ``children`` blurred with a centered upgrade CTA layered on top.
 *     The blurred layer is purely visual: a ``placeholder`` prop can
 *     be passed to render different content under the blur (used for
 *     cases where the real content shouldn't be in the DOM at all).
 *
 * Security model: the strict gate is server-side stripping (see
 * ``gate_store_analysis``). Any field stripped by the API will be
 * absent from ``children`` regardless of what this component does. The
 * blur is the *visual* gate over fields that DO ship in the response
 * (e.g. check labels and detail text), so free users can see how many
 * issues exist without being able to read them.
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
  /**
   * Optional alternative content rendered blurred when locked. Use this
   * when the real ``children`` shouldn't appear in the DOM at all —
   * e.g. when the API doesn't strip the field but we want a stronger
   * gate. Defaults to rendering ``children`` blurred.
   */
  placeholder?: React.ReactNode;
  /** Real content rendered when unlocked, blurred when locked. */
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
        {placeholder ?? children}
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

