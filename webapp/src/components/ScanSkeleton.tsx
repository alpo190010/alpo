"use client";

import { useEffect, useState, type CSSProperties } from "react";

/* ══════════════════════════════════════════════════════════════
   ScanSkeleton — placeholder layout shown during the store
   discovery phase on /scan/[domain].
   Mirrors the ProductListings split-view so the skeleton and the
   final UI share the same geometry (no layout shift on swap).
   A top status banner tells the user what's running (product
   discovery → store-wide analysis).

   The four building blocks are exported individually so the
   rescan flow in ProductListings can compose them in place
   without rebuilding the page-level layout.
   ══════════════════════════════════════════════════════════════ */

interface ScanSkeletonProps {
  domain: string;
  takingLong: boolean;
}

const pulse: CSSProperties = {
  background:
    "linear-gradient(90deg, var(--bg-elev) 0%, var(--paper) 50%, var(--bg-elev) 100%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.4s ease-in-out infinite",
};

function Block({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ ...pulse, ...style }}
    />
  );
}

export type ScanStatusBannerMode = "discovering" | "rescanning";

export function ScanStatusBanner({
  domain,
  takingLong,
  mode = "discovering",
}: {
  domain: string;
  takingLong: boolean;
  mode?: ScanStatusBannerMode;
}) {
  // Two-stage progressive sub-message during initial discovery
  // (Stage 0: 0–4s fetching products, Stage 1: 4s+ analyzing dimensions).
  // Rescan stays single-stage since product discovery isn't repeated.
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (mode !== "discovering") return;
    const t = setTimeout(() => setStage(1), 4_000);
    return () => clearTimeout(t);
  }, [mode]);

  const title =
    mode === "rescanning" ? `Re-scanning ${domain}` : `Scanning ${domain}`;

  const subMessage =
    mode === "rescanning"
      ? "Refreshing store-wide analysis…"
      : stage === 0
        ? "Finding products and reading pages…"
        : "Analyzing store-wide conversion dimensions…";

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3.5 px-5 md:px-8 py-4 border-b"
      style={{
        background: "var(--paper)",
        borderColor: "var(--rule-2)",
        boxShadow: "var(--shadow-subtle)",
      }}
    >
      {/* Spinner */}
      <div className="relative shrink-0" style={{ width: 28, height: 28 }}>
        <div
          className="absolute inset-0 rounded-full border-2"
          style={{
            borderColor: "color-mix(in oklch, var(--ink) 12%, transparent)",
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent"
          style={{
            borderTopColor: "var(--accent)",
            animation: "spin 0.9s linear infinite",
          }}
          aria-hidden="true"
        />
      </div>

      {/* Text block */}
      <div className="flex flex-col min-w-0 flex-1">
        <p
          className="font-display font-bold text-[15px] md:text-base leading-tight truncate"
          style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}
        >
          {title}
        </p>
        <p
          className="text-xs md:text-[13px] mt-0.5 transition-opacity duration-300"
          style={{ color: "var(--ink-3)" }}
          key={`${mode}-${stage}`}
        >
          {subMessage}
          {takingLong && (
            <span className="ml-1.5" style={{ color: "var(--ink-3)" }}>
              · taking longer than usual, hang tight
            </span>
          )}
        </p>
      </div>

    </div>
  );
}

export function HeroCardSkeleton() {
  return (
    <section
      className="rounded-2xl border p-[18px] flex flex-col gap-4"
      style={{
        background: "var(--paper)",
        borderColor: "var(--rule-2)",
        boxShadow: "var(--shadow-subtle)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <Block className="h-3 w-24 rounded" />
          <Block className="h-5 w-40 max-w-full rounded" />
        </div>
        <Block
          className="shrink-0 rounded-full"
          style={{ width: 56, height: 56 }}
        />
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <Block className="h-[60px] rounded-xl" />
        <Block className="h-[60px] rounded-xl" />
        <Block className="h-[60px] rounded-xl" />
      </div>
    </section>
  );
}

export function DimensionListSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[14px] border p-[12px_14px] flex items-center gap-3"
          style={{
            background: "var(--paper)",
            borderColor: "var(--rule-2)",
            boxShadow: "var(--shadow-subtle)",
          }}
        >
          <Block
            className="shrink-0 rounded-lg"
            style={{ width: 36, height: 36 }}
          />
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <Block className="h-3 w-28 rounded" />
            <Block className="h-2.5 w-full max-w-[180px] rounded" />
          </div>
          <Block
            className="shrink-0 rounded-full"
            style={{ width: 40, height: 22 }}
          />
        </div>
      ))}
    </div>
  );
}

export function StoreHealthDetailSkeleton() {
  return (
    <div className="p-6 md:p-8 flex flex-col gap-5 max-w-[960px]">
      {/* Header row: breadcrumb + title + score chip */}
      <div className="flex flex-col gap-3">
        <Block className="h-3 w-32 rounded" />
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <Block className="h-7 w-2/3 rounded" />
            <Block className="h-4 w-1/2 rounded" />
          </div>
          <Block
            className="shrink-0 rounded-full"
            style={{ width: 72, height: 32 }}
          />
        </div>
      </div>

      {/* 3-column metric strip (mirrors StoreHealthDetail FixSkeleton) */}
      <div className="grid grid-cols-3 gap-2.5">
        <Block className="rounded-xl" style={{ height: 72 }} />
        <Block className="rounded-xl" style={{ height: 72 }} />
        <Block className="rounded-xl" style={{ height: 72 }} />
      </div>

      {/* Section heading placeholder */}
      <Block className="h-4 w-40 rounded mt-2" />

      {/* Issue list rows */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Block key={i} className="rounded-xl" style={{ height: 56 }} />
        ))}
      </div>
    </div>
  );
}

export default function ScanSkeleton({ domain, takingLong }: ScanSkeletonProps) {
  return (
    <div
      className="flex flex-col w-full h-full md:min-h-0 md:overflow-hidden"
      data-testid="scan-skeleton"
      data-domain={domain}
    >
      <ScanStatusBanner domain={domain} takingLong={takingLong} mode="discovering" />

      <div className="flex flex-col md:flex-row flex-1 min-h-0 md:overflow-hidden">
        {/* ═══ LEFT SIDEBAR ═══ */}
        <div
          className="w-full md:w-[35%] md:max-w-[420px] md:min-w-[260px] flex flex-col md:h-full md:overflow-y-auto md:border-r border-[var(--border)] bg-[var(--surface)]"
        >
          <div className="p-3 flex flex-col gap-3">
            <HeroCardSkeleton />

            {/* Pill tabs placeholder */}
            <Block className="h-9 rounded-full" />

            <DimensionListSkeleton />
          </div>
        </div>

        {/* ═══ RIGHT PANE — StoreHealthDetail placeholder ═══ */}
        <main
          className="flex-1 overflow-y-auto md:h-full"
          aria-label="Loading analysis"
        >
          <StoreHealthDetailSkeleton />
        </main>
      </div>
    </div>
  );
}
