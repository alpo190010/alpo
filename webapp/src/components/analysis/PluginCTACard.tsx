"use client";

import { memo } from "react";
import { StorefrontIcon, ArrowRightIcon } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import DollarLossAmount from "@/components/analysis/DollarLossAmount";
import DollarLossTooltip from "@/components/analysis/DollarLossTooltip";

interface PluginCTACardProps {
  variant?: "compact" | "full";
  dollarLoss?: number;
  onViewBreakdown: () => void;
}

const PluginCTACard = memo(function PluginCTACard({
  variant = "compact",
  dollarLoss,
  onViewBreakdown,
}: PluginCTACardProps) {
  const full = variant === "full";
  const hasDollar = dollarLoss != null && dollarLoss > 0;

  return (
    <div
      className={`${full ? "md:col-span-4 p-8" : "md:col-span-5 p-6 sm:p-8"} rounded-2xl flex flex-col justify-between relative`}
      style={{
        background: "linear-gradient(145deg, var(--primary) 0%, var(--primary-light) 55%, var(--primary) 100%)",
        boxShadow: "var(--shadow-brand-md)",
        animation: "fade-in-up 500ms var(--ease-out-quart) both",
      }}
    >
      {/* Subtle diagonal line texture */}
      <div
        className="absolute inset-0 rounded-2xl opacity-[0.035] pointer-events-none overflow-hidden"
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
            className={`${full ? "text-lg sm:text-xl" : "text-base sm:text-lg"} font-extrabold text-white leading-tight font-display`}
          >
            {hasDollar
              ? <>You&rsquo;re losing <DollarLossAmount value={dollarLoss} /> per 1,000 visitors</>
              : "See your real dollar impact"}
          </h3>
          {hasDollar && (
            <div className="mt-0.5">
              <DollarLossTooltip size={16} variant="light" />
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

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onViewBreakdown}
        className={`relative z-10 group w-full ${full ? "py-3" : "py-2.5"} rounded-xl font-bold text-sm bg-white text-[var(--primary)] hover:bg-white/90 active:scale-[0.98]`}
      >
        Connect Your Store
        <ArrowRightIcon
          size={14}
          weight="bold"
          className="transition-transform group-hover:translate-x-0.5"
        />
      </Button>
    </div>
  );
});

export default PluginCTACard;
