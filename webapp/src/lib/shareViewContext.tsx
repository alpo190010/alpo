"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PlanTier } from "@/lib/tier";

/**
 * Shared-mode signal threaded through the report tree.
 *
 * On the owner's normal scan page (`/scan/{domain}`) and dashboard, the
 * provider is absent and the default ({ isShared: false }) lets every
 * paywall component behave as it always has.
 *
 * On the public `/share/{token}` page, the provider wraps the rendered
 * tree with `isShared = true` and the `shareTier` the owner picked.
 * `BlurredPlaceholder` reads this to swap its locked-state CTA from
 * "Unlock with Insights/Fixes" (which opens Paddle) to "Get your own
 * store analyzed" (which routes to /signup) — the viewer is not the
 * owner and cannot upgrade the owner's plan.
 */
export interface ShareView {
  isShared: boolean;
  shareTier?: PlanTier;
}

const ShareViewContext = createContext<ShareView>({ isShared: false });

export function ShareViewProvider({
  value,
  children,
}: {
  value: ShareView;
  children: ReactNode;
}) {
  return (
    <ShareViewContext.Provider value={value}>
      {children}
    </ShareViewContext.Provider>
  );
}

export function useShareView(): ShareView {
  return useContext(ShareViewContext);
}
