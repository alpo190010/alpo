"use client";

import { useMemo, memo } from "react";
import { PackageIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import DollarLossAmount from "@/components/analysis/DollarLossAmount";
import DollarLossTooltip from "@/components/analysis/DollarLossTooltip";
import { type FreeResult, scoreColorTintBg, scoreColorText, calculateConversionLoss, calculateDollarLossPerThousand, PRODUCT_LEVEL_DIMENSIONS } from "@/lib/analysis";

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

/* ── Store-wide dollar loss stat with shared tooltip ── */
function DollarLossStat({ avgDollarLoss, avgConversionLoss }: { avgDollarLoss: number; avgConversionLoss: number }) {
  return (
    <div
      className="flex-1 rounded-xl px-3 py-2.5 text-center relative"
      style={{ background: "var(--warning-light)" }}
    >
      {avgDollarLoss > 0 ? (
        <>
          <div className="flex items-center justify-center gap-1">
            <div
              className="text-xl font-extrabold leading-none font-display"
            >
              <DollarLossAmount value={avgDollarLoss} />
            </div>
            <DollarLossTooltip size={13} variant="muted" />
          </div>
          <div className="text-[10px] font-semibold mt-1 uppercase tracking-wide" style={{ color: "var(--warning-text)", opacity: 0.7 }}>
            Avg lost / 1k visitors
          </div>
          <div className="text-[9px] font-medium mt-0.5" style={{ color: "var(--warning-text)", opacity: 0.5 }}>
            ~{avgConversionLoss}% avg loss
          </div>
        </>
      ) : (
        <>
          <div
            className="text-xl font-extrabold leading-none font-display"
            style={{ color: "var(--warning-text)" }}
          >
            ~{avgConversionLoss}%
          </div>
          <div className="text-[10px] font-semibold mt-1 uppercase tracking-wide" style={{ color: "var(--warning-text)", opacity: 0.7 }}>
            Avg conversion loss
          </div>
        </>
      )}
    </div>
  );
}

/* ── Memoized product card — only re-renders when its own props change ── */
const ProductCard = memo(function ProductCard({
  product,
  index,
  isSelected,
  isAnalyzing,
  cachedResult,
  collapsed,
  onSelectProduct,
}: {
  product: Product;
  index: number;
  isSelected: boolean;
  isAnalyzing: boolean;
  cachedResult: FreeResult | undefined;
  collapsed: boolean;
  onSelectProduct: (index: number) => void;
}) {
  /* ── Collapsed: thumbnail-only buttons ── */
  if (collapsed) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="md"
        role="listitem"
        onClick={() => onSelectProduct(index)}
        className={`
          w-full flex items-center justify-center
          rounded-2xl transition-all duration-150 relative p-0 h-auto
          ${isSelected
            ? "ring-2 ring-[var(--brand)] ring-offset-2 ring-offset-[var(--surface)]"
            : "hover:ring-2 hover:ring-[var(--outline-variant)] hover:ring-offset-2 hover:ring-offset-[var(--surface)]"
          }
        `}
        aria-current={isSelected ? "true" : undefined}
        aria-label={product.slug.replace(/-/g, " ")}
        title={product.slug.replace(/-/g, " ")}
      >
        <div className="w-16 h-16 rounded-2xl bg-[var(--surface-container-highest)] overflow-hidden shrink-0 relative">
          {product.image && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={product.image}
              alt={product.slug.replace(/-/g, " ")}
              className="w-full h-full object-cover peer"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).classList.add("hidden");
              }}
            />
          )}
          <div className={`absolute inset-0 flex items-center justify-center ${product.image ? "hidden peer-[.hidden]:flex" : "flex"}`}>
            <PackageIcon size={24} weight="regular" color="var(--outline)" />
          </div>

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
              className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black border-2 border-[var(--surface)] font-display"
              style={{
                background: scoreColorTintBg(cachedResult.score),
                color: scoreColorText(cachedResult.score),
              }}
            >
              {cachedResult.score}
            </div>
          )}
        </div>
      </Button>
    );
  }

  /* ── Expanded: full card ── */
  return (
    <Button
      type="button"
      variant="ghost"
      size="md"
      role="listitem"
      onClick={() => onSelectProduct(index)}
      className={`cursor-pointer w-full text-left rounded-2xl transition-all duration-150 relative overflow-hidden border polish-focus-ring ${
        isSelected
          ? "border-[var(--brand)]"
          : "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] hover:border-[var(--surface-container-high)]"
      }`}
      style={isSelected ? { background: "var(--brand-light)" } : undefined}
      aria-current={isSelected ? "true" : undefined}
      aria-label={product.slug.replace(/-/g, " ")}
    >
      <div className="flex items-start gap-4 p-4">
        {/* Thumbnail with score overlay */}
        <div className="w-16 h-16 rounded-full bg-[var(--surface-container-highest)] overflow-hidden shrink-0 relative">
          {product.image && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={product.image}
              alt={product.slug.replace(/-/g, " ")}
              className="w-full h-full object-cover peer"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).classList.add("hidden");
              }}
            />
          )}
          <div className={`absolute inset-0 flex items-center justify-center ${product.image ? "hidden peer-[.hidden]:flex" : "flex"}`}>
            <PackageIcon size={24} weight="regular" color="var(--outline)" />
          </div>
          {cachedResult && !isAnalyzing && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: `color-mix(in oklch, ${scoreColorText(cachedResult.score)} 55%, transparent)` }}
            >
              <span
                className="text-white text-lg font-black font-display"
              >
                {cachedResult.score}
              </span>
            </div>
          )}
        </div>

        {/* Info column */}
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <p
            className="text-base font-bold text-[var(--on-surface)] truncate capitalize leading-snug font-display"
            title={product.slug.replace(/-/g, " ")}
          >
            {product.slug.replace(/-/g, " ")}
          </p>

          {isAnalyzing ? (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide w-fit font-display"
              style={{
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
          ) : cachedResult ? (
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase w-fit font-display"
              style={{
                background: scoreColorTintBg(cachedResult.score),
                color: scoreColorText(cachedResult.score),
              }}
            >
              {cachedResult.score >= 70 ? "Good" : cachedResult.score >= 40 ? "Needs work" : "Critical"} · {cachedResult.score}/100
            </span>
          ) : (
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide w-fit font-display"
              style={{
                background: "var(--surface-muted)",
                color: "var(--text-tertiary)",
              }}
            >
              Ready to scan
            </span>
          )}
        </div>
      </div>

      {/* Conversion loss strip — full width, only when analyzed */}
      {cachedResult && !isAnalyzing && (() => {
        let lossSum = 0;
        let dimCount = 0;
        for (const key of PRODUCT_LEVEL_DIMENSIONS) {
          const catScore = cachedResult.categories?.[key as keyof typeof cachedResult.categories];
          if (catScore != null) {
            lossSum += calculateConversionLoss(catScore as number, key);
            dimCount++;
          }
        }
        const avgLoss = dimCount > 0 ? Math.round((lossSum / dimCount) * 10) / 10 : 0;
        const dollarLoss = calculateDollarLossPerThousand(cachedResult.categories, cachedResult.productPrice, cachedResult.productCategory);
        return (
          <div
            className="px-4 py-2.5 flex items-center justify-between"
            style={{ background: "var(--gradient-error)" }}
          >
            <span className="text-white/70 text-[11px] font-semibold uppercase tracking-wide">Conversion loss</span>
            <span
              className="text-white text-base font-extrabold tracking-tight font-display"
            >
              {dollarLoss > 0
                ? <><DollarLossAmount value={dollarLoss} className="text-white" /> / 1k visitors</>
                : `~${avgLoss}% avg loss`
              }
            </span>
          </div>
        );
      })()}
    </Button>
  );
});

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
  /* ── Store-wide totals from analyzed products ── */
  const storeTotals = useMemo(() => {
    if (analyzedResults.size === 0) return null;
    let totalScore = 0;
    let totalConversionLoss = 0;
    let totalDollarLoss = 0;
    let dollarLossCount = 0;
    let count = 0;
    for (const result of analyzedResults.values()) {
      totalScore += result.score;
      // Per-product avg conversion loss across active dimensions
      let productLossSum = 0;
      let dimCount = 0;
      for (const key of PRODUCT_LEVEL_DIMENSIONS) {
        const catScore = result.categories?.[key as keyof typeof result.categories];
        if (catScore != null) {
          productLossSum += calculateConversionLoss(catScore as number, key);
          dimCount++;
        }
      }
      if (dimCount > 0) totalConversionLoss += productLossSum / dimCount;
      // Dollar loss per 1k visitors (only products with a valid price)
      const dloss = calculateDollarLossPerThousand(result.categories, result.productPrice, result.productCategory);
      if (dloss > 0) {
        totalDollarLoss += dloss;
        dollarLossCount++;
      }
      count++;
    }
    return {
      avgScore: Math.round(totalScore / count),
      avgConversionLoss: Math.round((totalConversionLoss / count) * 10) / 10,
      avgDollarLoss: dollarLossCount > 0 ? Math.round((totalDollarLoss / dollarLossCount) * 100) / 100 : 0,
      analyzed: count,
    };
  }, [analyzedResults]);
  return (
    <aside
      className={`
        ${collapsed
          ? "w-full md:w-[88px]"
          : "w-full md:w-[35%] md:max-w-[420px] md:min-w-[260px]"
        }
        md:h-[calc(100vh-72px)] md:sticky md:top-[72px]
        border-b md:border-b-0 md:border-r border-[var(--border)]
        bg-[var(--surface)] flex flex-col
        transition-[width] duration-300 ease-[var(--ease-out-quart)]
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
                  className="text-base font-bold text-[var(--on-surface)] truncate leading-tight font-display"
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            className="hidden md:flex w-8 h-8 rounded-xl shrink-0"
            aria-label={collapsed ? "Expand product list" : "Collapse product list"}
            title={collapsed ? "Expand product list" : "Collapse product list"}
          >
            <SidebarSimpleIcon
              size={18}
              weight="regular"
              color="var(--on-surface-variant)"
              style={{
                transform: collapsed ? "scaleX(-1)" : "none",
                transition: "transform 300ms var(--ease-out-quart)",
              }}
            />
          </Button>
        </div>

        {/* Store-wide totals — shown when at least 1 product analyzed */}
        {!collapsed && storeTotals && (
          <div className="px-5 pb-4">
            <div className="flex gap-3">
              <div
                className="flex-1 rounded-xl px-3 py-2.5 text-center"
                style={{ background: scoreColorTintBg(storeTotals.avgScore) }}
              >
                <div
                  className="text-xl font-extrabold leading-none font-display"
                  style={{ color: scoreColorText(storeTotals.avgScore) }}
                >
                  {storeTotals.avgScore}<span className="text-xs font-bold opacity-60">/100</span>
                </div>
                <div className="text-[10px] font-semibold mt-1 uppercase tracking-wide" style={{ color: scoreColorText(storeTotals.avgScore), opacity: 0.7 }}>
                  Avg score
                </div>
              </div>

              <DollarLossStat
                avgDollarLoss={storeTotals.avgDollarLoss}
                avgConversionLoss={storeTotals.avgConversionLoss}
              />

            </div>
            {storeTotals.analyzed < products.length && (
              <div className="mt-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-[var(--on-surface-variant)] uppercase tracking-wide">
                    {storeTotals.analyzed} of {products.length} scanned
                  </span>
                  <span className="text-[10px] font-bold text-[var(--on-surface-variant)]">
                    {Math.round((storeTotals.analyzed / products.length) * 100)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--surface-container-high)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(storeTotals.analyzed / products.length) * 100}%`,
                      background: "var(--gradient-error)",
                    }}
                  />
                </div>

              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Product list ── */}
      <div
        className={`flex-1 overflow-y-auto ${collapsed ? "p-2 space-y-2" : "p-3 space-y-2"}`}
        role="list"
        aria-label="Products"
      >
        {sortedIndices.map((i) => (
          <ProductCard
            key={products[i].url}
            product={products[i]}
            index={i}
            isSelected={selectedIndex === i}
            isAnalyzing={analyzingHandle === products[i].slug}
            cachedResult={analyzedResults.get(products[i].slug)}
            collapsed={collapsed}
            onSelectProduct={onSelectProduct}
          />
        ))}
      </div>
    </aside>
  );
}
