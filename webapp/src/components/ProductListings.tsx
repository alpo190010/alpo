"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import {
  type FreeResult,
  type StoreAnalysisData,
  PRODUCT_LEVEL_DIMENSIONS,
  STORE_WIDE_DIMENSIONS,
  calculateConversionLoss,
  calculateDollarLossPerThousand,
} from "@/lib/analysis";
import { useProductAnalysis } from "@/hooks/useProductAnalysis";
import AnalysisPane, { type AnalysisPaneProps } from "@/components/AnalysisPane";
import AuthModal from "@/components/AuthModal";
import ProductGrid from "@/components/ProductGrid";
import StoreHealth from "@/components/StoreHealth";
import StoreHealthTab from "@/components/StoreHealthTab";
import StoreHealthDetail from "@/components/StoreHealthDetail";

type SidebarTab = "health" | "products";

/* ══════════════════════════════════════════════════════════════
   ProductListings — Split-view orchestrator
   Left 35 %: ProductGrid (scrollable product cards)
   Right 65%: AnalysisPane (welcome → loading → results lifecycle)
   ══════════════════════════════════════════════════════════════ */

interface Product {
  url: string;
  slug: string;
  image?: string;
}

interface ProductListingsProps {
  products: Product[];
  storeName: string;
  domain: string;
  initialSku?: string;
  initialAnalyses?: Map<string, FreeResult>;
  storeAnalysis?: StoreAnalysisData | null;
  onSkuChange?: (sku: string | null) => void;
  onRefreshStoreAnalysis?: () => void | Promise<void>;
  refreshingStoreAnalysis?: boolean;
  /** Called with updated StoreAnalysisData after a per-dimension re-analyze succeeds. */
  onStoreAnalysisUpdate?: (next: StoreAnalysisData) => void;
}

export default function ProductListings({
  products,
  storeName,
  domain,
  initialSku,
  initialAnalyses,
  storeAnalysis,
  onSkuChange,
  onRefreshStoreAnalysis,
  refreshingStoreAnalysis,
  onStoreAnalysisUpdate,
}: ProductListingsProps) {
  /* ── Refs ── */
  const rightPaneRef = useRef<HTMLDivElement>(null);

  /* ── Session + auth modal for gating Run Deep Analysis ── */
  const { status } = useSession();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  /* ── Sorted product order (images first) ── */
  const sortedIndices = useMemo(
    () =>
      products
        .map((p, i) => ({ i, hasImage: !!p.image }))
        .sort((a, b) => (a.hasImage ? 0 : 1) - (b.hasImage ? 0 : 1))
        .map((x) => x.i),
    [products],
  );

  /* ── Hook: all analysis state + handlers ── */
  const {
    selectedIndex,
    selectedProduct,
    selectedUrl,
    analyzingHandle,
    analysisResult,
    analysisError,
    analyzedResults,
    contentFading,
    leaks,
    handleSelectProduct,
    handleDeepAnalyze,
    handleRetryAnalysis,
  } = useProductAnalysis({
    products,
    initialSku,
    initialAnalyses,
    onSkuChange,
    rightPaneRef,
    sortedIndices,
  });

  /* ── Sidebar collapsed state ── */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  /* ── Sidebar tab (default "health" — store-wide dimensions open by default) ── */
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>("health");

  /* ── Selected store-wide dimension for the right-pane detail view.
     Defaults to the worst-scoring store dimension when storeAnalysis loads. ── */
  const [selectedDimension, setSelectedDimension] = useState<string | null>(null);

  useEffect(() => {
    if (!storeAnalysis) return;
    const cats = storeAnalysis.categories ?? {};
    const ranked = Array.from(STORE_WIDE_DIMENSIONS)
      .map((key) => ({
        key,
        score: (cats as Record<string, number>)[key],
      }))
      .filter((c) => Number.isFinite(c.score))
      .sort((a, b) => (a.score as number) - (b.score as number));
    if (ranked.length === 0) return;
    // Only auto-select if nothing chosen, or previous choice no longer valid.
    if (
      selectedDimension === null ||
      !ranked.find((r) => r.key === selectedDimension)
    ) {
      setSelectedDimension(ranked[0].key);
    }
  }, [storeAnalysis, selectedDimension]);

  /* ── Aggregated totals across analyzed products (for Hero revenue-loss column) ── */
  const productTotals = useMemo(() => {
    if (analyzedResults.size === 0) return null;
    let totalScore = 0;
    let totalConversionLoss = 0;
    let totalDollarLoss = 0;
    let dollarLossCount = 0;
    let count = 0;
    for (const result of analyzedResults.values()) {
      totalScore += result.score;
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

  /* ── Mobile viewport ── */
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  /* ── Mobile click → dedicated product page; desktop → in-page selection ── */
  const router = useRouter();
  const handleProductClick = useCallback(
    (index: number) => {
      if (isMobile) {
        const target = products[index];
        if (target) {
          router.push(
            `/scan/${encodeURIComponent(domain)}/product/${encodeURIComponent(target.slug)}`,
          );
        }
        return;
      }
      handleSelectProduct(index);
    },
    [isMobile, products, domain, router, handleSelectProduct],
  );

  /* ── Mobile click → dedicated dimension page; desktop → in-page selection ── */
  const handleDimensionClick = useCallback(
    (key: string) => {
      if (isMobile) {
        router.push(
          `/scan/${encodeURIComponent(domain)}/dimension/${encodeURIComponent(key)}`,
        );
        return;
      }
      setSelectedDimension(key);
    },
    [isMobile, domain, router],
  );

  /* ── Gate Run Deep Analysis behind free signup; sidebar collapse is user-controlled ── */
  const handleDeepAnalyzeGated = useCallback(() => {
    if (status !== "authenticated") {
      setAuthModalOpen(true);
      return;
    }
    handleDeepAnalyze();
  }, [status, handleDeepAnalyze]);

  /* ── Shared props for AnalysisPane (rendered in 2 locations) ── */
  const analysisPaneProps: AnalysisPaneProps = useMemo(
    () => ({
      selectedProduct,
      selectedIndex,
      domain,
      analyzingHandle,
      analysisResult,
      analysisError,
      selectedUrl,
      leaks,
      contentFading,
      onDeepAnalyze: handleDeepAnalyzeGated,
      onRetryAnalysis: handleRetryAnalysis,
      onIssueClick: () => {},
    }),
    [
      selectedProduct, selectedIndex, domain, analyzingHandle,
      analysisResult, analysisError, selectedUrl, leaks,
      contentFading,
      handleDeepAnalyzeGated, handleRetryAnalysis,
    ],
  );

  /* ══════════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col md:flex-row w-full h-full md:min-h-0 md:overflow-hidden">
      {/* ═══ LEFT COLUMN — Store Health (top) + Product Grid (below) ═══ */}
      <div
        className={`
          ${sidebarCollapsed
            ? "w-full md:w-[88px]"
            : "w-full md:w-[35%] md:max-w-[420px] md:min-w-[260px]"
          }
          flex flex-col
          md:h-full md:overflow-y-auto
          md:border-r border-[var(--border)]
          bg-[var(--surface)]
          transition-[width] duration-300 ease-[var(--ease-out-quart)]
        `}
      >
        {!sidebarCollapsed && (
          <div className="p-3 flex flex-col gap-3">
            {/* ── Hero card (store identity + health score + revenue loss) ── */}
            {storeAnalysis ? (
              <StoreHealth
                storeAnalysis={storeAnalysis}
                storeName={storeName}
                domain={domain}
                productTotals={productTotals}
                onRefresh={onRefreshStoreAnalysis}
                refreshing={refreshingStoreAnalysis}
              />
            ) : refreshingStoreAnalysis ? (
              <section
                className="rounded-2xl border px-[18px] py-4 flex items-center gap-3"
                style={{
                  background: "var(--paper)",
                  borderColor: "var(--rule-2)",
                  boxShadow: "var(--shadow-subtle)",
                }}
              >
                <span
                  className="w-4 h-4 rounded-full border-2 border-[var(--brand)] border-t-transparent shrink-0"
                  style={{ animation: "spin 0.8s linear infinite" }}
                  aria-hidden="true"
                />
                <p className="text-xs font-medium" style={{ color: "var(--ink-3)" }}>
                  Analyzing store health…
                </p>
              </section>
            ) : null}

            {/* ── Pill tabs (sidebar-level) ── */}
            <div
              role="tablist"
              className="relative flex p-[3px] rounded-full"
              style={{ background: "var(--bg-elev)" }}
            >
              <span
                aria-hidden="true"
                className="absolute top-[3px] bottom-[3px] rounded-full transition-transform duration-[250ms] ease-[var(--ease-out-quart)]"
                style={{
                  background: "var(--ink)",
                  boxShadow: "0 1px 3px rgba(22,19,14,.15)",
                  width: "calc(50% - 3px)",
                  transform: activeSidebarTab === "products" ? "translateX(100%)" : "translateX(0)",
                }}
              />
              <button
                type="button"
                role="tab"
                aria-selected={activeSidebarTab === "health"}
                onClick={() => setActiveSidebarTab("health")}
                className="relative z-10 flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40"
                style={{
                  color: activeSidebarTab === "health" ? "var(--paper)" : "var(--ink-3)",
                  letterSpacing: "-0.005em",
                }}
              >
                Store Health
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeSidebarTab === "products"}
                onClick={() => setActiveSidebarTab("products")}
                className="relative z-10 flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40"
                style={{
                  color: activeSidebarTab === "products" ? "var(--paper)" : "var(--ink-3)",
                  letterSpacing: "-0.005em",
                }}
              >
                Products
                <span
                  className="font-mono text-[10px] font-semibold tabular-nums"
                  style={{ opacity: 0.7 }}
                >
                  {productTotals?.analyzed ?? 0}/{products.length}
                </span>
              </button>
            </div>

            {/* ── Tab content ── */}
            {activeSidebarTab === "health" && storeAnalysis && (
              <StoreHealthTab
                storeAnalysis={storeAnalysis}
                selectedKey={selectedDimension}
                onSelect={handleDimensionClick}
              />
            )}
            {activeSidebarTab === "health" && !storeAnalysis && (
              <p
                className="text-xs text-center py-6"
                style={{ color: "var(--ink-3)" }}
              >
                {refreshingStoreAnalysis
                  ? "Running store-wide dimension scan…"
                  : "Store-wide scan unavailable."}
              </p>
            )}

            {activeSidebarTab === "products" && (
              <div className="flex flex-col gap-3">
                {/* Products header with integrated progress bar */}
                <div className="flex flex-col gap-2 px-1">
                  <div className="flex items-baseline justify-between gap-2.5">
                    <h2
                      className="font-display font-bold text-lg leading-tight"
                      style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}
                    >
                      Products
                    </h2>
                    {productTotals ? (
                      <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                        {productTotals.analyzed}/{products.length} scanned
                      </span>
                    ) : (
                      <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                        0/{products.length} scanned
                      </span>
                    )}
                  </div>
                  <div
                    className="h-[3px] rounded-full overflow-hidden"
                    style={{ background: "color-mix(in oklch, var(--ink) 8%, transparent)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${products.length > 0 ? ((productTotals?.analyzed ?? 0) / products.length) * 100 : 0}%`,
                        background: "var(--ink)",
                      }}
                    />
                  </div>
                </div>
                <ProductGrid
                  products={products}
                  sortedIndices={sortedIndices}
                  selectedIndex={selectedIndex}
                  analyzingHandle={analyzingHandle}
                  analyzedResults={analyzedResults}
                  storeName={storeName}
                  domain={domain}
                  onSelectProduct={handleProductClick}
                  collapsed={sidebarCollapsed}
                  onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
                />
              </div>
            )}
          </div>
        )}
        {sidebarCollapsed && (
          <ProductGrid
            products={products}
            sortedIndices={sortedIndices}
            selectedIndex={selectedIndex}
            analyzingHandle={analyzingHandle}
            analyzedResults={analyzedResults}
            storeName={storeName}
            domain={domain}
            onSelectProduct={handleProductClick}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          />
        )}
      </div>

      {/* ═══ RIGHT PANE — Analysis lifecycle ═══ */}
      <main
        ref={rightPaneRef}
        className="flex-1 overflow-y-auto md:h-full"
        aria-label="Analysis results"
      >
        {!isMobile &&
          (activeSidebarTab === "health" && storeAnalysis && selectedDimension ? (
            <StoreHealthDetail
              key={selectedDimension}
              dimensionKey={selectedDimension}
              storeAnalysis={storeAnalysis}
              domain={domain}
              onStoreAnalysisUpdate={onStoreAnalysisUpdate}
            />
          ) : selectedIndex === null && !analyzingHandle && !analysisResult && !analysisError ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] px-6 py-16 text-center">
              <div
                className="w-16 h-16 rounded-2xl bg-[var(--surface-container-low)] border border-[var(--border)] flex items-center justify-center mb-5"
                style={{ animation: "fade-in-up 500ms var(--ease-out-quart) both" }}
              >
                <MagnifyingGlassIcon size={28} weight="regular" color="var(--on-surface-variant)" />
              </div>
              <h2
                className="text-xl font-bold text-[var(--on-surface)] mb-2 font-display"
                style={{
                  animation: "fade-in-up 500ms var(--ease-out-quart) 80ms both",
                }}
              >
                Select a product to analyze
              </h2>
              <p
                className="text-sm text-[var(--on-surface-variant)] max-w-xs leading-relaxed"
                style={{ animation: "fade-in-up 500ms var(--ease-out-quart) 160ms both" }}
              >
                Pick any product from the list to get a deep conversion score,
                actionable analysis, and prioritized fixes.
              </p>
            </div>
          ) : (
            <AnalysisPane {...analysisPaneProps} />
          ))}
      </main>

      {/* ═══ AUTH GATE — Run Deep Analysis requires free signup ═══ */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode="signup"
        heading="Sign up to run Deep Analysis"
        subheading="It's free — create an account to unlock the full conversion score, revenue-leak estimate, and prioritized fixes for every product."
      />
    </div>
  );
}
