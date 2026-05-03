/**
 * Plan-tier comparison helpers used by paywall UI.
 *
 * Three-tier ladder: free < insights < fixes. A user "meets" a required
 * tier when their current rank is at least the requirement's rank.
 */

export type PlanTier = "free" | "insights" | "fixes";

const TIER_RANK: Record<string, number> = {
  free: 0,
  insights: 1,
  fixes: 2,
};

/**
 * Returns true when *current* tier covers the *required* tier's content.
 * Unknown tier strings (or undefined / null) are treated as ``free``.
 */
export function meetsRequirement(
  current: string | null | undefined,
  required: PlanTier,
): boolean {
  const c = TIER_RANK[(current ?? "free") as string] ?? 0;
  const r = TIER_RANK[required] ?? 99;
  return c >= r;
}

/** Human-friendly tier label for surfacing in copy ("Insights", "Fixes"). */
export function tierDisplayName(tier: string | null | undefined): string {
  if (tier === "insights") return "Insights";
  if (tier === "fixes") return "Fixes";
  return "Free";
}
