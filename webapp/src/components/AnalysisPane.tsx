"use client";

import Image from "next/image";
import {
  PackageIcon,
  ArrowSquareOutIcon,
  ChartBarIcon,
  LightningIcon,
  SparkleIcon,
  WarningCircleIcon,
  ArrowsClockwiseIcon,
} from "@phosphor-icons/react";
import { type FreeResult, type LeakCard } from "@/lib/analysis";
import Button from "@/components/ui/Button";
import AnalysisResults from "@/components/AnalysisResults";
import AnalysisLoader from "@/components/AnalysisLoader";

/* ══════════════════════════════════════════════════════════════
   AnalysisPane — Product preview + analysis lifecycle states
   Renders in both desktop right-pane and mobile BottomSheet.
   ══════════════════════════════════════════════════════════════ */

interface Product {
  url: string;
  slug: string;
  image?: string;
}

export interface AnalysisPaneProps {
  /* ── Analysis state ── */
  selectedProduct: Product | null;
  selectedIndex: number | null;
  domain: string;
  analyzingHandle: string | null;
  analysisResult: FreeResult | null;
  analysisError: string;
  selectedUrl: string;
  leaks: LeakCard[];
  contentFading: boolean;

  /* ── Callbacks ── */
  onDeepAnalyze: () => void;
  onRetryAnalysis: () => void;
  onIssueClick: (key: string) => void;
}

export default function AnalysisPane({
  selectedProduct,
  selectedIndex,
  domain,
  analyzingHandle,
  analysisResult,
  analysisError,
  selectedUrl,
  leaks,
  contentFading,
  onDeepAnalyze,
  onRetryAnalysis,
  onIssueClick,
}: AnalysisPaneProps) {
  return (
    <div
      style={{
        opacity: contentFading ? 0 : 1,
        transform: contentFading ? "translateY(8px)" : "translateY(0)",
        transition: "opacity 250ms var(--ease-out-quart), transform 250ms var(--ease-out-quart)",
        minHeight: contentFading ? "500px" : undefined,
      }}
    >
      {/* ── Product selected, not yet analyzed ── */}
      {selectedProduct && !analyzingHandle && !analysisResult && !analysisError && (
        <div className="flex flex-col items-center justify-center h-full min-h-[500px] px-6 py-12">
          <div
            className="w-full max-w-md flex flex-col items-center text-center"
            style={{ animation: "fade-in-up 400ms var(--ease-out-quart) both" }}
          >
            {/* Product image */}
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden bg-[var(--surface-container-low)] border border-[var(--border)] shadow-[var(--shadow-brand-md)] mb-6">
              {selectedProduct.image ? (
                <Image
                  src={selectedProduct.image}
                  alt={selectedProduct.slug.replace(/-/g, " ")}
                  width={144}
                  height={144}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <PackageIcon size={40} weight="thin" color="var(--on-surface-variant)" style={{ opacity: 0.3 }} />
                </div>
              )}
            </div>

            {/* Product name + link */}
            <h1
              className="text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] capitalize tracking-tight leading-tight mb-1 font-display line-clamp-2 break-words"
            >
              {selectedProduct.slug.replace(/-/g, " ")}
            </h1>
            <a
              href={selectedProduct.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--on-surface-variant)] hover:text-[var(--brand)] transition-colors group mb-8"
            >
              <span className="truncate max-w-[200px] inline-block align-bottom">{domain}</span>
              <ArrowSquareOutIcon size={12} className="shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
            </a>

            {/* What you'll get — value props */}
            <div
              className="w-full grid grid-cols-3 gap-3 mb-8"
              style={{ animation: "fade-in-up 400ms var(--ease-out-quart) 100ms both" }}
            >
              {[
                { icon: <ChartBarIcon size={20} weight="regular" color="var(--brand)" />, label: "Score" },
                { icon: <WarningCircleIcon size={20} weight="regular" color="var(--brand)" />, label: "Revenue leaks" },
                { icon: <LightningIcon size={20} weight="regular" color="var(--brand)" />, label: "Quick fixes" },
              ].map(({ icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-[var(--surface-container-low)] border border-[var(--border)]">
                  {icon}
                  <span className="text-[11px] font-semibold text-[var(--on-surface-variant)]">{label}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <Button
              type="button"
              variant="gradient"
              size="lg"
              shape="pill"
              onClick={onDeepAnalyze}
              disabled={!!analyzingHandle}
              className="shadow-[var(--shadow-brand-md)]"
              style={{ animation: "fade-in-up 400ms var(--ease-out-quart) 200ms both", background: "var(--brand)" }}
            >
              <SparkleIcon size={18} weight="fill" />
              {analyzingHandle ? "Analyzing…" : "Run Deep Analysis"}
            </Button>
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
            <WarningCircleIcon size={24} weight="regular" color="var(--error)" />
          </div>
          <h3
            className="text-lg font-bold text-[var(--on-surface)] mb-2 font-display"
          >
            Analysis failed
          </h3>
          <p className="text-sm text-[var(--on-surface-variant)] max-w-sm mb-5 leading-relaxed">
            {analysisError}
          </p>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onRetryAnalysis}
          >
            <ArrowsClockwiseIcon size={14} weight="bold" />
            Retry Analysis
          </Button>
        </div>
      )}

      {/* ── Results state ── */}
      {analysisResult && (
        <div className="px-5 sm:px-8 py-6 sm:py-8">
          <AnalysisResults
            result={analysisResult}
            leaks={leaks}
            domain={domain}
            url={selectedUrl}
            productName={selectedProduct?.slug.replace(/-/g, " ")}
            productUrl={selectedProduct?.url}
            productImage={selectedProduct?.image}
            onIssueClick={onIssueClick}
            onAnalyzeAgain={onDeepAnalyze}
          />
        </div>
      )}
    </div>
  );
}
