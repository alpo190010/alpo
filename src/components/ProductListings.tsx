"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  type FreeResult,
  type CompetitorResult,
  type CategoryScores,
  buildLeaks,
  calculateRevenueLoss,
  captureEvent,
} from "@/lib/analysis";
import AnalysisResults from "@/components/AnalysisResults";
import AnalysisLoader from "@/components/AnalysisLoader";
import EmailModal from "@/components/EmailModal";
import BottomSheet from "@/components/BottomSheet";

/* ══════════════════════════════════════════════════════════════
   ProductListings — Split-view: product grid + analysis pane
   Left 35 %: scrollable product cards
   Right 65%: welcome → loading → results lifecycle
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
  onSkuChange?: (sku: string | null) => void;
}

export default function ProductListings({
  products,
  storeName,
  domain,
  initialSku,
  onSkuChange,
}: ProductListingsProps) {
  /* ── Selection + analysis companion state ── */
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [analyzingHandle, setAnalyzingHandle] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<FreeResult | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  /* ── Per-product result cache (survives product switches within session) ── */
  const [analyzedResults, setAnalyzedResults] = useState<Map<string, FreeResult>>(() => new Map());
  const analyzedResultsRef = useRef<Map<string, FreeResult>>(analyzedResults);
  analyzedResultsRef.current = analyzedResults;

  /* ── Competitor companion state ── */
  const [competitorLoading, setCompetitorLoading] = useState(false);
  const [competitorResult, setCompetitorResult] = useState<CompetitorResult | null>(null);
  const [competitorError, setCompetitorError] = useState("");
  const competitorAbortRef = useRef<AbortController | null>(null);

  /* ── Email / modal state ── */
  const [email, setEmail] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [selectedLeak, setSelectedLeak] = useState<string | null>(null);
  const [competitorCTAName, setCompetitorCTAName] = useState<string | null>(null);
  const [emailStep, setEmailStep] = useState<"form" | "queued" | null>(null);

  /* ── Mobile viewport detection ── */
  const [isMobile, setIsMobile] = useState(false);
  const [bottomSheetDismissed, setBottomSheetDismissed] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Reset dismiss flag when a new analysis starts
  useEffect(() => {
    if (analyzingHandle) setBottomSheetDismissed(false);
  }, [analyzingHandle]);

  /* ── Refs ── */
  const rightPaneRef = useRef<HTMLDivElement>(null);

  /* ── Derived data ── */
  const selectedProduct = selectedIndex !== null ? products[selectedIndex] : null;
  const selectedUrl = selectedProduct?.url ?? "";

  /** Bottom sheet is open on mobile when an analysis lifecycle is active and not manually dismissed */
  const sheetOpen =
    isMobile &&
    !bottomSheetDismissed &&
    (!!analyzingHandle || !!analysisResult || !!analysisError);

  const leaks = analysisResult
    ? buildLeaks(analysisResult.categories, analysisResult.tips)
    : [];

  const { lossLow, lossHigh } = analysisResult
    ? calculateRevenueLoss(
        analysisResult.score,
        analysisResult.productPrice,
        analysisResult.estimatedMonthlyVisitors,
        analysisResult.productCategory,
      )
    : { lossLow: 0, lossHigh: 0 };

  /* ── Abort cleanup on unmount ── */
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      competitorAbortRef.current?.abort();
    };
  }, []);

  /* ── Pre-select product matching initialSku when products load ── */
  useEffect(() => {
    if (products.length === 0 || !initialSku) return;
    const matchIndex = products.findIndex((p) => p.slug === initialSku);
    if (matchIndex === -1) return; // stale/invalid SKU — silently ignore
    setSelectedIndex(matchIndex);
    // If we have a cached result for this SKU, restore it immediately
    const cached = analyzedResultsRef.current.get(initialSku);
    if (cached) {
      setAnalysisResult(cached);
      setAnalyzingHandle(null);
      setAnalysisError("");
    }
  }, [products, initialSku]);

  /* ═══════════════════════════════════════════════════════════
     Fetch: Competitor analysis
     ═══════════════════════════════════════════════════════════ */
  const fetchCompetitors = useCallback(
    async (url: string) => {
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
          throw new Error(
            data.error || `Competitor analysis failed (${res.status})`,
          );
        }
        const data = await res.json();
        const validCompetitors = (data.competitors ?? []).filter(
          (c: { score: number; categories?: Record<string, number> }) => {
            if (c.score <= 0) return false;
            const cats = c.categories || {};
            const catSum = Object.values(cats).reduce(
              (a: number, b: number) => a + b,
              0,
            );
            return catSum > 0;
          },
        );
        setCompetitorResult({ competitors: validCompetitors });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message =
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.";
        setCompetitorError(message);
        console.error("Competitor fetch failed:", message);
      } finally {
        setCompetitorLoading(false);
      }
    },
    [],
  );

  /* ═══════════════════════════════════════════════════════════
     Select product (no analysis — just preview in right pane)
     ═══════════════════════════════════════════════════════════ */
  const handleSelectProduct = useCallback(
    (index: number) => {
      if (selectedIndex === index) return; // already selected
      const product = products[index];

      // Abort any in-flight requests from a previous product
      abortRef.current?.abort();
      competitorAbortRef.current?.abort();

      setSelectedIndex(index);
      setAnalysisError("");
      setAnalyzingHandle(null);
      setEmail("");
      setEmailError("");
      setEmailStep(null);
      setSelectedLeak(null);
      setCompetitorCTAName(null);
      setCompetitorLoading(false);
      setCompetitorResult(null);
      setCompetitorError("");

      // Check if we already have cached results for this product
      const cached = analyzedResultsRef.current.get(product.slug);
      if (cached) {
        setAnalysisResult(cached);
        onSkuChange?.(product.slug);
        // fetchCompetitors(product.url); // competitor analysis disabled for now
      } else {
        setAnalysisResult(null);
      }

      rightPaneRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      onSkuChange?.(product.slug);
    },
    [selectedIndex, products, fetchCompetitors, onSkuChange],
  );

  /* ═══════════════════════════════════════════════════════════
     Fetch: Deep analysis
     ═══════════════════════════════════════════════════════════ */
  const handleDeepAnalyze = useCallback(
    async () => {
      if (selectedIndex === null) return;
      const product = products[selectedIndex];

      // Abort any in-flight analysis + competitor requests
      abortRef.current?.abort();
      competitorAbortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Reset state for fresh analysis
      setAnalyzingHandle(product.slug);
      setAnalysisResult(null);
      setAnalysisError("");
      setCompetitorLoading(false);
      setCompetitorResult(null);
      setCompetitorError("");
      setEmail("");
      setEmailError("");
      setEmailStep(null);
      setSelectedLeak(null);
      setCompetitorCTAName(null);

      // Scroll right pane to top
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
          throw new Error(
            data.error || `Analysis failed (${res.status})`,
          );
        }
        const data = await res.json();

        // Defensive: ensure categories has all expected keys
        const safeCategories: CategoryScores = {
          title: Number(data.categories?.title) || 0,
          images: Number(data.categories?.images) || 0,
          pricing: Number(data.categories?.pricing) || 0,
          socialProof: Number(data.categories?.socialProof) || 0,
          cta: Number(data.categories?.cta) || 0,
          description: Number(data.categories?.description) || 0,
          trust: Number(data.categories?.trust) || 0,
        };

        const result: FreeResult = {
          score: Math.min(100, Math.max(0, Number(data.score) || 0)),
          summary: String(data.summary || "Analysis complete."),
          tips: Array.isArray(data.tips)
            ? data.tips.map(String).slice(0, 7)
            : [],
          categories: safeCategories,
          productPrice: Number(data.productPrice) || 0,
          productCategory: String(data.productCategory || "other"),
          estimatedMonthlyVisitors:
            Number(data.estimatedMonthlyVisitors) || 1000,
        };

        setAnalysisResult(result);
        setAnalyzingHandle(null);
        setAnalyzedResults(prev => new Map(prev).set(product.slug, result));
        onSkuChange?.(product.slug);
        captureEvent("scan_completed", {
          url: product.url,
          score: result.score,
        });

        // Competitor analysis disabled for now
        // fetchCompetitors(product.url);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAnalysisError(
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
        );
        setAnalyzingHandle(null);
      }
    },
    [selectedIndex, products, fetchCompetitors, onSkuChange],
  );

  /* ═══════════════════════════════════════════════════════════
     Email submission
     ═══════════════════════════════════════════════════════════ */
  const submitEmail = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (emailSubmitting) return;
      setEmailSubmitting(true);
      setEmailError("");

      try {
        const res = await fetch("/api/request-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            url: selectedUrl,
            score: analysisResult?.score,
            summary: analysisResult?.summary,
            tips: analysisResult?.tips,
            categories: analysisResult?.categories,
            competitorName: competitorCTAName,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 429) {
            throw new Error(
              "Too many requests. Please wait a moment and try again.",
            );
          }
          throw new Error(
            data.error || "Failed to send. Please try again.",
          );
        }
        setEmailStep("queued");
        captureEvent("report_email_submitted", {
          url: selectedUrl,
          score: analysisResult?.score,
        });
      } catch (err: unknown) {
        setEmailError(
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
        );
      } finally {
        setEmailSubmitting(false);
      }
    },
    [email, selectedUrl, analysisResult, emailSubmitting, competitorCTAName],
  );

  /* ── Callbacks for child components ── */
  const handleIssueClick = useCallback((key: string) => {
    setSelectedLeak(key);
    setCompetitorCTAName(null);
    setEmailStep("form");
    captureEvent("issue_clicked", { category: key });
  }, []);

  const handleBeatCompetitor = useCallback((name: string) => {
    setCompetitorCTAName(name);
    setSelectedLeak(null);
    setEmailStep("form");
  }, []);

  const handleCloseModal = useCallback(() => {
    setEmailStep(null);
    setSelectedLeak(null);
    setCompetitorCTAName(null);
    setEmailError("");
  }, []);

  const handleScanAnother = useCallback(() => {
    setSelectedIndex(null);
    setAnalysisResult(null);
    setAnalysisError("");
    setAnalyzingHandle(null);
    rightPaneRef.current?.scrollTo({ top: 0 });
    onSkuChange?.(null);
  }, [onSkuChange]);

  const handleRetryCompetitors = useCallback(() => {
    if (selectedUrl) fetchCompetitors(selectedUrl);
  }, [selectedUrl, fetchCompetitors]);

  /* ── Truncate URL for display ── */
  function truncateUrl(url: string, max = 48): string {
    if (url.length <= max) return url;
    return url.slice(0, max) + "…";
  }

  /* ══════════════════════════════════════════════════════════════
     Analysis lifecycle content — shared between right pane (desktop)
     and BottomSheet (mobile). Extracted to avoid duplicating ~100
     lines of JSX across two render targets.
     ══════════════════════════════════════════════════════════════ */
  const analysisContent = (
    <>
      {/* ── Loading state ── */}
      {analyzingHandle && !analysisResult && !analysisError && (
        <div className="px-4 py-6">
          <AnalysisLoader url={selectedUrl} />
        </div>
      )}

      {/* ── Error state ── */}
      {analysisError && (
        <div className="flex flex-col items-center justify-center min-h-[300px] px-6 py-12 text-center">
          <div
            className="w-14 h-14 rounded-2xl bg-[var(--error-light)] border border-[var(--error)] flex items-center justify-center mb-4"
            style={{ animation: "fade-in-up 400ms var(--ease-out-quart) both" }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke="var(--error)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h3
            className="text-lg font-bold text-[var(--on-surface)] mb-2"
            style={{
              fontFamily: "var(--font-manrope), Manrope, sans-serif",
            }}
          >
            Analysis failed
          </h3>
          <p className="text-sm text-[var(--on-surface-variant)] max-w-sm mb-5 leading-relaxed">
            {analysisError}
          </p>
          <button
            type="button"
            onClick={() => {
              if (selectedProduct && selectedIndex !== null) {
                setAnalysisError("");
                handleDeepAnalyze();
              }
            }}
            className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--brand)] hover:opacity-90 active:scale-95 transition-all"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                d="M1 4v6h6M23 20v-6h-6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Retry Analysis
          </button>
        </div>
      )}

      {/* ── Results state ── */}
      {analysisResult && (
        <div className="px-5 sm:px-8 py-6 sm:py-8">
          <AnalysisResults
            result={analysisResult}
            leaks={leaks}
            lossLow={lossLow}
            lossHigh={lossHigh}
            domain={domain}
            url={selectedUrl}
            onIssueClick={handleIssueClick}
            onScanAnother={handleScanAnother}
            onFetchCompetitors={() => {}} // competitor analysis disabled for now
            competitorLoading={false}
            competitorResult={null}
            competitorError=""
            onRetryCompetitors={() => {}}
            onBeatCompetitor={() => {}}
          />

          {/* Email Modal — sibling to results */}
          <EmailModal
            isOpen={emailStep !== null}
            onClose={handleCloseModal}
            selectedLeak={selectedLeak}
            competitorCTAName={competitorCTAName}
            leaks={leaks}
            email={email}
            onEmailChange={setEmail}
            onSubmit={submitEmail}
            emailSubmitting={emailSubmitting}
            emailError={emailError}
            emailStep={emailStep}
            url={selectedUrl}
            score={analysisResult.score}
          />
        </div>
      )}
    </>
  );

  /* ══════════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col lg:flex-row w-full min-h-[calc(100vh-80px)]">
      {/* ═══ LEFT PANE — Product Grid (35%) ═══ */}
      <aside
        className="w-full lg:w-[35%] lg:max-w-[420px] lg:min-w-[280px] lg:h-[calc(100vh-72px)] lg:sticky lg:top-[72px] border-b lg:border-b-0 lg:border-r border-[var(--border)] bg-[var(--surface-dim)] flex flex-col"
        aria-label="Product list"
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 px-5 py-4 bg-[var(--surface-dim)] border-b border-[var(--border)]">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-xl bg-[var(--brand-light)] border border-[var(--brand-border)] flex items-center justify-center shrink-0">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--brand)"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h2
                className="text-base font-bold text-[var(--on-surface)] truncate leading-tight"
                style={{
                  fontFamily: "var(--font-manrope), Manrope, sans-serif",
                }}
              >
                {storeName || domain}
              </h2>
              <p className="text-xs text-[var(--on-surface-variant)]">
                {products.length} product{products.length !== 1 ? "s" : ""}{" "}
                found
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable product list */}
        <div className="flex-1 overflow-y-auto" role="list" aria-label="Products">
          {products.map((product, i) => {
            const isSelected = selectedIndex === i;
            const isAnalyzing = analyzingHandle === product.slug;
            const isAnalyzed = analyzedResults.has(product.slug);

            return (
              <button
                key={product.url}
                type="button"
                role="listitem"
                onClick={() => handleSelectProduct(i)}
                className={`cursor-pointer w-full text-left px-4 py-3.5 border-b border-[var(--surface-container-low)] transition-colors duration-150 ${
                  isSelected
                    ? "bg-[var(--brand-light)] border-l-[3px] border-l-[var(--brand)]"
                    : "hover:bg-[var(--surface-container-low)] border-l-[3px] border-l-transparent"
                }`}
                aria-current={isSelected ? "true" : undefined}
              >
                <div className="flex items-center gap-3">
                  {/* Thumbnail */}
                  {product.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={product.image}
                      alt=""
                      className="w-12 h-12 rounded-xl object-cover bg-[var(--surface)] border border-[var(--border)] shrink-0"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shrink-0">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--on-surface-variant)"
                        strokeWidth="1.5"
                        aria-hidden="true"
                      >
                        <path
                          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Product info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-[var(--on-surface)] truncate capitalize leading-tight">
                        {product.slug.replace(/-/g, " ")}
                      </p>
                      {isAnalyzed && (
                        <span
                          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--success-light)] text-[var(--success)] shrink-0"
                          title="Analyzed"
                          aria-label="Analyzed"
                        >
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M2.5 6l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--on-surface-variant)] truncate mt-0.5">
                      {truncateUrl(product.url)}
                    </p>
                  </div>

                  {/* Status indicator */}
                  {isAnalyzing && (
                    <span
                      className="w-4 h-4 rounded-full border-[1.5px] border-[var(--brand)] border-t-transparent shrink-0"
                      style={{ animation: "spin 0.8s linear infinite" }}
                      aria-label="Analyzing"
                    />
                  )}
                  {!isAnalyzing && isSelected && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" className="shrink-0" aria-hidden="true">
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ═══ RIGHT PANE — Analysis lifecycle (65%) ═══ */}
      <main
        ref={rightPaneRef}
        className="flex-1 overflow-y-auto"
        aria-label="Analysis results"
      >
        {/* ── Welcome state: nothing selected ── */}
        {selectedIndex === null && !analyzingHandle && !analysisResult && !analysisError && (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] px-6 py-16 text-center">
            <div
              className="w-16 h-16 rounded-2xl bg-[var(--surface-container-low)] border border-[var(--border)] flex items-center justify-center mb-5"
              style={{ animation: "fade-in-up 500ms var(--ease-out-quart) both" }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--on-surface-variant)"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path
                  d="M15 15l5 5M10 4a6 6 0 100 12 6 6 0 000-12z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2
              className="text-xl font-bold text-[var(--on-surface)] mb-2"
              style={{
                fontFamily: "var(--font-manrope), Manrope, sans-serif",
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
              revenue loss estimate, and actionable fixes.
            </p>
          </div>
        )}

        {/* ── Product selected, not yet analyzed — show detail + Deep Analyze CTA ── */}
        {selectedProduct && !analyzingHandle && !analysisResult && !analysisError && (
          <div
            className="flex flex-col items-center justify-center h-full min-h-[400px] px-6 py-16 text-center"
            key={selectedProduct.slug}
          >
            {/* Product preview card */}
            <div
              className="w-full max-w-sm mb-8"
              style={{ animation: "fade-in-up 400ms var(--ease-out-quart) both" }}
            >
              {selectedProduct.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={selectedProduct.image}
                  alt=""
                  className="w-full aspect-square max-w-[220px] mx-auto rounded-2xl object-cover bg-[var(--surface)] border border-[var(--border)] mb-5"
                />
              ) : (
                <div className="w-full aspect-square max-w-[220px] mx-auto rounded-2xl bg-[var(--surface-container-low)] border border-[var(--border)] flex items-center justify-center mb-5">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--on-surface-variant)"
                    strokeWidth="1"
                    aria-hidden="true"
                    style={{ opacity: 0.4 }}
                  >
                    <path
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
              <h2
                className="text-xl font-bold text-[var(--on-surface)] capitalize mb-1"
                style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
              >
                {selectedProduct.slug.replace(/-/g, " ")}
              </h2>
              <p className="text-xs text-[var(--on-surface-variant)] truncate mb-6">
                {selectedProduct.url}
              </p>

              {/* Deep Analyze CTA */}
              <button
                type="button"
                onClick={handleDeepAnalyze}
                className="cursor-pointer inline-flex items-center gap-2.5 px-7 py-3 rounded-xl text-sm font-bold text-white bg-[var(--brand)] hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-[var(--brand)]/20"
                style={{ animation: "fade-in-up 400ms var(--ease-out-quart) 120ms both" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M15 15l5 5M10 4a6 6 0 100 12 6 6 0 000-12z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Deep Analyze
              </button>
              <p
                className="text-[11px] text-[var(--on-surface-variant)] mt-3 leading-relaxed"
                style={{ animation: "fade-in-up 400ms var(--ease-out-quart) 200ms both" }}
              >
                Get conversion score, revenue loss estimate &amp; actionable fixes
              </p>
            </div>
          </div>
        )}

        {/* ── Analysis content: desktop renders here, mobile uses BottomSheet ── */}
        {!sheetOpen && analysisContent}
      </main>

      {/* ═══ MOBILE BOTTOM SHEET — Analysis lifecycle overlay ═══ */}
      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setBottomSheetDismissed(true)}
        title="Analysis Results"
      >
        {analysisContent}
      </BottomSheet>
    </div>
  );
}
