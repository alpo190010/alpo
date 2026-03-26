"use client";

import { PackageIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { type FreeResult, scoreColorTintBg, scoreColorText, calculateRevenueLoss } from "@/lib/analysis";

/* ══════════════════════════════════════════════════════════════
   ProductGrid — Collapsible product sidebar
   Expanded: full cards with thumbnail + name + status
   Collapsed: narrow rail with just thumbnails
   ══════════════════════════════════════════════════════════════ */

interface Product {
  url: string;
  slug: string;
  image?: string;
}

export interface ProductGridProps {
  products: Product[];
  sortedIndices: number[];
  selectedIndex: number | null;
  analyzingHandle: string | null;
  analyzedResults: Map<string, FreeResult>;
  storeName: string;
  domain: string;
  onSelectProduct: (index: number) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function ProductGrid({
  products,
  sortedIndices,
  selectedIndex,
  analyzingHandle,
  analyzedResults,
  storeName,
  domain,
  onSelectProduct,
  collapsed,
  onToggleCollapse,
}: ProductGridProps) {
  return (
    <aside
      className={`
        ${collapsed
          ? "w-full lg:w-[88px]"
          : "w-full lg:w-[35%] lg:max-w-[420px] lg:min-w-[280px]"
        }
        lg:h-[calc(100vh-72px)] lg:sticky lg:top-[72px]
        border-b lg:border-b-0 lg:border-r border-[var(--border)]
        bg-[var(--surface)] flex flex-col
        transition-[width] duration-300 ease-[var(--ease-out-quart,cubic-bezier(0.165,0.84,0.44,1))]
      `}
      aria-label="Product list"
    >
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className={`flex items-center ${collapsed ? "justify-center px-2 py-4" : "justify-between px-5 py-4"}`}>
          {/* Store info — hidden when collapsed */}
          {!collapsed && (
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-xl bg-[var(--brand-light)] border border-[var(--brand-border)] flex items-center justify-center shrink-0">
                <PackageIcon size={16} weight="regular" color="var(--brand)" />
              </div>
              <div className="min-w-0">
                <h2
                  className="text-base font-bold text-[var(--on-surface)] truncate leading-tight"
                  style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
                >
                  {storeName || domain}
                </h2>
                <p className="text-xs text-[var(--on-surface-variant)]">
                  {products.length} product{products.length !== 1 ? "s" : ""} found
                </p>
              </div>
            </div>
          )}

          {/* Collapse toggle — always visible on desktop */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[var(--surface-container)] active:scale-95 transition-all shrink-0 cursor-pointer"
            aria-label={collapsed ? "Expand product list" : "Collapse product list"}
            title={collapsed ? "Expand product list" : "Collapse product list"}
          >
            <SidebarSimpleIcon
              size={18}
              weight="regular"
              color="var(--on-surface-variant)"
              style={{
                transform: collapsed ? "scaleX(-1)" : "none",
                transition: "transform 300ms ease",
              }}
            />
          </button>
        </div>
      </div>

      {/* ── Product list ── */}
      <div
        className={`flex-1 overflow-y-auto ${collapsed ? "p-2 space-y-2" : "p-3 space-y-2"}`}
        role="list"
        aria-label="Products"
      >
        {sortedIndices.map((i) => {
          const product = products[i];
          const isSelected = selectedIndex === i;
          const isAnalyzing = analyzingHandle === product.slug;
          const cachedResult = analyzedResults.get(product.slug);

          /* ── Collapsed: thumbnail-only buttons ── */
          if (collapsed) {
            return (
              <button
                key={product.url}
                type="button"
                role="listitem"
                onClick={() => onSelectProduct(i)}
                className={`
                  cursor-pointer w-full flex items-center justify-center
                  rounded-2xl transition-all duration-150 relative
                  ${isSelected
                    ? "ring-2 ring-[var(--brand)] ring-offset-2 ring-offset-[var(--surface)]"
                    : "hover:ring-2 hover:ring-slate-300 hover:ring-offset-2 hover:ring-offset-[var(--surface)]"
                  }
                `}
                aria-current={isSelected ? "true" : undefined}
                aria-label={product.slug.replace(/-/g, " ")}
                title={product.slug.replace(/-/g, " ")}
              >
                <div className="w-16 h-16 rounded-2xl bg-slate-400 overflow-hidden shrink-0 relative">
                  {product.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={product.image}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <PackageIcon size={24} weight="regular" color="var(--outline)" />
                    </div>
                  )}

                  {/* Analyzing spinner overlay */}
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center rounded-2xl">
                      <span
                        className="w-5 h-5 rounded-full border-2 border-white border-t-transparent"
                        style={{ animation: "spin 0.8s linear infinite" }}
                      />
                    </div>
                  )}

                  {/* Score dot */}
                  {cachedResult && !isAnalyzing && (
                    <div
                      className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black border-2 border-[var(--surface)]"
                      style={{
                        background: scoreColorTintBg(cachedResult.score),
                        color: scoreColorText(cachedResult.score),
                        fontFamily: "var(--font-manrope), Manrope, sans-serif",
                      }}
                    >
                      {cachedResult.score}
                    </div>
                  )}
                </div>
              </button>
            );
          }

          /* ── Expanded: full card ── */
          return (
            <button
              key={product.url}
              type="button"
              role="listitem"
              onClick={() => onSelectProduct(i)}
              className={`cursor-pointer w-full text-left p-4 rounded-2xl transition-all duration-150 relative border-2 ${
                isSelected
                  ? "border-[var(--brand)]"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
              style={isSelected ? { background: "var(--brand-light)" } : undefined}
              aria-current={isSelected ? "true" : undefined}
            >
              <div className="flex items-start gap-4">
                {/* Thumbnail */}
                <div className="w-16 h-16 rounded-full bg-slate-400 overflow-hidden shrink-0">
                  {product.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={product.image}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <PackageIcon size={24} weight="regular" color="var(--outline)" />
                    </div>
                  )}
                </div>

                {/* Info column */}
                <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                  <p
                    className="text-base font-bold text-slate-900 truncate capitalize leading-snug"
                    style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
                  >
                    {product.slug.replace(/-/g, " ")}
                  </p>

                  {/* Status badge */}
                  <div className="flex flex-col gap-1.5">
                    {isAnalyzing ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0"
                          style={{
                            fontFamily: "var(--font-manrope), Manrope, sans-serif",
                            background: "var(--surface-brand-subtle)",
                            color: "var(--brand)",
                          }}
                        >
                          <span
                            className="w-3 h-3 rounded-full border-[1.5px] border-[var(--brand)] border-t-transparent inline-block"
                            style={{ animation: "spin 0.8s linear infinite" }}
                          />
                          Scanning
                        </span>
                      </div>
                    ) : cachedResult ? (() => {
                      const { lossLow, lossHigh } = calculateRevenueLoss(
                        cachedResult.score,
                        cachedResult.productPrice,
                        cachedResult.estimatedMonthlyVisitors,
                        cachedResult.productCategory,
                      );
                      return (
                        <>
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0"
                              style={{
                                fontFamily: "var(--font-manrope), Manrope, sans-serif",
                                background: scoreColorTintBg(cachedResult.score),
                                color: scoreColorText(cachedResult.score),
                              }}
                            >
                              Score {cachedResult.score}/100
                            </span>
                          </div>
                          <div
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                            style={{ background: "var(--error-light)" }}
                          >
                            <span
                              className="text-sm font-extrabold text-[var(--error)]"
                              style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
                            >
                              -${lossLow}–${lossHigh}
                            </span>
                            <span className="text-[10px] font-semibold text-[var(--error)] opacity-70">/mo lost</span>
                          </div>
                        </>
                      );
                    })() : (
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0"
                          style={{
                            fontFamily: "var(--font-manrope), Manrope, sans-serif",
                            background: "var(--surface-muted)",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          Ready to scan
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
