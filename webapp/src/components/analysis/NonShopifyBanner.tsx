"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";

/**
 * Prominent beta warning shown above the analysis result on non-Shopify URLs.
 * Uses the amber warning palette to make the limitation unmistakable, since
 * Shopify is the supported path and other sites are early-beta. Caller
 * controls outer placement / margins — this component owns only its own
 * chrome.
 */
export default function NonShopifyBanner() {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl border px-4 py-3"
      style={{
        background: "var(--warning-light)",
        borderColor:
          "color-mix(in srgb, var(--warning-text) 30%, transparent)",
        color: "var(--warning-text)",
      }}
    >
      <WarningCircleIcon
        size={18}
        weight="fill"
        color="var(--warning-text)"
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="font-display text-[15px] font-extrabold leading-tight">
          Beta — not a Shopify store
        </div>
        <p className="mt-1 text-sm leading-snug">
          Alpo is built for Shopify. On other sites it&rsquo;s an early beta
          and may produce inaccurate results or break unexpectedly. Checkout,
          reviews, and upsell checks are skipped.
        </p>
      </div>
    </div>
  );
}
