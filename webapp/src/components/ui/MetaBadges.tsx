import type { HTMLAttributes } from "react";

/* Plan / role / waitlist metadata pills.
   These are distinct from the DS score chips in Badge.tsx — they label
   administrative metadata (plan tier, user role) rather than a scored state.
   Mono face, muted palette. */

const metaBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] font-mono";

type PlanTier = "pro" | "starter" | "free" | string;

export interface PlanBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tier: PlanTier;
}

export function PlanBadge({
  tier,
  className = "",
  style,
  children,
  ...props
}: PlanBadgeProps) {
  const palette =
    tier === "pro"
      ? { background: "var(--brand)", color: "var(--brand-light)" }
      : tier === "starter"
        ? { background: "var(--accent-soft)", color: "var(--accent-dim)" }
        : {
            background: "var(--surface-container)",
            color: "var(--text-secondary)",
          };

  return (
    <span
      className={`${metaBase} ${className}`}
      style={{ ...palette, ...style }}
      {...props}
    >
      {children ?? tier}
    </span>
  );
}

export interface RoleBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  role: string;
}

export function RoleBadge({
  role,
  className = "",
  style,
  children,
  ...props
}: RoleBadgeProps) {
  const palette =
    role === "admin"
      ? { background: "var(--brand)", color: "var(--brand-light)" }
      : {
          background: "var(--surface-container)",
          color: "var(--text-secondary)",
        };

  return (
    <span
      className={`${metaBase} ${className}`}
      style={{ ...palette, ...style }}
      {...props}
    >
      {children ?? role}
    </span>
  );
}

export function WaitlistBadge({
  className = "",
  style,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`${metaBase} ${className}`}
      style={{
        background: "color-mix(in srgb, var(--ok) 65%, var(--paper))",
        color: "color-mix(in srgb, var(--ok) 35%, var(--ink))",
        ...style,
      }}
      {...props}
    >
      {children ?? "Waitlisted"}
    </span>
  );
}
