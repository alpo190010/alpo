"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { type FreeResult, type StoreAnalysisData } from "@/lib/analysis";
import { useProductAnalysis } from "@/hooks/useProductAnalysis";
import AnalysisPane, { type AnalysisPaneProps } from "@/components/AnalysisPane";
import AuthModal from "@/components/AuthModal";
import ProductGrid from "@/components/ProductGrid";
import StoreHealth from "@/components/StoreHealth";
import BottomSheet from "@/components/BottomSheet";

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
}

export default function ProductListings({
  products,
  storeName,
  domain,
  initialSku,
  initialAnalyses,
  storeAnalysis,
  onSkuChange,
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

  /* ── Mobile viewport ── */
  const [isMobile, setIsMobile] = useState(false);
  const [bottomSheetDismissed, setBottomSheetDismissed] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (selectedIndex !== null || analyzingHandle) setBottomSheetDismissed(false);
  }, [selectedIndex, analyzingHandle]);

  const sheetOpen =
    isMobile &&
    !bottomSheetDismissed &&
    (!!selectedProduct || !!analyzingHandle || !!analysisResult || !!analysisError);

  /* ── Gate Run Deep Analysis behind free signup; otherwise collapse + run ── */
  const handleDeepAnalyzeAndCollapse = useCallback(() => {
    if (status !== "authenticated") {
      setAuthModalOpen(true);
      return;
    }
    setSidebarCollapsed(true);
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
      onDeepAnalyze: handleDeepAnalyzeAndCollapse,
      onRetryAnalysis: handleRetryAnalysis,
      onIssueClick: () => {},
    }),
    [
      selectedProduct, selectedIndex, domain, analyzingHandle,
      analysisResult, analysisError, selectedUrl, leaks,
      contentFading,
      handleDeepAnalyzeAndCollapse, handleRetryAnalysis,
    ],
  );

  /* ══════════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col md:flex-row w-full min-h-[calc(100dvh-80px)] md:min-h-0 md:h-[calc(100dvh-1rem)] md:overflow-hidden">
      {/* ═══ LEFT PANE — Store Health + Product Grid ═══ */}
      {storeAnalysis && <StoreHealth storeAnalysis={storeAnalysis} />}
      <ProductGrid
        products={products}
        sortedIndices={sortedIndices}
        selectedIndex={selectedIndex}
        analyzingHandle={analyzingHandle}
        analyzedResults={analyzedResults}
        storeName={storeName}
        domain={domain}
        onSelectProduct={handleSelectProduct}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />

      {/* ═══ RIGHT PANE — Analysis lifecycle ═══ */}
      <main
        ref={rightPaneRef}
        className="flex-1 overflow-y-auto md:h-[calc(100dvh-1rem)] md:sticky md:top-0"
        aria-label="Analysis results"
      >
        {!isMobile && selectedIndex === null && !analyzingHandle && !analysisResult && !analysisError && (
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
        )}

        {!isMobile && <AnalysisPane {...analysisPaneProps} />}
      </main>

      {/* ═══ MOBILE BOTTOM SHEET ═══ */}
      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setBottomSheetDismissed(true)}
        title={analysisResult ? "Analysis Results" : selectedProduct ? selectedProduct.slug.replace(/-/g, " ") : "Product Details"}
      >
        <AnalysisPane {...analysisPaneProps} />
      </BottomSheet>

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
