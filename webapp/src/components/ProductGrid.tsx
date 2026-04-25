"use client";

import Link from "next/link";
import { memo } from "react";
import {
  ArrowRightIcon,
  CaretLeftIcon,
  CaretRightIcon,
  LockKeyIcon,
  PackageIcon,
  SidebarSimpleIcon,
} from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { type FreeResult, scoreColorTintBg, scoreColorText } from "@/lib/analysis";

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
  /* ── Pagination ── */
  currentPage?: number;
  totalPages?: number | null;
  productCount?: number | null;
  canPaginate?: boolean;
  paginationLoading?: boolean;
  onPageChange?: (page: number) => void;
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
      className={`cursor-pointer w-full text-left rounded-2xl transition-all duration-150 relative overflow-hidden border polish-focus-ring flex flex-col items-stretch justify-start !p-0 h-auto ${
        isSelected
          ? "border-[var(--brand)]"
          : "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] hover:border-[var(--surface-container-high)]"
      }`}
      style={isSelected ? { background: "var(--brand-light)" } : undefined}
      aria-current={isSelected ? "true" : undefined}
      aria-label={product.slug.replace(/-/g, " ")}
    >
      <div className="flex items-start gap-4 p-4 w-full">
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
            className="text-base font-bold text-[var(--on-surface)] line-clamp-2 break-words capitalize leading-snug font-display"
            title={product.slug.replace(/-/g, " ")}
          >
            {product.slug.replace(/-/g, " ")}
          </p>

          {isAnalyzing ? (
            <Badge variant="scanning" className="w-fit" />
          ) : cachedResult ? (
            <Badge
              variant={
                cachedResult.score >= 70
                  ? "ok"
                  : cachedResult.score >= 40
                    ? "warn"
                    : "err"
              }
              className="w-fit"
            >
              {cachedResult.score >= 70
                ? "Good"
                : cachedResult.score >= 40
                  ? "Needs work"
                  : "Critical"}{" "}
              · {cachedResult.score}/100
            </Badge>
          ) : (
            <Badge variant="muted" className="w-fit">
              Ready to scan
            </Badge>
          )}
        </div>
      </div>
    </Button>
  );
});

export default function ProductGrid({
  products,
  sortedIndices,
  selectedIndex,
  analyzingHandle,
  analyzedResults,
  onSelectProduct,
  collapsed,
  onToggleCollapse,
  currentPage = 1,
  totalPages = null,
  productCount = null,
  canPaginate = false,
  paginationLoading = false,
  onPageChange,
}: ProductGridProps) {
  const showPagination =
    !collapsed && totalPages !== null && totalPages > 1 && !!onPageChange;

  return (
    <aside
      className="flex-1 min-h-0 flex flex-col"
      aria-label="Product list"
    >
      {/* Collapse toggle — only visible when the sidebar is collapsed to the 88px rail */}
      {collapsed && (
        <div className="flex items-center justify-center py-3 border-b border-[var(--border)]">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            className="hidden md:flex w-8 h-8 rounded-xl shrink-0"
            aria-label="Expand product list"
            title="Expand product list"
          >
            <SidebarSimpleIcon
              size={18}
              weight="regular"
              color="var(--on-surface-variant)"
              style={{
                transform: "scaleX(-1)",
                transition: "transform 300ms var(--ease-out-quart)",
              }}
            />
          </Button>
        </div>
      )}

      {/* ── Product list ── */}
      <div
        className={`flex-1 ${collapsed ? "p-2 space-y-2" : "space-y-2"} ${
          paginationLoading ? "opacity-60 pointer-events-none" : ""
        }`}
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

      {/* ── Pagination footer ── */}
      {showPagination && (
        <ProductPaginationFooter
          currentPage={currentPage}
          totalPages={totalPages}
          productCount={productCount}
          canPaginate={canPaginate}
          loading={paginationLoading}
          onPageChange={onPageChange}
        />
      )}
    </aside>
  );
}

/* ── Pagination footer + locked upgrade CTA ─────────────────── */
function ProductPaginationFooter({
  currentPage,
  totalPages,
  productCount,
  canPaginate,
  loading,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  productCount: number | null;
  canPaginate: boolean;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const atFirst = currentPage <= 1;
  const atLast = currentPage >= totalPages;
  const prevDisabled = loading || atFirst || !canPaginate;
  const nextDisabled = loading || atLast || !canPaginate;

  return (
    <div className="border-t border-[var(--border)] pt-3 mt-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={prevDisabled}
          aria-label="Previous page"
          className="!px-2"
        >
          {loading && !atFirst ? (
            <span
              className="w-4 h-4 rounded-full border-2 border-[var(--ink-3)] border-t-transparent"
              style={{ animation: "spin 0.8s linear infinite" }}
              aria-hidden
            />
          ) : (
            <CaretLeftIcon size={16} weight="bold" />
          )}
          <span className="ml-1">Prev</span>
        </Button>

        <span
          className="text-[12.5px] font-medium font-display"
          style={{ color: "var(--ink-2)" }}
          aria-live="polite"
        >
          Page {currentPage} of {totalPages}
        </span>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={nextDisabled}
          aria-label="Next page"
          className="!px-2"
        >
          <span className="mr-1">Next</span>
          {loading && !atLast ? (
            <span
              className="w-4 h-4 rounded-full border-2 border-[var(--ink-3)] border-t-transparent"
              style={{ animation: "spin 0.8s linear infinite" }}
              aria-hidden
            />
          ) : (
            <CaretRightIcon size={16} weight="bold" />
          )}
        </Button>
      </div>

      {!canPaginate && (
        <Link
          href="/pricing"
          aria-label="Upgrade your plan to browse all products"
          className="group rounded-[14px] border px-4 py-3 flex items-center gap-3 transition-[background,border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-quart)] hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]/30"
          style={{
            background: "var(--paper)",
            borderColor: "var(--rule-2)",
            boxShadow: "var(--shadow-subtle)",
          }}
        >
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "var(--bg-elev)",
              color: "var(--ink-2)",
            }}
          >
            <LockKeyIcon size={16} weight="bold" />
          </span>
          <div className="flex-1 min-w-0">
            <div
              className="font-display font-bold text-[13.5px] leading-tight"
              style={{ color: "var(--ink)" }}
            >
              Unlock the full catalog
            </div>
            <p
              className="text-[12px] leading-[1.5] mt-0.5"
              style={{ color: "var(--ink-3)" }}
            >
              {productCount !== null
                ? `Browse all ${productCount} products on a paid plan.`
                : "Browse the full catalog on a paid plan."}
            </p>
          </div>
          <span
            className="shrink-0 inline-flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1 rounded-full transition-transform duration-150 group-hover:translate-x-0.5"
            style={{
              background: "var(--ink)",
              color: "var(--paper)",
            }}
            aria-hidden="true"
          >
            Upgrade
            <ArrowRightIcon size={12} weight="bold" />
          </span>
        </Link>
      )}
    </div>
  );
}
