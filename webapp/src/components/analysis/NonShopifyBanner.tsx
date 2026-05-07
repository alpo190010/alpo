"use client";

import { InfoIcon } from "@phosphor-icons/react";

/**
 * Banner shown above the analysis result when the analyzed URL was not
 * detected as a Shopify store. Tells the user — in plain language — that
 * we ran the universal checks but skipped the Shopify-only ones, so the
 * report won't have data on checkout flow, reviews app, cross-sell, etc.
 */
export default function NonShopifyBanner() {
  return (
    <div
      role="status"
      className="max-w-6xl mx-auto px-4 sm:px-6 mt-20 sm:mt-24"
    >
      <div className="flex items-start gap-3 p-4 sm:p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="shrink-0 w-9 h-9 rounded-full bg-[var(--brand-light,rgba(0,0,0,0.04))] flex items-center justify-center">
          <InfoIcon size={20} weight="regular" color="var(--brand)" />
        </div>
        <div className="text-sm leading-relaxed text-[var(--on-surface)]">
          <p className="font-display font-semibold text-[var(--text-primary)] mb-1">
            Not a Shopify store
          </p>
          <p className="text-[var(--text-secondary)]">
            We&rsquo;ve checked the things that work on any website. Some
            store-specific insights — like checkout flow, reviews app, and
            upsell modules — only show up for Shopify sites.
          </p>
        </div>
      </div>
    </div>
  );
}
