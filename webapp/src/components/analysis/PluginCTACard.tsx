"use client";

import { useState } from "react";
import { StorefrontIcon, ArrowRightIcon, InfoIcon } from "@phosphor-icons/react";

interface PluginCTACardProps {
  variant?: "compact" | "full";
  dollarLoss?: number;
  onViewBreakdown: () => void;
}

export default function PluginCTACard({
  variant = "compact",
  dollarLoss,
  onViewBreakdown,
}: PluginCTACardProps) {
  const full = variant === "full";
  const [showTooltip, setShowTooltip] = useState(false);
  const hasDollar = dollarLoss != null && dollarLoss > 0;

  return (
    <div
      className={`${full ? "md:col-span-4 p-8" : "md:col-span-5 p-6 sm:p-8"} rounded-3xl flex flex-col justify-between relative`}
      style={{
        background: "linear-gradient(145deg, var(--primary) 0%, var(--primary-light) 55%, var(--primary) 100%)",
        boxShadow: "var(--shadow-brand-md)",
        animation: "fade-in-up 500ms var(--ease-out-quart) both",
      }}
    >
      {/* Subtle diagonal line texture */}
      <div
        className="absolute inset-0 rounded-3xl opacity-[0.035] pointer-events-none overflow-hidden"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, transparent, transparent 20px, rgba(255,255,255,0.5) 20px, rgba(255,255,255,0.5) 21px)",
        }}
      />

      <div className="relative z-10 space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
            <StorefrontIcon
              size={full ? 20 : 18}
              weight="regular"
              className="text-white/70"
            />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/40">
            Shopify Plugin
          </span>
        </div>
        <div className="flex items-start gap-1.5">
          <h3
            className={`${full ? "text-lg sm:text-xl" : "text-base sm:text-lg"} font-extrabold text-white leading-tight`}
            style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
          >
            {hasDollar
              ? `You're losing ~$${dollarLoss.toFixed(2)} per 1,000 visitors`
              : "See your real dollar impact"}
          </h3>
          {hasDollar && (
            <div className="relative flex-shrink-0 mt-0.5">
              <button
                type="button"
                aria-label="How we calculate this"
                className="cursor-pointer text-white/40 hover:text-white/70 transition-colors"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onClick={() => setShowTooltip((v) => !v)}
              >
                <InfoIcon size={16} weight="regular" />
              </button>
              {showTooltip && (
                <div
                  className="absolute top-full right-0 mt-2 w-64 rounded-xl px-4 py-3 text-xs leading-relaxed text-white/90 pointer-events-none z-50"
                  style={{
                    background: "rgba(0,0,0,0.88)",
                    backdropFilter: "blur(8px)",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                  }}
                >
                  <p className="font-semibold text-white mb-1">How we calculate this</p>
                  <p>
                    Based on your product price, category conversion rate benchmarks
                    (Shopify &amp; industry data), and your page&rsquo;s scores — estimating
                    lost revenue per 1,000 visitors vs. top stores in your category.
                  </p>
                  {/* Arrow */}
                  <div
                    className="absolute bottom-full right-3 w-0 h-0"
                    style={{
                      borderLeft: "6px solid transparent",
                      borderRight: "6px solid transparent",
                      borderBottom: "6px solid rgba(0,0,0,0.88)",
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <p
        className={`relative z-10 text-white/55 leading-relaxed ${full ? "text-sm my-5" : "text-[13px] my-4"}`}
      >
        {hasDollar
          ? "Connect your Shopify store to recover this revenue with real traffic data."
          : "Connect your Shopify store to turn conversion scores into real revenue estimates based on your actual traffic & sales data."}
      </p>

      <button
        type="button"
        onClick={onViewBreakdown}
        className={`relative z-10 cursor-pointer group w-full ${full ? "py-3" : "py-2.5"} rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 bg-white text-[var(--primary)] hover:bg-white/90 active:scale-[0.98]`}
      >
        Connect Your Store
        <ArrowRightIcon
          size={14}
          weight="bold"
          className="transition-transform group-hover:translate-x-0.5"
        />
      </button>
    </div>
  );
}
