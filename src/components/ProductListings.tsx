"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  type FreeResult,
  type CompetitorResult,
  type CategoryScores,
  buildLeaks,
  calculateRevenueLoss,
  captureEvent,
  scoreColorTintBg,
  scoreColorText,
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
  initialAnalyses?: Map<string, FreeResult>;
  onSkuChange?: (sku: string | null) => void;
}

export default function ProductListings({
  products,
  storeName,
  domain,
  initialSku,
  initialAnalyses,
  onSkuChange,
}: ProductListingsProps) {
  /* ── Selection + analysis companion state ── */
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [analyzingHandle, setAnalyzingHandle] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<FreeResult | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  /* ── Per-product result cache (survives product switches within session) ── */
  const [analyzedResults, setAnalyzedResults] = useState<Map<string, FreeResult>>(() => initialAnalyses ?? new Map());
  const analyzedResultsRef = useRef<Map<string, FreeResult>>(analyzedResults);
  analyzedResultsRef.current = analyzedResults;

  /* ── Content transition state for smooth phase swaps ── */
  const [contentFading, setContentFading] = useState(false);

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

  // Reset dismiss flag when a new product is selected or analysis starts
  useEffect(() => {
    if (selectedIndex !== null || analyzingHandle) setBottomSheetDismissed(false);
  }, [selectedIndex, analyzingHandle]);

  /* ── Refs ── */
  const rightPaneRef = useRef<HTMLDivElement>(null);

  /* ── Sorted product order (images first, stable within group) ── */
  const sortedIndices = useMemo(
    () =>
      products
        .map((p, i) => ({ i, hasImage: !!p.image }))
        .sort((a, b) => (a.hasImage ? 0 : 1) - (b.hasImage ? 0 : 1))
        .map((x) => x.i),
    [products],
  );

  /* ── Derived data ── */
  const selectedProduct = selectedIndex !== null ? products[selectedIndex] : null;
  const selectedUrl = selectedProduct?.url ?? "";

  /** Bottom sheet is open on mobile when a product is selected (preview or analysis lifecycle) and not manually dismissed */
  const sheetOpen =
    isMobile &&
    !bottomSheetDismissed &&
    (!!selectedProduct || !!analyzingHandle || !!analysisResult || !!analysisError);

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

  /* ── Pre-select product matching initialSku, or first product by default ── */
  useEffect(() => {
    if (products.length === 0 || sortedIndices.length === 0) return;

    if (initialSku) {
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
    } else if (selectedIndex === null) {
      // No SKU in URL — auto-select first product from the sorted list
      const firstSortedIndex = sortedIndices[0];
      setSelectedIndex(firstSortedIndex);
      onSkuChange?.(products[firstSortedIndex].slug);
    }
  }, [products, initialSku, sortedIndices]);

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

      // Fade out current content, then swap to loader
      setContentFading(true);
      await new Promise((r) => setTimeout(r, 250));

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
      setContentFading(false);

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

        // Defensive: ensure categories has all 20 expected keys
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

  const handleRetryCompetitors = useCallback(() => {
    if (selectedUrl) fetchCompetitors(selectedUrl);
  }, [selectedUrl, fetchCompetitors]);


  /* ══════════════════════════════════════════════════════════════
     Shared content — renders in right pane (desktop) or BottomSheet
     (mobile). Covers product preview + analysis lifecycle states.
     ══════════════════════════════════════════════════════════════ */
  const analysisContent = (
    <div
      style={{
        opacity: contentFading ? 0 : 1,
        transform: contentFading ? "translateY(8px)" : "translateY(0)",
        transition: "opacity 250ms ease, transform 250ms ease",
      }}
    >
      {/* ── Product selected, not yet analyzed ── */}
      {selectedProduct && !analyzingHandle && !analysisResult && !analysisError && (
        <div className="flex flex-col items-center justify-center h-full min-h-[500px] px-6 py-12">
          {/* Product preview + CTA — centered single column */}
          <div
            className="w-full max-w-md flex flex-col items-center text-center"
            style={{ animation: "fade-in-up 400ms var(--ease-out-quart) both" }}
          >
            {/* Product image */}
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl overflow-hidden bg-[var(--surface-container-low)] border border-[var(--border)] shadow-lg mb-6">
              {selectedProduct.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={selectedProduct.image}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--on-surface-variant)" strokeWidth="0.75" aria-hidden="true" style={{ opacity: 0.3 }}>
                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>

            {/* Product name + link */}
            <h1
              className="text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] capitalize tracking-tight leading-tight mb-1"
              style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
            >
              {selectedProduct.slug.replace(/-/g, " ")}
            </h1>
            <a
              href={selectedProduct.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--on-surface-variant)] hover:text-[var(--brand)] transition-colors group mb-8"
            >
              <span>{domain}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" aria-hidden="true">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>

            {/* What you'll get — value props */}
            <div
              className="w-full grid grid-cols-3 gap-3 mb-8"
              style={{ animation: "fade-in-up 400ms var(--ease-out-quart) 100ms both" }}
            >
              {[
                { icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", label: "Score" },
                { icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", label: "Revenue leaks" },
                { icon: "M13 10V3L4 14h7v7l9-11h-7z", label: "Quick fixes" },
              ].map(({ icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-[var(--surface-container-low)] border border-[var(--border)]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.5" aria-hidden="true">
                    <path d={icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-[11px] font-semibold text-[var(--on-surface-variant)]">{label}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={handleDeepAnalyze}
              className="cursor-pointer inline-flex items-center gap-2.5 px-8 py-4 rounded-full text-base font-bold text-white bg-[var(--brand)] hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[var(--brand)]/20"
              style={{ animation: "fade-in-up 400ms var(--ease-out-quart) 200ms both" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 3v1.5M12 19.5V21M4.22 4.22l1.06 1.06M17.72 17.72l1.06 1.06M3 12h1.5M19.5 12H21M4.22 19.78l1.06-1.06M17.72 6.28l1.06-1.06" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 8l1.12 2.26L15.5 11.5l-2.38 1.24L12 15l-1.12-2.26L8.5 11.5l2.38-1.24L12 8z" fill="currentColor" stroke="none" />
              </svg>
              Run Deep Analysis
            </button>
            <p
              className="text-xs text-[var(--on-surface-variant)] mt-3 opacity-60"
              style={{ animation: "fade-in-up 400ms var(--ease-out-quart) 280ms both" }}
            >
              Takes about 15–30 seconds
            </p>
          </div>
        </div>
      )}

      {/* ── Loading state ── */}
      {analyzingHandle && !analysisResult && !analysisError && (
        <div className="px-4 py-6" style={{ animation: "fade-in-up 500ms var(--ease-out-quart) both" }}>
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
            onAnalyzeAgain={handleDeepAnalyze}
            onFetchCompetitors={() => {}} // competitor analysis disabled for now
            competitorLoading={false}
            competitorResult={null}
            competitorError=""
            onRetryCompetitors={() => {}}
            onBeatCompetitor={() => {}}
            onReanalyze={handleDeepAnalyze}
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
    </div>
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
        <div className="flex-1 overflow-y-auto p-3 space-y-2" role="list" aria-label="Products">
          {sortedIndices.map((i) => {
            const product = products[i];
            const isSelected = selectedIndex === i;
            const isAnalyzing = analyzingHandle === product.slug;
            const cachedResult = analyzedResults.get(product.slug);

            return (
              <button
                key={product.url}
                type="button"
                role="listitem"
                onClick={() => handleSelectProduct(i)}
                className={`cursor-pointer w-full text-left p-4 rounded-2xl transition-all duration-150 relative border-2 ${
                  isSelected
                    ? "border-[var(--brand)] bg-violet-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
                style={isSelected ? {
                  boxShadow: "0 0 0 3px rgba(111, 50, 213, 0.15), 0 4px 12px rgba(111, 50, 213, 0.1)",
                } : undefined}
                aria-current={isSelected ? "true" : undefined}
              >
                <div className="flex items-start gap-4">
                  {/* Thumbnail — 64px circle */}
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
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#94a3b8"
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
                  </div>

                  {/* Info column */}
                  <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                    {/* Product name */}
                    <p
                      className="text-base font-bold text-slate-900 truncate capitalize leading-snug"
                      style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
                    >
                      {product.slug.replace(/-/g, " ")}
                    </p>

                    {/* Status row: badge + domain */}
                    <div className="flex items-center gap-2">
                      {isAnalyzing ? (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0"
                          style={{
                            fontFamily: "var(--font-manrope), Manrope, sans-serif",
                            background: "rgba(111, 50, 213, 0.08)",
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
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0"
                          style={{
                            fontFamily: "var(--font-manrope), Manrope, sans-serif",
                            background: scoreColorTintBg(cachedResult.score),
                            color: scoreColorText(cachedResult.score),
                          }}
                        >
                          Score {cachedResult.score}/100
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0"
                          style={{
                            fontFamily: "var(--font-manrope), Manrope, sans-serif",
                            background: "rgba(100, 116, 139, 0.08)",
                            color: "rgb(100, 116, 139)",
                          }}
                        >
                          Ready to scan
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ═══ RIGHT PANE — Analysis lifecycle (65%) ═══ */}
      <main
        ref={rightPaneRef}
        className="flex-1 overflow-y-auto lg:h-[calc(100vh-72px)] lg:sticky lg:top-[72px]"
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

        {/* ── Shared content: desktop renders here, mobile uses BottomSheet ── */}
        {!sheetOpen && analysisContent}
      </main>

      {/* ═══ MOBILE BOTTOM SHEET — Analysis lifecycle overlay ═══ */}
      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setBottomSheetDismissed(true)}
        title={analysisResult ? "Analysis Results" : selectedProduct ? selectedProduct.slug.replace(/-/g, " ") : "Product Details"}
      >
        {analysisContent}
      </BottomSheet>
    </div>
  );
}
