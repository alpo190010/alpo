"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { API_URL } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import {
  type FreeResult,
  buildLeaks,
  captureEvent,
  parseAnalysisResponse,
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
    setEmailStep,
    submitEmail,
    handleIssueClick,
    handleCloseModal,
    resetEmailState,
  } = useEmailModal({ selectedUrl, analysisResult });

  const leaks = analysisResult
    ? buildLeaks(analysisResult.categories, analysisResult.tips, analysisResult.dimensionTips)
    : [];

  /* ── Abort cleanup ── */
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
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

  /* ── Select product (preview, no analysis) ── */
  const handleSelectProduct = useCallback(
    (index: number) => {
      if (selectedIndex === index) return;
      const product = products[index];
      abortRef.current?.abort();
      setSelectedIndex(index);
      setAnalysisError("");
      setAnalyzingHandle(null);
      resetEmailState();
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
    [selectedIndex, products, onSkuChange, rightPaneRef, resetEmailState],
  );

  /* ── Fetch: Deep analysis ── */
  const handleDeepAnalyze = useCallback(async () => {
    if (selectedIndex === null) return;
    const product = products[selectedIndex];
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setContentFading(true);
    await new Promise((r) => setTimeout(r, 250));

    setAnalyzingHandle(product.slug);
    setAnalysisResult(null);
    setAnalysisError("");
    resetEmailState();
    setContentFading(false);

    rightPaneRef.current?.scrollTo({ top: 0, behavior: "smooth" });

    try {
      const res = await authFetch(`${API_URL}/analyze`, {
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
      const result = parseAnalysisResponse(data as Record<string, unknown>);

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
  }, [selectedIndex, products, onSkuChange, rightPaneRef, resetEmailState]);

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
    setEmailStep,
    submitEmail,
  };
}
