"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  type FreeResult,
  type CompetitorResult,
  type CategoryScores,
  type LeakCard,
  buildLeaks,
  calculateRevenueLoss,
  captureEvent,
} from "@/lib/analysis";
import { useEmailModal } from "@/hooks/useEmailModal";

/* ══════════════════════════════════════════════════════════════
   useProductAnalysis — state + fetch logic for product analysis
   Email / modal state delegated to useEmailModal.
   ══════════════════════════════════════════════════════════════ */

interface Product {
  url: string;
  slug: string;
  image?: string;
}

interface UseProductAnalysisArgs {
  products: Product[];
  initialSku?: string;
  initialAnalyses?: Map<string, FreeResult>;
  onSkuChange?: (sku: string | null) => void;
  rightPaneRef: React.RefObject<HTMLDivElement | null>;
  sortedIndices: number[];
}

export function useProductAnalysis({
  products,
  initialSku,
  initialAnalyses,
  onSkuChange,
  rightPaneRef,
  sortedIndices,
}: UseProductAnalysisArgs) {
  /* ── Selection + analysis state ── */
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [analyzingHandle, setAnalyzingHandle] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<FreeResult | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  /* ── Per-product result cache ── */
  const [analyzedResults, setAnalyzedResults] = useState<Map<string, FreeResult>>(
    () => initialAnalyses ?? new Map(),
  );
  const analyzedResultsRef = useRef<Map<string, FreeResult>>(analyzedResults);
  analyzedResultsRef.current = analyzedResults;

  /* ── Content transition ── */
  const [contentFading, setContentFading] = useState(false);

  /* ── Competitor state ── */
  const [competitorLoading, setCompetitorLoading] = useState(false);
  const [competitorResult, setCompetitorResult] = useState<CompetitorResult | null>(null);
  const [competitorError, setCompetitorError] = useState("");
  const competitorAbortRef = useRef<AbortController | null>(null);

  /* ── Derived data ── */
  const selectedProduct = selectedIndex !== null ? products[selectedIndex] : null;
  const selectedUrl = selectedProduct?.url ?? "";

  /* ── Email / modal state (delegated) ── */
  const {
    email,
    emailSubmitting,
    emailError,
    selectedLeak,
    competitorCTAName,
    emailStep,
    setEmail,
    submitEmail,
    handleIssueClick,
    handleCloseModal,
    resetEmailState,
  } = useEmailModal({ selectedUrl, analysisResult });

  const { lossLow, lossHigh } = analysisResult
    ? calculateRevenueLoss(
        analysisResult.score,
        analysisResult.productPrice,
        analysisResult.estimatedMonthlyVisitors,
        analysisResult.productCategory,
      )
    : { lossLow: 0, lossHigh: 0 };

  const leaks = analysisResult
    ? buildLeaks(analysisResult.categories, analysisResult.tips, lossLow, lossHigh)
    : [];

  /* ── Abort cleanup ── */
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      competitorAbortRef.current?.abort();
    };
  }, []);

  /* ── Pre-select product matching initialSku ── */
  useEffect(() => {
    if (products.length === 0 || sortedIndices.length === 0) return;
    if (initialSku) {
      const matchIndex = products.findIndex((p) => p.slug === initialSku);
      if (matchIndex === -1) return;
      setSelectedIndex(matchIndex);
      const cached = analyzedResultsRef.current.get(initialSku);
      if (cached) {
        setAnalysisResult(cached);
        setAnalyzingHandle(null);
        setAnalysisError("");
      }
    } else if (selectedIndex === null) {
      const firstSortedIndex = sortedIndices[0];
      setSelectedIndex(firstSortedIndex);
      onSkuChange?.(products[firstSortedIndex].slug);
    }
  }, [products, initialSku, sortedIndices]);

  /* ── Fetch: Competitor analysis ── */
  const fetchCompetitors = useCallback(async (url: string) => {
    competitorAbortRef.current?.abort();
    const controller = new AbortController();
    competitorAbortRef.current = controller;
    setCompetitorLoading(true);
    setCompetitorError("");
    setCompetitorResult(null);
    captureEvent("competitor_analysis_triggered", { url });
    try {
      const res = await fetch("/api/analyze-competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Competitor analysis failed (${res.status})`);
      }
      const data = await res.json();
      const validCompetitors = (data.competitors ?? []).filter(
        (c: { score: number; categories?: Record<string, number> }) => {
          if (c.score <= 0) return false;
          const cats = c.categories || {};
          return Object.values(cats).reduce((a: number, b: number) => a + b, 0) > 0;
        },
      );
      setCompetitorResult({ competitors: validCompetitors });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setCompetitorError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setCompetitorLoading(false);
    }
  }, []);

  /* ── Select product (preview, no analysis) ── */
  const handleSelectProduct = useCallback(
    (index: number) => {
      if (selectedIndex === index) return;
      const product = products[index];
      abortRef.current?.abort();
      competitorAbortRef.current?.abort();
      setSelectedIndex(index);
      setAnalysisError("");
      setAnalyzingHandle(null);
      resetEmailState();
      setCompetitorLoading(false);
      setCompetitorResult(null);
      setCompetitorError("");
      const cached = analyzedResultsRef.current.get(product.slug);
      if (cached) {
        setAnalysisResult(cached);
        onSkuChange?.(product.slug);
      } else {
        setAnalysisResult(null);
      }
      rightPaneRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      onSkuChange?.(product.slug);
    },
    [selectedIndex, products, fetchCompetitors, onSkuChange, rightPaneRef, resetEmailState],
  );

  /* ── Fetch: Deep analysis ── */
  const handleDeepAnalyze = useCallback(async () => {
    if (selectedIndex === null) return;
    const product = products[selectedIndex];
    abortRef.current?.abort();
    competitorAbortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setContentFading(true);
    await new Promise((r) => setTimeout(r, 250));

    setAnalyzingHandle(product.slug);
    setAnalysisResult(null);
    setAnalysisError("");
    setCompetitorLoading(false);
    setCompetitorResult(null);
    setCompetitorError("");
    resetEmailState();
    setContentFading(false);

    rightPaneRef.current?.scrollTo({ top: 0, behavior: "smooth" });

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: product.url }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Analysis failed (${res.status})`);
      }
      const data = await res.json();

      const sc = (k: string) => Number(data.categories?.[k]) || 0;
      const safeCategories: CategoryScores = {
        pageSpeed: sc("pageSpeed"), images: sc("images"), socialProof: sc("socialProof"),
        checkout: sc("checkout"), mobileCta: sc("mobileCta"), title: sc("title"),
        aiDiscoverability: sc("aiDiscoverability"), structuredData: sc("structuredData"),
        pricing: sc("pricing"), description: sc("description"), shipping: sc("shipping"),
        crossSell: sc("crossSell"), cartRecovery: sc("cartRecovery"), trust: sc("trust"),
        merchantFeed: sc("merchantFeed"), socialCommerce: sc("socialCommerce"),
        sizeGuide: sc("sizeGuide"), variantUx: sc("variantUx"),
        accessibility: sc("accessibility"), contentFreshness: sc("contentFreshness"),
      };

      const result: FreeResult = {
        score: Math.min(100, Math.max(0, Number(data.score) || 0)),
        summary: String(data.summary || "Analysis complete."),
        tips: Array.isArray(data.tips) ? data.tips.map(String).slice(0, 7) : [],
        categories: safeCategories,
        productPrice: Number(data.productPrice) || 0,
        productCategory: String(data.productCategory || "other"),
        estimatedMonthlyVisitors: Number(data.estimatedMonthlyVisitors) || 1000,
      };

      setAnalysisResult(result);
      setAnalyzingHandle(null);
      setAnalyzedResults((prev) => new Map(prev).set(product.slug, result));
      onSkuChange?.(product.slug);
      captureEvent("scan_completed", { url: product.url, score: result.score });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setAnalysisError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setAnalyzingHandle(null);
    }
  }, [selectedIndex, products, fetchCompetitors, onSkuChange, rightPaneRef, resetEmailState]);

  const handleRetryAnalysis = useCallback(() => {
    if (selectedProduct && selectedIndex !== null) {
      setAnalysisError("");
      handleDeepAnalyze();
    }
  }, [selectedProduct, selectedIndex, handleDeepAnalyze]);

  return {
    selectedIndex,
    selectedProduct,
    selectedUrl,
    analyzingHandle,
    analysisResult,
    analysisError,
    analyzedResults,
    contentFading,
    leaks,
    lossLow,
    lossHigh,
    email,
    emailStep,
    emailSubmitting,
    emailError,
    selectedLeak,
    competitorCTAName,
    handleSelectProduct,
    handleDeepAnalyze,
    handleRetryAnalysis,
    handleIssueClick,
    handleCloseModal,
    setEmail,
    submitEmail,
  };
}
