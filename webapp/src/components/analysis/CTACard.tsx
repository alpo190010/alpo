"use client";

import { PlusSquareIcon, CaretRightIcon } from "@phosphor-icons/react";

interface CTACardProps {
  leaksCount: number;
  animationDelay: number;
  onClick: () => void;
  variant?: "compact" | "full";
  /** Override the card heading (e.g. "Unlock Full Report" for shallow mode) */
  label?: string;
  /** Override the button text (e.g. "Upgrade Now" for shallow mode) */
  buttonLabel?: string;
}

export default function CTACard({
  leaksCount,
  animationDelay,
  onClick,
  variant = "compact",
  label,
  buttonLabel,
}: CTACardProps) {
  const full = variant === "full";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer group relative w-full rounded-[1.5rem] ${full ? "p-7 min-h-[280px]" : "p-6 min-h-[240px]"} flex flex-col items-center justify-center text-center overflow-hidden text-white`}
      style={{
        background: full
          ? "var(--gradient-dark-cta)"
          : "linear-gradient(135deg, var(--on-surface) 0%, var(--primary-dim) 100%)",
        animation: `fade-in-up 400ms ease-out ${animationDelay}ms both`,
      }}
    >
      {/* Subtle grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(var(--brand) 1px, transparent 1px), linear-gradient(90deg, var(--brand) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className={`relative z-10 ${full ? "space-y-4" : "space-y-3"}`}>
        <div className={`${full ? "w-14 h-14" : "w-12 h-12"} mx-auto rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10`}>
          <PlusSquareIcon size={full ? 24 : 22} weight="regular" color="white" />
        </div>
        <h3
          className={`${full ? "text-xl sm:text-2xl" : "text-lg sm:text-xl"} font-extrabold font-display`}
        >
          {label ?? "Get All Fixes"}
        </h3>
        <p className="text-white/60 text-sm max-w-[200px] mx-auto leading-relaxed">
          Step-by-step recommendations for all {leaksCount} issues{!full && ", sent to your inbox"}.
        </p>
        <span className={`inline-flex items-center gap-1.5 ${full ? "px-6 py-2.5" : "px-5 py-2"} bg-white text-[var(--on-surface)] rounded-full font-bold text-sm group-hover:scale-[1.02] transition-transform`}>
          {buttonLabel ?? "Get Free Report"}
          <CaretRightIcon className="w-4 h-4" weight="bold" />
        </span>
      </div>
    </button>
  );
}
