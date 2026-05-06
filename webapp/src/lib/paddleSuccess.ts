"use client";

/**
 * Post-checkout activation helper.
 *
 * Paddle's ``checkout.completed`` event fires on the client the moment the
 * payment confirms — but the new plan tier only becomes visible to our API
 * after Paddle delivers the ``transaction.completed`` webhook, which is
 * asynchronous and typically lands ~1-5 s later. Reloading immediately
 * would re-render the page against the still-stale ``free`` tier and the
 * gated content would stay blurred until the user reloads a second time.
 *
 * This helper polls ``/user/plan`` until the freshly-purchased store
 * appears in ``paidStores`` at the expected tier (or higher), then hard-
 * reloads the page so every server-rendered gate re-evaluates against
 * the new tier. Falls back to a reload on timeout — better to drop the
 * user back into the page than leave them stuck on a spinner.
 */

import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/api";

interface PaidStore {
  domain: string;
  tier: "insights" | "fixes";
  currentPeriodEnd: string | null;
}

const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 30_000;

const TIER_RANK: Record<string, number> = {
  free: 0,
  insights: 1,
  fixes: 2,
};

export async function waitForPaidStoreThenReload(
  storeDomain: string,
  expectedTier: "insights" | "fixes",
): Promise<void> {
  if (typeof window === "undefined") return;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  const target = TIER_RANK[expectedTier] ?? 0;
  const normalized = storeDomain.trim().toLowerCase();

  while (Date.now() < deadline) {
    try {
      const res = await authFetch(`${API_URL}/user/plan`);
      if (res.ok) {
        const data = (await res.json()) as { paidStores?: PaidStore[] };
        const match = (data.paidStores ?? []).find(
          (s) => s.domain === normalized,
        );
        if (match && (TIER_RANK[match.tier] ?? 0) >= target) {
          break;
        }
      }
    } catch {
      // network blip — keep polling
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  window.location.reload();
}
