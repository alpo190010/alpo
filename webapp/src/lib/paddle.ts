"use client";

import { initializePaddle, type Paddle } from "@paddle/paddle-js";

/**
 * Paddle Billing client wrapper.
 *
 * We initialize Paddle once on first use and cache the instance. Checkout is
 * opened inline (overlay on our domain) via the Paddle.js SDK; there is no
 * server round-trip or URL redirect involved.
 *
 * Required env vars (all NEXT_PUBLIC_*):
 *   - PADDLE_CLIENT_TOKEN          — public client-side token from Paddle dashboard
 *   - PADDLE_ENVIRONMENT           — "sandbox" | "production"
 *   - PADDLE_PRICE_INSIGHTS        — pri_... for $79/yr Insights tier
 *   - PADDLE_PRICE_FIXES           — pri_... for $149/yr Fixes tier
 *   - PADDLE_PRICE_STARTER_MONTHLY — pri_... for $29/mo (dormant subscription path)
 *   - PADDLE_PRICE_STARTER_ANNUAL  — pri_... for ~$139/yr (dormant)
 */

const CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
const ENVIRONMENT = (process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? "sandbox") as
  | "sandbox"
  | "production";

export const PADDLE_PRICE_INSIGHTS =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_INSIGHTS ?? "";
export const PADDLE_PRICE_FIXES =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_FIXES ?? "";
export const PADDLE_PRICE_STARTER_MONTHLY =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTHLY ?? "";
export const PADDLE_PRICE_STARTER_ANNUAL =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_ANNUAL ?? "";

/** True when the env vars needed to open any paid checkout are set. */
export function isPaddleConfigured(): boolean {
  return !!CLIENT_TOKEN && (!!PADDLE_PRICE_INSIGHTS || !!PADDLE_PRICE_FIXES);
}

let paddlePromise: Promise<Paddle | undefined> | null = null;

function loadPaddle(): Promise<Paddle | undefined> {
  if (!CLIENT_TOKEN) {
    return Promise.resolve(undefined);
  }
  if (paddlePromise) return paddlePromise;
  paddlePromise = initializePaddle({
    environment: ENVIRONMENT,
    token: CLIENT_TOKEN,
  });
  return paddlePromise;
}

export interface OpenCheckoutArgs {
  userId: string;
  /** Domain of the store the plan should attach to. Required: per-store binding. */
  storeDomain: string;
  email?: string;
}

async function _openOneTimeCheckout(
  priceId: string,
  { userId, storeDomain, email }: OpenCheckoutArgs,
): Promise<boolean> {
  if (!priceId) return false;
  if (!storeDomain) return false;
  const paddle = await loadPaddle();
  if (!paddle) return false;
  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customData: { user_id: userId, store_domain: storeDomain.toLowerCase() },
    customer: email ? { email } : undefined,
  });
  return true;
}

/**
 * Open the Paddle inline checkout overlay for the $79/yr Insights tier.
 * Paddle charges this as a one-time purchase; the 1-year window is enforced
 * server-side via current_period_end on the user row.
 *
 * No-ops (returns false) if Paddle is unconfigured or fails to load.
 */
export function openInsightsCheckout(
  args: OpenCheckoutArgs,
): Promise<boolean> {
  return _openOneTimeCheckout(PADDLE_PRICE_INSIGHTS, args);
}

/**
 * Open the Paddle inline checkout overlay for the $149/yr Fixes tier.
 * Same one-time + 1-year-access model as Insights.
 */
export function openFixesCheckout(
  args: OpenCheckoutArgs,
): Promise<boolean> {
  return _openOneTimeCheckout(PADDLE_PRICE_FIXES, args);
}

export interface OpenStarterCheckoutArgs extends OpenCheckoutArgs {
  billing: "monthly" | "annual";
}

/**
 * Open the Paddle inline checkout overlay for the legacy Starter subscription.
 * Currently dormant — no UI calls this — but kept for a future monitoring
 * product that may revive recurring billing. Safe to remove later.
 */
export async function openStarterCheckout({
  billing,
  userId,
  storeDomain,
  email,
}: OpenStarterCheckoutArgs): Promise<boolean> {
  const priceId =
    billing === "annual"
      ? PADDLE_PRICE_STARTER_ANNUAL
      : PADDLE_PRICE_STARTER_MONTHLY;
  return _openOneTimeCheckout(priceId, { userId, storeDomain, email });
}
