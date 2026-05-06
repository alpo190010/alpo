"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import AnalysisPane from "@/components/AnalysisPane";
import AuthModal from "@/components/AuthModal";
import Button from "@/components/ui/Button";
import MobileAppBar from "@/components/MobileAppBar";
import { useSingleProductAnalysis } from "@/hooks/useSingleProductAnalysis";
import { API_URL } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { type FreeResult, parseAnalysisResponse } from "@/lib/analysis";

/* ═══════════════════════════════════════════════════════════════
   /scan/[domain]/product/[slug] — Single-product analysis page

   Replaces the mobile bottom-sheet drawer used on the listings
   page. Hydrates from the per-user store cache (GET /store/{domain}),
   then runs /analyze on demand via useSingleProductAnalysis.
   ═══════════════════════════════════════════════════════════════ */

interface Product {
  url: string;
  slug: string;
  image?: string;
}

type LoadPhase = "loading" | "ready" | "missing" | "error";

function ProductDetailLoader() {
  const params = useParams<{ domain: string; slug: string }>();
  const router = useRouter();

  const rawDomain = params.domain ?? "";
  const domain = decodeURIComponent(rawDomain);
  const slug = decodeURIComponent(params.slug ?? "");

  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [product, setProduct] = useState<Product | null>(null);
  const [initialResult, setInitialResult] = useState<FreeResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!domain || !slug) return;

    // Force downstream remount: useState(initialResult) doesn't resync on prop change otherwise.
    setPhase("loading");
    setProduct(null);
    setInitialResult(null);
    setErrorMessage("");

    const controller = new AbortController();

    (async () => {
      try {
        const res = await authFetch(
          `${API_URL}/store/${encodeURIComponent(domain)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          // No cached store → bounce to listings to trigger discovery flow.
          router.replace(`/scan/${encodeURIComponent(domain)}`);
          return;
        }
        const data = await res.json();
        const products: Product[] = data.products ?? [];
        const match = products.find((p) => p.slug === slug);
        if (!match) {
          setPhase("missing");
          return;
        }
        const dbEntry = (data.analyses ?? {})[match.url];
        if (dbEntry) {
          setInitialResult(
            parseAnalysisResponse(dbEntry as Record<string, unknown>),
          );
        }
        setProduct(match);
        setPhase("ready");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to load product.",
        );
        setPhase("error");
      }
    })();

    return () => controller.abort();
  }, [domain, slug, router]);

  if (phase === "loading") {
    return (
      <div className="h-full bg-[var(--bg)] flex items-center justify-center px-6">
        <div
          className="inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-[var(--surface)] border border-[var(--border)]"
          style={{ boxShadow: "var(--shadow-subtle)" }}
        >
          <div
            className="w-4 h-4 rounded-full border-2 border-[var(--brand)] border-t-transparent"
            style={{ animation: "spin 0.8s linear infinite" }}
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            Loading product…
          </span>
        </div>
      </div>
    );
  }

  if (phase === "missing" || phase === "error") {
    return (
      <div className="h-full bg-[var(--bg)] flex flex-col items-center justify-center px-6 text-center">
        <div
          className="w-14 h-14 rounded-2xl bg-[var(--surface-container-low)] border border-[var(--border)] flex items-center justify-center mb-4"
          style={{ animation: "fade-in-up 400ms var(--ease-out-quart) both" }}
        >
          <WarningCircleIcon size={24} weight="regular" color="var(--error)" />
        </div>
        <h2 className="font-display text-xl font-bold text-[var(--on-surface)] mb-2">
          {phase === "missing" ? "Product not found" : "Something went wrong"}
        </h2>
        <p className="text-sm text-[var(--on-surface-variant)] max-w-sm mb-5 leading-relaxed break-words">
          {phase === "missing"
            ? `We couldn't find "${slug.replace(/-/g, " ")}" on ${domain}.`
            : errorMessage}
        </p>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => router.push(`/scan/${encodeURIComponent(domain)}`)}
        >
          Back to {domain}
        </Button>
      </div>
    );
  }

  // phase === "ready" — product is non-null
  return (
    <ProductDetailReady
      product={product as Product}
      initialResult={initialResult}
      domain={domain}
    />
  );
}

interface ProductDetailReadyProps {
  product: Product;
  initialResult: FreeResult | null;
  domain: string;
}

function ProductDetailReady({
  product,
  initialResult,
  domain,
}: ProductDetailReadyProps) {
  const router = useRouter();
  const { status } = useSession();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const {
    analyzingHandle,
    analysisResult,
    analysisError,
    contentFading,
    leaks,
    handleDeepAnalyze,
    handleRetryAnalysis,
  } = useSingleProductAnalysis({ product, initialResult });

  const handleDeepAnalyzeGated = useCallback(() => {
    if (status !== "authenticated") {
      setAuthModalOpen(true);
      return;
    }
    handleDeepAnalyze();
  }, [status, handleDeepAnalyze]);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(`/scan/${encodeURIComponent(domain)}`);
  }, [router, domain]);

  return (
    <div className="h-full bg-[var(--bg)] flex flex-col">
      <MobileAppBar
        onBack={handleBack}
        title={product.slug.replace(/-/g, " ")}
      />

      <main className="flex-1 overflow-y-auto" aria-label="Analysis results">
        <AnalysisPane
          selectedProduct={product}
          selectedIndex={0}
          domain={domain}
          analyzingHandle={analyzingHandle}
          analysisResult={analysisResult}
          analysisError={analysisError}
          selectedUrl={product.url}
          leaks={leaks}
          contentFading={contentFading}
          onDeepAnalyze={handleDeepAnalyzeGated}
          onRetryAnalysis={handleRetryAnalysis}
          onIssueClick={() => {}}
        />
      </main>

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

export default function ProductDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full bg-[var(--bg)] flex items-center justify-center px-6">
          <div
            className="inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-[var(--surface)] border border-[var(--border)]"
            style={{ boxShadow: "var(--shadow-subtle)" }}
          >
            <div
              className="w-4 h-4 rounded-full border-2 border-[var(--brand)] border-t-transparent"
              style={{ animation: "spin 0.8s linear infinite" }}
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              Loading…
            </span>
          </div>
        </div>
      }
    >
      <ProductDetailLoader />
    </Suspense>
  );
}
