"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { API_URL } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { getUserFriendlyError } from "@/lib/errors";
import {
  type FreeResult,
  buildLeaks,
  captureEvent,
  parseAnalysisResponse,
} from "@/lib/analysis";

/* ══════════════════════════════════════════════════════════════
   useSingleProductAnalysis — analysis lifecycle for ONE product

   Lighter-weight sibling of useProductAnalysis used by the
   /scan/[domain]/product/[slug] route. The list-orchestration
   hook needs products[], sortedIndices, rightPaneRef, and writes
   ?sku= to the URL — none of which apply on a single-product page.
   ══════════════════════════════════════════════════════════════ */

interface Product {
  url: string;
  slug: string;
  image?: string;
}

interface UseSingleProductAnalysisArgs {
  product: Product;
  initialResult: FreeResult | null;
}

export function useSingleProductAnalysis({
  product,
  initialResult,
}: UseSingleProductAnalysisArgs) {
  const [analyzingHandle, setAnalyzingHandle] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<FreeResult | null>(
    initialResult,
  );
  const [analysisError, setAnalysisError] = useState("");
  const [contentFading, setContentFading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const leaks = analysisResult
    ? buildLeaks(
        analysisResult.categories,
        analysisResult.tips,
        analysisResult.dimensionTips,
        analysisResult.skippedDimensions,
      )
    : [];

  const handleDeepAnalyze = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setContentFading(true);
    await new Promise((r) => setTimeout(r, 250));

    setAnalyzingHandle(product.slug);
    setAnalysisResult(null);
    setAnalysisError("");
    setContentFading(false);

    try {
      const res = await authFetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: product.url }),
        signal: controller.signal,
      });
      if (res.status === 429) {
        throw new Error(getUserFriendlyError(429));
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Analysis failed (${res.status})`);
      }
      const data = await res.json();
      const result = parseAnalysisResponse(data as Record<string, unknown>);

      setAnalysisResult(result);
      setAnalyzingHandle(null);
      captureEvent("scan_completed", { url: product.url, score: result.score });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setAnalysisError(
        err instanceof Error ? err.message : getUserFriendlyError(0),
      );
      setAnalyzingHandle(null);
    } finally {
      if (!controller.signal.aborted) {
        setContentFading(false);
      }
    }
  }, [product.slug, product.url]);

  const handleRetryAnalysis = useCallback(() => {
    setAnalysisError("");
    handleDeepAnalyze();
  }, [handleDeepAnalyze]);

  return {
    analyzingHandle,
    analysisResult,
    analysisError,
    contentFading,
    leaks,
    handleDeepAnalyze,
    handleRetryAnalysis,
  };
}
