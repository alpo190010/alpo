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
 *   - PADDLE_CLIENT_TOKEN       — public client-side token from Paddle dashboard
 *   - PADDLE_ENVIRONMENT        — "sandbox" | "production"
 *   - PADDLE_PRICE_STARTER_MONTHLY — pri_... for $29/mo
 *   - PADDLE_PRICE_STARTER_ANNUAL  — pri_... for $278/yr
 */

const CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
const ENVIRONMENT = (process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? "sandbox") as
  | "sandbox"
  | "production";

export const PADDLE_PRICE_STARTER_MONTHLY =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTHLY ?? "";
export const PADDLE_PRICE_STARTER_ANNUAL =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_ANNUAL ?? "";

/** True when all env vars needed for Paddle checkout are set. */
export function isPaddleConfigured(): boolean {
  return (
    !!CLIENT_TOKEN &&
    !!PADDLE_PRICE_STARTER_MONTHLY &&
    !!PADDLE_PRICE_STARTER_ANNUAL
  );
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

export interface OpenStarterCheckoutArgs {
  billing: "monthly" | "annual";
  userId: string;
  email?: string;
}

/**
 * Open the Paddle inline checkout overlay for the Starter plan.
 * No-ops (returns false) if Paddle is unconfigured or fails to load.
 */
export async function openStarterCheckout({
  billing,
  userId,
  email,
}: OpenStarterCheckoutArgs): Promise<boolean> {
  const priceId =
    billing === "annual"
      ? PADDLE_PRICE_STARTER_ANNUAL
      : PADDLE_PRICE_STARTER_MONTHLY;
  if (!priceId) return false;

  const paddle = await loadPaddle();
  if (!paddle) return false;

  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customData: { user_id: userId },
    customer: email ? { email } : undefined,
  });
  return true;
}
